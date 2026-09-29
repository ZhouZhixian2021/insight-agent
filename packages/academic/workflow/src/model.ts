/** Session-backed evidence extraction through the shared durable model transport. */
import type { Context } from '@deepseek-ai/cordis'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import type { EvidenceContentSegment, EvidenceDraft, EvidenceGenerationRequest } from '@deepseek-ai/dsh-academic-evidence'
import { EvidenceError } from '@deepseek-ai/dsh-academic-evidence'
import { parsePaperModelResponse } from './parse-evidence.ts'
import { evidenceMessages } from './model-prompt.ts'
import { createLoggedModelRunner } from './model-call.ts'
import type { LoggedModelAttemptObservation } from './model-call.ts'
import { WorkflowLogError } from './model-errors.ts'
import { MAX_EVIDENCE_DRAFTS } from './model-limits.ts'
import { reportPaperEvidenceProgress } from './evidence-progress.ts'
import type { EvidenceExtractionModelPolicy, EvidenceModelSource, PaperEvidenceGenerator, PaperModelResponse,
  PaperScopeRules } from './model-types.ts'
import type { AcademicWorkflowProgressFailureCode } from './progress.ts'

interface EvidenceSegmentPiece {
  readonly originalSegmentIndex: number
  readonly segment: EvidenceContentSegment
}

/**
 * Bind extraction to a live Session with exact provenance and durable model records.
 * @param ctx DSH model, token-meter and persistence services.
 * @param session Live Session with an active durable writer.
 * @param config Explicit model route and generation controls.
 * @param policy Bounded recovery; only output-limit exhaustion is retried.
 * @returns A source-aware generator for one paper.
 */
export function createModelEvidenceGenerator(
  ctx: Context, session: Session, config: LlmCallConfig, policy: EvidenceExtractionModelPolicy,
): PaperEvidenceGenerator {
  const run = createLoggedModelRunner<PaperModelResponse>(ctx, session, config, policy)
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
    const batches = createEvidenceBatches(request, scope, source, policy.inputBatchTokenLimit,
      policy.inputBatchOverlapCharacters ?? 0, messages => messages.reduce((sum, message) => sum + meter.estimateMessage(message), 0))
    const responses: PaperModelResponse[] = []
    const failures: unknown[] = []
    for (const [batchOffset, batch] of batches.entries()) {
      request.signal?.throwIfAborted()
      const batchIndex = batchOffset + 1
      reportPaperEvidenceProgress(onProgress, evidenceProgress(batchIndex, batches.length))
      const batchRequest = withSegments(request, batch.map(piece => piece.segment))
      try {
        const response = await run({
          messages: evidenceMessages(batchRequest, scope, source),
          ...request.signal === undefined ? {} : { signal: request.signal },
          parse: parsePaperModelResponse,
          appendRequest: data => session.append('academic/evidence-request', { source, ...data }),
          appendResult: data => session.append('academic/evidence-result', { source, ...data }),
          onAttempt: (observation) => {
            reportPaperEvidenceProgress(onProgress, attemptProgress(batchIndex, batches.length, observation))
          },
        })
        responses.push({ ...response, evidence: response.evidence.map(draft => remapDraft(draft, batch)) })
      } catch (error: unknown) {
        if (error instanceof WorkflowLogError) throw error
        request.signal?.throwIfAborted()
        failures.push(error)
      }
    }
    const included = responses.filter(response => response.scope.status === 'included')
    const firstIncluded = included[0]
    if (firstIncluded === undefined) {
      if (failures.length > 0) throw failures[0]
      const excluded = responses[0]
      if (excluded === undefined) throw new EvidenceError('No evidence batch was available.', 'EVIDENCE_INPUT_TOO_LARGE')
      return excluded
    }
    const evidence = deduplicateDrafts(included.flatMap(response => response.evidence)).slice(0, MAX_EVIDENCE_DRAFTS)
    return {
      scope: firstIncluded.scope,
      evidence,
      ...failures.length === 0 ? {} : { incompleteBatchCount: failures.length },
    }
  }
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
  scope: PaperScopeRules,
  source: EvidenceModelSource,
  tokenLimit: number | undefined,
  overlapCharacters: number,
  estimate: (messages: ReturnType<typeof evidenceMessages>) => number,
): EvidenceSegmentPiece[][] {
  const original = request.segments.map((segment, originalSegmentIndex) => ({ originalSegmentIndex, segment }))
  if (tokenLimit === undefined) return [original]
  const tokensFor = (pieces: readonly EvidenceSegmentPiece[]) => estimate(evidenceMessages(
    withSegments(request, pieces.map(piece => piece.segment)), scope, source,
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
    const key = `${draft.segmentIndex}\u0000${draft.verbatimExcerpt}\u0000${draft.sourcedStatement}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
