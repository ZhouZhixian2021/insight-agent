/**
 * Service Definition for the academic source capability seam (`ctx.academicSource`): a provider
 * registry and provider-selecting execution for scholarly search. Duplicate ids are rejected. At
 * execution time, a configured provider must exist and be usable; without one, exactly one usable
 * provider is required, so selection never depends on registration order. `searchAll()` runs every
 * usable provider and aggregates their outcomes into one partial-success batch.
 * @module @deepseek-ai/dsh-academic-source
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { createBatchResult, createFailureId } from '@deepseek-ai/dsh-academic-model'
import type { ProviderFailure, WorkVersion } from '@deepseek-ai/dsh-academic-model'
import z from '@deepseek-ai/schemastery'
import type {
  AcademicSourceFullText,
  AcademicSourceProvider,
  AcademicSourceSearchBatchResult,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
  AcademicSourceWork,
} from './types.ts'
import { AcademicSourceError } from './types.ts'

export { AcademicSourceError } from './types.ts'
export type {
  AcademicSourceFullText,
  AcademicSourceProvider,
  AcademicSourceSearchBatchResult,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
  AcademicSourceWork,
} from './types.ts'
export {
  academicCatalogHtmlText,
  normalizeAcademicCatalogRecord,
  searchAcademicCatalogs,
} from './catalog.ts'
export type { AcademicCatalogRecord, AcademicCatalogSearchOptions } from './catalog.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    academicSource: AcademicSourceRuntime
  }
}

/** Selection inputs for execution-time provider resolution. */
interface Selection<P> {
  /** The configured provider id for this capability, if any. */
  readonly configuredId?: string
  /** Providers registered for this capability kind. */
  readonly providers: ReadonlyMap<string, P>
}

/**
 * Config for the academic source seam. `searchProvider` pins which provider wins
 * for search; it is optional (a single registered usable provider auto-selects).
 * Operational overrides such as environment variables must feed this same field
 * rather than introduce a hidden priority chain.
 */
export interface AcademicSourceRuntimeConfig {
  /** Explicit search provider id. Omitted = auto-select when exactly one usable. */
  readonly searchProvider?: string
}

/**
 * The academic source access service. Registered as `ctx.academicSource` (one
 * instance per context).
 *
 * Selection semantics (resolved at execution time, never order-dependent):
 * - A configured id that is registered and `available()` → that provider.
 * - A configured id not registered → `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING`.
 * - A configured id registered but unavailable →
 *   `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE`.
 * - No id configured, exactly one registered usable provider → that provider.
 * - No id configured, multiple usable providers → `ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS`.
 * - No id configured, no usable provider → `ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE`.
 */
export class AcademicSourceRuntime extends Service {
  /**
   * Provider selection config. Operational env overrides feed the SAME field:
   * `$DSH_ACADEMIC_SOURCE_SEARCH_PROVIDER` is equivalent to `searchProvider`
   * and is NOT a hidden priority chain.
   */
  static Config: z<AcademicSourceRuntimeConfig> = z.object({
    searchProvider: z.string(),
  })

  private providers = new Map<string, AcademicSourceProvider>()
  private readonly searchProviderId: string | undefined

  constructor(ctx: Context, config: AcademicSourceRuntimeConfig = {}) {
    super(ctx, 'academicSource')
    this.searchProviderId = config.searchProvider ?? process.env.DSH_ACADEMIC_SOURCE_SEARCH_PROVIDER
  }

  /**
   * Register an academic source provider. Throws {@link AcademicSourceError}
   * `ACADEMIC_SOURCE_DUPLICATE_PROVIDER` if its id is already registered.
   * Returns a disposer; disposed with the calling fiber.
   * @param provider - the provider; its `id` is the registry key.
   * @returns the disposer that unregisters the provider.
   */
  registerSearchProvider(provider: AcademicSourceProvider): () => void {
    const store = this.providers
    if (store.has(provider.id)) {
      throw new AcademicSourceError(
        `an academic source provider with id "${provider.id}" is already registered`,
        'ACADEMIC_SOURCE_DUPLICATE_PROVIDER',
      )
    }
    const dispose = this.ctx.effect(function* () {
      store.set(provider.id, provider)
      yield () => store.delete(provider.id)
    }, 'academicSource.registerSearchProvider()')
    // ctx.effect's disposer returns Promise<void>; the registrant API is
    // synchronous fire-and-forget — discard the (always-resolved) promise.
    return () => void dispose()
  }

  /**
   * Run one scholarly search through the selected provider. Resolves the
   * provider at call time with the selection rules above; throws
   * {@link AcademicSourceError} when the capability cannot run. The seam
   * enforces `request.maxResults` on the result: if the provider over-returns,
   * `works[]` is truncated and `truncated` set.
   * @param request - the query and optional result limit.
   * @param signal - optional cancellation signal forwarded to the provider.
   * @returns the provider's normalized works, capped to `request.maxResults`.
   */
  async search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult> {
    const provider = resolveProvider({
      providers: this.providers,
      ...this.searchProviderId !== undefined ? { configuredId: this.searchProviderId } : {},
    })
    const result = await provider.search(request, signal)
    return capWorks(result, request.maxResults)
  }

  /**
   * Search every usable provider and merge their results round-robin before applying the total bound.
   *
   * One provider's failure never discards another provider's results: expected search failures
   * become source-level `ProviderFailure` entries in `batch.failures`, and works from the remaining
   * providers survive in `batch.items`. Every called provider succeeds — including zero-result
   * searches — yields `batch.status: success`; at least one surviving work beside failures yields
   * `partial_success`; only failures yields `failed` with every failure retained. Configuration
   * failures (`ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE` and the other selection codes) still throw,
   * and caller cancellation aborts the whole round as `ACADEMIC_SOURCE_ABORTED` instead of
   * fabricating provider failures.
   *
   * `discoveredRecords` counts every record the providers returned before the aggregate
   * `request.maxResults` bound; `truncated` is set when either a provider or the aggregate bound
   * dropped records; `limitations` carries each called provider's declared coverage limits and one
   * aggregate-bound entry when the total bound dropped records. The inherited `works` and
   * `truncated` fields mirror `batch.items` for the existing single-result adapter shape.
   * @param request - query and total result limit across providers.
   * @param signal - optional cancellation forwarded to every provider.
   * @returns the aggregate batch outcome from all usable providers.
   */
  async searchAll(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchBatchResult> {
    const providers = [...this.providers.values()]
      .filter(provider => provider.available())
      .sort((left, right) => left.id.localeCompare(right.id))
    if (providers.length === 0) {
      throw new AcademicSourceError('no usable academic source provider is registered', 'ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE')
    }
    const settled = await Promise.all(providers.map(async (provider) => {
      try {
        return { provider, result: await provider.search(request, signal) }
      } catch (reason: unknown) {
        return { provider, reason }
      }
    }))
    const cancelled = cancellationOf(settled, signal)
    if (cancelled !== undefined) throw cancelled
    const failures: ProviderFailure[] = []
    const groups: (readonly AcademicSourceWork[])[] = []
    let providerTruncated = false
    for (const entry of settled) {
      if ('result' in entry) {
        groups.push(entry.result.works)
        providerTruncated = providerTruncated || entry.result.truncated
      } else {
        failures.push(searchFailure(entry.provider, entry.reason))
      }
    }
    const merged = roundRobin(groups)
    const capped = request.maxResults === undefined ? merged : merged.slice(0, request.maxResults)
    const batch = createBatchResult(capped, failures)
    const limitations = declaredLimitations(providers)
    if (capped.length < merged.length) {
      limitations.push(`The aggregate result bound retained ${capped.length} of ${merged.length} discovered records.`)
    }
    return {
      works: batch.items,
      truncated: providerTruncated || capped.length < merged.length,
      providers: providers.map(provider => provider.id),
      discoveredRecords: merged.length,
      batch,
      limitations,
    }
  }

  /**
   * Resolve full-text URLs through the provider named by a version's source records.
   * @param version - version selected after ingestion.
   * @returns the first usable provider's ordered candidates, or `null`.
   */
  resolveFullText(version: WorkVersion): AcademicSourceFullText | null {
    for (const record of version.sourceRecords) {
      const provider = this.providers.get(record.provider)
      if (provider === undefined || !provider.available()) continue
      const urls = provider.fullTextUrls(record.recordId)
      if (urls.length > 0) return { sourceProvider: provider.id, urls }
    }
    return null
  }
}

interface ResolvableProvider {
  readonly id: string
  available(): boolean
}

/** Resolve the selected provider or throw the matching {@link AcademicSourceError}. */
function resolveProvider<P extends ResolvableProvider>(selection: Selection<P>): P {
  const { configuredId, providers } = selection
  if (configuredId !== undefined) {
    const provider = providers.get(configuredId)
    if (!provider) {
      throw new AcademicSourceError(
        `configured academic source provider "${configuredId}" is not registered`,
        'ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING',
      )
    }
    if (!provider.available()) {
      throw new AcademicSourceError(
        `configured academic source provider "${configuredId}" is registered but unavailable`,
        'ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE',
      )
    }
    return provider
  }
  const usable = [...providers.values()].filter(provider => provider.available())
  const [single] = usable
  if (single === undefined) {
    throw new AcademicSourceError('no usable academic source provider is registered', 'ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE')
  }
  if (usable.length > 1) {
    const ids = usable.map(provider => provider.id).join(', ')
    throw new AcademicSourceError(
      `multiple usable academic source providers are registered (${ids}); configure one explicitly`,
      'ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS',
    )
  }
  return single
}

/** Enforce `maxResults` on a search result: truncate `works[]` and flag it. */
function capWorks(result: AcademicSourceSearchResult, maxResults: number | undefined): AcademicSourceSearchResult {
  if (maxResults === undefined || result.works.length <= maxResults) return result
  return { ...result, works: result.works.slice(0, maxResults), truncated: true }
}

/** One provider's settled search: its success result or its rejection reason. */
type SettledSearch =
  | { readonly provider: AcademicSourceProvider; readonly result: AcademicSourceSearchResult }
  | { readonly provider: AcademicSourceProvider; readonly reason: unknown }

/**
 * The whole round's cancellation, if any: the first provider's `ACADEMIC_SOURCE_ABORTED`
 * error, or a synthesized one when the signal is already aborted.
 * @param settled - per-provider outcomes; abort rejections abort the round, never become failures.
 * @param signal - the caller's cancellation signal.
 * @returns the error to rethrow, or `undefined` when the round was not cancelled.
 */
function cancellationOf(settled: readonly SettledSearch[], signal: AbortSignal | undefined): AcademicSourceError | undefined {
  for (const entry of settled) {
    if ('reason' in entry && entry.reason instanceof AcademicSourceError && entry.reason.code === 'ACADEMIC_SOURCE_ABORTED') {
      return entry.reason
    }
  }
  if (signal?.aborted === true) {
    return new AcademicSourceError('academic source searchAll aborted', 'ACADEMIC_SOURCE_ABORTED', { cause: signal.reason })
  }
  return undefined
}

/**
 * Convert one provider's rejected search into a source-level `ProviderFailure`.
 * Expected provider failures carry the provider's credential-free message as a
 * retryable upstream error; unexpected rejection values surface as unknown and
 * not retryable. Finer categories (network, timeout, rate limit) wait for a
 * provider error-granularity increment; search-level failures never set
 * `affectedWorkVersionId`.
 * @param provider - the provider whose search rejected.
 * @param reason - the rejection value; provider messages are credential-free by construction.
 * @returns the `ProviderFailure` recorded in `batch.failures`.
 */
function searchFailure(provider: AcademicSourceProvider, reason: unknown): ProviderFailure {
  const expected = reason instanceof AcademicSourceError
  return {
    schemaVersion: 1,
    failureId: createFailureId(),
    provider: provider.id,
    operation: 'search',
    category: expected ? 'upstream_error' : 'unknown',
    message: expected ? reason.message : String(reason),
    retryable: expected,
    retryAfter: null,
  }
}

/** Collect the called providers' declared coverage limitations, deduplicated in provider order. */
function declaredLimitations(providers: readonly AcademicSourceProvider[]): string[] {
  const limitations: string[] = []
  for (const provider of providers) {
    for (const limitation of provider.limitations ?? []) {
      if (!limitations.includes(limitation)) limitations.push(limitation)
    }
  }
  return limitations
}

/** Interleave provider result lists so a total cap does not favor registration order. */
function roundRobin<T>(groups: readonly (readonly T[])[]): T[] {
  const merged: T[] = []
  const length = Math.max(0, ...groups.map(group => group.length))
  for (let index = 0; index < length; index++) {
    for (const group of groups) {
      const item = group[index]
      if (item !== undefined) merged.push(item)
    }
  }
  return merged
}

export default AcademicSourceRuntime
