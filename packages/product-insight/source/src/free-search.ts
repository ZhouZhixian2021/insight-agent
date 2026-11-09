/** DuckDuckGo HTML results normalized without treating snippets as product evidence. */
import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import { WebError, type WebFetchResult, type WebSearchResult, type WebSearchSource } from '@deepseek-ai/dsh-web'

type Node = DefaultTreeAdapterTypes.Node

function attribute(node: Node, name: string): string {
  return 'attrs' in node ? node.attrs.find(item => item.name === name)?.value ?? '' : ''
}

function text(node: Node): string {
  if ('value' in node) return node.value
  return 'childNodes' in node ? node.childNodes.map(text).join(' ') : ''
}

function descendants(node: Node): Node[] {
  return [node, ...('childNodes' in node ? node.childNodes.flatMap(descendants) : [])]
}

/**
 * Parse one bounded search response; challenge and unknown layouts fail instead of becoming empty results.
 * @param fetched - Complete HTML response from DuckDuckGo's HTML search endpoint.
 * @param maximum - Maximum number of unique result URLs to retain.
 * @returns Search links and snippets, with an explicit result-limit flag.
 */
export function parseDuckDuckGoResults(fetched: WebFetchResult, maximum: number): WebSearchResult {
  if (fetched.statusCode === 429) throw new WebError('免费搜索暂时限流，请稍后重试。', 'WEB_RATE_LIMITED')
  if (fetched.statusCode !== 200 || fetched.body.kind !== 'html' || fetched.truncated) {
    throw new WebError(`免费搜索未返回完整结果（HTTP ${fetched.statusCode}）。`, 'WEB_PROVIDER_FAILED')
  }
  const html = fetched.body.content
  if (/anomaly-modal|challenge-form|anomaly\.js/iu.test(html)) {
    throw new WebError('免费搜索要求验证码，本轮未绕过验证；请稍后重试或更换搜索渠道。', 'WEB_PROVIDER_CHALLENGE')
  }
  const nodes = descendants(parse(html))
  const sources = new Map<string, WebSearchSource>()
  for (const node of nodes) {
    if (!attribute(node, 'class').split(/\s/u).includes('result__a')) continue
    let url: URL
    try {
      url = new URL(attribute(node, 'href'), 'https://html.duckduckgo.com')
      const target = url.searchParams.get('uddg')
      if (target && /(^|\.)duckduckgo\.com$/u.test(url.hostname)) url = new URL(target)
    } catch { continue }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
      || /(^|\.)duckduckgo\.com$/u.test(url.hostname)) continue
    let container: Node = node
    while ('parentNode' in container && container.parentNode
      && !attribute(container, 'class').split(/\s/u).includes('result')) container = container.parentNode
    const snippet = descendants(container).find(item => attribute(item, 'class').split(/\s/u).includes('result__snippet'))
    sources.set(url.href, { url: url.href, title: text(node).replace(/\s+/gu, ' ').trim(),
      ...snippet ? { snippet: text(snippet).replace(/\s+/gu, ' ').trim() } : {} })
  }
  if (!sources.size && !/no-results|No results found/iu.test(html)) {
    throw new WebError('免费搜索页面格式未识别，不能据此认定没有相关网页。', 'WEB_PROVIDER_LAYOUT_CHANGED')
  }
  return { sources: [...sources.values()].slice(0, maximum), truncated: sources.size > maximum }
}
