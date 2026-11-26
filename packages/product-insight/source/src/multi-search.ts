/** Direct, bounded public search aggregation; snippets remain discovery material. */
import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import { WebError, type WebFetchResult, type WebSearchResult, type WebSearchSource } from '@deepseek-ai/dsh-web'
import { parseDuckDuckGoResults } from './free-search.ts'

type Node = DefaultTreeAdapterTypes.Node
/** Supported anonymous HTML search providers. */
export type SearchEngine = 'duckduckgo' | 'bing' | 'yahoo'
/** Discovery link plus the anonymous engine that returned it, so an empty page stays diagnosable. */
export interface AttributedSearchSource extends WebSearchSource { readonly engine: SearchEngine }
const endpoints = { duckduckgo: 'https://html.duckduckgo.com/html/', bing: 'https://www.bing.com/search', yahoo: 'https://uk.search.yahoo.com/search' }
const attr = (node: Node, name: string): string => 'attrs' in node ? node.attrs.find(item => item.name === name)?.value ?? '' : ''
const children = (node: Node): Node[] => 'childNodes' in node ? node.childNodes : []
const all = (node: Node): Node[] => [node, ...children(node).flatMap(all)]
const text = (node: Node): string => ('value' in node ? node.value : children(node).map(text).join(' ')).replace(/\s+/gu, ' ').trim()
const hasClass = (node: Node, name: string): boolean => attr(node, 'class').split(/\s/u).includes(name)
const tag = (node: Node, name: string): boolean => 'tagName' in node && node.tagName === name
/** Promoted containers; a Bing ad keeps its result markup, so class names alone do not separate it. */
const AD_SLOTS = ['b_ad', 'b_adBlock', 'b_ads', 'b_ans'] as const
const isAdSlot = (node: Node): boolean => AD_SLOTS.some(name => hasClass(node, name))
/** Whether a result card sits inside a promoted container, at any depth. */
const insideAdSlot = (node: Node): boolean => {
  let current: Node = node
  for (;;) {
    if (!('parentNode' in current)) return false
    const parent: Node | null = current.parentNode
    if (parent === null) return false
    if (isAdSlot(parent)) return true
    current = parent
  }
}

/** Deployment limits for the engine circuit breaker. */
export interface SearchHealthOptions {
  /** Consecutive failures that take an engine out of the rotation. */
  readonly failureThreshold: number
  /** How long a tripped engine stays out before the next attempt. */
  readonly cooldownMs: number
}

/**
 * Failures per engine, so a blocked or changed engine stops costing a request
 * per question. A success clears the streak; a tripped engine is retried once
 * the cooldown ends, and the whole rotation is used again when every engine is
 * out, because a run with no source at all is worse than a slow one.
 */
export class SearchEngineHealth {
  private readonly failures = new Map<SearchEngine, number>()
  private readonly trippedAt = new Map<SearchEngine, number>()

  constructor(private readonly options: SearchHealthOptions, private readonly now: () => number = Date.now) {}

  /**
   * Whether this attempt should skip the engine.
   * @param engine - Engine about to be queried.
   * @returns True while the engine is cooling down.
   */
  skips(engine: SearchEngine): boolean {
    const at = this.trippedAt.get(engine)
    if (at === undefined) return false
    if (this.now() - at >= this.options.cooldownMs) { this.trippedAt.delete(engine); this.failures.delete(engine); return false }
    return true
  }

  /**
   * Record one attempt.
   * @param engine - Engine that was queried.
   * @param ok - Whether it answered with a usable page.
   */
  record(engine: SearchEngine, ok: boolean): void {
    if (ok) { this.failures.delete(engine); this.trippedAt.delete(engine); return }
    const failures = (this.failures.get(engine) ?? 0) + 1
    this.failures.set(engine, failures)
    if (failures >= this.options.failureThreshold && !this.trippedAt.has(engine)) this.trippedAt.set(engine, this.now())
  }
}

/**
 * Split the configured engines into those to query now and those cooling down.
 * @param engines - Unique configured sources.
 * @param health - Per-engine failure record, or undefined to query them all.
 * @returns The rotation to use and the engines it skipped.
 */
export function rotationOf(engines: readonly SearchEngine[], health: SearchEngineHealth | undefined):
{ readonly active: readonly SearchEngine[]; readonly skipped: readonly SearchEngine[] } {
  if (health === undefined) return { active: engines, skipped: [] }
  const active = engines.filter(engine => !health.skips(engine))
  const skipped = engines.filter(engine => health.skips(engine))
  return active.length > 0 ? { active, skipped } : { active: engines, skipped: [] }
}

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
  const cards = nodes.filter(node => hasClass(node, engine === 'bing' ? 'b_algo' : 'algo-sr')
    && !isAdSlot(node) && !insideAdSlot(node))
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
 * @param recover - Optional browser or model recovery for an unrecognized layout.
 * @param health - Per-engine failure record; a cooling engine is skipped this round.
 * @returns Interleaved, deduplicated results and source outcome diagnostics.
 */
export async function searchMultiple(query: string, maximum: number, engines: SearchEngine[],
  fetchPage: (url: string, signal?: AbortSignal) => Promise<WebFetchResult>, signal?: AbortSignal,
  recover?: (engine: SearchEngine, page: WebFetchResult) => Promise<WebSearchResult>,
  health?: SearchEngineHealth): Promise<WebSearchResult> {
  signal?.throwIfAborted()
  const { active, skipped } = rotationOf(engines, health)
  const outcomes = await Promise.allSettled(active.map(async (engine) => {
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
  outcomes.forEach((outcome, index) => {
    const engine = active[index]
    if (engine !== undefined) health?.record(engine, outcome.status === 'fulfilled')
  })
  const details = outcomes.map((outcome, i) => outcome.status === 'fulfilled'
    ? `${active[i]}: ${outcome.value.sources.length} 条${outcome.value.truncated ? '（已截断）' : ''}`
    : `${active[i]}: ${outcome.reason instanceof WebError ? outcome.reason.code : 'WEB_PROVIDER_FAILED'} (${outcome.reason instanceof Error ? outcome.reason.message.slice(0, 200) : 'Unknown failure'})`)
  if (skipped.length > 0) details.push(`冷却中跳过：${skipped.join('、')}`)
  const successes = outcomes.flatMap((outcome, index) => outcome.status === 'fulfilled' && active[index] !== undefined
    ? [{ engine: active[index], result: outcome.value }] : [])
  if (!successes.length) throw new WebError(`搜索来源均失败：${details.join('；')}`, 'WEB_PROVIDER_FAILED')
  const sources = new Map<string, AttributedSearchSource>()
  const count = Math.max(0, ...successes.map(({ result }) => result.sources.length))
  for (let rank = 0; rank < count; rank++) for (const { engine, result } of successes) {
    const source = result.sources[rank]
    if (!source) continue
    const url = targetUrl(source.url, engine)
    if (!url) continue
    const previous = sources.get(url)
    if (!previous) { sources.set(url, { ...source, url, engine }); continue }
    const title = previous.title || source.title
    const details = new Set([previous.snippet, source.snippet, source.title !== title ? source.title : undefined])
    const snippet = [...details].filter(Boolean).join('\n')
    sources.set(url, { ...previous, ...(title && { title }), ...(snippet && { snippet }) })
  }
  return { sources: [...sources.values()].slice(0, maximum),
    truncated: sources.size > maximum || successes.length < engines.length
      || successes.some(({ result }) => result.truncated),
    content: `搜索来源状态（仅用于发现网页，不是正文证据）：${details.join('；')}。合并去重 ${sources.size} 条，保留 ${Math.min(maximum, sources.size)} 条。` }
}
