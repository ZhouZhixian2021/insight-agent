/** Bind one research pass to the caller's live DSH Session and explicit model route. */
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { createModelEvidenceGenerator } from './model.ts'
import { createModelFragmentEvidenceGenerator } from './fragment-model.ts'
import { createModelSynthesisGenerator } from './synthesis-model.ts'
import { createModelCoverageAssessor } from './coverage-model.ts'
import { runResearchDraft } from './pipeline.ts'
import type { AcademicModelPolicies } from './model-types.ts'
import type { DraftPipelineAdapters, DraftPipelineInput, DraftPipelineResult } from './pipeline-types.ts'
import { createModelCoverageCandidateReader, createModelCoverageRepair, createModelCoverageReviewer } from './coverage-model.ts'
import { persistAcademicEvent } from './model-call.ts'

/**
 * Run one approved research draft using DSH's model service and durable model records.
 * The caller retains search, scope selection, acquisition, clock and Session ownership.
 * @param ctx Context providing model, token and Session persistence services.
 * @param session Live Session with an active persistence writer.
 * @param config Explicit model configuration for every paper in this pass.
 * @param policies Separate bounded recovery for evidence extraction and final synthesis.
 * @param input Approved Brief, query and synthetic-data disclosure.
 * @param adapters External search, scope selection, acquisition and clock dependencies.
 * @param signal Caller-owned cancellation and elapsed-time budget.
 * @param synthesisConfig Optional separately resolved generation controls for final synthesis.
 * @returns Evaluated report with automatic delivery mode, or cancelled partial results; no automatic recovery.
 * @throws Propagates binding, admission, logging and downstream errors from the existing pipeline.
 */
export function runModelResearchDraft(
  ctx: Context,
  session: Session,
  config: LlmCallConfig,
  policies: AcademicModelPolicies,
  input: DraftPipelineInput,
  adapters: Omit<DraftPipelineAdapters, 'generator' | 'synthesize'>,
  signal?: AbortSignal,
  synthesisConfig: LlmCallConfig = config,
): Promise<DraftPipelineResult> {
  const coverage = input.recovery?.coverageRepairState?.policy ?? input.coverageRepairPolicy
  if (input.brief.coverageRequirements !== undefined && (coverage === undefined || policies.coverage === undefined)) {
    throw new Error('Aspect coverage requires an explicit repair and model policy.')
  }
  const coverageAdapters = coverage === undefined || policies.coverage === undefined ? {} : {
    reviewCoverage: createModelCoverageReviewer(ctx, session,
      { ...config, maxTokens: Math.min(config.maxTokens ?? policies.coverage.maxTokens, policies.coverage.maxTokens) },
      policies.coverage, coverage),
    repairCoverageEvidence: async (request: import('./coverage-types.ts').CoverageEvidenceRepairInput, repairSignal?: AbortSignal,
      budget?: import('./coverage-types.ts').CoverageModelBudget) => {
      const evidence = await createModelCoverageRepair(ctx, session, config, policies.evidence, coverage)(request, repairSignal, budget)
      await persistAcademicEvent(ctx, session, () => session.append('academic/coverage-repair-paper-v1', {
        retrievalRunId: request.retrievalRunId, workVersionId: request.source.workVersionId, evidence,
      }))
      return evidence
    },
    ...coverage.targeting === undefined ? {} : {
      extractCoverageCandidate: createModelCoverageCandidateReader(ctx, session, config, policies.evidence, coverage),
    } satisfies Pick<DraftPipelineAdapters, 'extractCoverageCandidate'>,
    onCoverageRepairState: async (state: import('./coverage-types.ts').CoverageRepairState,
      retrievalRunId: import('@deepseek-ai/dsh-academic-model').RetrievalRunId) => {
      await persistAcademicEvent(ctx, session, () => session.append('academic/coverage-repair-state-v1', { retrievalRunId, state }))
      await adapters.onCoverageRepairState?.(state, retrievalRunId)
    },
  }
  return runResearchDraft(input, {
    ...adapters, generator: createModelEvidenceGenerator(ctx, session, config, policies.evidence, adapters.onTrace),
    onPublicationDateContext: (context, retrievalRunId) => {
      session.append('academic/publication-date-context-v1', { retrievalRunId, context })
      adapters.onPublicationDateContext?.(context, retrievalRunId)
    },
    verifiedGenerator: createModelFragmentEvidenceGenerator(ctx, session, config, policies.evidence, adapters.onTrace),
    assessQuestionCoverage: createModelCoverageAssessor(ctx, session, config, policies.evidence, adapters.onTrace),
    synthesize: createModelSynthesisGenerator(ctx, session, synthesisConfig, policies.synthesis, adapters.onTrace),
    ...coverageAdapters,
  }, signal)
}
