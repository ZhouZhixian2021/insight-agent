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
import { EvidenceError } from '@deepseek-ai/dsh-academic-evidence'
import type { PaperProcessingFailure, SelectedPaper } from './pipeline-types.ts'
import type { PaperEvidenceResult } from './types.ts'

/** Source facts accumulated from the explicit queries that completed. */
export interface RetrievalSearchObservation {
  readonly providers: readonly string[]
  readonly discoveredRecords: number
  /** Exact work identities returned across queries before the aggregate run applies its candidate-work bound. */
  readonly deduplicatedWorks: number
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
  /** Actual reasons for stopping candidate processing, including exhaustion or evidence sufficiency. */
  readonly selectionLimitations: readonly string[]
  /** Independent works admitted by the workflow's evidence check. */
  readonly includedWorkIds: readonly AcademicWorkId[]
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
  error?: unknown,
): ProviderFailure {
  if (stage === 'extraction') {
    const code = error instanceof EvidenceError ? error.code : null
    const category = code === 'EVIDENCE_INVALID_MODEL_OUTPUT'
      || code === 'EVIDENCE_MODEL_UNEXPECTED_CONTENT'
      || code === 'EVIDENCE_EXCERPT_NOT_FOUND'
      || code === 'EVIDENCE_DRAFTS_REJECTED'
      ? 'parse_failed'
      : code === 'EVIDENCE_MODEL_BUDGET_UNKNOWN'
        ? 'invalid_request'
        : code === 'EVIDENCE_MODEL_INCOMPLETE'
          ? 'upstream_error'
          : 'unknown'
    const message = code === 'EVIDENCE_DRAFTS_REJECTED'
      ? 'Evidence drafts failed source verification; see per-paper rejections. Any accepted evidence was retained.'
      : code === 'EVIDENCE_EXCERPT_NOT_FOUND'
        ? 'Evidence extraction excerpt did not exactly match the selected source segment.'
        : code === 'EVIDENCE_MODEL_BUDGET_UNKNOWN'
          ? 'Evidence extraction model capacity or output limit is unavailable.'
          : code === 'EVIDENCE_MODEL_INCOMPLETE'
            ? 'Evidence extraction model response did not complete.'
            : category === 'parse_failed'
              ? 'Evidence extraction model output was invalid.'
              : 'Evidence extraction failed.'
    return {
      schemaVersion: 1,
      failureId: createFailureId(),
      provider: paper.sourceProvider,
      operation: 'extract_evidence',
      category,
      message,
      retryable: false,
      retryAfter: null,
      affectedWorkVersionId: paper.workVersionId,
    }
  }
  return {
    schemaVersion: 1,
    failureId: createFailureId(),
    provider: paper.sourceProvider,
    operation: 'fetch_fulltext',
    category: 'fulltext_unavailable',
    message: 'Full-text acquisition failed.',
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
  const includedWorkIds = observation.includedWorkIds
  const status = createBatchResult(includedWorkIds, observation.failures).status
  const paused = observation.papers.filter(paper => paper.status === 'paused')
  const sourceFailures = observation.search?.failures ?? []
  const truncated = observation.search?.truncated === true
    || (observation.search?.limitations.length ?? 0) > 0
    || sourceFailures.length > 0
    || observation.selectionTruncated
    || paused.length > 0
    || observation.paperFailures.length > 0
    || observation.papers.some(paper => paper.status === 'partially_extracted' || paper.status === 'extraction_failed')
  const limitations = unique([
    ...(observation.search?.limitations ?? []),
    ...observation.search?.truncated === true
      ? ['Search providers or the aggregate result bound truncated candidate records.']
      : [],
    ...sourceFailures.map(failure => `Provider ${failure.provider} failed during ${failure.operation}.`),
    ...observation.selectionLimitations,
    ...paused.map(paper => `Paused version ${paper.pause.workVersionId}: ${paper.pause.reason}.`),
    ...observation.paperFailures.map(failure => `Version ${failure.workVersionId} failed during ${failure.stage}.`),
    ...evidenceRejectionLimitations(observation.papers),
    ...observation.queries.length > 0
      ? [`This run executed ${observation.queries.length} ordered search ${observation.queries.length === 1 ? 'query' : 'queries'} without automatic query expansion; source providers may repeat transient transport attempts within their configured bounds.`]
      : [],
  ])
  const coverageSummary = createCoverageSummary({
    discoveredRecords: observation.search?.discoveredRecords ?? 0,
    deduplicatedWorks: observation.search?.deduplicatedWorks ?? 0,
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

/**
 * Describe retained and rejected drafts for reports and retrieval coverage.
 * @param papers - settled paper extraction results.
 * @returns limitations that distinguish partial extraction from complete source verification.
 */
export function evidenceRejectionLimitations(papers: readonly PaperEvidenceResult[]): readonly string[] {
  return papers.flatMap(paper => paper.status === 'partially_extracted' || paper.status === 'extraction_failed'
    ? [`Version ${paper.version.workVersionId}: retained ${paper.evidence.evidenceRecords.length} evidence records; rejected ${paper.evidence.rejectedDrafts.length} drafts during source verification.`]
    : [])
}
