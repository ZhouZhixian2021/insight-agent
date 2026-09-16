/** Session-backed extraction through DSH's prepared model call and token estimator. */
import type { Context } from '@deepseek-ai/cordis'
import { isDeepStrictEqual } from 'node:util'
import { AssistantStreamAccumulator, BlockAssembler, type LlmCallConfig } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-token-meter'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { EvidenceError } from '@deepseek-ai/dsh-academic-evidence'
import { parseEvidenceDrafts } from './parse-evidence.ts'
import { evidenceMessages } from './model-prompt.ts'
import { WorkflowLogError } from './model-errors.ts'
import type { EvidenceModelResult, EvidenceModelSource, PaperEvidenceGenerator } from './model-types.ts'

/**
 * Bind extraction to a live Session and an explicit model configuration.
 * Requests and outcomes must flush successfully; logging failures stop the entire pipeline.
 * The resolved model must advertise a context window and a positive output-token cap.
 * Input estimates include all framing and reserve the output cap, but are not exact tokenization.
 * @param ctx - context containing DSH llm, sessions, sessionPersistence and tokenMeter services.
 * @param session - live Session whose persistence listener owns durable records.
 * @param config - explicit route and generation controls, normally captured from the active Session.
 * @returns a provenance-aware generator for extractPaperEvidence or runResearchDraft.
 */
export function createModelEvidenceGenerator(ctx: Context, session: Session, config: LlmCallConfig): PaperEvidenceGenerator {
  const llm = ctx.get('llm'), sessions = ctx.get('sessions'), meter = ctx.get('tokenMeter')
  const persistence = ctx.get('sessionPersistence')
  if (!llm || !sessions || !meter || !persistence) {
    throw new Error('Academic extraction requires llm, sessions, sessionPersistence and tokenMeter.')
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

  return async (request, parsed) => {
    request.signal?.throwIfAborted()
    const source: EvidenceModelSource = {
      academicWorkId: parsed.academicWorkId, workVersionId: parsed.workVersionId, contentHash: parsed.contentHash,
      sourceProvider: parsed.sourceProvider, sourceUrl: parsed.sourceUrl, retrievedAt: parsed.retrievedAt,
      extractionMethod: structuredClone(parsed.extractionMethod),
    }
    let requestSeq: SessionSeq | null = null
    const assembler = new BlockAssembler()
    const accumulator = new AssistantStreamAccumulator()
    let finish: EvidenceModelResult['finish']
    let status: EvidenceModelResult['status'] = 'failed'
    let errorCode: string | undefined
    let failure: unknown
    let drafts: ReturnType<typeof parseEvidenceDrafts> | undefined
    try {
      const prepared = await llm.prepareCall(selectedConfig, request.signal)
      request.signal?.throwIfAborted()
      const contextWindow = prepared.context?.contextWindow
      const outputTokens = prepared.config.maxTokens
      if (contextWindow === undefined || outputTokens === undefined
        || !Number.isSafeInteger(outputTokens) || outputTokens <= 0) {
        throw new EvidenceError('Model context window and output-token cap are required.', 'EVIDENCE_MODEL_BUDGET_UNKNOWN')
      }
      const messages = evidenceMessages(request)
      const estimatedInputTokens = messages.reduce((sum, message) => sum + meter.estimateMessage(message), 0)
      const oversized = estimatedInputTokens + outputTokens > contextWindow
      const logged = await record(() => session.append('academic/evidence-request', { source, config: prepared.config,
        messages, estimatedInputTokens, contextWindow, outputTokens, decision: oversized ? 'skip_input_limit' : 'dispatch' }))
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
      drafts = parseEvidenceDrafts(text)
      status = 'validated'
    } catch (error: unknown) {
      if (error instanceof WorkflowLogError) throw error
      failure = error
      if (request.signal?.aborted || finish?.kind === 'aborted') status = 'cancelled'
      errorCode = error instanceof EvidenceError ? error.code : 'EVIDENCE_MODEL_CALL_FAILED'
    }
    await record(() => session.append('academic/evidence-result', { source, requestSeq, status, stream: accumulator.snapshot(),
      ...finish === undefined ? {} : { finish }, ...assembler.usage === undefined ? {} : { usage: assembler.usage },
      ...errorCode === undefined ? {} : { errorCode } }))
    // A cancellation arriving during result persistence still prevents downstream extraction.
    request.signal?.throwIfAborted()
    if (drafts === undefined) throw failure
    return drafts
  }
}
