import { describe, expect, it, vi } from 'vitest'
import { WebError, type WebFetchResult } from '@deepseek-ai/dsh-web'
import { parseSearchResults, searchMultiple } from '../src/multi-search.ts'

const response = (content: string, statusCode = 200): WebFetchResult => ({ url: 'https://example.com',
  statusCode, body: { kind: 'html', content }, truncated: false })
const bing = (url: string) => `<li class="b_algo"><h2><a href="${url}">Product</a></h2><p>Official features</p></li>`
const yahoo = '<div class="algo-sr"><h3><a aria-label="Permissions" href="https://r.search.yahoo.com/_ylt=x/RU=https%3A%2F%2Fexample.org%2Fpermissions/RK=2/RS=x">Permissions</a></h3><div class="compText">Access details</div></div>'
const ddg = '<div class="result"><a class="result__a" href="https://example.com/spec?utm_source=ddg">Product</a></div>'

describe('direct multiple-engine product search', () => {
  it('decodes engine redirects and strips tracking while keeping citations usable', () => {
    const encoded = 'a1' + Buffer.from('https://example.com/spec?utm_source=bing').toString('base64url')
    expect(parseSearchResults('bing', response(bing(`https://www.bing.com/ck/a?u=${encoded}`)), 10).sources[0]?.url).toBe('https://example.com/spec')
    expect(parseSearchResults('yahoo', response(yahoo), 10).sources[0]).toEqual({ url: 'https://example.org/permissions', title: 'Permissions', snippet: 'Access details' })
  })
  it('accepts usable result content on non-200 responses across engines', () => {
    for (const status of [202, 403, 429, 503]) {
      expect(parseSearchResults('bing', response(bing('https://example.com/spec'), status), 5).sources).toHaveLength(1)
      expect(parseSearchResults('yahoo', response(yahoo, status), 5).sources).toHaveLength(1)
    }
    expect(() => parseSearchResults('bing', response('<p>Verify you are human</p>', 202), 5))
      .toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CHALLENGE' }))
  })
  it('merges sources by rank, deduplicates links and preserves the exact query', async () => {
    const fetch = vi.fn(async (url: string) => response(url.includes('duckduckgo') ? ddg : url.includes('bing') ? bing('https://example.com/spec') + bing('https://example.net/other') : yahoo))
    const result = await searchMultiple('Notion team permissions', 2, ['duckduckgo', 'bing', 'yahoo'], fetch)
    expect(result.sources.map(source => source.url)).toEqual(['https://example.com/spec', 'https://example.org/permissions'])
    expect(result.truncated).toBe(true)
    expect(result.content).toContain('合并去重 3 条，保留 2 条')
    expect(result).toMatchSnapshot()
    expect(fetch.mock.calls).toHaveLength(3)
    for (const [url] of fetch.mock.calls) expect(new URL(url).searchParams.get(url.includes('yahoo') ? 'p' : 'q')).toBe('Notion team permissions')
  })
  it('retains another engine after rate limiting and reports incomplete coverage', async () => {
    const result = await searchMultiple('permissions', 10, ['bing', 'yahoo'], async url => response(url.includes('bing') ? '' : yahoo, url.includes('bing') ? 429 : 200))
    expect(result.sources).toHaveLength(1)
    expect(result.truncated).toBe(true)
    expect(result.content).toContain('bing: WEB_RATE_LIMITED')
  })
  it('distinguishes empty results, unknown layout, challenges and total failure', async () => {
    expect(parseSearchResults('bing', response('<li class="b_no">No results found</li>'), 5).sources).toEqual([])
    expect(() => parseSearchResults('yahoo', response('<p>New layout</p>'), 5)).toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_LAYOUT_CHANGED' }))
    expect(() => parseSearchResults('bing', response('<p>Verify you are human</p>'), 5)).toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CHALLENGE' }))
    await expect(searchMultiple('q', 5, ['bing', 'yahoo'], async () => { throw new WebError('Unavailable', 'WEB_PROVIDER_FAILED') })).rejects.toThrow('搜索来源均失败')
  })
  it('does not convert user cancellation to partial success', async () => {
    const controller = new AbortController()
    const reason = new Error('Cancelled')
    await expect(searchMultiple('q', 5, ['bing'], async () => { controller.abort(reason); return response(bing('https://example.com')) }, controller.signal)).rejects.toBe(reason)
  })
})
