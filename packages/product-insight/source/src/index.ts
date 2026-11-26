/** Bounded product-page discovery over the provider-neutral DSH Web search API. */
import { createProductBatchResult, createProductFailureId,
  isExecutableProductPlan, type CandidatePage, type Product, type ProductBatchResult,
  type ProductFailure, type ProductFailureId, type ProductPlan, type ProductQuestionId,
} from '@deepseek-ai/dsh-product-insight-model'
import type { WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import { productQuestionTerms } from './page-content.ts'
import { candidateKey, parseCandidateUrl, ProductCandidatePool, queryKey, screenNavigation, withinDomain } from './candidate-pool.ts'
import type { OfficialFeedResult, OfficialLink } from './official-feed.ts'

export { name, inject, Config, apply } from './web-provider.ts'
export type { SearchObservation } from './search-recovery.ts'

export { prepareProductPage, extractProductPageEvidence, productTextRange, selectProductGapFragment,
  rankProductPageFragments, splitProductPageText, splitFailedProductFragment,
  PRODUCT_PAGE_FRAGMENT_CHARACTERS, PRODUCT_PAGE_FRAGMENT_OVERLAP_CHARACTERS } from './page-content.ts'
export type { ProductPageImage, PreparedProductPage, ProductEvidenceDraft, ProductEvidenceExtractionResult,
  ProductPageFragment, RejectedProductEvidenceDraft } from './page-content.ts'
export { fetchProductImage } from './web-provider.ts'
export { fetchProductPages, sameProductPageFacts } from './page-fetch.ts'
export type { ProductPageFetchAdapters, ProductPageFetchResult } from './page-fetch.ts'
export { discoverOfficialLinks, OFFICIAL_FEED_PATHS } from './official-feed.ts'
export type { OfficialFeedOptions, OfficialFeedResult, OfficialLink } from './official-feed.ts'
export { MINIMUM_QUESTION_TERM_HITS, relevanceSignals, scoreCandidateRelevance } from './relevance.ts'
export type { RelevanceCandidate, RelevanceSignals, RelevanceVerdict } from './relevance.ts'
export { BING_NEWS_MARKET, BING_NEWS_RSS, discoverNewsLinks, newsFeedUrl } from './news-feed.ts'
export { rotationOf, SearchEngineHealth, searchMultiple } from './multi-search.ts'
export type { SearchHealthOptions } from './multi-search.ts'
export type { NewsFeedOptions, NewsFeedResult } from './news-feed.ts'

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
  /** Observed planning-search links; screened and deduplicated with background results. */
  readonly initialSources?: WebSearchResult['sources']
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

/**
 * Match a search attempt to the approved question it helps answer.
 * @param search - Recorded discovery or follow-up search.
 * @param question - Approved question and its standalone queries.
 * @returns Whether the question owns this attempt or shares its original discovery query.
 */
export function searchAppliesToProductQuestion(search: ProductSearchAttempt, question: ProductPlan['questions'][number]): boolean {
  return search.questionId === question.questionId || (!isProductGapSearch(search)
    && (question.searchQueries?.some(query => queryKey(query) === queryKey(search.query)) ?? false))
}

/** Discovery link a provider may attribute to the anonymous engine that returned it. */
export interface ProductSearchSource extends WebSearchSource {
  readonly engine?: string
}

/** Search provider adapter; a DSH WebRuntime satisfies this interface. */
export interface ProductSearchAdapter {
  search(request: WebSearchRequest, signal?: AbortSignal):
  Promise<WebSearchResult & { readonly sources: readonly ProductSearchSource[] }>
}

/** Clock injected by the caller so screening times follow the owning run. */
export interface ProductDiscoveryAdapters {
  readonly web: ProductSearchAdapter
  readonly now: () => string
  /** Reads links the official site publishes; omission keeps discovery limited to search. */
  readonly officialFeed?: (url: string, accept: (link: OfficialLink) => boolean,
    signal?: AbortSignal) => Promise<OfficialFeedResult>
  /** Reads one keyless news feed for the product name; omission leaves only search and the official source. */
  readonly newsFeed?: (query: string, accept: (link: OfficialLink) => boolean,
    signal?: AbortSignal) => Promise<readonly OfficialLink[]>
}

/**
 * Resolve the reviewed per-page source bound before any fetch or model work.
 * @param plan - Approved plan, including its optional expanded page allowance.
 * @returns Maximum complete canonical text characters per selected page.
 */
export function resolveProductPageCharacterLimit(plan: ProductPlan): number {
  const maximum = plan.limits?.maximumPageCharacters ?? Number.MAX_SAFE_INTEGER
  if (!Number.isSafeInteger(maximum) || maximum < 1) {
    throw new RangeError('maximumPageCharacters must be a positive safe integer')
  }
  return maximum
}

/** Character budget of one first-pass query; longer sentences make engines match rare words. */
const PRODUCT_SEARCH_QUERY_CHARACTERS = 60
/** Approved-question terms kept in one first-pass query. */
const PRODUCT_SEARCH_QUERY_TERMS = 4

/**
 * Build the first-pass query of one approved question from the product name and its strongest question terms.
 * Plan scope stays out of the query: engines match its prose instead of the product and return unrelated pages.
 * @param product - Investigated product; a trailing parenthetical is annotation, not a search term.
 * @param question - Approved question whose distinctive terms are ranked.
 * @param searchTerms - Words the planner chose for this question; they replace the derived ones when present.
 * @returns A keyword query of at most {@link PRODUCT_SEARCH_QUERY_CHARACTERS} characters.
 */
export function productSearchQuery(product: Product, question: string,
  searchTerms?: readonly string[]): string {
  // A planner-chosen list knows what a source page prints; derived keywords fall
  // back to the question's own wording, which carries filler no page contains.
  if (searchTerms !== undefined && searchTerms.length > 0) {
    return capSearchQuery(searchTerms.join(' '), PRODUCT_SEARCH_QUERY_CHARACTERS)
  }
  const name = product.name.replace(/\s*[（(][^）)]*[）)]/gu, ' ').trim()
  const lowered = name.toLowerCase()
  const terms = [...productQuestionTerms(question)]
    .map((term, index) => ({ term, index, score: searchTermScore(term) }))
    .filter(candidate => !lowered.includes(candidate.term))
    .sort((left, right) => right.score - left.score || right.term.length - left.term.length
      || left.index - right.index)
    .slice(0, PRODUCT_SEARCH_QUERY_TERMS)
    .sort((left, right) => left.index - right.index)
    .map(candidate => candidate.term)
  return capSearchQuery([name, ...terms].join(' '), PRODUCT_SEARCH_QUERY_CHARACTERS)
}

function searchTermScore(term: string): number {
  const ascii = /^[a-z0-9]+$/u.test(term) ? 3 : 0
  const digit = /\d/u.test(term) ? 2 : 0
  const length = term.length >= 3 ? 1 : 0
  return ascii + digit + length
}

function capSearchQuery(query: string, maximum: number): string {
  const text = query.trim()
  if (text.length <= maximum) return text
  const boundary = text.lastIndexOf(' ', maximum)
  return (boundary > 0 ? text.slice(0, boundary) : text.slice(0, maximum)).trim()
}

/**
 * Run the approved search intents and allocate reading slots after screening all discovery channels.
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
  const limit = maxResultsPerQuery
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
  let candidates = new Map(input.existing?.candidates.items.map(page => [candidateKey(page.url), page]))
  const failures: ProductFailure[] = [...input.existing?.candidates.failures ?? []]
  const searches: ProductSearchAttempt[] = [...input.existing?.searches ?? []]
  const pool = new ProductCandidatePool(product, plan, adapters.now)
  const batches: { search: { recordedCount: number; truncated: boolean }; keys: Set<string> }[] = []
  const official = product.officialUrl === undefined ? undefined : new URL(product.officialUrl)
  const startedAt = Date.parse(adapters.now())
  const maximumElapsedMinutes = plan.limits?.maximumElapsedMinutes
  if (maximumElapsedMinutes !== undefined && (!Number.isFinite(maximumElapsedMinutes) || maximumElapsedMinutes <= 0)) {
    throw new RangeError('maximumElapsedMinutes must be positive')
  }
  if (official !== undefined && official.protocol !== 'https:' && official.protocol !== 'http:') {
    throw new RangeError('Product officialUrl must be HTTP(S)')
  }
  const candidateLimit = maximum ?? Number.POSITIVE_INFINITY
  /** Plans that carry confirmed focus directions search every site, not a reviewed host list. */
  const focusDriven = plan.focus !== undefined
  function recordGap(page: CandidatePage, questionId: ProductQuestionId): 'recorded' | 'ignored' | 'limit' {
    const key = candidateKey(page.url)
    const prior = candidates.get(key)
    if (prior && (prior.screening.status === 'selected' || page.screening.status !== 'selected')) return 'ignored'
    if (!prior && candidates.size >= candidateLimit) {
      if (page.screening.status !== 'selected') return 'limit'
      const replaced = [...candidates].findLast(([, entry]) => entry.screening.status !== 'selected')
      if (!replaced) return 'limit'
      candidates.delete(replaced[0])
    }
    candidates.set(key, {
      ...page,
      ...(prior && {
        candidatePageId: prior.candidatePageId, url: prior.url, discoveredAt: prior.discoveredAt, title: page.title ?? prior.title,
      }),
      questionIds: [...new Set([...(prior?.questionIds ?? []), questionId])],
    })
    return prior ? 'ignored' : 'recorded'
  }
  if (gap === undefined && !signal?.aborted) {
    // A concrete official page is an explicit reading lead, not only a host identity.
    const seeds = [
      ...official !== undefined && official.pathname !== '/' && product.officialUrl !== undefined
        ? [{ url: product.officialUrl }] : [],
      ...input.initialSources ?? [],
    ]
    seeds.forEach((seed, rank) => pool.observe(seed, rank, 'web'))
  }
  // Skip unrelated entries when a provider reads a bounded feed. Retained links still compete in the common pool.
  const acceptFeedLink = (link: OfficialLink): boolean => pool.matchesFeed(link)
  if (gap === undefined && !signal?.aborted && adapters.officialFeed !== undefined
    && product.officialUrl !== undefined) {
    try {
      const feed = await adapters.officialFeed(product.officialUrl, acceptFeedLink, signal)
      feed.links.filter(acceptFeedLink).forEach((link, rank) => pool.observe(link, rank, 'official-feed'))
    } catch (error: unknown) {
      failures.push(productFailure('discovery', errorCategory(error), errorMessage(error), adapters.now()))
    }
  }
  // A news feed ranks general stories above the product, so the pipe filters before it truncates.
  if (gap === undefined && !signal?.aborted && adapters.newsFeed !== undefined) {
    try {
      const links = await adapters.newsFeed(product.name, acceptFeedLink, signal)
      links.filter(acceptFeedLink).forEach((link, rank) => pool.observe(link, rank, 'news-feed'))
    } catch (error: unknown) {
      failures.push(productFailure('discovery', errorCategory(error), errorMessage(error), adapters.now()))
    }
  }
  const queryGroups = new Map<string, { query: string; question: ProductPlan['questions'][number]; ids: Set<ProductQuestionId> }>()
  for (const question of plan.questions.filter(item => gap === undefined || gap.includes(item.questionId))) {
    const fallback = productSearchQuery(product, question.text, question.searchTerms)
    for (const query of gap === undefined && question.searchQueries?.length ? question.searchQueries : [fallback]) {
      const key = gap === undefined && question.searchQueries?.length ? `query:${queryKey(query)}` : `question:${question.questionId}`
      const group = queryGroups.get(key) ?? { query, question, ids: new Set<ProductQuestionId>() }
      group.ids.add(question.questionId)
      queryGroups.set(key, group)
    }
  }
  for (const { question, query: firstPassQuery, ids } of queryGroups.values()) {
    const primaryId = input.corroborationFor?.get(question.questionId)
    const retained = [...candidates.values()]
    const primary = primaryId === undefined ? undefined : retained.find(page => page.candidatePageId === primaryId)
    const primaryHost = primary === undefined ? undefined : parseCandidateUrl(primary.url)?.hostname
    // A focus plan searches the open web; only a legacy plan searches inside its reviewed hosts.
    const domains = focusDriven ? []
      : primaryId === undefined ? [
        ...official === undefined ? [] : [official.hostname],
        ...plan.sourcePublishers?.map(item => item.domain) ?? [],
      ]
        : primary === undefined ? [] : productCorroborationDomains(product, plan, primary)
    const domain = gap === undefined ? undefined : gapSearchDomain(domains,
      retained.filter(page => !input.unavailablePages?.has(page.candidatePageId)), triedDomains)
    if (gap !== undefined && domain === undefined && !focusDriven) continue
    if (primaryId !== undefined && primary === undefined) continue
    const reason = primaryId === undefined ? 'evidence_gap' : 'corroboration_gap'
    const terms = domain === undefined ? [] : [...productQuestionTerms(question.text)]
    const query = domain === undefined ? firstPassQuery
      : [product.name, terms.join(' ') || question.text, plan.sourceCriteria?.productVersion,
        plan.sourceCriteria?.region, `site:${domain}`].filter(Boolean).join(' ').trim()
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
      if (gap === undefined) {
        const keys = new Set(result.sources.map((source, rank) => pool.observe(source, rank, searchChannel(source), ids)))
        batches.push({ search, keys })
      } else {
        const pages = result.sources.map(source => pool.screen(source, ids, searchChannel(source)).page)
        for (const page of pages.toSorted((a, b) => Number(b.screening.status === 'selected') - Number(a.screening.status === 'selected'))) {
          const host = parseCandidateUrl(page.url)?.hostname
          if (domain !== undefined && !withinDomain(host, domain)) continue
          if (focusDriven && primaryHost !== undefined && !distinctHosts(primaryHost, host)) continue
          const outcome = recordGap(page, question.questionId)
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
  if (gap === undefined) {
    candidates = pool.allocate(candidateLimit)
    const counted = new Set<string>()
    for (const { search, keys } of batches) for (const key of keys) {
      if (!candidates.has(key)) search.truncated = true
      else if (!counted.has(key)) { search.recordedCount++; counted.add(key) }
    }
  }
  const pages = [...candidates.values()]
  return { candidates: createProductBatchResult(gap === undefined ? pages : pages.map(screenNavigation(pages)), failures), searches,
    cancelled: input.existing?.cancelled || signal?.aborted || false }
}

/**
 * Decide whether a follow-up can add an eligible page within the candidate limit.
 * @param candidates - Retained discovery results. A follow-up may replace unselected candidates.
 * @param maximum - Approved candidate-page limit.
 * @returns Whether there is room for one more selected page.
 */
export function hasProductCandidateCapacity(candidates: readonly CandidatePage[], maximum: number): boolean {
  return candidates.filter(page => page.screening.status !== 'excluded').length < maximum
}

/**
 * Find eligible search domains outside the key source's approved publisher and site.
 * Legacy plans only: a focus plan corroborates across any other site instead.
 * @param product Product identity and official website.
 * @param plan Approved plan defining eligible external publisher domains.
 * @param primary Candidate page supplying the key statement.
 * @returns Approved search domains whose publisher and site differ from the key source.
 */
export function productCorroborationDomains(product: Product, plan: ProductPlan, primary: CandidatePage): readonly string[] {
  const host = parseCandidateUrl(primary.url)?.hostname
  if (host === undefined || primary.publisher === undefined) return []
  const publisher = primary.publisher.toLocaleLowerCase()
  const approved = [
    ...product.officialUrl === undefined ? [] : [{ name: product.developer, domain: new URL(product.officialUrl).hostname }],
    ...plan.sourcePublishers ?? [],
  ]
  return approved.filter(({ name, domain }) => name.toLocaleLowerCase() !== publisher
    && !withinDomain(host, domain) && !withinDomain(domain, host)).map(({ domain }) => domain)
}

/** Prefer an approved host with the fewest selected pages, breaking ties in favor of untried hosts. */
function gapSearchDomain(domains: readonly string[], candidates: readonly CandidatePage[],
  tried: ReadonlySet<string>): string | undefined {
  let best: string | undefined
  let fewest = Number.POSITIVE_INFINITY
  for (const domain of domains) {
    const count = candidates.filter((page) => {
      const host = parseCandidateUrl(page.url)?.hostname
      return page.screening.status !== 'excluded' && withinDomain(host, domain)
    }).length
    if (count < fewest || count === fewest && best !== undefined && tried.has(best) && !tried.has(domain)) {
      best = domain
      fewest = count
    }
  }
  return best
}

/** Engine that returned one search source, when the provider attributes it; planning links carry none. */
function searchChannel(source: ProductSearchSource): string {
  return source.engine ? `web:${source.engine}` : 'web'
}

/** Two hosts are distinct sites when neither names the other as a parent domain. */
function distinctHosts(left: string | undefined, right: string | undefined): boolean {
  if (left === undefined || right === undefined) return false
  return left !== right && !left.endsWith(`.${right}`) && !right.endsWith(`.${left}`)
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
