/** Builds the shared terminal retrieval record from source and paper observations. */
import {
  createBatchResult,
  createCoverageSummary,
  createFailureId,
  type AcademicWorkId,
  type ProviderFailure,
  type ResearchBrief,
  type RetrievalRun,
  type RetrievalRunId,
} from '@deepseek-ai/dsh-academic-model'
import type { PaperProcessingFailure, SelectedPaper } from './pipeline-types.ts'
import type { PaperEvidenceResult } from './types.ts'

/** Source facts accumulated from the explicit queries that completed. */
export interface RetrievalSearchObservation {
  readonly providers: readonly string[]
  readonly discoveredRecords: number
  readonly failures: readonly ProviderFailure[]
  readonly limitations: readonly string[]
  readonly truncated: boolean
}

/** Observations needed to settle one retrieval run without consulting provider state again. */
export interface RetrievalRunObservation {
  readonly retrievalRunId: RetrievalRunId
  readonly brief: ResearchBrief
  readonly startedAt: string
  readonly completedAt: string
  readonly cancelled: boolean
  readonly queries: readonly string[]
  readonly search: RetrievalSearchObservation | null
  readonly academicWorkIds: readonly AcademicWorkId[]
  readonly papers: readonly PaperEvidenceResult[]
  readonly paperFailures: readonly PaperProcessingFailure[]
  readonly failures: readonly ProviderFailure[]
  readonly availableFulltextWorks: number
  readonly selectionTruncated: boolean
}

/**
 * Convert one paper-local settlement into the provider-neutral failure retained by RetrievalRun.
 * @param paper - selected paper carrying its source provider and version identity.
 * @param stage - operation that failed after selection.
 * @returns a credential-free, non-retryable failure tied to the affected version.
 */
export function createPaperProviderFailure(
  paper: SelectedPaper,
  stage: PaperProcessingFailure['stage'],
): ProviderFailure {
  return {
    schemaVersion: 1,
    failureId: createFailureId(),
    provider: paper.sourceProvider,
    operation: stage === 'fulltext' ? 'fetch_fulltext' : 'extract_evidence',
    category: stage === 'fulltext' ? 'fulltext_unavailable' : 'parse_failed',
    message: stage === 'fulltext' ? 'Full-text acquisition failed.' : 'Evidence extraction failed.',
    retryable: false,
    retryAfter: null,
    affectedWorkVersionId: paper.workVersionId,
  }
}

/**
 * Build one terminal RetrievalRun from facts observed during the bounded pass.
 * @param observation - source batch, deduplicated identities, paper settlements, limits, and terminal timing.
 * @returns a completed, failed, or cancelled run with consistent coverage and batch status.
 */
export function buildRetrievalRun(observation: RetrievalRunObservation): RetrievalRun {
  const includedWorkIds = observation.papers.flatMap(paper => paper.status === 'extracted'
    ? [paper.version.academicWorkId]
    : [])
  const status = createBatchResult(includedWorkIds, observation.failures).status
  const paused = observation.papers.filter(paper => paper.status === 'paused')
  const sourceFailures = observation.search?.failures ?? []
  const truncated = observation.search?.truncated === true
    || (observation.search?.limitations.length ?? 0) > 0
    || sourceFailures.length > 0
    || observation.selectionTruncated
    || paused.length > 0
    || observation.paperFailures.length > 0
  const limitations = unique([
    ...(observation.search?.limitations ?? []),
    ...observation.search?.truncated === true
      ? ['Search providers or the aggregate result bound truncated candidate records.']
      : [],
    ...sourceFailures.map(failure => `Provider ${failure.provider} failed during ${failure.operation}.`),
    ...observation.selectionTruncated
      ? [`The approved included-work bound stopped selection at ${observation.brief.stopConditions.maximumIncludedWorks}.`]
      : [],
    ...paused.map(paper => `Paused version ${paper.pause.workVersionId}: ${paper.pause.reason}.`),
    ...observation.paperFailures.map(failure => `Version ${failure.workVersionId} failed during ${failure.stage}.`),
    ...observation.queries.length > 0
      ? [`This run executed ${observation.queries.length} ordered search ${observation.queries.length === 1 ? 'query' : 'queries'} without automatic retries.`]
      : [],
  ])
  const coverageSummary = createCoverageSummary({
    discoveredRecords: observation.search?.discoveredRecords ?? 0,
    deduplicatedWorks: observation.academicWorkIds.length,
    includedWorks: includedWorkIds.length,
    availableFulltextWorks: observation.availableFulltextWorks,
    abstractOnlyWorks: 0,
    metadataOnlyWorks: 0,
    failedOperations: observation.failures.length,
    truncated,
    limitations,
    providerBreakdown: null,
  })
  return {
    schemaVersion: 1,
    retrievalRunId: observation.retrievalRunId,
    researchBriefId: observation.brief.researchBriefId,
    researchBriefVersion: observation.brief.version,
    stage: observation.cancelled ? 'cancelled' : status === 'failed' ? 'failed' : 'completed',
    status,
    startedAt: observation.startedAt,
    completedAt: observation.completedAt,
    queries: [...observation.queries],
    providers: observation.search?.providers ?? [],
    academicWorkIds: [...observation.academicWorkIds],
    coverageSummary,
    failures: [...observation.failures],
  }
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(value => value.trim().length > 0))]
}
