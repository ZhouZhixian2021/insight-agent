/** Bounded search-page observations; model choices never introduce new URLs. */
import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import { WebError, type WebSearchResult } from '@deepseek-ai/dsh-web'
import { targetUrl, type SearchEngine } from './multi-search.ts'

/** Bounded text and numbered links observed on one rendered search page; link IDs are local to this observation. */
export interface SearchObservation {
  readonly query: string
  readonly pageUrl: string
  readonly text: string
  readonly links: readonly { id: number; url: string; title: string }[]
  readonly maximum: number
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** Select organic result link IDs from untrusted rendered search content.
     * @mode serial
     * @param observation - Bounded page facts, never evidence.
     * @param signal - Shared operation deadline and cancellation.
     */
    'product/search-recognize'(observation: SearchObservation, signal: AbortSignal): Promise<readonly number[] | undefined>
  }
}

type Node = DefaultTreeAdapterTypes.Node
const attr = (node: Node, key: string): string => 'attrs' in node ? node.attrs.find(item => item.name === key)?.value ?? '' : ''
function visible(node: Node): string {
  if ('tagName' in node && (['script', 'style', 'noscript', 'template'].includes(node.tagName)
    || ('attrs' in node && node.attrs.some(item => item.name === 'hidden')) || attr(node, 'aria-hidden') === 'true')) return ''
  return 'value' in node ? node.value : 'childNodes' in node ? node.childNodes.map(visible).join(' ') : ''
}

/** Extract bounded page text and observed external links for one recognition request. */
export function observeSearchPage(engine: SearchEngine, pageUrl: string, html: string, query: string,
  maximum: number, maximumCharacters: number, maximumLinks: number): SearchObservation {
  const root = parse(html)
  const text = visible(root).replace(/\s+/gu, ' ').trim().slice(0, maximumCharacters)
  if (/verify you are human|checking your browser|请完成验证|challenge-form|anomaly-modal/iu.test(text + html.slice(0, 20000))) {
    throw new WebError('搜索来源要求人工验证。', 'WEB_PROVIDER_CHALLENGE')
  }
  const links: { id: number; url: string; title: string }[] = []
  const seen = new Set<string>()
  function visit(node: Node): void {
    if (links.length >= maximumLinks || !visible(node)) return
    if ('tagName' in node && node.tagName === 'a') {
      const url = targetUrl(attr(node, 'href'), engine)
      const title = visible(node).replace(/\s+/gu, ' ').trim().slice(0, 240)
      if (url && title && !seen.has(url)) { seen.add(url); links.push({ id: links.length, url, title }) }
    }
    if ('childNodes' in node) node.childNodes.forEach(visit)
  }
  visit(root)
  if (!text || !links.length) throw new WebError('浏览器未取得可识别的搜索结果链接。', 'WEB_PROVIDER_LAYOUT_CHANGED')
  return { query, pageUrl, text, links, maximum }
}

/** Resolve model-selected IDs strictly against observed links, rejecting fabricated selections. */
export function resolveSearchSelection(observation: SearchObservation, ids: readonly number[]): WebSearchResult {
  if (!ids.length || ids.length > observation.maximum || new Set(ids).size !== ids.length
    || ids.some(id => !Number.isSafeInteger(id) || !observation.links[id])) {
    throw new WebError('模型未识别出有效搜索结果，或返回了页面不存在的链接编号。', 'WEB_PROVIDER_LAYOUT_CHANGED')
  }
  return { sources: ids.map((id) => {
    const link = observation.links[id]
    if (!link) throw new WebError('页面不存在该链接编号。', 'WEB_PROVIDER_LAYOUT_CHANGED')
    return { url: link.url, title: link.title }
  }),
  truncated: true }
}
