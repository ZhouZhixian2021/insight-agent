import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime, { type WebFetchResult } from '@deepseek-ai/dsh-web'
import { HttpFetchProvider } from '@deepseek-ai/dsh-web-fetch-http'
import * as provider from '../src/web-provider.ts'
import { parseDuckDuckGoResults } from '../src/free-search.ts'

const result = (content: string, statusCode = 200): WebFetchResult => ({ url: 'https://html.duckduckgo.com/html/',
  statusCode, body: { kind: 'html', content }, truncated: false })
const html = '<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fspec">Example &amp; specs</a><a class="result__snippet">Version 2 features</a></div>'

describe('free product search', () => {
  it('uses result content regardless of HTTP status and still rejects challenge pages', () => {
    for (const status of [202, 403, 429, 503]) {
      expect(parseDuckDuckGoResults(result(html, status), 5).sources).toHaveLength(1)
    }
    expect(() => parseDuckDuckGoResults(result('<form id="challenge-form"></form>', 202), 5))
      .toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CHALLENGE' }))
    expect(() => parseDuckDuckGoResults(result('<p>Service unavailable</p>', 202), 5))
      .toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_LAYOUT_CHANGED' }))
  })
  it('retains decoded links and snippets without promoting them to evidence', () => {
    expect(parseDuckDuckGoResults(result(html + html), 5)).toEqual({ truncated: false,
      sources: [{ url: 'https://example.com/spec', title: 'Example & specs', snippet: 'Version 2 features' }] })
    expect(parseDuckDuckGoResults(result(html), 5)).toMatchSnapshot()
    expect(parseDuckDuckGoResults(result('<div class="no-results">No results found</div>'), 5).sources).toEqual([])
  })
  it('distinguishes challenge, rate limiting and changed layouts from no results', () => {
    expect(() => parseDuckDuckGoResults(result('<form id="challenge-form"></form>'), 5)).toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CHALLENGE' }))
    expect(() => parseDuckDuckGoResults(result('', 429), 5)).toThrow(expect.objectContaining({ code: 'WEB_RATE_LIMITED' }))
    expect(() => parseDuckDuckGoResults(result('<p>Unknown page</p>'), 5)).toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_LAYOUT_CHANGED' }))
  })
  it('registers isolated readers without keys and removes them on disposal', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: 'product-free-search', fetchProvider: 'product-public-page' })
    const fiber = await ctx.plugin(provider, {
      searchEngines: ['duckduckgo'],
      searchHttp1Only: true,
      browserEnabled: false, browserChannel: 'msedge', browserTimeoutMs: 30000,
      browserMaximumRequests: 60, browserMinimumTextCharacters: 300,
      timeoutMs: 25000, maximumResponseBytes: 5_000_000,
      maximumBodyCharacters: 500_000, maximumSearchResults: 10,
    })
    let searchCalls = 0
    let keepAccepted = false
    const mock = vi.spyOn(HttpFetchProvider.prototype, 'fetch').mockImplementation(async request =>
      request.url.startsWith('https://html.duckduckgo.com/')
        ? (++searchCalls === 1 || keepAccepted ? result('', 202) : result(html))
        : { ...result('<article>Product specifications.</article>'), url: request.url })
    try {
      expect((await ctx.web.search({ query: 'Example specs', maxResults: 3 })).sources).toHaveLength(1)
      expect(mock.mock.calls[0]?.[0].url).toContain('q=Example+specs')
      expect(searchCalls).toBe(2)
      keepAccepted = true
      await expect(ctx.web.search({ query: 'Example specs' }))
        .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_FAILED' }))
      expect(searchCalls).toBe(4)
      expect((await ctx.web.fetch({ url: 'https://example.com/spec' })).body.kind).toBe('html')
      await fiber.dispose()
      await expect(ctx.web.search({ query: 'Example' })).rejects.toThrow()
    } finally { mock.mockRestore(); await ctx.fiber.dispose() }
  })
  it('routes product search through the installed Web provider while retaining product page fetch', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: 'dsh-web-tools' })
    const product = ctx.isolate('web')
    await product.plugin(WebRuntime, { searchProvider: 'product-installed-search', fetchProvider: 'product-public-page' })
    const fiber = await product.plugin(provider, {
      browserEnabled: false, browserChannel: 'msedge', browserTimeoutMs: 30000,
      browserMaximumRequests: 60, browserMinimumTextCharacters: 300,
      timeoutMs: 25000, maximumResponseBytes: 5_000_000,
      maximumBodyCharacters: 500_000, maximumSearchResults: 10,
      searchHttp1Only: true,
    })
    const search = vi.fn(async () => ({ sources: [{ url: 'https://example.com/spec', title: 'Example specs' }], truncated: false }))
    const mock = vi.spyOn(HttpFetchProvider.prototype, 'fetch').mockResolvedValue(result('<article>Product specifications.</article>'))
    try {
      await expect(product.web.search({ query: 'Example specs' }))
        .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
      const remove = ctx.web.registerSearchProvider({ id: 'dsh-web-tools', available: () => true, search })
      expect((await product.web.search({ query: 'Example specs', maxResults: 3 })).sources).toHaveLength(1)
      expect(search).toHaveBeenCalledWith({ query: 'Example specs', maxResults: 3 }, undefined)
      expect((await product.web.fetch({ url: 'https://example.com/spec' })).body.kind).toBe('html')
      expect(mock).toHaveBeenCalledTimes(1)
      remove()
      await fiber.dispose()
      await expect(product.web.search({ query: 'Example specs' })).rejects.toThrow()
    } finally { mock.mockRestore(); await ctx.fiber.dispose() }
  })
})
