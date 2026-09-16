/** Bind one research pass to the caller's live DSH Session and explicit model route. */
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { createModelEvidenceGenerator } from './model.ts'
import { runResearchDraft } from './pipeline.ts'
import type { DraftPipelineAdapters, DraftPipelineInput, DraftPipelineResult } from './pipeline-types.ts'

/**
 * Run one approved research draft using DSH's model service and durable model records.
 * The caller retains search, scope selection, acquisition, clock and Session ownership.
 * @param ctx Context providing model, token and Session persistence services.
 * @param session Live Session with an active persistence writer.
 * @param config Explicit model configuration for every paper in this pass.
 * @param input Approved Brief, query and synthetic-data disclosure.
 * @param adapters External search, scope selection, acquisition and clock dependencies.
 * @param signal Caller-owned cancellation and elapsed-time budget.
 * @returns Completed draft or cancelled partial results; no automatic publication or recovery.
 * @throws Propagates binding, admission, logging and downstream errors from the existing pipeline.
 */
export function runModelResearchDraft(
  ctx: Context,
  session: Session,
  config: LlmCallConfig,
  input: DraftPipelineInput,
  adapters: Omit<DraftPipelineAdapters, 'generator'>,
  signal?: AbortSignal,
): Promise<DraftPipelineResult> {
  return runResearchDraft(input, {
    ...adapters, generator: createModelEvidenceGenerator(ctx, session, config),
  }, signal)
}
