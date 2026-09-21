/** Explicit adapters and results for one bounded research draft pass. */
import type { ResearchBrief, RetrievalRun, WorkVersionId, ExtractionMethod } from '@deepseek-ai/dsh-academic-model'
import type { AcademicSourceSearchBatchResult, AcademicSourceSearchRequest } from '@deepseek-ai/dsh-academic-source'
import type { IngestOutcome } from '@deepseek-ai/dsh-academic-ingestion'
import type { AcademicWebFetcher } from '@deepseek-ai/dsh-academic-evidence'
import type { PaperEvidenceGenerator } from './model-types.ts'
import type { ResearchReport } from '@deepseek-ai/dsh-academic-report'
import type { AnalysisResult } from '@deepseek-ai/dsh-academic-analysis'
import type { PaperEvidenceResult } from './types.ts'

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
}

/** Hard safety bound for explicit queries in one draft pass. */
export const MAX_DRAFT_SEARCH_QUERIES = 3

/** Callers own query planning, source execution, scope selection, model transport and durable request logging. */
export interface DraftPipelineAdapters {
  /** Return an evidence-validated draft for the admitted research questions. */
  readonly synthesize: (input: import('@deepseek-ai/dsh-academic-analysis').AcademicSynthesisInput,
    signal?: AbortSignal) => Promise<import('@deepseek-ai/dsh-academic-analysis').AcademicSynthesisDraft>
  /** Return source-observed providers, counts, limits, successes, and failures for one explicit query. */
  readonly search: (request: AcademicSourceSearchRequest, signal?: AbortSignal) => Promise<AcademicSourceSearchBatchResult>
  /** Return the ordered eligible candidate pool under maximumCandidateWorks; do not apply maximumIncludedWorks here. */
  readonly selectPapers: (ingested: IngestOutcome, brief: ResearchBrief) => PaperSelectionResult
  readonly fetcher: AcademicWebFetcher
  readonly generator: PaperEvidenceGenerator
  /** Current UTC ISO time for run settlement, acquisition, and report evaluation. */
  readonly now: () => string
}

/** Ordered explicit searches followed by one merged paper-processing pass and a draft only. */
export interface DraftPipelineInput {
  readonly brief: ResearchBrief
  readonly searches: readonly AcademicSourceSearchRequest[]
  readonly synthetic: boolean
}

/** A paper-local failure; raw transport/model errors are not copied into report text. */
export interface PaperProcessingFailure {
  readonly workVersionId: WorkVersionId
  readonly stage: 'fulltext' | 'extraction'
}

/** Completed paper results and observed retrieval facts remain available when the caller cancels the pass. */
export interface DraftPipelineResult {
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
