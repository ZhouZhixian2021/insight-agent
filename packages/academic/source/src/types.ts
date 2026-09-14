/**
 * Vocabulary for the academic source capability seam (`ctx.academicSource`). A source provider
 * searches scholarly works and returns provider-neutral work/version pairs; the seam owns provider
 * selection, cancellation, the result bound, and one error taxonomy, while cross-record version
 * linking, deduplication, and run/coverage statistics remain later increments of the shared model.
 * @module @deepseek-ai/dsh-academic-source/types
 */

import type { AcademicWork, WorkVersion } from '@deepseek-ai/dsh-academic-model'

/**
 * One provider-neutral work/version pair: the portable search-result item a
 * source provider returns. `academicWork` is a fresh work identity and
 * `workVersion` its single immutable version; cross-record linking and
 * deduplication belong to the ingestion increment, not to a provider.
 */
export interface AcademicSourceWork {
  readonly academicWork: AcademicWork
  readonly workVersion: WorkVersion
}

/**
 * What one source-capable backend is asked to search. Each request carries one
 * query. `maxResults` is a consumer-owned bound passed through unchanged and
 * enforced on the way back by the seam (see {@link AcademicSourceSearchResult}).
 */
export interface AcademicSourceSearchRequest {
  readonly query: string
  /**
   * Upper bound on returned works; the seam truncates to it. Omitted = no
   * bound. A provider whose API supports a result-count control should apply it
   * at the request layer as a cost/latency optimization; the seam enforces the
   * bound regardless.
   */
  readonly maxResults?: number
}

/**
 * Normalized search outcome. `works[]` is the portable normalized-work shape.
 * `truncated` is set by the seam when it cut `works[]` down to `maxResults`.
 */
export interface AcademicSourceSearchResult {
  /** Normalized works, already truncated to the request's `maxResults`. */
  readonly works: readonly AcademicSourceWork[]
  /** True when the seam dropped works to honor `maxResults`. */
  readonly truncated: boolean
}

/**
 * A source-capable backend. Registered with `ctx.academicSource.registerSearchProvider`.
 * `id` is a stable string, unique within the search capability kind.
 */
export interface AcademicSourceProvider {
  readonly id: string
  /** Cheap local usability check; must not make network calls. */
  available(): boolean
  /** Run one scholarly search; honor `signal` for cancellation. */
  search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult>
}

/**
 * Typed failure for academic-source seam operations, carrying a stable
 * machine-routable, open-string `code` and a chained `cause`.
 *
 * Deliberately re-implements the `HarnessError` shape instead of extending it:
 * the academic business group stays free of the `@deepseek-ai/dsh-llm`
 * capability package, and consumers route on `code`, never on the prototype
 * chain, so the two shapes stay interchangeable at a future tool boundary.
 * Shared codes cover missing, unusable, ambiguous, or duplicate providers and a
 * provider's own failure surfaced through the seam.
 */
export class AcademicSourceError extends Error {
  /** Stable machine-routable failure code. */
  readonly code: string

  /**
   * @param message - human-readable failure description.
   * @param code - stable machine-routable code.
   * @param options - optional chained cause.
   */
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AcademicSourceError'
    this.code = code
  }
}
