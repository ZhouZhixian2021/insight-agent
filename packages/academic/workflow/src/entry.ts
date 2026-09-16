/** Stable application entry for one Academic research draft pass. */
import type { Context } from '@deepseek-ai/cordis'
import { ReasoningEffortId, type LlmCallConfig } from '@deepseek-ai/dsh-llm'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import { runModelResearchDraft } from './model-pipeline.ts'
import type { DraftPipelineAdapters, DraftPipelineInput, DraftPipelineResult } from './pipeline-types.ts'

/** All caller-owned inputs for one bounded Academic research run. */
export interface AcademicResearchDraftRequest {
  /** DSH context containing the model, token, Session and persistence services. */
  readonly ctx: Context
  /** Live Session used for durable Academic model-call records. */
  readonly session: Session
  /** Exact model route and generation controls; reasoning defaults to low when omitted. */
  readonly model: LlmCallConfig
  /** Approved Brief, search request and synthetic-data disclosure. */
  readonly input: DraftPipelineInput
  /** Search, selection, full-text acquisition and clock integrations. */
  readonly adapters: Omit<DraftPipelineAdapters, 'generator'>
  /** Caller-owned cancellation and elapsed-time budget. */
  readonly signal?: AbortSignal
}

/** One pipeline result together with the Session that owns its model records. */
export interface AcademicResearchDraftResult extends DraftPipelineResult {
  readonly sessionId: SessionId
}

/**
 * Run the formal B → A → B → C Academic draft pipeline entry.
 * Model capability is checked before search or acquisition begins. An omitted
 * reasoning effort becomes `low`; an explicit caller choice is preserved.
 * @param request - complete application-owned dependencies and research input.
 * @returns the draft result and durable model-record Session identity.
 * @throws when the model route or requested reasoning effort is unsupported,
 * or when the underlying pipeline cannot safely continue.
 */
export async function runAcademicResearchDraft(
  request: AcademicResearchDraftRequest,
): Promise<AcademicResearchDraftResult> {
  const llm = request.ctx.get('llm')
  if (!llm) throw new Error('Academic research requires the DSH llm service.')
  const proposed = request.model.reasoningEffort === undefined
    ? { ...request.model, reasoningEffort: ReasoningEffortId('low') }
    : request.model
  const model = await llm.resolveCallConfig(proposed, request.signal)
  const result = await runModelResearchDraft(
    request.ctx,
    request.session,
    model,
    request.input,
    request.adapters,
    request.signal,
  )
  return { ...result, sessionId: request.session.id }
}
