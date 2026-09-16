/** Explicit adapters and results for one bounded research draft pass. */
import type { ResearchBrief, WorkVersionId, ExtractionMethod } from '@deepseek-ai/dsh-academic-model'
import type { AcademicSourceSearchRequest, AcademicSourceSearchResult } from '@deepseek-ai/dsh-academic-source'
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

/** Callers own query planning, scope selection, model transport and durable request logging. */
export interface DraftPipelineAdapters {
  readonly search: (request: AcademicSourceSearchRequest, signal?: AbortSignal) => Promise<AcademicSourceSearchResult>
  /** Apply approved scope and date rules; select at most one actual version per work. */
  readonly selectPapers: (ingested: IngestOutcome, brief: ResearchBrief) => readonly SelectedPaper[]
  readonly fetcher: AcademicWebFetcher
  readonly generator: PaperEvidenceGenerator
  /** Current UTC ISO time, called separately for acquisition and report evaluation. */
  readonly now: () => string
}

/** A single search round followed by ordered paper processing and a draft only. */
export interface DraftPipelineInput {
  readonly brief: ResearchBrief
  readonly search: AcademicSourceSearchRequest
  readonly synthetic: boolean
}

/** A paper-local failure; raw transport/model errors are not copied into report text. */
export interface PaperProcessingFailure {
  readonly workVersionId: WorkVersionId
  readonly stage: 'fulltext' | 'extraction'
}

/** Completed paper results remain available even when the caller cancels the pass. */
export interface DraftPipelineResult {
  readonly status: 'completed' | 'cancelled'
  readonly papers: readonly PaperEvidenceResult[]
  readonly failures: readonly PaperProcessingFailure[]
  readonly analysis: AnalysisResult | null
  readonly report: ResearchReport | null
}
