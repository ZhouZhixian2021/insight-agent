/**
 * Service Definition for the academic source capability seam (`ctx.academicSource`): a provider
 * registry and provider-selecting execution for scholarly search. Duplicate ids are rejected. At
 * execution time, a configured provider must exist and be usable; without one, exactly one usable
 * provider is required, so selection never depends on registration order. `searchAll()` runs the
 * configured discovery providers (all usable providers when omitted) in one partial-success batch.
 * @module @deepseek-ai/dsh-academic-source
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { createBatchResult, createFailureId } from '@deepseek-ai/dsh-academic-model'
import type { FailureCategory, ProviderFailure, WorkVersion } from '@deepseek-ai/dsh-academic-model'
import z from '@deepseek-ai/schemastery'
import type {
  AcademicReference,
  AcademicReferenceVerificationOutcome,
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
  AcademicReference,
  AcademicReferenceIdentificationIssue,
  AcademicReferenceIdentificationIssueCode,
  AcademicReferenceIdentificationResult,
  AcademicReferenceIdentifier,
  AcademicReferenceVerificationFailure,
  AcademicReferenceVerificationOutcome,
  AcademicVerifiedReference,
  AcademicSourceSearchBatchResult,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
  AcademicSourceWork,
  AcademicWebDiscoveryCandidate,
} from './types.ts'
export {
  academicCatalogHtmlText,
  fetchAcademicPaperPage,
  normalizeAcademicCatalogRecord,
  parseAcademicPaperCitation,
  searchAcademicCatalogs,
} from './catalog.ts'
export type { AcademicCatalogRecord, AcademicCatalogSearchOptions, AcademicPaperCitation } from './catalog.ts'

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
  /** Provider ids called by searchAll; omitted searches every usable provider. Resolvers remain registered. */
  readonly searchProviders?: string[]
  /** Per-provider search deadline; omitted preserves the caller-owned budget. No retries are performed. */
  readonly searchTimeoutMs?: number
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
    searchProviders: z.array(z.string()).extra('default', undefined),
    searchTimeoutMs: z.number(),
  })

  private providers = new Map<string, AcademicSourceProvider>()
  private readonly searchProviderId: string | undefined
  private readonly searchProviderIds: readonly string[] | undefined
  private readonly searchTimeoutMs: number | undefined

  constructor(ctx: Context, config: AcademicSourceRuntimeConfig = {}) {
    super(ctx, 'academicSource')
    this.searchProviderId = config.searchProvider ?? process.env.DSH_ACADEMIC_SOURCE_SEARCH_PROVIDER
    if (config.searchProviders !== undefined && (config.searchProviders.length === 0
      || config.searchProviders.some(id => id.trim() === '')
      || new Set(config.searchProviders).size !== config.searchProviders.length)) {
      throw new Error('searchProviders must contain distinct, non-empty provider ids')
    }
    if (config.searchTimeoutMs !== undefined && (!Number.isSafeInteger(config.searchTimeoutMs)
      || config.searchTimeoutMs <= 0 || config.searchTimeoutMs > 2_147_483_647)) {
      throw new Error('searchTimeoutMs must be a positive timer-safe integer')
    }
    this.searchProviderIds = config.searchProviders
    this.searchTimeoutMs = config.searchTimeoutMs
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
    const result = await this.runSearch(provider, request, signal)
    return capWorks(result, request.maxResults)
  }

  /**
   * Search configured discovery providers, or every usable provider, and merge results round-robin.
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
    if (signal?.aborted) throw new AcademicSourceError('academic source search aborted', 'ACADEMIC_SOURCE_ABORTED')
    const providers = (this.searchProviderIds === undefined
      ? [...this.providers.values()].filter(provider => provider.available())
      : this.searchProviderIds.map(configuredId => resolveProvider({ providers: this.providers, configuredId })))
      .sort((left, right) => left.id.localeCompare(right.id))
    if (providers.length === 0) {
      throw new AcademicSourceError('no usable academic source provider is registered', 'ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE')
    }
    const settled = await Promise.all(providers.map(async (provider) => {
      try {
        return { provider, result: await this.runSearch(provider, request, signal) }
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
    const identified = capped.filter(work => work.workVersion.sourceRecords.length > 0)
    const unknownDates = identified.filter(work => work.academicWork.firstPublicDate.status !== 'available').length
    const unknownVenues = identified.filter(work => work.academicWork.venue.status !== 'available').length
    const unknownVersions = identified.filter(work => work.workVersion.versionType === 'unknown').length
    let missingFullText = 0
    let failedResolution = 0
    for (const work of identified) {
      try {
        if (this.resolveFullText(work.workVersion) === null) missingFullText++
      } catch {
        // Resolution failures remain explicit limits; they must not discard another source's search results.
        failedResolution++
      }
    }
    if (unknownDates > 0) limitations.push(`${unknownDates} returned works have unknown first_public_release dates; publication dates must not substitute for them.`)
    if (unknownVenues > 0) limitations.push(`${unknownVenues} returned works have unknown publication venues; download hosts do not establish conference membership or ranking.`)
    if (unknownVersions > 0) limitations.push(`${unknownVersions} returned works have unknown version types; version eligibility requires verification.`)
    if (missingFullText > 0) limitations.push(`${missingFullText} returned works have no resolvable full-text candidates; this does not establish that no full text exists.`)
    if (failedResolution > 0) limitations.push(`Full-text candidate resolution failed for ${failedResolution} returned works; no download was attempted during discovery.`)
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

  /** Bound one provider without treating its deadline as cancellation of other sources. */
  private async runSearch(provider: AcademicSourceProvider, request: AcademicSourceSearchRequest,
    signal?: AbortSignal): Promise<AcademicSourceSearchResult> {
    if (signal?.aborted) throw new AcademicSourceError('academic source search aborted', 'ACADEMIC_SOURCE_ABORTED')
    if (this.searchTimeoutMs === undefined) return provider.search(request, signal)
    const controller = new AbortController()
    const abort = () => { controller.abort(new AcademicSourceError('academic source search aborted', 'ACADEMIC_SOURCE_ABORTED')) }
    signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => { controller.abort(new AcademicSourceError(
      `${provider.id} search exceeded ${this.searchTimeoutMs} ms`, 'ACADEMIC_SOURCE_TIMEOUT',
    )) }, this.searchTimeoutMs)
    const { promise: stopped, reject } = Promise.withResolvers<never>()
    const onAbort = () => { reject(controller.signal.reason as AcademicSourceError) }
    controller.signal.addEventListener('abort', onAbort, { once: true })
    try {
      return await Promise.race([provider.search(request, controller.signal), stopped])
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      controller.signal.removeEventListener('abort', onAbort)
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

  /**
   * Verify one Web-discovered paper against the approved owning provider.
   * Search-only availability does not prevent a registered provider from verifying a single record.
   * @param reference - DOI, arXiv ID, or official provider record identified from one Web result.
   * @param allowedProviders - provider ids approved by the research plan for verification.
   * @param signal - caller cancellation, which aborts the whole verification round.
   * @returns the official work and full-text candidates, or one classified failure.
   */
  async verifyReference(reference: AcademicReference, allowedProviders: readonly string[],
    signal?: AbortSignal): Promise<AcademicReferenceVerificationOutcome> {
    if (signal?.aborted) throw new AcademicSourceError('academic reference verification aborted', 'ACADEMIC_SOURCE_ABORTED')
    const providerId = reference.kind === 'provider_record' ? reference.provider
      : reference.kind === 'doi' ? 'openalex' : 'arxiv'
    if (!allowedProviders.includes(providerId)) {
      return referenceFailure(reference, providerId, 'invalid_request', `${providerId} was not approved for reference verification.`)
    }
    const provider = this.providers.get(providerId)
    if (provider === undefined || provider.verifyReference === undefined) {
      throw new AcademicSourceError(`academic source provider "${providerId}" cannot verify references`,
        'ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING')
    }
    try {
      const work = await provider.verifyReference(reference, signal)
      if (work === null) return referenceFailure(reference, providerId, 'not_found',
        `${providerId} has no matching official paper record.`)
      const record = work.workVersion.sourceRecords.find(item => item.provider === providerId)
      if (record === undefined) throw new AcademicSourceError('Verified work has no owning source record', 'ACADEMIC_SOURCE_PARSE_ERROR')
      const urls = provider.fullTextUrls(record.recordId)
      return { status: 'verified', value: { reference, verificationProvider: providerId, work,
        fullText: urls.length === 0 ? null : { sourceProvider: providerId, urls } } }
    } catch (reason: unknown) {
      if (signal?.aborted || reason instanceof AcademicSourceError && reason.code === 'ACADEMIC_SOURCE_ABORTED') {
        throw new AcademicSourceError('academic reference verification aborted', 'ACADEMIC_SOURCE_ABORTED', { cause: reason })
      }
      const code = reason instanceof AcademicSourceError ? reason.code : ''
      const category: FailureCategory = code === 'ACADEMIC_SOURCE_INVALID_REQUEST' ? 'invalid_request'
        : code === 'ACADEMIC_SOURCE_RATE_LIMIT' ? 'rate_limited'
          : code === 'ACADEMIC_SOURCE_TIMEOUT' ? 'timeout'
            : code === 'ACADEMIC_SOURCE_NETWORK_ERROR' ? 'network_error'
              : code === 'ACADEMIC_SOURCE_PARSE_ERROR' ? 'parse_failed'
                : code === 'ACADEMIC_SOURCE_PROVIDER_ERROR' ? 'upstream_error' : 'unknown'
      return referenceFailure(reference, providerId, category,
        reason instanceof AcademicSourceError ? reason.message : `${providerId} verification failed.`)
    }
  }
}

function referenceFailure(reference: AcademicReference, verificationProvider: string, category: FailureCategory,
  message: string): AcademicReferenceVerificationOutcome {
  return { status: 'failed', failure: { reference, verificationProvider, category, message,
    retryable: ['rate_limited', 'timeout', 'network_error'].includes(category), retryAfter: null } }
}

interface ResolvableProvider {
  readonly id: string
  available(): boolean
}

/** Resolve the selected provider or throw the matching {@link AcademicSourceError}. */
/* jscpd:ignore-start -- academic and Web providers own separate error codes and selection APIs. */
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
/* jscpd:ignore-end */

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
 * classified failure; unclassified expected errors retain the upstream category.
 * Unexpected rejection values surface as unknown and not retryable. Search-level
 * failures never set `affectedWorkVersionId`; this conversion does not retry requests.
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
    category: !expected ? 'unknown' : reason.code === 'ACADEMIC_SOURCE_TIMEOUT' ? 'timeout'
      : reason.code === 'ACADEMIC_SOURCE_RATE_LIMIT' ? 'rate_limited'
        : reason.code === 'ACADEMIC_SOURCE_PARSE_ERROR' ? 'parse_failed'
          : reason.code === 'ACADEMIC_SOURCE_NETWORK_ERROR' ? 'network_error' : 'upstream_error',
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
export { identifyAcademicReferences } from './identify-reference.ts'
