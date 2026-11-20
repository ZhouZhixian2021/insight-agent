import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime, { WebError, type WebFetchResult } from '@deepseek-ai/dsh-web'
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
      searchHttp1Only: true,
      browserEnabled: false, browserChannel: 'msedge', browserTimeoutMs: 30000,
      browserMaximumRequests: 60, browserMinimumTextCharacters: 300, followPageRedirects: true,
      searchEngineFailureThreshold: 3, searchEngineCooldownMs: 600000,
      timeoutMs: 25000, maximumResponseBytes: 5_000_000,
      maximumBodyCharacters: 500_000, maximumSearchResults: 10,
    })
    const mock = vi.spyOn(HttpFetchProvider.prototype, 'fetch').mockImplementation(async request =>
      request.url.startsWith('https://html.duckduckgo.com/') ? result(html)
        : { ...result('<article>Product specifications.</article>'), url: request.url })
    try {
      expect((await ctx.web.search({ query: 'Example specs', maxResults: 3 })).sources).toHaveLength(1)
      expect(mock.mock.calls[0]?.[0].url).toContain('q=Example+specs')
      expect((await ctx.web.fetch({ url: 'https://example.com/spec' })).body.kind).toBe('html')
      await fiber.dispose()
      await expect(ctx.web.search({ query: 'Example' })).rejects.toThrow()
    } finally { mock.mockRestore(); await ctx.fiber.dispose() }
  })

  it('retries one blocked page with a browser-like agent and keeps the blocked status when it stays blocked', async () => {
    for (const retryStatus of [200, 403]) {
      const ctx = new Context()
      await ctx.plugin(WebRuntime, { searchProvider: 'product-free-search', fetchProvider: 'product-public-page' })
      const fiber = await ctx.plugin(provider, {
        searchHttp1Only: true,
        browserEnabled: false, browserChannel: 'msedge', browserTimeoutMs: 30000,
        browserMaximumRequests: 60, browserMinimumTextCharacters: 300, followPageRedirects: true,
        searchEngineFailureThreshold: 3, searchEngineCooldownMs: 600000,
        timeoutMs: 25000, maximumResponseBytes: 5_000_000,
        maximumBodyCharacters: 500_000, maximumSearchResults: 10,
      })
      let calls = 0
      const mock = vi.spyOn(HttpFetchProvider.prototype, 'fetch').mockImplementation(async (request) => {
        calls += 1
        const statusCode = calls === 1 ? 403 : retryStatus
        return { ...result(statusCode === 200 ? '<article>Product specifications.</article>' : '<p>blocked</p>',
          statusCode), url: request.url }
      })
      try {
        const fetched = await ctx.web.fetch({ url: 'https://example.com/spec' })
        expect(calls).toBe(2)
        expect(fetched.statusCode).toBe(retryStatus)
      } finally { mock.mockRestore(); await fiber.dispose(); await ctx.fiber.dispose() }
    }
  })

  it('retries once when the site answers with no usable content type', async () => {
    for (const retrySucceeds of [true, false]) {
      const ctx = new Context()
      await ctx.plugin(WebRuntime, { searchProvider: 'product-free-search', fetchProvider: 'product-public-page' })
      const fiber = await ctx.plugin(provider, {
        searchHttp1Only: true,
        browserEnabled: false, browserChannel: 'msedge', browserTimeoutMs: 30000,
        browserMaximumRequests: 60, browserMinimumTextCharacters: 300, followPageRedirects: true,
        searchEngineFailureThreshold: 3, searchEngineCooldownMs: 600000,
        timeoutMs: 25000, maximumResponseBytes: 5_000_000,
        maximumBodyCharacters: 500_000, maximumSearchResults: 10,
      })
      let calls = 0
      const mock = vi.spyOn(HttpFetchProvider.prototype, 'fetch').mockImplementation(async (request) => {
        calls += 1
        if (calls === 1 || !retrySucceeds) throw new WebError('unsupported content type "unknown"',
          'WEB_UNSUPPORTED_CONTENT_TYPE')
        return { ...result('<article>Product specifications.</article>'), url: request.url }
      })
      try {
        if (retrySucceeds) {
          expect((await ctx.web.fetch({ url: 'https://example.com/spec' })).statusCode).toBe(200)
        } else {
          await expect(ctx.web.fetch({ url: 'https://example.com/spec' }))
            .rejects.toThrow(expect.objectContaining({ code: 'WEB_UNSUPPORTED_CONTENT_TYPE' }))
        }
        expect(calls).toBe(2)
      } finally { mock.mockRestore(); await fiber.dispose(); await ctx.fiber.dispose() }
    }
  })
})
