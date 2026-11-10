/** Direct, bounded public search aggregation; snippets remain discovery material. */
import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import { WebError, type WebFetchResult, type WebSearchResult, type WebSearchSource } from '@deepseek-ai/dsh-web'
import { parseDuckDuckGoResults } from './free-search.ts'

type Node = DefaultTreeAdapterTypes.Node
/** Supported anonymous HTML search providers. */
export type SearchEngine = 'duckduckgo' | 'bing' | 'yahoo'
const endpoints = { duckduckgo: 'https://html.duckduckgo.com/html/', bing: 'https://www.bing.com/search', yahoo: 'https://uk.search.yahoo.com/search' }
const attr = (node: Node, name: string): string => 'attrs' in node ? node.attrs.find(item => item.name === name)?.value ?? '' : ''
const children = (node: Node): Node[] => 'childNodes' in node ? node.childNodes : []
const all = (node: Node): Node[] => [node, ...children(node).flatMap(all)]
const text = (node: Node): string => ('value' in node ? node.value : children(node).map(text).join(' ')).replace(/\s+/gu, ' ').trim()
const hasClass = (node: Node, name: string): boolean => attr(node, 'class').split(/\s/u).includes(name)
const tag = (node: Node, name: string): boolean => 'tagName' in node && node.tagName === name

export function targetUrl(href: string, engine: SearchEngine): string | undefined {
  let url: URL
  try {
    url = new URL(href, endpoints[engine])
    if (engine === 'duckduckgo' && /(^|\.)duckduckgo\.com$/u.test(url.hostname)) {
      const target = url.searchParams.get('uddg')
      if (target) url = new URL(target)
    }
    if (engine === 'bing' && /(^|\.)bing\.com$/u.test(url.hostname) && url.pathname === '/ck/a') {
      const encoded = url.searchParams.get('u')
      if (!encoded?.startsWith('a1')) return
      url = new URL(Buffer.from(encoded.slice(2), 'base64url').toString('utf8'))
    }
    if (engine === 'yahoo' && /(^|\.)yahoo\.com$/u.test(url.hostname)) {
      const encoded = /\/RU=([^/]+)/u.exec(url.pathname)?.[1]
      if (encoded) url = new URL(decodeURIComponent(encoded))
    }
  } catch { return undefined }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || /(^|\.)(bing|yahoo|duckduckgo)\.com$/u.test(url.hostname)) return
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) if (/^utm_|^(gclid|fbclid|msclkid)$/u.test(key)) url.searchParams.delete(key)
  return url.href
}

/**
 * Parse organic result cards, rejecting challenges and unknown layouts.
 * @param engine - Source owning the result page.
 * @param fetched - Size-bounded public HTTP response.
 * @param maximum - Result cap per source.
 * @returns Normalized discovery links; never verified evidence.
 */
export function parseSearchResults(engine: SearchEngine, fetched: WebFetchResult, maximum: number): WebSearchResult {
  if (engine === 'duckduckgo') return parseDuckDuckGoResults(fetched, maximum)
  if (fetched.body.kind !== 'html' || fetched.truncated) {
    throw new WebError('搜索来源未返回完整网页。', 'WEB_PROVIDER_FAILED')
  }
  const html = fetched.body.content
  if (/captcha|verify you are human|challenge-form|unusual traffic/iu.test(html)) throw new WebError('搜索来源要求人工验证。', 'WEB_PROVIDER_CHALLENGE')
  const nodes = all(parse(html))
  const cards = nodes.filter(node => hasClass(node, engine === 'bing' ? 'b_algo' : 'algo-sr'))
  const sources = new Map<string, WebSearchSource>()
  for (const card of cards) {
    const inside = all(card)
    const heading = inside.find(node => tag(node, engine === 'bing' ? 'h2' : 'h3'))
    if (!heading) continue
    const link = all(heading).find(node => tag(node, 'a'))
      ?? ('parentNode' in heading && heading.parentNode && tag(heading.parentNode, 'a') ? heading.parentNode : undefined)
    if (!link) continue
    const url = targetUrl(attr(link, 'href'), engine)
    const title = attr(link, 'aria-label') || text(heading)
    if (!url || !title) continue
    const snippet = engine === 'bing' ? inside.find(node => tag(node, 'p')) : inside.find(node => hasClass(node, 'compText'))
    sources.set(url, { url, title, ...snippet ? { snippet: text(snippet) } : {} })
  }
  if (!sources.size) {
    if (!/class=["'][^"']*(?:b_no|no-results)|We did not find results|No results found/iu.test(html)) {
      if (fetched.statusCode === 429) throw new WebError('搜索来源限流。', 'WEB_RATE_LIMITED')
      throw new WebError('搜索页面格式未识别。', 'WEB_PROVIDER_LAYOUT_CHANGED')
    }
  }
  return { sources: [...sources.values()].slice(0, maximum), truncated: sources.size > maximum }
}

/**
 * Search selected engines concurrently, retaining healthy sources if another fails.
 * @param query - One approved query, unchanged across sources.
 * @param maximum - Combined result cap.
 * @param engines - Unique configured sources.
 * @param fetchPage - Existing guarded HTTP transport with timeout and size limits.
 * @param signal - Shared cancellation signal.
 * @returns Interleaved, deduplicated results and source outcome diagnostics.
 */
export async function searchMultiple(query: string, maximum: number, engines: SearchEngine[],
  fetchPage: (url: string, signal?: AbortSignal) => Promise<WebFetchResult>, signal?: AbortSignal,
  recover?: (engine: SearchEngine, page: WebFetchResult) => Promise<WebSearchResult>): Promise<WebSearchResult> {
  signal?.throwIfAborted()
  const outcomes = await Promise.allSettled(engines.map(async (engine) => {
    const url = new URL(endpoints[engine])
    url.searchParams.set(engine === 'yahoo' ? 'p' : 'q', query)
    if (engine === 'yahoo') url.searchParams.set('iscqry', '')
    const page = await fetchPage(url.href, signal)
    try { return parseSearchResults(engine, page, maximum) } catch (error) {
      if (!(error instanceof WebError) || error.code !== 'WEB_PROVIDER_LAYOUT_CHANGED' || !recover) throw error
      return recover(engine, page)
    }
  }))
  signal?.throwIfAborted()
  const details = outcomes.map((outcome, i) => outcome.status === 'fulfilled'
    ? `${engines[i]}: ${outcome.value.sources.length} 条${outcome.value.truncated ? '（已截断）' : ''}`
    : `${engines[i]}: ${outcome.reason instanceof WebError ? outcome.reason.code : 'WEB_PROVIDER_FAILED'} (${outcome.reason instanceof Error ? outcome.reason.message.slice(0, 200) : 'Unknown failure'})`)
  const successes = outcomes.flatMap(outcome => outcome.status === 'fulfilled' ? [outcome.value] : [])
  if (!successes.length) throw new WebError(`搜索来源均失败：${details.join('；')}`, 'WEB_PROVIDER_FAILED')
  const sources = new Map<string, WebSearchSource>()
  const count = Math.max(0, ...successes.map(result => result.sources.length))
  for (let rank = 0; rank < count; rank++) for (const result of successes) {
    const source = result.sources[rank]
    if (!source) continue
    const url = targetUrl(source.url, 'duckduckgo')
    if (url && !sources.has(url)) sources.set(url, { ...source, url })
  }
  return { sources: [...sources.values()].slice(0, maximum),
    truncated: sources.size > maximum || successes.length < engines.length || successes.some(result => result.truncated),
    content: `搜索来源状态（仅用于发现网页，不是正文证据）：${details.join('；')}。合并去重 ${sources.size} 条，保留 ${Math.min(maximum, sources.size)} 条。` }
}
