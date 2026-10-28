/** Shared bounded model transport; callers own prompts, parsing and durable event names. */
import { academicTraceCallKey, academicTraceSpan, observeAcademicTrace, type AcademicTraceObserver, type AcademicTraceOperationIdentity } from './trace.ts'
import { academicTraceSpanId, type AcademicTraceSpan } from '@deepseek-ai/dsh-academic-model'
import type { Context } from '@deepseek-ai/cordis'
import { setTimeout as delay } from 'node:timers/promises'
import { isDeepStrictEqual } from 'node:util'
import { AssistantStreamAccumulator, BlockAssembler, type LlmCallConfig, type Message } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-token-meter'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { EvidenceError } from '@deepseek-ai/dsh-academic-evidence'
import { SynthesisError } from '@deepseek-ai/dsh-academic-analysis'
import { WorkflowLogError } from './model-errors.ts'
import type { EvidenceModelPolicy, EvidenceModelRequest, EvidenceModelResult } from './model-types.ts'

/** Internal marker preserving the existing durable code while identifying output-limit exhaustion to synthesis. */
export class ModelOutputLimitError extends EvidenceError {
  constructor() { super('Model did not complete a text response.', 'EVIDENCE_MODEL_INCOMPLETE') }
}

/** Operation-owned callbacks keep evidence and synthesis request-result records separate. */
export interface LoggedModelRequest<T> {
  readonly trace?: AcademicTraceOperationIdentity
  readonly messages: Message[]
  /** A local attempt deadline may be recovered by the caller with smaller input instead of repeating this request. */
  readonly retryLocalTimeout?: boolean
  /** Smaller request used once after output-limit exhaustion; omitted callers repeat their original request. */
  readonly outputLimitRetryMessages?: Message[]
  /** Build a complete replacement request after structural validation rejects a settled response. */
  readonly invalidOutputRetryMessages?: (error: unknown, compact: boolean) => Message[]
  readonly signal?: AbortSignal
  readonly parse: (text: string) => T
  readonly appendRequest: (data: Omit<EvidenceModelRequest, 'source'>) => SessionEvent & { readonly data: Omit<EvidenceModelRequest, 'source'> }
  readonly appendResult: (data: Omit<EvidenceModelResult, 'source'>) => SessionEvent
  /** Observe attempts only after their request or result record is durable. */
  readonly onAttempt?: (observation: LoggedModelAttemptObservation) => void
}

/** Durable attempt commit observed by an operation-specific progress adapter. */
export interface LoggedModelAttemptObservation {
  readonly phase: 'started' | 'settled' | 'retry_scheduled'
  readonly attempt: number
  readonly maximumAttempts: number
  readonly status: EvidenceModelResult['status'] | null
  readonly finish: EvidenceModelResult['finish'] | null
  readonly errorCode: string | null
}

/**
 * Bind a model route to durable recording and bounded recovery.
 * @param ctx DSH model, token-meter and persistence services.
 * @param session Live Session with a durable writer.
 * @param config Selected route and output-token reserve.
 * @param policy Total attempts plus optional output-limit, invalid-response and transient-failure recovery.
 * @param traceObserver Optional safe diagnostic sink; callback failures do not change model results.
 * @returns A tool-free model runner using the exact persisted messages.
 */
export function createLoggedModelRunner<T>(ctx: Context, session: Session, config: LlmCallConfig,
  policy: EvidenceModelPolicy, traceObserver?: AcademicTraceObserver): (request: LoggedModelRequest<T>) => Promise<T> {
  const llm = ctx.get('llm'), sessions = ctx.get('sessions'), meter = ctx.get('tokenMeter')
  const persistence = ctx.get('sessionPersistence')
  if (!llm || !sessions || !meter || !persistence) {
    throw new Error('Academic extraction requires llm, sessions, sessionPersistence and tokenMeter.')
  }
  if (!Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new Error('Academic extraction maxAttempts must be a positive safe integer.')
  }
  if (policy.attemptTimeoutMs !== undefined
    && (!Number.isSafeInteger(policy.attemptTimeoutMs) || policy.attemptTimeoutMs < 1)) {
    throw new Error('Academic model attemptTimeoutMs must be a positive safe integer.')
  }
  const transientRetry = policy.transientRetry
  if (transientRetry !== undefined) {
    if (transientRetry.failureCodes.length === 0 || new Set(transientRetry.failureCodes).size !== transientRetry.failureCodes.length) {
      throw new Error('Academic transient retry failureCodes must be non-empty and unique.')
    }
    if (!Number.isSafeInteger(transientRetry.initialDelayMs) || transientRetry.initialDelayMs < 0) {
      throw new Error('Academic transient retry initialDelayMs must be a non-negative safe integer.')
    }
    const lastDelay = transientRetry.initialDelayMs * 2 ** Math.max(0, policy.maxAttempts - 2)
    if (!Number.isSafeInteger(lastDelay)) throw new Error('Academic transient retry delay exceeds the safe integer range.')
  }
  const selectedConfig = structuredClone(config)
  const flush = () => sessions.flush(session)
  const openReader = () => persistence.open(session.id, 'read')

  async function record<T extends SessionEvent>(append: () => T): Promise<T> {
    try {
      const event = append()
      if (!await flush()) throw new Error('No Session durability listener is active.')
      // A registered flush listener can be a no-op when this Session has no live writer.
      await using reader = await openReader()
      const [stored] = (await reader.read(event.seq, 1)).events
      if (!isDeepStrictEqual(stored, event)) throw new Error('Session storage did not retain the model record.')
      return event
    } catch (cause: unknown) {
      throw new WorkflowLogError(cause)
    }
  }

  return async (request: LoggedModelRequest<T>) => {
    request.signal?.throwIfAborted()
    if (policy.retryInvalidOutput === true && request.invalidOutputRetryMessages === undefined) {
      throw new Error('Academic invalid-output retry requires recovery messages.')
    }
    const identity = request.trace
    const callKey = academicTraceCallKey()
    const parent = identity === undefined ? null : academicTraceSpanId(identity.workVersionId === undefined
      ? `stage:${identity.stage}` : `paper:${identity.stage}:${identity.workVersionId}`)
    const call: AcademicTraceSpan = { ...academicTraceSpan(callKey, parent, 'call', identity?.stage ?? null, identity?.operation ?? 'unknown'),
      academicWorkId: identity?.academicWorkId ?? null, workVersionId: identity?.workVersionId ?? null,
      providerId: safeIdentifier(selectedConfig.provider), model: safeIdentifier(selectedConfig.model),
      startedAt: new Date().toISOString() }
    const callStarted = performance.now()
    const observe = (span: AcademicTraceSpan) =>{  observeAcademicTrace(traceObserver, span) }
    observe(call)
    let useOutputLimitRecovery = false
    let validationRecoveryMessages: Message[] | undefined
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      const started = performance.now()
      const attemptSpan: AcademicTraceSpan = { ...call, spanId: academicTraceSpanId(`${callKey}:attempt:${attempt}`),
        parentSpanId: call.spanId, kind: 'attempt', attemptIndex: attempt, startedAt: new Date().toISOString() }
      observe(attemptSpan)
      let streamStarted: number | undefined
      let executionMs: number | undefined
      const timeoutController = policy.attemptTimeoutMs === undefined ? undefined : new AbortController()
      const timeout = timeoutController === undefined ? undefined : setTimeout(() => {
        timeoutController.abort(new DOMException('Academic model attempt timed out.', 'TimeoutError'))
      }, policy.attemptTimeoutMs)
      timeout?.unref()
      const attemptSignal = timeoutController === undefined ? request.signal : request.signal === undefined
        ? timeoutController.signal : AbortSignal.any([request.signal, timeoutController.signal])
      let requestSeq: SessionSeq | null = null
      const assembler = new BlockAssembler()
      const accumulator = new AssistantStreamAccumulator()
      let finish: EvidenceModelResult['finish']
      let status: EvidenceModelResult['status'] = 'failed'
      let errorCode: string | undefined
      let failure: unknown
      let result: T | undefined
      let firstContentElapsedMs: number | undefined
      let stage: 'prepare' | 'admission' | 'stream' | 'parse' = 'prepare'
      let failurePhase: EvidenceModelResult['failurePhase']
      try {
        const prepared = await llm.prepareCall(selectedConfig, attemptSignal)
        stage = 'admission'
        attemptSignal?.throwIfAborted()
        const contextWindow = prepared.context?.contextWindow
        const outputTokens = prepared.config.maxTokens
        if (contextWindow === undefined || outputTokens === undefined
          || !Number.isSafeInteger(outputTokens) || outputTokens <= 0) {
          throw new EvidenceError('Model context window and output-token cap are required.', 'EVIDENCE_MODEL_BUDGET_UNKNOWN')
        }
        const messages = validationRecoveryMessages
          ?? (useOutputLimitRecovery ? request.outputLimitRetryMessages ?? request.messages : request.messages)
        const estimatedInputTokens = messages.reduce((sum, message) => sum + meter.estimateMessage(message), 0)
        const oversized = estimatedInputTokens + outputTokens > contextWindow
        const logged = await record(() => request.appendRequest({ config: prepared.config,
          messages, estimatedInputTokens, contextWindow, outputTokens, attempt, maxAttempts: policy.maxAttempts,
          decision: oversized ? 'skip_input_limit' : 'dispatch' }))
        requestSeq = logged.seq
        reportAttempt(request.onAttempt, { phase: 'started', attempt, maximumAttempts: policy.maxAttempts,
          status: null, finish: null, errorCode: null })
        attemptSignal?.throwIfAborted()
        if (oversized) {
          status = 'skipped'
          throw new EvidenceError('Paper exceeds the estimated model input budget.', 'EVIDENCE_INPUT_TOO_LARGE')
        }
        stage = 'stream'
        // The Session's immutable event supplies exactly the config and messages dispatched.
        streamStarted = performance.now()
        const stream = prepared.stream(Object.freeze({ ...logged.data.config, messages: logged.data.messages,
          sessionId: session.id, ...attemptSignal === undefined ? {} : { signal: attemptSignal } }))
        const iterator = stream[Symbol.asyncIterator]()
        while (true) {
          // Some gateways do not settle a pending stream read after abort. Enforce the
          // attempt deadline locally so one candidate cannot hold the whole run open.
          const next = await nextModelChunk(iterator, attemptSignal)
          if (next.done) break
          const chunk = next.value
          if (firstContentElapsedMs === undefined && (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta')) {
            firstContentElapsedMs = Math.round(performance.now() - started)
          }
          accumulator.push({ time: Date.now(), chunk })
          assembler.push(chunk)
          if (chunk.type === 'finish') finish = chunk.reason
          attemptSignal?.throwIfAborted()
        }
        executionMs = Math.round(performance.now() - streamStarted)
        stage = 'parse'
        attemptSignal?.throwIfAborted()
        if (finish?.kind !== 'stop') {
          if (finish?.kind === 'max-tokens') throw new ModelOutputLimitError()
          throw new EvidenceError('Model did not complete a text response.', 'EVIDENCE_MODEL_INCOMPLETE')
        }
        const blocks = assembler.blocks()
        if (blocks.some(block => block.type !== 'text' && block.type !== 'reasoning')) {
          throw new EvidenceError('Unexpected non-text model output.', 'EVIDENCE_MODEL_UNEXPECTED_CONTENT')
        }
        const text = blocks.filter(block => block.type === 'text').map(block => block.text).join('')
        result = request.parse(text)
        status = 'validated'
      } catch (error: unknown) {
        if (error instanceof WorkflowLogError) {
          observe({ ...attemptSpan, status: 'unknown', gaps: [{ code: 'source_unavailable', field: 'status', message: 'Model record could not be committed.' }] })
          throw error
        }
        if (streamStarted !== undefined && executionMs === undefined) executionMs = Math.round(performance.now() - streamStarted)
        failurePhase = stage === 'stream' || (stage === 'parse' && finish?.kind === 'error')
          ? firstContentElapsedMs === undefined ? 'before_content' : 'after_content' : stage
        if (timeoutController?.signal.aborted === true && request.signal?.aborted !== true) {
          finish = { kind: 'error', failure: { code: 'TIMEOUT', message: 'Academic model attempt timed out.' } }
          failure = new EvidenceError('Academic model attempt timed out.', 'EVIDENCE_MODEL_TIMEOUT', { cause: error })
          errorCode = 'EVIDENCE_MODEL_TIMEOUT'
        } else {
          failure = error
          if (request.signal?.aborted || finish?.kind === 'aborted') status = 'cancelled'
          errorCode = error instanceof EvidenceError || error instanceof SynthesisError ? error.code : 'EVIDENCE_MODEL_CALL_FAILED'
        }
      } finally {
        if (timeout !== undefined) clearTimeout(timeout)
      }
      const resultRecord = await record(() => request.appendResult({ requestSeq, attempt,
        maxAttempts: policy.maxAttempts, status, stream: accumulator.snapshot(),
        elapsedMs: Math.round(performance.now() - started),
        ...firstContentElapsedMs === undefined ? {} : { firstContentElapsedMs },
        ...failurePhase === undefined ? {} : { failurePhase },
        ...finish === undefined ? {} : { finish }, ...assembler.usage === undefined ? {} : { usage: assembler.usage },
        ...errorCode === undefined ? {} : { errorCode } }))
      const observedStatus = resultRecord.type === 'academic/synthesis-result' ? resultRecord.data.status : status
      const spanStatus = observedStatus === 'validated' ? 'succeeded'
        : observedStatus === 'partially_validated' ? 'partial_success' : observedStatus
      const safeFailure: AcademicTraceSpan['failure'] = errorCode === undefined ? null : {
        code: errorCode.includes('TIMEOUT') ? 'timeout' as const : finish?.kind === 'max-tokens' ? 'output_limit' as const
          : finish?.kind === 'error' && finish.failure.code === 'TRANSPORT' ? 'transport' as const
            : failurePhase === 'parse' ? 'parse' as const : failurePhase === 'admission' ? 'admission' as const : 'other' as const,
        phase: failurePhase ?? 'unknown', message: 'Model attempt did not produce a validated result.' }
      const settledSpan: AcademicTraceSpan = { ...attemptSpan, status: spanStatus, businessStatus: observedStatus,
        endedAt: new Date().toISOString(), failure: status === 'cancelled' ? null : safeFailure,
        timing: { ...attemptSpan.timing, totalMs: { value: Math.round(performance.now() - started), basis: 'monotonic' },
          executionMs: executionMs === undefined ? { value: null, basis: 'unknown' } : { value: executionMs, basis: 'monotonic' } } }
      observe(settledSpan)
      const finishCall = (state: AcademicTraceSpan['status']) =>{  observe({ ...call, status: state,
        endedAt: new Date().toISOString(), failure: settledSpan.failure,
        timing: { ...call.timing, totalMs: { value: Math.round(performance.now() - callStarted), basis: 'monotonic' } } }) }
      const settled: LoggedModelAttemptObservation = { phase: 'settled', attempt, maximumAttempts: policy.maxAttempts,
        status, finish: finish ?? null, errorCode: errorCode ?? null }
      reportAttempt(request.onAttempt, settled)
      // A cancellation arriving during result persistence still prevents downstream extraction.
      request.signal?.throwIfAborted()
      if (result !== undefined) { finishCall(spanStatus); return result }
      const retryOutputLimit = policy.retryOutputLimit === true && !useOutputLimitRecovery
        && errorCode === 'EVIDENCE_MODEL_INCOMPLETE' && finish?.kind === 'max-tokens'
      const transientFailureCode = finish?.kind === 'error'
        && (finish.failure.code === 'TRANSPORT' || finish.failure.code === 'TIMEOUT') ? finish.failure.code : undefined
      const retryTransient = transientFailureCode !== undefined
        && transientRetry?.failureCodes.includes(transientFailureCode) === true
        && (request.retryLocalTimeout !== false || timeoutController?.signal.aborted !== true)
      const nextValidationRecovery = policy.retryInvalidOutput === true
        && errorCode === 'SYNTHESIS_INVALID_MODEL_OUTPUT' && finish?.kind === 'stop'
        ? request.invalidOutputRetryMessages?.(failure, useOutputLimitRecovery) : undefined
      const retryInvalidOutput = nextValidationRecovery !== undefined
      if ((!retryOutputLimit && !retryTransient && !retryInvalidOutput) || attempt === policy.maxAttempts) {
        finishCall(spanStatus); throw failure
      }
      observe({ ...call, status: 'retry_wait', failure: settledSpan.failure })
      reportAttempt(request.onAttempt, { ...settled, phase: 'retry_scheduled' })
      if (retryOutputLimit) {
        useOutputLimitRecovery = true
        validationRecoveryMessages = undefined
      } else if (retryInvalidOutput) {
        validationRecoveryMessages = nextValidationRecovery
      }
      if (retryTransient && transientRetry.initialDelayMs > 0) {
        await delay(transientRetry.initialDelayMs * 2 ** (attempt - 1), undefined,
          request.signal === undefined ? undefined : { signal: request.signal })
      }
    }
    throw new Error('Academic extraction exhausted an invalid attempt range.')
  }
}

async function nextModelChunk<T>(iterator: AsyncIterator<T>, signal?: AbortSignal): Promise<IteratorResult<T>> {
  if (signal === undefined) return iterator.next()
  signal.throwIfAborted()
  let onAbort: (() => void) | undefined
  try {
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        reject(signal.reason instanceof Error
          ? signal.reason : new DOMException('Academic model attempt aborted.', 'AbortError'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })
    return await Promise.race([iterator.next(), aborted])
  } finally {
    if (onAbort !== undefined) signal.removeEventListener('abort', onAbort)
  }
}

function reportAttempt(
  observer: LoggedModelRequest<unknown>['onAttempt'],
  observation: LoggedModelAttemptObservation,
): void {
  if (observer === undefined) return
  try {
    observer(observation)
  } catch {
    // Attempt progress is observational; durable model execution remains authoritative.
  }
}

function safeIdentifier(value: string | undefined): string | null {
  return value !== undefined && /^[\w./:-]{1,120}$/u.test(value) ? value : null
}
