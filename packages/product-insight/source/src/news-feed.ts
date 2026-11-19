/** Read one keyless structured news feed instead of scraping a search page. */
import { parseFeedItems, type OfficialLink } from './official-feed.ts'

/** Bing News RSS endpoint. The HTML endpoint returns unrelated pages here; this one does not. */
export const BING_NEWS_RSS = 'https://www.bing.com/news/search'
/** Market whose feed returned relevant items; the `zh-CN` market returned a single promotion link. */
export const BING_NEWS_MARKET = 'en-US'

/**
 * Build the feed URL for one product query.
 * @param query - Product query, already bounded by the caller.
 * @param market - Market tag such as `en-US`; it also selects the language tag.
 * @returns Absolute feed URL with the RSS format parameters set.
 */
export function newsFeedUrl(query: string, market: string = BING_NEWS_MARKET): string {
  const url = new URL(BING_NEWS_RSS)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'rss')
  url.searchParams.set('setmkt', market)
  url.searchParams.set('setlang', market.split('-')[0] ?? 'en')
  return url.href
}

/** Transport and bound for one feed read. */
export interface NewsFeedOptions {
  /** Retained link bound, applied after relevance filtering. */
  readonly maximumLinks: number
  /** Reads one URL, returning `undefined` when the response is not a document. */
  readonly read: (url: string, signal?: AbortSignal) => Promise<string | undefined>
}

/** Links retained from one feed read, plus the URL that was read. */
export interface NewsFeedResult {
  readonly links: readonly OfficialLink[]
  readonly attempted: readonly string[]
}

/**
 * Read the news feed and keep the links the caller accepts.
 *
 * Filtering happens before the bound applies: a popular feed ranks general news
 * above the product, so truncating first discards the wanted items.
 * @param query - Product query sent to the feed.
 * @param accept - Whether one item belongs to this investigation.
 * @param options - Transport, retained link bound, and cancellation.
 * @param signal - Optional cancellation propagated to the transport.
 * @returns Accepted items in feed order, with their source URL.
 */
export async function discoverNewsLinks(query: string, accept: (link: OfficialLink) => boolean,
  options: NewsFeedOptions, signal?: AbortSignal): Promise<NewsFeedResult> {
  const trimmed = query.trim()
  if (trimmed === '') return { links: [], attempted: [] }
  if (!Number.isSafeInteger(options.maximumLinks) || options.maximumLinks < 1) {
    throw new RangeError('maximumLinks must be a positive integer')
  }
  signal?.throwIfAborted()
  const url = newsFeedUrl(trimmed)
  const content = await options.read(url, signal)
  if (content === undefined) throw new Error('News feed returned no document.')
  const links: OfficialLink[] = []
  const seen = new Set<string>()
  for (const link of parseFeedItems(content, url)) {
    if (seen.has(link.url) || !accept(link)) continue
    seen.add(link.url)
    links.push(link)
    if (links.length >= options.maximumLinks) break
  }
  return { links, attempted: [url] }
}
