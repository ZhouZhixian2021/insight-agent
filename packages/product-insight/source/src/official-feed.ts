/** Official site feeds and sitemaps, read without a third-party search engine. */
import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'

type Node = DefaultTreeAdapterTypes.Node

/** One link published by the product's own site, before any relevance decision. */
export interface OfficialLink {
  /** Absolute HTTP(S) URL taken from the feed, sitemap, or page link element. */
  readonly url: string
  /** Item title when the source provides one. */
  readonly title?: string
  /** Source publication timestamp in its original textual form. */
  readonly publishedAt?: string
}

/** Bounded inputs the caller supplies so discovery cannot run unbounded. */
export interface OfficialFeedOptions {
  /** Performs one bounded public HTTP request, matching the discovery transport. */
  readonly fetch: (url: string, signal?: AbortSignal) => Promise<WebFetchResult>
  /** Maximum links returned, applied after deduplication and sorting. */
  readonly maximumLinks: number
  /** Maximum requests spent on the official site, counting the page and sitemap probes. */
  readonly maximumProbes: number
  /**
   * Keeps only links about the product. A source whose entries all fail this test falls
   * through to the next one, so a current-news feed cannot hide an older product post that
   * only the sitemap still lists.
   */
  readonly accept?: (link: OfficialLink) => boolean
  /** Cancels remaining probes once the caller no longer needs the result. */
  readonly signal?: AbortSignal
}

/** Discovered links plus per-source diagnostics, so an empty result stays explainable. */
export interface OfficialFeedResult {
  readonly links: readonly OfficialLink[]
  readonly notes: readonly string[]
}

/** Feed locations products commonly publish; probing stops at the first source with items. */
export const OFFICIAL_FEED_PATHS = ['/newsroom/rss-feed.rss', '/feed', '/rss.xml', '/blog/feed'] as const

const attr = (node: Node, name: string): string => 'attrs' in node ? node.attrs.find(item => item.name === name)?.value ?? '' : ''
const children = (node: Node): Node[] => 'childNodes' in node ? node.childNodes : []
const all = (node: Node): Node[] => [node, ...children(node).flatMap(all)]
const tag = (node: Node, name: string): boolean => 'tagName' in node && node.tagName === name
const text = (node: Node): string => ('value' in node ? node.value : children(node).map(text).join(' ')).replace(/\s+/gu, ' ').trim()
const find = (node: Node, name: string): Node | undefined => all(node).find(child => tag(child, name))

function escapeXml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
}

/**
 * Normalize XML-specific syntax into content the HTML parser reads correctly.
 *
 * HTML parsing differs from XML in two ways that silently drop feed data. `<link>` is a
 * void element, so RSS item URLs written as element text are discarded and those elements
 * are renamed for parsing. Self-closing unknown elements (for example Atom `<category/>`)
 * do not close under HTML rules and swallow every following sibling, so they are written
 * with explicit end tags. CDATA sections become parser comments, so their payload is
 * unescaped into text first.
 *
 * @param content - Raw feed bytes decoded as text, possibly carrying a XML declaration or CDATA sections.
 * @returns Markup whose link text, sibling structure, and CDATA payloads survive HTML parsing.
 */
function readableXml(content: string): string {
  return content
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, (_match, inner: string) => escapeXml(inner))
    .replace(/<([a-z][\w:.-]*)((?:\s[^<>]*?)?)\/>/giu, '<$1$2></$1>')
    .replace(/<link>([^<]*)<\/link>/giu, '<rsslink>$1</rsslink>')
}

/**
 * Read one bounded response body as text regardless of whether the server labelled it HTML.
 * @param fetched - Response returned by the discovery transport.
 * @returns Decoded content, or `undefined` when the body is not textual or was truncated.
 */
function bodyText(fetched: WebFetchResult): string | undefined {
  if (fetched.truncated) return undefined
  return fetched.body.kind === 'pdf' ? undefined : fetched.body.content
}

/**
 * Resolve one link reference against its source and reject values that cannot be fetched as public pages.
 * @param href - Raw attribute or text value from the feed or sitemap.
 * @param base - URL used to resolve relative references.
 * @returns Absolute HTTP(S) URL without fragments or credentials, or `undefined`.
 */
function publicLink(href: string, base: string): string | undefined {
  if (!href) return undefined
  let url: URL
  try { url = new URL(href, base) } catch { return undefined }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined
  url.hash = ''
  return url.href
}

/**
 * Read `<item>` entries from RSS or `<entry>` entries from Atom.
 * @param content - Decoded feed body.
 * @param base - Feed URL used to resolve relative links.
 * @returns Item links in document order.
 */
export function parseFeedItems(content: string, base: string): OfficialLink[] {
  const nodes = all(parse(readableXml(content)))
  const items: OfficialLink[] = []
  for (const node of nodes) {
    if (!tag(node, 'item') && !tag(node, 'entry')) continue
    const anchor = children(node).find(child => tag(child, 'link') && attr(child, 'href') !== ''
      && !/^(?:self|enclosure)$/u.test(attr(child, 'rel')))
    const linkText = find(node, 'rsslink')
    const guid = find(node, 'guid')
    const href = anchor ? attr(anchor, 'href') : linkText ? text(linkText) : guid ? text(guid) : ''
    const url = publicLink(href, base)
    if (!url) continue
    const title = find(node, 'title')
    const published = ['pubdate', 'published', 'updated', 'dc:date']
      .map(name => find(node, name)).find(entry => entry !== undefined)
    items.push({ url,
      ...(title ? { title: text(title) } : {}),
      ...(published ? { publishedAt: text(published) } : {}) })
  }
  return items
}

/**
 * Read `<loc>` entries from a sitemap or sitemap index.
 * @param content - Decoded sitemap body.
 * @param base - Sitemap URL used to resolve relative entries.
 * @returns Location links in document order, including child sitemap URLs.
 */
export function parseSitemapLocations(content: string, base: string): string[] {
  const nodes = all(parse(readableXml(content)))
  const links: string[] = []
  for (const node of nodes) {
    if (!tag(node, 'loc')) continue
    const url = publicLink(text(node), base)
    if (url) links.push(url)
  }
  return links
}

/**
 * Collect feed URLs advertised by the page's `<link rel="alternate">` elements.
 * @param content - Decoded HTML document.
 * @param base - Page URL used to resolve relative references.
 * @returns Ordered, deduplicated candidate feed URLs.
 */
export function parseAdvertisedFeeds(content: string, base: string): string[] {
  const feeds: string[] = []
  for (const node of all(parse(readableXml(content)))) {
    if (!tag(node, 'link')) continue
    if (!/(^|\s)alternate(\s|$)/u.test(attr(node, 'rel'))) continue
    if (!/rss|atom/iu.test(attr(node, 'type'))) continue
    const url = publicLink(attr(node, 'href'), base)
    if (url && !feeds.includes(url)) feeds.push(url)
  }
  return feeds
}

/** Sort by publication time when known, deduplicate, and cap discovered links. */
function settle(links: OfficialLink[], maximum: number): OfficialLink[] {
  const unique = new Map<string, OfficialLink>()
  for (const link of links) if (!unique.has(link.url)) unique.set(link.url, link)
  const stamp = (link: OfficialLink): number => {
    const parsed = Date.parse(link.publishedAt ?? '')
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return [...unique.values()].sort((left, right) => stamp(right) - stamp(left)).slice(0, maximum)
}

/**
 * Discover links an official product site publishes, preferring its feeds over its sitemap.
 *
 * The page and every probe share one request budget, so a site without feeds cannot
 * convert this step into unbounded crawling. Failures stay in `notes`; they never throw,
 * because discovery continues with the other sources.
 *
 * @param officialUrl - Product site URL, normally the plan's official product page.
 * @param options - Transport, per-site request budget, and result cap.
 * @returns Discovered links in publication order plus per-source diagnostics.
 */
export async function discoverOfficialLinks(officialUrl: string, options: OfficialFeedOptions): Promise<OfficialFeedResult> {
  const notes: string[] = []
  let site: URL
  try { site = new URL(officialUrl) } catch { return { links: [], notes: ['官方站点地址无效'] } }
  if (!['http:', 'https:'].includes(site.protocol)) return { links: [], notes: ['官方站点地址必须是 HTTP(S)'] }
  let budget = options.maximumProbes
  const read = async (url: string): Promise<string | undefined> => {
    if (budget <= 0) return undefined
    budget -= 1
    try {
      const fetched = await options.fetch(url, options.signal)
      if (fetched.statusCode < 200 || fetched.statusCode >= 300) {
        notes.push(`${url}：HTTP ${fetched.statusCode}`)
        return undefined
      }
      return bodyText(fetched)
    } catch (error: unknown) {
      notes.push(`${url}：${error instanceof Error ? error.message.slice(0, 120) : '请求失败'}`)
      return undefined
    }
  }

  const page = await read(site.href)
  const advertised = page ? parseAdvertisedFeeds(page, site.href) : []
  const candidates = [...advertised]
  for (const path of OFFICIAL_FEED_PATHS) {
    const url = new URL(path, site.origin).href
    if (!candidates.includes(url)) candidates.push(url)
  }
  for (const candidate of candidates) {
    if (budget <= 0) break
    const content = await read(candidate)
    if (!content) continue
    const items = parseFeedItems(content, candidate)
    if (!items.length) {
      notes.push(`订阅源 ${candidate}：无法解析出条目`)
      continue
    }
    const accepted = items.filter(link => options.accept?.(link) ?? true)
    if (!accepted.length) {
      notes.push(`订阅源 ${candidate}：${items.length} 条，0 条命中产品`)
      continue
    }
    const links = settle(accepted, options.maximumLinks)
    notes.push(`订阅源 ${candidate}：${items.length} 条，命中 ${links.length} 条`)
    return { links, notes }
  }

  for (const path of ['/sitemap.xml', '/sitemap_index.xml']) {
    if (budget <= 0) break
    const location = new URL(path, site.origin).href
    const content = await read(location)
    if (!content) continue
    const entries = parseSitemapLocations(content, location)
    if (!entries.length) continue
    const isIndex = /<sitemapindex/iu.test(content)
    const pages = isIndex ? (await childSitemaps(entries, read)) : entries
    if (!pages.length) continue
    const accepted = pages.filter(url => options.accept?.({ url }) ?? true)
    if (!accepted.length) {
      notes.push(`站点地图 ${location}：${pages.length} 条，0 条命中产品`)
      continue
    }
    notes.push(`站点地图 ${location}：${pages.length} 条，命中 ${accepted.length} 条`)
    return { links: settle(accepted.map(url => ({ url })), options.maximumLinks), notes }
  }
  notes.push('官方站点未提供订阅源或站点地图')
  return { links: [], notes }
}

/** Read child sitemaps of an index within the remaining request budget. */
async function childSitemaps(entries: string[], read: (url: string) => Promise<string | undefined>): Promise<string[]> {
  const pages: string[] = []
  for (const entry of entries) {
    const content = await read(entry)
    if (!content) continue
    pages.push(...parseSitemapLocations(content, entry).filter(url => !/\.xml(?:$|\?)/iu.test(url)))
  }
  return pages
}
