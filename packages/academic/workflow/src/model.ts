import type { AcademicTraceObserver } from './trace.ts'
/** Session-backed evidence extraction through the shared durable model transport. */
import type { Context } from '@deepseek-ai/cordis'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import type { EvidenceContentSegment, EvidenceDraft, EvidenceGenerationRequest } from '@deepseek-ai/dsh-academic-evidence'
import { EvidenceError } from '@deepseek-ai/dsh-academic-evidence'
import { parseFocusedEvidence, parseScopeDecision } from './parse-evidence.ts'
import { evidenceMessages, scopeMessages } from './model-prompt.ts'
import { createLoggedModelRunner } from './model-call.ts'
import type { LoggedModelAttemptObservation } from './model-call.ts'
import { WorkflowLogError } from './model-errors.ts'
import { MAX_EVIDENCE_DRAFTS } from './model-limits.ts'
import { reportPaperEvidenceProgress } from './evidence-progress.ts'
import type { EvidenceExtractionModelPolicy, EvidenceModelSource, PaperEvidenceGenerator,
  PaperScopeDecision } from './model-types.ts'
import type { AcademicWorkflowProgressFailureCode } from './progress.ts'

interface EvidenceSegmentPiece {
  readonly originalSegmentIndex: number
  readonly segment: EvidenceContentSegment
}

/**
 * Bind extraction to a live Session with exact source metadata and durable model records.
 * @param ctx DSH model, token-meter and persistence services.
 * @param session Live Session with an active durable writer.
 * @param config Explicit model route and generation controls.
 * @param policy Bounded recovery; timed-out evidence batches split once before retrying smaller inputs.
 * @param traceObserver Optional safe diagnostic sink.
 * @returns A source-aware generator for one paper.
 */
export function createModelEvidenceGenerator(
  ctx: Context, session: Session, config: LlmCallConfig, policy: EvidenceExtractionModelPolicy, traceObserver?: AcademicTraceObserver,
): PaperEvidenceGenerator {
  const runScope = createLoggedModelRunner<PaperScopeDecision>(ctx, session, config, policy, traceObserver)
  const runEvidence = createLoggedModelRunner<readonly EvidenceDraft[]>(ctx, session, config, policy, traceObserver)
  const meter = ctx.get('tokenMeter')
  if (meter === undefined) throw new Error('Academic extraction requires tokenMeter.')
  if (policy.inputBatchTokenLimit !== undefined
    && (!Number.isSafeInteger(policy.inputBatchTokenLimit) || policy.inputBatchTokenLimit < 1)) {
    throw new Error('Academic extraction inputBatchTokenLimit must be a positive safe integer.')
  }
  if (policy.inputBatchOverlapCharacters !== undefined
    && (!Number.isSafeInteger(policy.inputBatchOverlapCharacters) || policy.inputBatchOverlapCharacters < 0)) {
    throw new Error('Academic extraction inputBatchOverlapCharacters must be a non-negative safe integer.')
  }
  return async (request, parsed, scope, onProgress) => {
    const source: EvidenceModelSource = {
      academicWorkId: parsed.academicWorkId, workVersionId: parsed.workVersionId, contentHash: parsed.contentHash,
      sourceProvider: parsed.sourceProvider, sourceUrl: parsed.sourceUrl, retrievedAt: parsed.retrievedAt,
      extractionMethod: structuredClone(parsed.extractionMethod),
    }
    const batches = createEvidenceBatches(request, policy.inputBatchTokenLimit,
      policy.inputBatchOverlapCharacters ?? 0, messages => messages.reduce((sum, message) => sum + meter.estimateMessage(message), 0))
    const firstBatch = batches[0]
    if (firstBatch === undefined) throw new EvidenceError('No evidence batch was available.', 'EVIDENCE_INPUT_TOO_LARGE')
    const decision = await runScope({
      trace: { stage: 'extraction', operation: 'scope_review', academicWorkId: source.academicWorkId, workVersionId: source.workVersionId }, messages: scopeMessages(withSegments(request, firstBatch.map(piece => piece.segment)), scope, source,
        batches.length === 1 && firstBatch.length === request.segments.length),
      ...request.signal === undefined ? {} : { signal: request.signal },
      parse: parseScopeDecision,
      appendRequest: data => session.append('academic/evidence-request', { source, phase: 'scope', ...data }),
      appendResult: data => session.append('academic/evidence-result', { source, phase: 'scope', ...data }),
    })
    if (decision.status !== 'included') return { scope: decision, evidence: [] }
    const work = batches.map(batch => ({ batch, splitDepth: 0 }))
    const responses: EvidenceDraft[][] = []
    const failures: unknown[] = []
    for (let batchOffset = 0; batchOffset < work.length; batchOffset++) {
      request.signal?.throwIfAborted()
      const current = work[batchOffset]
      if (current === undefined) throw new Error('Evidence batch disappeared during extraction.')
      const batch = current.batch
      const batchIndex = batchOffset + 1
      reportPaperEvidenceProgress(onProgress, evidenceProgress(batchIndex, work.length))
      const batchRequest = withSegments(request, batch.map(piece => piece.segment))
      try {
        const response = await runEvidence({
          trace: { stage: 'extraction', operation: 'evidence_extract', academicWorkId: source.academicWorkId, workVersionId: source.workVersionId }, messages: evidenceMessages(batchRequest),
          retryLocalTimeout: false,
          ...request.signal === undefined ? {} : { signal: request.signal },
          parse: parseFocusedEvidence,
          appendRequest: data => session.append('academic/evidence-request', { source, phase: 'evidence', ...data }),
          appendResult: data => session.append('academic/evidence-result', { source, phase: 'evidence', ...data }),
          onAttempt: (observation) => {
            reportPaperEvidenceProgress(onProgress, attemptProgress(batchIndex, work.length, observation))
          },
        })
        responses.push(response.map(draft => remapDraft(draft, batch)))
      } catch (error: unknown) {
        if (error instanceof WorkflowLogError) throw error
        request.signal?.throwIfAborted()
        const split = error instanceof EvidenceError && error.code === 'EVIDENCE_MODEL_TIMEOUT'
          && policy.maxAttempts > 1 && current.splitDepth === 0
          ? splitTimedOutBatch(batch, policy.inputBatchOverlapCharacters ?? 0) : undefined
        if (split !== undefined) {
          work.splice(batchOffset, 1, ...split.map(part => ({ batch: part, splitDepth: 1 })))
          reportPaperEvidenceProgress(onProgress, { ...evidenceProgress(batchIndex, work.length),
            operation: 'waiting_retry', lastFailure: 'timeout' })
          batchOffset--
          continue
        }
        failures.push(error)
      }
    }
    if (responses.length === 0) {
      if (failures.length > 0) throw failures[0]
      throw new EvidenceError('No evidence batch was available.', 'EVIDENCE_INPUT_TOO_LARGE')
    }
    const evidence = deduplicateDrafts(responses.flat()).slice(0, MAX_EVIDENCE_DRAFTS)
    return {
      scope: decision,
      evidence,
      ...failures.length === 0 ? {} : { incompleteBatchCount: failures.length },
    }
  }
}

function splitTimedOutBatch(
  batch: readonly EvidenceSegmentPiece[], overlapCharacters: number,
): [EvidenceSegmentPiece[], EvidenceSegmentPiece[]] | undefined {
  if (batch.length > 1) {
    const middle = Math.floor(batch.length / 2)
    return [batch.slice(0, middle), batch.slice(middle)]
  }
  const piece = batch[0]
  if (piece === undefined) return undefined
  const characters = Array.from(piece.segment.text)
  if (characters.length < 2) return undefined
  const middle = Math.floor(characters.length / 2)
  const overlap = Math.min(overlapCharacters, middle - 1, characters.length - middle - 1)
  return [
    [{ ...piece, segment: { ...piece.segment, text: characters.slice(0, middle + overlap).join('') } }],
    [{ ...piece, segment: { ...piece.segment, text: characters.slice(middle - overlap).join('') } }],
  ]
}

function evidenceProgress(
  batchIndex: number,
  batchCount: number,
): Parameters<typeof reportPaperEvidenceProgress>[1] {
  return { operation: 'evidence_extract', batchIndex, batchCount, attempt: null, maximumAttempts: null,
    lastFailure: null, validatedEvidenceRecords: 0, rejectedEvidenceDrafts: 0 }
}

function attemptProgress(
  batchIndex: number,
  batchCount: number,
  observation: LoggedModelAttemptObservation,
): Parameters<typeof reportPaperEvidenceProgress>[1] {
  return { operation: observation.phase === 'retry_scheduled' ? 'waiting_retry' : 'evidence_extract',
    batchIndex, batchCount, attempt: observation.attempt, maximumAttempts: observation.maximumAttempts,
    lastFailure: observation.phase === 'started' ? null : modelProgressFailure(observation),
    validatedEvidenceRecords: 0, rejectedEvidenceDrafts: 0 }
}

function modelProgressFailure(observation: LoggedModelAttemptObservation): AcademicWorkflowProgressFailureCode | null {
  if (observation.status === null || observation.status === 'validated') return null
  if (observation.status === 'cancelled') return 'cancelled'
  if (observation.finish?.kind === 'max-tokens') return 'output_limit'
  if (observation.finish?.kind === 'error') {
    if (observation.finish.failure.code === 'TIMEOUT') return 'timeout'
    if (observation.finish.failure.code === 'TRANSPORT') return 'network_error'
  }
  switch (observation.errorCode) {
    case 'EVIDENCE_MODEL_TIMEOUT': return 'timeout'
    case 'EVIDENCE_INPUT_TOO_LARGE': return 'output_limit'
    case 'EVIDENCE_MODEL_INCOMPLETE': return 'incomplete_output'
    case 'EVIDENCE_INVALID_MODEL_OUTPUT':
    case 'EVIDENCE_MODEL_UNEXPECTED_CONTENT': return 'invalid_output'
    default: return 'unknown'
  }
}

function createEvidenceBatches(
  request: EvidenceGenerationRequest,
  tokenLimit: number | undefined,
  overlapCharacters: number,
  estimate: (messages: ReturnType<typeof evidenceMessages>) => number,
): EvidenceSegmentPiece[][] {
  const original = request.segments.map((segment, originalSegmentIndex) => ({ originalSegmentIndex, segment }))
  if (tokenLimit === undefined) return [original]
  const tokensFor = (pieces: readonly EvidenceSegmentPiece[]) => estimate(evidenceMessages(
    withSegments(request, pieces.map(piece => piece.segment)),
  ))
  const pieces = original.flatMap(piece => splitPiece(piece, tokenLimit, overlapCharacters, tokensFor))
  const batches: EvidenceSegmentPiece[][] = []
  let current: EvidenceSegmentPiece[] = []
  for (const piece of pieces) {
    if (current.length > 0 && tokensFor([...current, piece]) > tokenLimit) {
      batches.push(current)
      current = []
    }
    current.push(piece)
  }
  if (current.length > 0) batches.push(current)
  return batches
}

/** Reuse the existing admission context bound when the formal evidence path uses fragments.
 * @param request Complete parsed segments and approved focus questions.
 * @param tokenLimit Optional estimated input bound used by the prior whole-paper path.
 * @param overlapCharacters Repeated source characters at split boundaries.
 * @param estimate Estimate the token cost of framed model messages.
 * @param traceObserver Optional safe diagnostic sink.
 * @returns The first admission batch and whether it contains the whole source.
 */
export function firstScopeBatch(
  request: EvidenceGenerationRequest,
  tokenLimit: number | undefined,
  overlapCharacters: number,
  estimate: (messages: ReturnType<typeof evidenceMessages>) => number,
): { readonly segments: readonly EvidenceContentSegment[]; readonly complete: boolean } {
  const batches = createEvidenceBatches(request, tokenLimit, overlapCharacters, estimate)
  const first = batches[0]
  if (first === undefined) throw new EvidenceError('No evidence batch was available.', 'EVIDENCE_INPUT_TOO_LARGE')
  return { segments: first.map(piece => piece.segment),
    complete: batches.length === 1 && first.length === request.segments.length }
}

function splitPiece(
  piece: EvidenceSegmentPiece,
  tokenLimit: number,
  overlapCharacters: number,
  tokensFor: (pieces: readonly EvidenceSegmentPiece[]) => number,
): EvidenceSegmentPiece[] {
  if (tokensFor([piece]) <= tokenLimit) return [piece]
  const output: EvidenceSegmentPiece[] = []
  let start = 0
  while (start < piece.segment.text.length) {
    let low = start + 1
    let high = piece.segment.text.length
    let fittingEnd = start
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const candidate = { ...piece, segment: { ...piece.segment, text: piece.segment.text.slice(start, middle) } }
      if (tokensFor([candidate]) <= tokenLimit) {
        fittingEnd = middle
        low = middle + 1
      } else high = middle - 1
    }
    if (fittingEnd === start) {
      throw new EvidenceError('Evidence batch token limit cannot fit the fixed extraction instructions.', 'EVIDENCE_INPUT_TOO_LARGE')
    }
    output.push({ ...piece, segment: { ...piece.segment, text: piece.segment.text.slice(start, fittingEnd) } })
    if (fittingEnd === piece.segment.text.length) break
    start = fittingEnd - start > overlapCharacters ? fittingEnd - overlapCharacters : fittingEnd
  }
  return output
}

function withSegments(request: EvidenceGenerationRequest, segments: readonly EvidenceContentSegment[]): EvidenceGenerationRequest {
  return { ...request, segments }
}

function remapDraft(draft: EvidenceDraft, batch: readonly EvidenceSegmentPiece[]): EvidenceDraft {
  return { ...draft, segmentIndex: batch[draft.segmentIndex]?.originalSegmentIndex ?? -1 }
}

function deduplicateDrafts(drafts: readonly EvidenceDraft[]): EvidenceDraft[] {
  const seen = new Set<string>()
  return drafts.filter((draft) => {
    const questionIndexes = draft.questionIndexes?.toSorted((left, right) => left - right)
    const key = JSON.stringify([draft.segmentIndex, draft.verbatimExcerpt, draft.sourcedStatement, questionIndexes])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
