/** Pool discovery leads from every channel before distributing the approved reading slots. */
import { createCandidatePageId, type CandidatePage, type Product, type ProductPlan,
  type ProductQuestionId } from '@deepseek-ai/dsh-product-insight-model'
import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { MINIMUM_QUESTION_TERM_HITS, questionTermHits, relevanceSignals, scoreCandidateRelevance,
  type RelevanceSignals, type RelevanceVerdict } from './relevance.ts'

interface Lead {
  readonly url: string
  readonly channel: string
  readonly titles: Set<string>
  readonly snippets: Set<string>
  readonly questionIds: Set<ProductQuestionId>
  rank: number
}

interface RankedPage {
  readonly key: string
  readonly page: CandidatePage
  readonly hits: Map<ProductQuestionId, number>
  readonly score: number
  readonly namesProduct: boolean
  readonly materialQueries: ReadonlySet<string>
  readonly rank: number
  readonly entry: boolean
}

type Decision = Pick<CandidatePage['screening'], 'status' | 'reason'>

interface MaterialIntent {
  readonly query: string
  readonly distinguishingTerms: string[][]
}

/**
 * Identify equivalent queries for execution and candidate selection.
 * @param query - One approved search.
 * @returns Case- and whitespace-normalized query text.
 */
export function queryKey(query: string): string {
  return query.trim().replace(/\s+/gu, ' ').toLowerCase()
}

/** Terms that distinguish this search from each sibling, including combinations such as GPU + Geekbench. */
function materialIntents(product: Product, queries: readonly string[] = []): MaterialIntent[] {
  const unique = new Map(queries.map(query => [queryKey(query), query]))
  if (unique.size < 2) return []
  const intents = [...unique.values()].map(query => ({ query, terms: relevanceSignals(product, query).questionTerms }))
  return intents.flatMap(({ query, terms }) => {
    const distinguishingTerms: string[][] = []
    for (const other of intents) {
      if (other.query === query) continue
      const distinct = [...terms].filter(term => !other.terms.has(term))
      if (!distinct.length) continue
      const specific = distinct.filter(term => !/^(?:reviews?|tests?|results?|reports?|评测|测评|实测|测试|结果|报告)$/u.test(term))
      distinguishingTerms.push(specific.length ? specific : distinct)
    }
    // A broader query contained in all its siblings still describes material when its own terms match together.
    if (!distinguishingTerms.length) for (const term of terms) distinguishingTerms.push([term])
    return distinguishingTerms.length ? [{ query, distinguishingTerms }] : []
  })
}

function screenLink(parsed: URL | null, titles: readonly string[], verdict: RelevanceVerdict | undefined,
  focusDriven: boolean, trusted: boolean, trustedLead: boolean): Decision {
  if (!parsed) return { status: 'excluded', reason: 'Search result URL is not a valid HTTP(S) URL.' }
  if (isNavigationPage(parsed) || titles.some(isNavigationTitle)) {
    return { status: 'excluded', reason: 'Site navigation offers no product content.' }
  }
  if (!focusDriven && !trusted) return { status: 'excluded', reason: 'Host is not an approved official or external source; not fetched.' }
  if (verdict?.relevant) return { status: 'selected', reason: verdict.reason }
  if (trusted && (!focusDriven || trustedLead)) return { status: 'selected', reason: 'Approved source lead for inspection against the page text.' }
  return { status: 'excluded', reason: verdict?.reason ?? 'No matching topic.' }
}

/** One approved discovery pass. Observation never consumes a reading slot. */
export class ProductCandidatePool {
  private readonly leads = new Map<string, Lead>()
  private readonly topics: { id: ProductQuestionId; signals: RelevanceSignals; intents: MaterialIntent[] }[]
  private readonly official: URL | undefined
  private readonly identity: RelevanceSignals

  constructor(private readonly product: Product, private readonly plan: ProductPlan, private readonly now: () => string) {
    this.official = product.officialUrl ? new URL(product.officialUrl) : undefined
    this.identity = relevanceSignals(product, '')
    this.topics = plan.questions.map(q => ({ id: q.questionId, intents: materialIntents(product, q.searchQueries),
      signals: relevanceSignals(product, [q.text, ...(q.searchQueries ?? q.searchTerms ?? [])].join(' ')) }))
  }

  /** Use the same topic signals when a bounded feed needs to skip unrelated company-wide posts. */
  matchesFeed(source: WebSearchSource): boolean {
    const url = parseCandidateUrl(candidateKey(source.url))
    if (!url || isNavigationPage(url) || (source.title && isNavigationTitle(source.title))) return false
    const candidate = { ...source, url: url.href }
    return scoreCandidateRelevance(candidate, this.identity).relevant
      || this.topics.some(({ signals }) => questionTermHits(candidate, signals).length >= MINIMUM_QUESTION_TERM_HITS)
  }

  /** Merge complementary metadata and preserve the originating search questions for a unique destination. */
  observe(source: WebSearchSource, rank: number, channel: string, questionIds: Iterable<ProductQuestionId> = []): string {
    const key = candidateKey(source.url)
    const lead = this.leads.get(key) ?? { url: parseCandidateUrl(source.url) ? key : source.url,
      titles: new Set<string>(), snippets: new Set<string>(), channel, rank, questionIds: new Set<ProductQuestionId>() }
    if (source.title) lead.titles.add(source.title)
    if (source.snippet) lead.snippets.add(source.snippet)
    for (const id of questionIds) lead.questionIds.add(id)
    lead.rank = Math.min(rank, lead.rank)
    this.leads.set(key, lead)
    return key
  }

  /** Apply the same navigation, product and topic rules to every channel, including historical handoffs. */
  screen(source: WebSearchSource, originIds: ReadonlySet<ProductQuestionId>, channel: string, rank = 0,
    titles: readonly string[] = source.title ? [source.title] : []): RankedPage {
    const key = candidateKey(source.url)
    const parsed = parseCandidateUrl(key)
    const officialPage = this.official !== undefined && withinDomain(parsed?.hostname, this.official.hostname)
    const focusDriven = this.plan.focus !== undefined
    const namedSites = focusDriven ? this.plan.additionalSites : this.plan.sourcePublishers
    const site = namedSites?.find(item => withinDomain(parsed?.hostname, item.domain))
    const identity = scoreCandidateRelevance(source, this.identity)
    const matches = this.topics.map(({ id, signals, intents }) =>
      ({ id, signals, intents, terms: new Set(questionTermHits(source, signals)) }))
    const strongest = matches.toSorted((a, b) => b.terms.size - a.terms.size)[0]
    const best = !identity.relevant && strongest ? scoreCandidateRelevance(source, strongest.signals) : identity
    const trusted = officialPage || site !== undefined
    const questionIds = matches.filter(m => originIds.has(m.id) || m.terms.size >= MINIMUM_QUESTION_TERM_HITS
      || (m.terms.size > 0 && (identity.relevant || trusted))).map(m => m.id)
    // Older excerpt consumers require an approved reading context even for a general publisher lead.
    if (!focusDriven && !questionIds.length) questionIds.push(...this.plan.questions.map(q => q.questionId))
    const sparse = !source.snippet && (!source.title || /^(specifications?|technical specifications?|技术规格)$/iu.test(source.title))
    const decision = screenLink(parsed, titles, best, focusDriven, trusted,
      sparse || matches.some(m => m.terms.size > 0))
    const timestamp = this.now()
    const publisher = officialPage ? this.product.developer : site?.name
    const page: CandidatePage = { schemaVersion: 1, candidatePageId: createCandidatePageId(), planId: this.plan.planId,
      productId: this.product.productId, url: parsed?.href ?? source.url, ...(source.title && { title: source.title }),
      sourceType: officialPage ? 'official_product_page' : 'other', discoveredAt: timestamp, questionIds,
      screening: { ...decision, screenedAt: timestamp }, ...(publisher && { publisher }), discoveryChannel: channel }
    const entry = parsed !== null && isEntryPoint(parsed)
    const materialQueries = new Set<string>()
    if (decision.status === 'selected' && identity.relevant && !entry) {
      for (const { intents, terms } of matches) for (const { query, distinguishingTerms } of intents) {
        if (distinguishingTerms.every(group => group.some(term => terms.has(term)))) materialQueries.add(query)
      }
    }
    return { key, page, rank, hits: new Map(matches.map(m => [m.id, m.terms.size])), score: best.score,
      namesProduct: identity.relevant, materialQueries, entry }
  }

  /** Rotate across questions and prefer relevant pages on material missing from the current reading list. */
  allocate(maximum: number): Map<string, CandidatePage> {
    const rows = [...this.leads.values()].map((lead) => {
      const titles = [...lead.titles]
      const title = titles[0]
      const snippet = [...lead.snippets, ...titles.slice(1)].join(' ')
      return this.screen({ url: lead.url, ...(title && { title }), ...(snippet && { snippet }) },
        lead.questionIds, lead.channel, lead.rank, titles)
    })
    const screenPage = screenNavigation(rows.map(row => row.page))
    const ranked = rows.map(row => ({ ...row, page: screenPage(row.page) }))
    const eligible = ranked.filter(row => row.page.screening.status === 'selected')
    const byRelevance = (a: RankedPage, b: RankedPage) => Number(a.entry) - Number(b.entry) || b.score - a.score || a.rank - b.rank
    const productAndTopic = (row: RankedPage, id: ProductQuestionId) => row.namesProduct && (row.hits.get(id) ?? 0) > 0
    const queues = this.topics.map(({ id, intents }) => {
      const pages = eligible.filter(row => !row.page.questionIds.length || row.page.questionIds.includes(id))
        .sort((a, b) => Number(a.entry) - Number(b.entry) || Number(productAndTopic(b, id)) - Number(productAndTopic(a, id))
          || (b.hits.get(id) ?? 0) - (a.hits.get(id) ?? 0) || byRelevance(a, b))
      const materialPages = pages.flatMap((row) => {
        const queries = intents.filter(intent => row.materialQueries.has(intent.query)).map(intent => intent.query)
        return queries.length ? [{ row, queries }] : []
      })
      return { ranked: pages.values(), materialPages }
    })
    const represented = new Set<string>()
    const retained = new Map<string, CandidatePage>()
    while (retained.size < maximum) {
      const before = retained.size
      for (const queue of queues) {
        const missing = queue.materialPages.find(({ queries }) => queries.some(query => !represented.has(query)))
        let chosen = missing?.row
        if (!chosen) {
          queue.materialPages.length = 0
          for (const row of queue.ranked) {
            if (!retained.has(row.key)) { chosen = row; break }
          }
        }
        if (chosen) {
          let page = chosen.page
          if (missing) {
            const queries = missing.queries.filter(query => !represented.has(query))
            page = { ...page, screening: { ...page.screening,
              reason: `${page.screening.reason} Reading lead for previously unrepresented material (${queries.join(' / ')}).` } }
          }
          retained.set(chosen.key, page)
          for (const query of chosen.materialQueries) represented.add(query)
        }
        if (retained.size >= maximum) break
      }
      if (retained.size === before) break
    }
    for (const row of ranked) {
      if (retained.size >= maximum) break
      if (row.page.screening.status === 'excluded') retained.set(row.key, row.page)
    }
    return retained
  }
}

/** Match the reviewed host and its subdomains on a DNS label boundary. */
export function withinDomain(host: string | undefined, domain: string): boolean {
  return host === domain || (host?.endsWith(`.${domain}`) ?? false)
}

/** Parse a public web link before handing it to the guarded transport. */
export function parseCandidateUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null
    return url
  } catch { return null }
}

/** A locale prefix alone addresses the site root of that market, not a page. */
const LOCALE_ROOT_PATH = /^\/[a-z]{2}(?:[-_][a-z]{2,4})?\/?$/iu
/** Account, cart and search-result hosts never carry product content, whatever their path. */
const ACCOUNT_HOST = /^(?:account|login|signin|cart|checkout)\./iu
/** Account, cart and search-result paths never carry product content, whatever their depth. */
const ACCOUNT_PATH = /^\/(?:account|login|signin|sign-in|cart|checkout|bag|search)(?:\/|$)/iu
/** A store or shop root lists products; a deeper path can describe one configuration. */
const STORE_ROOT_PATH = /^\/(?:store|shop)(?:\/|$)/iu

/**
 * Whether a discovered page can only lead into the site.
 * @param url - Parsed candidate address.
 * @returns Whether the page is account, cart or search navigation that carries no product evidence.
 */
function isNavigationPage(url: URL): boolean {
  return ACCOUNT_HOST.test(url.hostname) || ACCOUNT_PATH.test(url.pathname)
}

/**
 * Whether a page addresses a store or shop root rather than one product configuration.
 * @param url - Parsed candidate address.
 * @returns Whether the page lists products instead of describing one.
 */
function isStoreIndex(url: URL): boolean {
  return STORE_ROOT_PATH.test(url.pathname)
    && url.pathname.split('/').filter(segment => segment.length > 0).length <= 1
}

/**
 * Whether a page only names a site or market entry rather than a product page.
 * @param url - Parsed candidate address.
 * @returns Whether the page is a site root, a locale root, or a store index.
 */
function isEntryPoint(url: URL): boolean {
  return url.pathname === '/' || LOCALE_ROOT_PATH.test(url.pathname) || isStoreIndex(url)
}

/**
 * Exclude site entry points that only duplicate a deeper page on the same host.
 * @param candidates - Final discovery candidates in discovery order.
 * @returns A function that marks each redundant entry point as excluded.
 */
export function screenNavigation(candidates: readonly CandidatePage[]): (page: CandidatePage) => CandidatePage {
  const contentHosts = new Set(candidates
    .map(page => ({ page, url: parseCandidateUrl(page.url) }))
    .filter((entry): entry is { page: CandidatePage; url: URL } => entry.url !== null
      && entry.page.screening.status !== 'excluded' && !isNavigationPage(entry.url) && !isEntryPoint(entry.url))
    .map(entry => entry.url.hostname))
  return (page) => {
    if (page.screening.status === 'excluded') return page
    const url = parseCandidateUrl(page.url)
    if (url === null) return page
    const navigation = isNavigationPage(url)
    const redundant = !navigation && isEntryPoint(url) && contentHosts.has(url.hostname)
    if (!navigation && !redundant) return page
    return { ...page, screening: { ...page.screening, status: 'excluded',
      reason: navigation
        ? 'Search result addresses site navigation; the page carries no product evidence.'
        : 'Site entry point duplicates a deeper page on the same host; the deeper page carries the content.' } }
  }
}

/** Recognize sign-in pages even on an ordinary host and a path such as /home. */
function isNavigationTitle(title: string): boolean {
  return /^(?:sign[ -]?in|log[ -]?in|登录|登入)(?:\s*[|–—:：-]|\s*$)/iu.test(title.trim())
}

function dedupUrl(url: URL): string {
  const normalized = new URL(url)
  normalized.hash = ''
  for (const key of [...normalized.searchParams.keys()]) {
    if (/^utm_/iu.test(key) || key === 'gclid' || key === 'fbclid' || key === 'msclkid') normalized.searchParams.delete(key)
  }
  return normalized.href
}

/** Identity shared across channels. Market, version and other content-bearing parameters stay in the key. */
export function candidateKey(url: string, parsed = parseCandidateUrl(url)): string {
  if (parsed === null) return `invalid:${url}`
  if (['bing.com', 'www.bing.com'].includes(parsed.hostname) && parsed.pathname.toLowerCase() === '/news/apiclick.aspx') {
    const target = parseCandidateUrl(parsed.searchParams.get('url') ?? '')
    if (target) return dedupUrl(target)
  }
  return dedupUrl(parsed)
}
