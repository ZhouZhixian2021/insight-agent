/** Shared bounded model transport; callers own prompts, parsing and durable event names. */
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

/** Operation-owned callbacks keep evidence and synthesis provenance separate. */
export interface LoggedModelRequest<T> {
  readonly messages: Message[]
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
 * @returns A tool-free model runner using the exact persisted messages.
 */
export function createLoggedModelRunner<T>(ctx: Context, session: Session, config: LlmCallConfig, policy: EvidenceModelPolicy) {
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
      const [stored] = await reader.read(event.seq, 1)
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
    let useOutputLimitRecovery = false
    let validationRecoveryMessages: Message[] | undefined
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
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
      try {
        const prepared = await llm.prepareCall(selectedConfig, attemptSignal)
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
        // The Session's immutable event supplies exactly the config and messages dispatched.
        for await (const chunk of prepared.stream(Object.freeze({ ...logged.data.config, messages: logged.data.messages,
          sessionId: session.id, ...attemptSignal === undefined ? {} : { signal: attemptSignal } }))) {
          accumulator.push({ time: Date.now(), chunk })
          assembler.push(chunk)
          if (chunk.type === 'finish') finish = chunk.reason
          attemptSignal?.throwIfAborted()
        }
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
        if (error instanceof WorkflowLogError) throw error
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
      await record(() => request.appendResult({ requestSeq, attempt,
        maxAttempts: policy.maxAttempts, status, stream: accumulator.snapshot(),
        ...finish === undefined ? {} : { finish }, ...assembler.usage === undefined ? {} : { usage: assembler.usage },
        ...errorCode === undefined ? {} : { errorCode } }))
      const settled: LoggedModelAttemptObservation = { phase: 'settled', attempt, maximumAttempts: policy.maxAttempts,
        status, finish: finish ?? null, errorCode: errorCode ?? null }
      reportAttempt(request.onAttempt, settled)
      // A cancellation arriving during result persistence still prevents downstream extraction.
      request.signal?.throwIfAborted()
      if (result !== undefined) return result
      const retryOutputLimit = policy.retryOutputLimit === true && !useOutputLimitRecovery
        && errorCode === 'EVIDENCE_MODEL_INCOMPLETE' && finish?.kind === 'max-tokens'
      const transientFailureCode = finish?.kind === 'error'
        && (finish.failure.code === 'TRANSPORT' || finish.failure.code === 'TIMEOUT') ? finish.failure.code : undefined
      const retryTransient = transientFailureCode !== undefined
        && transientRetry?.failureCodes.includes(transientFailureCode) === true
      const nextValidationRecovery = policy.retryInvalidOutput === true
        && errorCode === 'SYNTHESIS_INVALID_MODEL_OUTPUT' && finish?.kind === 'stop'
        ? request.invalidOutputRetryMessages?.(failure, useOutputLimitRecovery) : undefined
      const retryInvalidOutput = nextValidationRecovery !== undefined
      if ((!retryOutputLimit && !retryTransient && !retryInvalidOutput) || attempt === policy.maxAttempts) throw failure
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
