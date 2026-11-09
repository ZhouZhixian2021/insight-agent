/** Bounded product-page discovery over the provider-neutral DSH Web search API. */
import { createCandidatePageId, createProductBatchResult, createProductFailureId,
  isExecutableProductPlan, type CandidatePage, type Product, type ProductBatchResult,
  type ProductFailure, type ProductFailureId, type ProductPlan, type ProductQuestionId,
} from '@deepseek-ai/dsh-product-insight-model'
import type { WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'
import { productQuestionTerms, PRODUCT_PAGE_FRAGMENT_CHARACTERS } from './page-content.ts'

export { name, inject, Config, apply } from './web-provider.ts'

export { prepareProductPage, extractProductPageEvidence, productTextRange, selectProductGapFragment,
  rankProductPageFragments, splitProductPageText, splitFailedProductFragment,
  PRODUCT_PAGE_FRAGMENT_CHARACTERS, PRODUCT_PAGE_FRAGMENT_OVERLAP_CHARACTERS } from './page-content.ts'
export type { PreparedProductPage, ProductEvidenceDraft, ProductEvidenceExtractionResult,
  ProductPageFragment, RejectedProductEvidenceDraft } from './page-content.ts'
export { fetchProductPages, sameProductPageFacts } from './page-fetch.ts'
export type { ProductPageFetchAdapters, ProductPageFetchResult } from './page-fetch.ts'

/** One query and its observed outcome, including empty searches and unstarted queries. */
export interface ProductSearchAttempt {
  readonly questionId: ProductQuestionId
  readonly query: string
  readonly status: 'success' | 'failed' | 'cancelled' | 'skipped'
  readonly returnedCount?: number
  readonly recordedCount?: number
  readonly truncated: boolean
  readonly failureId?: ProductFailureId
  readonly reason?: string
}

/** Candidate list and the per-query record needed to explain incomplete discovery. */
export interface ProductDiscoveryResult {
  readonly candidates: ProductBatchResult<CandidatePage>
  readonly searches: readonly ProductSearchAttempt[]
  readonly cancelled: boolean
}

/** Approved plan input and deployment-owned per-request result bound. */
export interface ProductDiscoveryInput {
  readonly product: Product
  readonly plan: ProductPlan
  readonly maxResultsPerQuery: number
  /** A completed first pass whose candidates and queries remain within the same approved plan. */
  readonly existing?: ProductDiscoveryResult
  /** Approved questions selected for one additional search each. */
  readonly gapQuestionIds?: readonly ProductQuestionId[]
  /** Previously selected pages that could not be acquired and do not count toward host coverage. */
  readonly unavailablePages?: ReadonlySet<CandidatePage['candidatePageId']>
  /** Key sources for gap searches that require a different approved publisher and site. */
  readonly corroborationFor?: ReadonlyMap<ProductQuestionId, CandidatePage['candidatePageId']>
}

/**
 * The two follow-up reasons share one approved allowance and one attempt per question.
 * @param search Observed search attempt.
 * @returns Whether this attempt used the shared follow-up allowance.
 */
export function isProductGapSearch(search: ProductSearchAttempt): boolean {
  return search.reason === 'evidence_gap' || search.reason === 'corroboration_gap'
}

/** Search provider adapter; a DSH WebRuntime satisfies this interface. */
export interface ProductSearchAdapter {
  search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>
}

/** Clock injected by the caller so screening times follow the owning run. */
export interface ProductDiscoveryAdapters {
  readonly web: ProductSearchAdapter
  readonly now: () => string
}

/**
 * Resolve the reviewed per-page source bound before any fetch or model work.
 * @param plan - Approved plan, including its optional expanded page allowance.
 * @returns Maximum complete canonical text characters per selected page.
 */
export function resolveProductPageCharacterLimit(plan: ProductPlan): number {
  const maximum = plan.limits?.maximumPageCharacters ?? PRODUCT_PAGE_FRAGMENT_CHARACTERS
  if (!Number.isSafeInteger(maximum) || maximum < PRODUCT_PAGE_FRAGMENT_CHARACTERS || maximum > 48_000) {
    throw new RangeError('maximumPageCharacters must be between 12000 and 48000')
  }
  return maximum
}

/**
 * Search each approved question once and merge initial candidates in question order at each result rank.
 * An optional follow-up searches approved unresolved questions within the remaining candidate allowance.
 * @param input - Product, exact approved plan, and explicit result bound.
 * @param adapters - Provider-neutral Web search and the run clock.
 * @param signal - Optional cancellation propagated to the Web provider.
 * @returns Screened pages, per-query outcomes, and cancellation state.
 */
export async function discoverCandidatePages(input: ProductDiscoveryInput,
  adapters: ProductDiscoveryAdapters, signal?: AbortSignal): Promise<ProductDiscoveryResult> {
  const { product, plan, maxResultsPerQuery } = input
  if (!isExecutableProductPlan(plan)) throw new RangeError('Product discovery requires approval of the current plan version')
  if (product.productId !== plan.productId) throw new RangeError('Product does not match the approved plan')
  if (!Number.isSafeInteger(maxResultsPerQuery) || maxResultsPerQuery < 1) {
    throw new RangeError('maxResultsPerQuery must be a positive integer')
  }
  const maximum = plan.limits?.maximumCandidatePages
  if (maximum !== undefined && (!Number.isSafeInteger(maximum) || maximum < 1)) {
    throw new RangeError('maximumCandidatePages must be a positive integer')
  }
  const limit = Math.min(maxResultsPerQuery, maximum ?? maxResultsPerQuery)
  const gap = input.gapQuestionIds
  const attempts = input.existing?.searches.filter(isProductGapSearch) ?? []
  const triedDomains = new Set(attempts.flatMap(({ query }) => query.match(/ site:([a-z0-9.-]+)$/iu)?.slice(1) ?? []))
  if ((gap === undefined) !== (input.existing === undefined)
    || gap !== undefined && (new Set(gap).size !== gap.length
      || gap.some(questionId => !plan.questions.some(question => question.questionId === questionId))
      || gap.some(questionId => attempts.some(search => search.questionId === questionId))
      || gap.length + attempts.length > (plan.limits?.maximumGapSearches ?? 0))
    || [...input.corroborationFor?.keys() ?? []].some(id => !gap?.includes(id))) {
    throw new RangeError('Product gap search exceeds the approved questions or search allowance')
  }
  const candidates = new Map(input.existing?.candidates.items.map(page => [candidateKey(page.url), page]))
  const failures: ProductFailure[] = [...input.existing?.candidates.failures ?? []]
  const searches: ProductSearchAttempt[] = [...input.existing?.searches ?? []]
  const initialBatches: {
    search: { questionId: ProductQuestionId; recordedCount: number; truncated: boolean }
    sources: ReturnType<typeof screenSource>[]
  }[] = []
  const official = new URL(product.officialUrl)
  const startedAt = Date.parse(adapters.now())
  const maximumElapsedMinutes = plan.limits?.maximumElapsedMinutes
  if (maximumElapsedMinutes !== undefined && (!Number.isFinite(maximumElapsedMinutes) || maximumElapsedMinutes <= 0)) {
    throw new RangeError('maximumElapsedMinutes must be positive')
  }
  if (official.protocol !== 'https:' && official.protocol !== 'http:') {
    throw new RangeError('Product officialUrl must be HTTP(S)')
  }
  const candidateLimit = maximum ?? Number.POSITIVE_INFINITY
  const priorities = ['selected', 'needs_review', 'excluded'] as const
  function screenSource(source: WebSearchResult['sources'][number]) {
    const parsed = parseCandidateUrl(source.url)
    const officialPage = parsed !== null && withinDomain(parsed.hostname, official.hostname)
    const approvedPublisher = parsed === null ? undefined : plan.sourcePublishers?.find(item => withinDomain(parsed.hostname, item.domain))
    const named = [source.title, source.snippet, parsed?.hostname, parsed?.pathname].some(part =>
      part !== undefined && [product.name, ...product.aliases ?? []].some(name =>
        name.trim().length > 0 && part.toLocaleLowerCase().includes(name.toLocaleLowerCase())))
    return { source, parsed, officialPage, approvedPublisher,
      screening: screenCandidate(parsed, officialPage, named, approvedPublisher !== undefined) }
  }
  const recordSource = ({ source, parsed, officialPage, approvedPublisher, screening }: ReturnType<typeof screenSource>,
    questionId: ProductQuestionId): 'recorded' | 'ignored' | 'limit' => {
    const key = candidateKey(source.url, parsed)
    const prior = candidates.get(key)
    const promoted = gap !== undefined && prior !== undefined && prior.screening.status !== 'selected'
      && screening.status === 'selected'
    if (prior !== undefined && !promoted) {
      if (gap === undefined && !prior.questionIds.includes(questionId)) {
        candidates.set(key, { ...prior, questionIds: [...prior.questionIds, questionId] })
      }
      return 'ignored'
    }
    if (prior === undefined && candidates.size >= candidateLimit) {
      if (gap === undefined || screening.status !== 'selected') return 'limit'
      const replaced = [...candidates].findLast(([, page]) => page.screening.status !== 'selected')
      if (replaced === undefined) return 'limit'
      candidates.delete(replaced[0])
    }
    const title = source.title || prior?.title
    candidates.set(key, { schemaVersion: 1, candidatePageId: prior?.candidatePageId ?? createCandidatePageId(), planId: plan.planId,
      productId: product.productId, url: prior?.url ?? source.url, ...(title ? { title } : {}),
      sourceType: officialPage ? 'official_product_page' : 'other', discoveredAt: prior?.discoveredAt ?? adapters.now(),
      questionIds: [...new Set([...prior?.questionIds ?? [], questionId])], screening: { ...screening, screenedAt: adapters.now() },
      ...(officialPage ? { publisher: product.developer }
        : approvedPublisher === undefined ? {} : { publisher: approvedPublisher.name }), discoveryChannel: 'web' })
    return prior === undefined ? 'recorded' : 'ignored'
  }
  for (const question of gap === undefined ? plan.questions
    : plan.questions.filter(item => gap.includes(item.questionId))) {
    const primaryId = input.corroborationFor?.get(question.questionId)
    const retained = [...candidates.values()]
    const primary = primaryId === undefined ? undefined : retained.find(page => page.candidatePageId === primaryId)
    const domains = primaryId === undefined ? [official.hostname, ...plan.sourcePublishers?.map(item => item.domain) ?? []]
      : primary === undefined ? [] : productCorroborationDomains(product, plan, primary)
    const domain = gap === undefined ? undefined : gapSearchDomain(domains,
      retained.filter(page => !input.unavailablePages?.has(page.candidatePageId)), triedDomains)
    if (gap !== undefined && domain === undefined) continue
    const reason = primaryId === undefined ? 'evidence_gap' : 'corroboration_gap'
    const terms = domain === undefined ? [] : [...productQuestionTerms(question.text)]
    const query = (domain === undefined ? [product.name, question.text, plan.scope]
      : [product.name, terms.join(' ') || question.text, plan.sourceCriteria?.productVersion,
        plan.sourceCriteria?.region, `site:${domain}`]).filter(Boolean).join(' ').trim()
    const elapsed = maximumElapsedMinutes !== undefined
      && Date.parse(adapters.now()) - startedAt >= maximumElapsedMinutes * 60_000
    if (signal?.aborted || elapsed || gap !== undefined && !hasProductCandidateCapacity(retained, candidateLimit)) {
      searches.push({ questionId: question.questionId, query, status: 'skipped', truncated: true,
        reason: signal?.aborted ? 'cancelled' : elapsed ? 'elapsed_limit' : 'candidate_limit' })
      continue
    }
    try {
      if (domain !== undefined) triedDomains.add(domain)
      const result = await adapters.web.search({ query, maxResults: limit }, signal)
      const search = { questionId: question.questionId, query, status: 'success' as const,
        returnedCount: result.sources.length, recordedCount: 0, truncated: result.truncated,
        ...gap === undefined ? {} : { reason } }
      const sources = result.sources.map(screenSource)
      if (gap === undefined) {
        initialBatches.push({ search, sources })
      } else {
        for (const source of sources.toSorted((left, right) => priorities.indexOf(left.screening.status)
          - priorities.indexOf(right.screening.status))) {
          if (domain !== undefined && !withinDomain(source.parsed?.hostname, domain)) continue
          const outcome = recordSource(source, question.questionId)
          if (outcome === 'limit') { search.truncated = true; break }
          if (outcome === 'recorded') search.recordedCount += 1
        }
      }
      searches.push(search)
    } catch (error) {
      if (signal?.aborted) {
        searches.push({ questionId: question.questionId, query, status: 'cancelled', truncated: false,
          ...gap === undefined ? {} : { reason } })
        continue
      }
      const failure = productFailure('discovery', errorCategory(error), errorMessage(error), adapters.now())
      failures.push(failure)
      searches.push({ questionId: question.questionId, query, status: 'failed',
        truncated: false, failureId: failure.failureId,
        ...gap === undefined ? {} : { reason } })
    }
  }
  // Keep scanning settled results after reaching the limit so duplicate pages retain every question link.
  for (const status of priorities) {
    const batches = initialBatches.map(({ search, sources }) => ({ search,
      sources: sources.filter(source => source.screening.status === status) }))
    const ranks = Math.max(0, ...batches.map(({ sources }) => sources.length))
    for (let rank = 0; rank < ranks; rank += 1) {
      for (const { search, sources } of batches) {
        const source = sources[rank]
        if (source === undefined) continue
        const outcome = recordSource(source, search.questionId)
        if (outcome === 'recorded') search.recordedCount += 1
        if (outcome === 'limit') search.truncated = true
      }
    }
  }
  return { candidates: createProductBatchResult([...candidates.values()], failures), searches,
    cancelled: input.existing?.cancelled || signal?.aborted || false }
}

/**
 * Decide whether a follow-up can add an eligible page within the candidate limit.
 * @param candidates - Retained discovery results. A follow-up may replace unselected candidates.
 * @param maximum - Approved candidate-page limit.
 * @returns Whether there is room for one more selected page.
 */
export function hasProductCandidateCapacity(candidates: readonly CandidatePage[], maximum: number): boolean {
  return candidates.filter(page => page.screening.status === 'selected').length < maximum
}

/**
 * Find eligible search domains outside the key source's approved publisher and site.
 * @param product Product identity and official website.
 * @param plan Approved plan defining eligible external publisher domains.
 * @param primary Candidate page supplying the key statement.
 * @returns Approved search domains whose publisher and site differ from the key source.
 */
export function productCorroborationDomains(product: Product, plan: ProductPlan, primary: CandidatePage): readonly string[] {
  const host = parseCandidateUrl(primary.url)?.hostname
  if (host === undefined || primary.publisher === undefined) return []
  const publisher = primary.publisher.toLocaleLowerCase()
  const approved = [{ name: product.developer, domain: new URL(product.officialUrl).hostname }, ...plan.sourcePublishers ?? []]
  return approved.filter(({ name, domain }) => name.toLocaleLowerCase() !== publisher
    && !withinDomain(host, domain) && !withinDomain(domain, host)).map(({ domain }) => domain)
}

function withinDomain(host: string | undefined, domain: string): boolean {
  return host === domain || (host?.endsWith(`.${domain}`) ?? false)
}

/** Prefer an approved host with the fewest selected pages, breaking ties in favor of untried hosts. */
function gapSearchDomain(domains: readonly string[], candidates: readonly CandidatePage[],
  tried: ReadonlySet<string>): string | undefined {
  let best: string | undefined
  let fewest = Number.POSITIVE_INFINITY
  for (const domain of domains) {
    const count = candidates.filter((page) => {
      const host = parseCandidateUrl(page.url)?.hostname
      return page.screening.status === 'selected' && withinDomain(host, domain)
    }).length
    if (count < fewest || count === fewest && best !== undefined && tried.has(best) && !tried.has(domain)) {
      best = domain
      fewest = count
    }
  }
  return best
}

function parseCandidateUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null
    return url
  } catch { return null }
}

function dedupUrl(url: URL): string {
  const normalized = new URL(url)
  normalized.hash = ''
  for (const key of [...normalized.searchParams.keys()]) {
    if (/^utm_/iu.test(key) || key === 'gclid' || key === 'fbclid') normalized.searchParams.delete(key)
  }
  return normalized.href
}

function candidateKey(url: string, parsed = parseCandidateUrl(url)): string {
  return parsed === null ? `invalid:${url}` : dedupUrl(parsed)
}

function screenCandidate(parsed: URL | null, officialPage: boolean, named: boolean, approvedPublisher: boolean):
Pick<CandidatePage['screening'], 'status' | 'reason'> {
  if (parsed === null) return { status: 'excluded', reason: 'Search result URL is not a valid HTTP(S) URL.' }
  if (officialPage) {
    return { status: 'selected', reason: 'URL matches the approved official host; check product relevance against the page text.' }
  }
  if (named) {
    return { status: 'selected', reason: approvedPublisher
      ? 'Search metadata names the product and its host matches a user-approved publisher domain.'
      : 'Search metadata names the product; publisher identity remains unverified.' }
  }
  return { status: 'needs_review', reason: 'Publisher and product relevance need page review.' }
}

function productFailure(stage: ProductFailure['stage'], category: ProductFailure['category'],
  message: string, occurredAt: string): ProductFailure {
  return { schemaVersion: 1, failureId: createProductFailureId(), stage, category,
    message, retryable: category === 'timeout' || category === 'rate_limited' || category === 'network_error', occurredAt }
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }

function errorCategory(error: unknown): ProductFailure['category'] {
  const code = error instanceof Error && 'code' in error ? String(error.code) : ''
  if (/TIMEOUT/iu.test(code)) return 'timeout'
  if (/RATE_LIMIT/iu.test(code)) return 'rate_limited'
  if (/NETWORK/iu.test(code)) return 'network_error'
  if (/PROVIDER/iu.test(code)) return 'upstream_error'
  return 'unknown'
}
