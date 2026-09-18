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

/** Selected full-text candidates plus an observed included-work bound. */
export interface PaperSelectionResult {
  readonly papers: readonly SelectedPaper[]
  /** True when another eligible, resolvable paper existed beyond the approved included-work limit. */
  readonly truncated: boolean
}

/** Hard safety bound for explicit queries in one draft pass. */
export const MAX_DRAFT_SEARCH_QUERIES = 3

/** Callers own query planning, source execution, scope selection, model transport and durable request logging. */
export interface DraftPipelineAdapters {
  /** Return source-observed providers, counts, limits, successes, and failures for one explicit query. */
  readonly search: (request: AcademicSourceSearchRequest, signal?: AbortSignal) => Promise<AcademicSourceSearchBatchResult>
  /** Apply approved scope and date rules and report whether the included-work bound omitted another eligible version. */
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
  readonly status: 'completed' | 'cancelled'
  readonly retrievalRun: RetrievalRun
  readonly papers: readonly PaperEvidenceResult[]
  readonly failures: readonly PaperProcessingFailure[]
  readonly analysis: AnalysisResult | null
  readonly report: ResearchReport | null
}
