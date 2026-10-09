/** Explicit adapters and results for one bounded research draft pass. */
import type { AcademicCandidateRankingResult, CandidateAssessment, HybridSearchPlan,
  ResearchBrief, ResearchQuestionCoverageResult, RetrievalRun, WorkVersionId,
  ExtractionMethod } from '@deepseek-ai/dsh-academic-model'
import type { AcademicSourceProviderObserver, AcademicSourceSearchBatchResult,
  AcademicSourceSearchRequest } from '@deepseek-ai/dsh-academic-source'
import type { IngestOutcome } from '@deepseek-ai/dsh-academic-ingestion'
import type { AcademicWebFetcher } from '@deepseek-ai/dsh-academic-evidence'
import type { PaperEvidenceGenerator } from './model-types.ts'
import type { ResearchReport } from '@deepseek-ai/dsh-academic-report'
import type { AnalysisResult } from '@deepseek-ai/dsh-academic-analysis'
import type { PaperEvidenceResult } from './types.ts'
import type { HybridSearchObservation, HybridSearchProgressObserver } from './hybrid-search.ts'
import type { HybridRunObservation } from './hybrid-run.ts'
import type { AcademicWorkflowProgressObserver } from './progress.ts'
import type { CandidateBatchPolicy } from './candidate-batches.ts'
import type { AcademicSettlementObserver } from './settlement-events.ts'
import type { AcademicQueryWorkflowObservation, AcademicQueryWorkflowObserver } from './query-workflow.ts'
import type { AcademicRecoveryCheckpointObserver, AcademicResearchRecoveryCheckpoint } from './recovery-checkpoint.ts'

/** Source batch with optional observations from the approved hybrid executor. */
export interface DraftSearchResult extends AcademicSourceSearchBatchResult {
  readonly hybridObservation?: HybridSearchObservation
}

/** One approved search request with the channels known before execution begins. */
export interface DraftPipelineSearch extends AcademicSourceSearchRequest {
  readonly channels: readonly ('academic' | 'web_discovery')[]
}

/** One explicitly selected, reconciled version and its ordered full-text candidates. */
export interface SelectedPaper {
  readonly workVersionId: WorkVersionId
  readonly urls: readonly string[]
  readonly sourceProvider: string
  readonly extractionMethod: ExtractionMethod
  readonly hasHistoricalEvidence: boolean
}

/** Ordered full-text candidates, bounded before processing; inclusion is decided from usable evidence. */
export interface PaperSelectionResult {
  readonly papers: readonly SelectedPaper[]
  /** True when the selector omitted another eligible, resolvable candidate. */
  readonly truncated: boolean
  /** Optional Q5 inputs; when present, the pipeline schedules these papers in ranked batches. */
  readonly candidateScheduling?: CandidateScheduling
}

/** Q5 ranked-scheduling inputs carried through one bounded pass. */
export interface CandidateScheduling {
  readonly plan: HybridSearchPlan
  readonly assessments: readonly CandidateAssessment[]
  readonly ranking: AcademicCandidateRankingResult
  readonly policy: CandidateBatchPolicy
}

/** Result of one evidence-gap replenishment round: an extended plan, merged re-ranking, and newly selected papers. */
export interface ReplenishedCandidates {
  /** Extended plan with the gap round appended, plus the re-ranked merged candidate queues. */
  readonly scheduling: CandidateScheduling
  /** Merged ingestion containing works and versions from every completed round. */
  readonly ingested: IngestOutcome
  /** Newly selected papers from this gap round, ready for full-text processing. */
  readonly papers: readonly SelectedPaper[]
}

/** Hard safety bound for explicit queries in one draft pass. */
export const MAX_DRAFT_SEARCH_QUERIES = 3

/** Callers own query planning, source execution, scope selection, model transport and durable request logging. */
export interface DraftPipelineAdapters {
  /** Return an evidence-validated draft for the admitted research questions. */
  readonly synthesize: (input: import('@deepseek-ai/dsh-academic-analysis').AcademicSynthesisInput,
    signal?: AbortSignal) => Promise<import('@deepseek-ai/dsh-academic-analysis').AcademicSynthesisDraft>
  /** Return source-observed providers, counts, limits, successes, and failures for one explicit query. */
  readonly search: (
    request: AcademicSourceSearchRequest,
    signal?: AbortSignal,
    onProvider?: AcademicSourceProviderObserver,
    onHybrid?: HybridSearchProgressObserver,
  ) => Promise<DraftSearchResult>
  /**
   * Screen all returned deduplicated works, then cap eligible candidates at the effective maximumCandidateWorks.
   * Do not apply maximumIncludedWorks here.
   */
  readonly selectPapers: (ingested: IngestOutcome, brief: ResearchBrief) => PaperSelectionResult
  /**
   * Execute one evidence-gap replenishment round and re-rank the merged candidate pool.
   * Invoked only when Q5 scheduling requests more evidence and another search round remains.
   * Omitted adapters keep the single-round behavior and stop with an evidence-gap limitation.
   */
  readonly replenishCandidates?: (
    scheduling: CandidateScheduling,
    ingested: IngestOutcome,
    coverage: ResearchQuestionCoverageResult,
    nextRoundIndex: number,
    signal?: AbortSignal,
  ) => Promise<ReplenishedCandidates>
  readonly fetcher: AcademicWebFetcher
  readonly generator: PaperEvidenceGenerator
  /** Current UTC ISO time for run settlement, acquisition, and report evaluation. */
  readonly now: () => string
  /** Observe complete run-local progress snapshots; subscriber failures do not interrupt research. */
  readonly onProgress?: AcademicWorkflowProgressObserver
  /** Observe Q5 scheduling decisions and batch settlements; subscriber failures do not interrupt research. */
  readonly onSettlement?: AcademicSettlementObserver
  /** Observe complete Q5 facts for browser projection; subscriber failures do not interrupt research. */
  readonly onQueryWorkflow?: AcademicQueryWorkflowObserver
  /** Persist a recovery checkpoint at every scheduled and settled batch boundary. */
  readonly onRecoveryCheckpoint?: AcademicRecoveryCheckpointObserver
}

/** Ordered explicit searches followed by one merged paper-processing pass and a draft only. */
export interface DraftPipelineInput {
  /** Maximum concurrent paper acquisitions/extractions; omitted means serial execution. */
  readonly paperConcurrency?: number
  readonly brief: ResearchBrief
  readonly searches: readonly DraftPipelineSearch[]
  readonly synthetic: boolean
  /** A-S3 checkpoint; when present, retrieval and screening are not repeated. */
  readonly recovery?: AcademicResearchRecoveryCheckpoint
}

/** A paper-local failure; raw transport/model errors are not copied into report text. */
export interface PaperProcessingFailure {
  readonly workVersionId: WorkVersionId
  readonly stage: 'fulltext' | 'extraction'
}

/** Completed paper results and observed retrieval facts remain available when the caller cancels the pass. */
export interface DraftPipelineResult {
  /** Settled query expressions; older synthetic callers may omit this observation. */
  readonly completedSearchQueries?: readonly string[]
  /** Completed hybrid searches and actual ingestion facts, including on cancellation. Not a wire projection. */
  readonly hybridSearch?: HybridRunObservation
  /** Latest complete Q5 observation; absent for legacy selectors without ranked scheduling. */
  readonly queryWorkflow?: AcademicQueryWorkflowObservation
  readonly synthesis: SynthesisSettlement
  readonly status: 'completed' | 'cancelled'
  readonly retrievalRun: RetrievalRun
  readonly papers: readonly PaperEvidenceResult[]
  readonly failures: readonly PaperProcessingFailure[]
  readonly analysis: AnalysisResult | null
  readonly report: ResearchReport | null
}

/** Analysis settlement is independent of retrieval success and report semantic approval. */
export interface SynthesisSettlement {
  readonly status: 'not_run' | 'blocked' | 'failed' | 'completed' | 'partial_success'
  readonly reasons: readonly string[]
}
