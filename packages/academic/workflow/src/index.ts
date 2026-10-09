/** Academic workflow public entry; implementations do not import this barrel. */
export { extractPaperEvidence } from './paper.ts'
export { parseEvidenceDrafts, parsePaperModelResponse } from './parse-evidence.ts'
export { createModelEvidenceGenerator } from './model.ts'
export { createModelSynthesisGenerator } from './synthesis-model.ts'
export type { SynthesisModelRequest, SynthesisModelResult } from './synthesis-model.ts'
export type { SynthesisSettlement } from './pipeline-types.ts'
export { WorkflowLogError } from './model-errors.ts'
export type { PaperEvidenceGenerator, PaperEvidenceProgressObservation, PaperEvidenceProgressObserver,
  PaperModelResponse, PaperScopeDecision, PaperScopeRules,
  EvidenceModelSource, EvidenceModelRequest, EvidenceModelResult, EvidenceModelPolicy, EvidenceExtractionModelPolicy, AcademicModelPolicies,
  AcademicTransientFailureCode, AcademicTransientRetryPolicy } from './model-types.ts'
export type { PaperEvidenceResult, PaperPause, PaperExclusion } from './types.ts'
export type {
  AcademicWorkflowProgressActivity,
  AcademicWorkflowProgressCounts,
  AcademicWorkflowProgressEvent,
  AcademicWorkflowProgressFailureCode,
  AcademicWorkflowProgressObserver,
  AcademicWorkflowProgressSnapshot,
  AcademicWorkflowProgressStage,
  AcademicWorkflowProgressStages,
  AcademicWorkflowProgressStageView,
  AcademicWorkflowProgressStatus,
  AcademicWorkflowProgressUnit,
} from './progress.ts'
export { runResearchDraft } from './pipeline.ts'
export { runModelResearchDraft } from './model-pipeline.ts'
export { runAcademicResearchDraft } from './entry.ts'
export { executeHybridSearch } from './hybrid-search.ts'
export type { HybridRunObservation } from './hybrid-run.ts'
export type {
  HybridDirectSearchProvider,
  HybridReferenceVerificationProvider,
  HybridRetrievalPolicy,
  HybridSearchAdapters,
  HybridSearchObservation,
  HybridSearchProgressObservation,
  HybridSearchProgressObserver,
  HybridSearchResult,
  HybridSearchStageStatus,
  HybridWebDiscoveryResult,
} from './hybrid-search.ts'
export { validateSynthesisRequirements as validateResearchBriefRequirements } from '@deepseek-ai/dsh-academic-analysis'
export { selectResearchPapers } from './selection.ts'
export { planCandidateBatch } from './candidate-batches.ts'
export type {
  CandidateBatchDecision,
  CandidateBatchPlanningInput,
  CandidateBatchPolicy,
  CandidateBatchReason,
  CandidateFulltextBatch,
} from './candidate-batches.ts'
export { MAX_DRAFT_SEARCH_QUERIES } from './pipeline-types.ts'
export type { PaperCandidateResolver } from './selection.ts'
export type { AcademicResearchDraftRequest, AcademicResearchDraftResult } from './entry.ts'
export type {
  CandidateScheduling,
  DraftPipelineAdapters, DraftPipelineInput, DraftPipelineResult, DraftPipelineSearch, DraftSearchResult,
  PaperProcessingFailure, PaperSelectionResult, ReplenishedCandidates, SelectedPaper,
} from './pipeline-types.ts'
export type {
  AcademicBatchDecisionEvent, AcademicBatchSettlementEvent, AcademicRunSettlementEvent,
  AcademicSearchPlanEvent, AcademicSearchPlanQueryEvent, AcademicSettlementFact, AcademicSettlementObserver,
} from './settlement-events.ts'
