import type { AcademicTraceObserver } from './trace.ts'
/** Formal Session-backed scope review and incremental source-verified extraction. */
import { isDeepStrictEqual } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import { EvidenceError, enhanceEvidenceInFragments, extractEvidenceFromContent, extractEvidenceInFragments,
  type EvidenceFragmentFailureCategory,
  type EvidenceFragmentOptions, type EvidenceFragmentPolicy, type EvidenceFragmentResult,
  type EvidenceGenerationRequest, type EvidenceDraft, type EvidenceExtractionInput,
  type EvidenceExtractionResult } from '@deepseek-ai/dsh-academic-evidence'
import { createLoggedModelRunner, type LoggedModelAttemptObservation } from './model-call.ts'
import { WorkflowLogError } from './model-errors.ts'
import { evidenceMessages, scopeMessages } from './model-prompt.ts'
import { parseFocusedEvidence, parseScopeDecision } from './parse-evidence.ts'
import { reportPaperEvidenceProgress } from './evidence-progress.ts'
import { reviewPaperScope } from './model.ts'
import type { EvidenceExtractionModelPolicy, EvidenceModelSource, PaperScopeDecision,
  PaperEvidenceProgressObserver, PaperVerifiedEvidenceGenerator } from './model-types.ts'

const DEFAULT_FRAGMENT_POLICY: EvidenceFragmentPolicy = {
  maximumCharacters: 4_000, minimumCharacters: 1_000, overlapCharacters: 256,
  maximumAttempts: 3, maximumOutputTokens: 16_384, initialRetryDelayMs: 1_000,
}

class FragmentModelFailure extends Error {
  constructor(readonly category: EvidenceFragmentFailureCategory, cause: unknown,
    readonly requestId?: string) {
    super('Academic fragment model attempt failed.', { cause })
  }
}
/** Bind the formal model route to B's fragment extractor without nested evidence retries.
 * @param ctx DSH model, token-meter and Session persistence services.
 * @param session Live Session with an active persistence writer.
 * @param config Selected model route and output controls.
 * @param policy Existing scope policy plus optional fragment controls.
 * @param traceObserver Optional safe diagnostic sink.
 * @returns A scope reviewer and incrementally verified evidence generator.
 */
export function createModelFragmentEvidenceGenerator(
  ctx: Context, session: Session, config: LlmCallConfig, policy: EvidenceExtractionModelPolicy, traceObserver?: AcademicTraceObserver,
): PaperVerifiedEvidenceGenerator {
  const runScope = createLoggedModelRunner<PaperScopeDecision>(ctx, session, config, policy, traceObserver)
  const meter = ctx.get('tokenMeter')
  if (!meter) throw new Error('Academic fragment extraction requires tokenMeter.')

  return async (parsed, scope, onProgress, signal) => {
    signal?.throwIfAborted()
    const extractionInput = { ...parsed, depth: policy.depth ?? 'complete' }
    const source: EvidenceModelSource = {
      academicWorkId: parsed.academicWorkId, workVersionId: parsed.workVersionId,
      contentHash: parsed.contentHash, sourceProvider: parsed.sourceProvider,
      sourceUrl: parsed.sourceUrl, retrievedAt: parsed.retrievedAt,
      extractionMethod: structuredClone(parsed.extractionMethod),
    }
    const baseRequest: EvidenceGenerationRequest = {
      instruction: '', focusQuestions: [...(parsed.focusQuestions ?? [])], segments: parsed.segments,
      ...signal === undefined ? {} : { signal },
    }
    const decision = await reviewPaperScope(baseRequest, policy,
      messages => messages.reduce((sum, message) => sum + meter.estimateMessage(message), 0),
      (scopeRequest, complete) => runScope({
        trace: { stage: 'extraction', operation: 'scope_review', academicWorkId: source.academicWorkId, workVersionId: source.workVersionId },
        messages: scopeMessages(scopeRequest, scope, source, complete),
        ...signal === undefined ? {} : { signal }, parse: parseScopeDecision,
        appendRequest: data => session.append('academic/evidence-request', { source, phase: 'scope', ...data }),
        appendResult: data => session.append('academic/evidence-result', { source, phase: 'scope', ...data }),
      }))
    if (decision.status !== 'included') {
      return { scope: decision, evidence: await extractEvidenceFromContent(extractionInput, () => Promise.resolve([]), signal),
        incompleteFragmentCount: 0 }
    }

    const result = await extractEvidenceInFragments(extractionInput,
      fragmentOptions(ctx, session, config, policy, extractionInput, onProgress, undefined, traceObserver), signal)
    if (result.evidence.evidenceRecords.length === 0 && result.failures.length > 0
      && result.failures.every(failure => failure.error instanceof FragmentModelFailure
        && failure.error.cause instanceof EvidenceError
        && failure.error.cause.code === 'EVIDENCE_INPUT_TOO_LARGE')) {
      throw new EvidenceError('Paper fragments exceed the estimated model input budget.', 'EVIDENCE_INPUT_TOO_LARGE')
    }
    return { scope: decision, evidence: result.evidence,
      incompleteFragmentCount: extractionInput.depth === 'minimal' && result.evidence.evidenceRecords.length === 5
        && result.failures.length === 0 ? 0 : result.incompleteFragments.length }
  }
}

/**
 * Bind B's complete-depth supplementation to the same logged model and durable fragment sink.
 * @param ctx DSH model and Session persistence services.
 * @param session Session containing the previously committed minimal evidence.
 * @param config Selected model route.
 * @param policy Bounded model and fragment controls.
 * @param traceObserver Optional safe diagnostic sink.
 * @returns A single-paper enhancement operation; it does not start automatically.
 */
export function createModelFragmentEvidenceEnhancer(
  ctx: Context, session: Session, config: LlmCallConfig, policy: EvidenceExtractionModelPolicy, traceObserver?: AcademicTraceObserver,
): (source: EvidenceExtractionInput, initial: EvidenceExtractionResult, signal?: AbortSignal) => Promise<EvidenceFragmentResult> {
  return (source, initial, signal) => enhanceEvidenceInFragments(source, initial,
    fragmentOptions(ctx, session, config, policy, source, undefined, 'enhancement', traceObserver), signal)
}

function fragmentOptions(ctx: Context, session: Session, config: LlmCallConfig,
  policy: EvidenceExtractionModelPolicy, parsed: EvidenceExtractionInput,
  onProgress?: PaperEvidenceProgressObserver, purpose?: 'enhancement', traceObserver?: AcademicTraceObserver): EvidenceFragmentOptions {
  const fragmentPolicy = policy.fragmentPolicy ?? DEFAULT_FRAGMENT_POLICY
  const outputCap = Math.min(config.maxTokens ?? fragmentPolicy.maximumOutputTokens,
    fragmentPolicy.maximumOutputTokens)
  if (!Number.isSafeInteger(outputCap) || outputCap < 1) throw new RangeError('Academic fragment output cap is invalid.')
  const runFragment = createLoggedModelRunner<readonly EvidenceDraft[]>(ctx, session, { ...config, maxTokens: outputCap },
    { maxAttempts: 1, ...policy.attemptTimeoutMs === undefined ? {} : { attemptTimeoutMs: policy.attemptTimeoutMs } }, traceObserver)
  const sessions = ctx.get('sessions'), persistence = ctx.get('sessionPersistence')
  if (!sessions || !persistence) throw new Error('Academic fragment extraction requires Session persistence.')
  const source: EvidenceModelSource = {
    academicWorkId: parsed.academicWorkId, workVersionId: parsed.workVersionId,
    contentHash: parsed.contentHash, sourceProvider: parsed.sourceProvider,
    sourceUrl: parsed.sourceUrl, retrievedAt: parsed.retrievedAt,
    extractionMethod: structuredClone(parsed.extractionMethod),
  }
  let validatedRecords = 0, rejectedDrafts = 0
  return {
    policy: { ...fragmentPolicy, maximumOutputTokens: outputCap },
    ...parsed.depth === 'minimal' && policy.questionTerms !== undefined
      ? { questionTerms: policy.questionTerms } : {},
    generator: async (request, fragment) => {
      let settled: LoggedModelAttemptObservation | undefined
      reportPaperEvidenceProgress(onProgress, { operation: 'evidence_extract', batchIndex: fragment.fragmentIndex,
        batchCount: null, attempt: fragment.attempt, maximumAttempts: fragment.maximumAttempts,
        lastFailure: null, validatedEvidenceRecords: validatedRecords, rejectedEvidenceDrafts: rejectedDrafts })
      try {
        return await runFragment({ trace: { stage: 'extraction', operation: 'evidence_extract', academicWorkId: source.academicWorkId, workVersionId: source.workVersionId }, messages: evidenceMessages(request, purpose === 'enhancement' ? 'complete' : parsed.depth),
          ...request.signal === undefined ? {} : { signal: request.signal }, parse: parseFocusedEvidence,
          appendRequest: data => session.append('academic/evidence-request',
            { source, phase: 'evidence', fragment, ...data }),
          appendResult: data => session.append('academic/evidence-result',
            { source, phase: 'evidence', fragment, ...data }),
          onAttempt: (observation) => { if (observation.phase === 'settled') settled = observation },
        })
      } catch (error: unknown) {
        if (error instanceof WorkflowLogError || request.signal?.aborted) throw error
        const failure = settled?.finish?.kind === 'error' ? settled.finish.failure : undefined
        if (failure !== undefined && failure.code !== 'TRANSPORT' && failure.code !== 'TIMEOUT') throw error
        const category = failure?.code === 'TRANSPORT' ? 'transport'
          : failure?.code === 'TIMEOUT' ? 'timeout' : classifyEvidenceError(error)
        if (category === null) throw error
        throw new FragmentModelFailure(category, error, failure?.requestId)
      }
    },
    classifyFailure: error => error instanceof FragmentModelFailure ? error.category : classifyEvidenceError(error),
    onVerified: async (fragment, evidence) => {
      try {
        const event = session.append('academic/evidence-fragment-verified', { source, fragment, evidence,
          ...purpose === undefined ? {} : { purpose } })
        if (!await sessions.flush(session)) throw new Error('No Session durability listener is active.')
        await using reader = await persistence.open(session.id, 'read')
        const [stored] = (await reader.read(event.seq, 1)).events
        if (!isDeepStrictEqual(stored, event)) throw new Error('Session storage did not retain verified evidence.')
      } catch (cause: unknown) {
        throw new WorkflowLogError(cause)
      }
      validatedRecords += evidence.evidenceRecords.length
      rejectedDrafts += evidence.rejectedDrafts.length
      reportPaperEvidenceProgress(onProgress, { operation: 'evidence_validate', batchIndex: fragment.fragmentIndex,
        batchCount: null, attempt: fragment.attempt, maximumAttempts: fragment.maximumAttempts,
        lastFailure: null, validatedEvidenceRecords: validatedRecords, rejectedEvidenceDrafts: rejectedDrafts })
    },
    onFailure: (failure) => { reportPaperEvidenceProgress(onProgress, { operation: 'waiting_retry',
      batchIndex: failure.fragmentIndex, batchCount: null, attempt: failure.attempt,
      maximumAttempts: failure.maximumAttempts,
      lastFailure: failure.category === 'transport' ? 'network_error'
        : failure.category === 'timeout' ? 'timeout'
          : failure.category === 'parse_failed' ? 'invalid_output' : 'incomplete_output',
      validatedEvidenceRecords: validatedRecords, rejectedEvidenceDrafts: rejectedDrafts }) },
  }
}

function classifyEvidenceError(error: unknown): EvidenceFragmentFailureCategory | null {
  if (!(error instanceof EvidenceError)) return null
  switch (error.code) {
    case 'EVIDENCE_MODEL_TIMEOUT': return 'timeout'
    case 'EVIDENCE_INVALID_MODEL_OUTPUT': return 'parse_failed'
    case 'EVIDENCE_MODEL_INCOMPLETE':
    case 'EVIDENCE_INPUT_TOO_LARGE': return 'incomplete_output'
    default: return null
  }
}
