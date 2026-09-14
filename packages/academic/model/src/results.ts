/** Shared processing outcomes and observed coverage; no provider execution or retry policy. */
import type { FailureId, WorkVersionId } from './types.ts'

/** Provider-neutral failure categories; retryability is recorded separately. */
export type FailureCategory =
  | 'invalid_request'
  | 'authentication_failed'
  | 'rate_limited'
  | 'timeout'
  | 'network_error'
  | 'upstream_error'
  | 'not_found'
  | 'parse_failed'
  | 'fulltext_unavailable'
  | 'unknown'

/** One observed failure, optionally tied to a paper version rather than a whole search. */
export interface ProviderFailure {
  readonly schemaVersion: 1
  readonly failureId: FailureId
  readonly provider: string
  /** Provider-owned operation name, such as search or fetch_fulltext. */
  readonly operation: string
  readonly category: FailureCategory
  /** A readable explanation with credentials removed by the producer. */
  readonly message: string
  /** Eligibility for retry, not authorization to exceed the brief's stop conditions. */
  readonly retryable: boolean
  /** Absolute UTC ISO 8601 timestamp, or null when no retry time is known. */
  readonly retryAfter: string | null
  readonly affectedWorkVersionId?: WorkVersionId
}

/** Outcome of returned items and failures, independent of retrieval completeness. */
export type BatchStatus = 'success' | 'partial_success' | 'failed'

/** Successful items survive individual failures; successful empty searches remain success. */
export interface BatchResult<T> {
  readonly schemaVersion: 1
  readonly status: BatchStatus
  readonly items: readonly T[]
  readonly failures: readonly ProviderFailure[]
}

/**
 * Builds a batch outcome without mutating the caller's collections.
 * @param items - Successful values, including an empty list for a valid search with no matches.
 * @param failures - Observed failures; absence means success regardless of item count.
 * @returns A success, partial success, or failure with shallow copies of both collections.
 */
export function createBatchResult<T>(items: readonly T[], failures: readonly ProviderFailure[]): BatchResult<T> {
  return {
    schemaVersion: 1,
    status: failures.length === 0 ? 'success' : items.length === 0 ? 'failed' : 'partial_success',
    items: [...items],
    failures: [...failures],
  }
}

/** Observed run counts, never model estimates; counts are non-negative safe integers. */
export interface CoverageSummary {
  readonly schemaVersion: 1
  readonly discoveredRecords: number
  readonly deduplicatedWorks: number
  readonly includedWorks: number
  readonly availableFulltextWorks: number
  readonly abstractOnlyWorks: number
  readonly metadataOnlyWorks: number
  readonly failedOperations: number
  /** A resource, source, or permission limit interrupted coverage. */
  readonly truncated: boolean
  /** At least one non-blank explanation is required when truncated is true. */
  readonly limitations: readonly string[]
  /** Per-provider statistics are not supplied by this schema; null is not a zero count. */
  readonly providerBreakdown: null
}

/**
 * Builds coverage from producer-observed counts and explicit limitations.
 * @param input - Counts and limits without the schema version; no inferred statistics or defaults.
 * @returns Coverage with its schema version and a shallow copy of the limitations list.
 * @throws {RangeError} A count is negative, fractional, non-finite, or not a safe integer.
 * @throws {Error} Coverage is truncated without a non-blank limitation.
 */
export function createCoverageSummary(input: Omit<CoverageSummary, 'schemaVersion'>): CoverageSummary {
  const counts = {
    discoveredRecords: input.discoveredRecords,
    deduplicatedWorks: input.deduplicatedWorks,
    includedWorks: input.includedWorks,
    availableFulltextWorks: input.availableFulltextWorks,
    abstractOnlyWorks: input.abstractOnlyWorks,
    metadataOnlyWorks: input.metadataOnlyWorks,
    failedOperations: input.failedOperations,
  }
  for (const [field, value] of Object.entries(counts)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${field} must be a non-negative safe integer`)
    }
  }
  if (input.truncated && !input.limitations.some(reason => reason.trim().length > 0)) {
    throw new Error('truncated coverage requires a non-blank limitation')
  }
  return { ...input, schemaVersion: 1, limitations: [...input.limitations] }
}
