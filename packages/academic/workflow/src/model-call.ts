/** Shared bounded model transport; callers own prompts, parsing and durable event names. */
import type { Context } from '@deepseek-ai/cordis'
import { isDeepStrictEqual } from 'node:util'
import { AssistantStreamAccumulator, BlockAssembler, type LlmCallConfig, type Message } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-token-meter'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { EvidenceError } from '@deepseek-ai/dsh-academic-evidence'
import { SynthesisError } from '@deepseek-ai/dsh-academic-analysis'
import { WorkflowLogError } from './model-errors.ts'
import type { EvidenceModelPolicy, EvidenceModelRequest, EvidenceModelResult } from './model-types.ts'

/** Operation-owned callbacks keep evidence and synthesis provenance separate. */
export interface LoggedModelRequest<T> {
  readonly messages: Message[]
  readonly signal?: AbortSignal
  readonly parse: (text: string) => T
  readonly appendRequest: (data: Omit<EvidenceModelRequest, 'source'>) => SessionEvent & { readonly data: Omit<EvidenceModelRequest, 'source'> }
  readonly appendResult: (data: Omit<EvidenceModelResult, 'source'>) => SessionEvent
}

/**
 * Bind a model route to durable recording and bounded output-limit recovery.
 * @param ctx DSH model, token-meter and persistence services.
 * @param session Live Session with a durable writer.
 * @param config Selected route and output-token reserve.
 * @param policy Total attempts; only output-limit exhaustion is retried.
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
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      let requestSeq: SessionSeq | null = null
      const assembler = new BlockAssembler()
      const accumulator = new AssistantStreamAccumulator()
      let finish: EvidenceModelResult['finish']
      let status: EvidenceModelResult['status'] = 'failed'
      let errorCode: string | undefined
      let failure: unknown
      let result: T | undefined
      try {
        const prepared = await llm.prepareCall(selectedConfig, request.signal)
        request.signal?.throwIfAborted()
        const contextWindow = prepared.context?.contextWindow
        const outputTokens = prepared.config.maxTokens
        if (contextWindow === undefined || outputTokens === undefined
          || !Number.isSafeInteger(outputTokens) || outputTokens <= 0) {
          throw new EvidenceError('Model context window and output-token cap are required.', 'EVIDENCE_MODEL_BUDGET_UNKNOWN')
        }
        const messages = request.messages
        const estimatedInputTokens = messages.reduce((sum, message) => sum + meter.estimateMessage(message), 0)
        const oversized = estimatedInputTokens + outputTokens > contextWindow
        const logged = await record(() => request.appendRequest({ config: prepared.config,
          messages, estimatedInputTokens, contextWindow, outputTokens, attempt, maxAttempts: policy.maxAttempts,
          decision: oversized ? 'skip_input_limit' : 'dispatch' }))
        requestSeq = logged.seq
        request.signal?.throwIfAborted()
        if (oversized) {
          status = 'skipped'
          throw new EvidenceError('Paper exceeds the estimated model input budget.', 'EVIDENCE_INPUT_TOO_LARGE')
        }
        // The Session's immutable event supplies exactly the config and messages dispatched.
        for await (const chunk of prepared.stream(Object.freeze({ ...logged.data.config, messages: logged.data.messages,
          sessionId: session.id, ...request.signal === undefined ? {} : { signal: request.signal } }))) {
          accumulator.push({ time: Date.now(), chunk })
          assembler.push(chunk)
          if (chunk.type === 'finish') finish = chunk.reason
          request.signal?.throwIfAborted()
        }
        request.signal?.throwIfAborted()
        if (finish?.kind !== 'stop') {
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
        failure = error
        if (request.signal?.aborted || finish?.kind === 'aborted') status = 'cancelled'
        errorCode = error instanceof EvidenceError || error instanceof SynthesisError ? error.code : 'EVIDENCE_MODEL_CALL_FAILED'
      }
      await record(() => request.appendResult({ requestSeq, attempt,
        maxAttempts: policy.maxAttempts, status, stream: accumulator.snapshot(),
        ...finish === undefined ? {} : { finish }, ...assembler.usage === undefined ? {} : { usage: assembler.usage },
        ...errorCode === undefined ? {} : { errorCode } }))
      // A cancellation arriving during result persistence still prevents downstream extraction.
      request.signal?.throwIfAborted()
      if (result !== undefined) return result
      const retryOutputLimit = errorCode === 'EVIDENCE_MODEL_INCOMPLETE' && finish?.kind === 'max-tokens'
      if (!retryOutputLimit || attempt === policy.maxAttempts) throw failure
    }
    throw new Error('Academic extraction exhausted an invalid attempt range.')
  }
}
