/**
 * Service Definition for the academic source capability seam (`ctx.academicSource`): a provider
 * registry and provider-selecting execution for scholarly search. Duplicate ids are rejected. At
 * execution time, a configured provider must exist and be usable; without one, exactly one usable
 * provider is required, so selection never depends on registration order.
 * @module @deepseek-ai/dsh-academic-source
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {
  AcademicSourceProvider,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
} from './types.ts'
import { AcademicSourceError } from './types.ts'

export { AcademicSourceError } from './types.ts'
export type {
  AcademicSourceProvider,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
  AcademicSourceWork,
} from './types.ts'

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

export default AcademicSourceRuntime
