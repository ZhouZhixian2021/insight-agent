/** Product-local free search and anonymous HTTP/browser page retrieval. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { WebError, type WebFetchResult } from '@deepseek-ai/dsh-web'
import { HttpFetchProvider } from '@deepseek-ai/dsh-web-fetch-http'
import { parseDuckDuckGoResults } from './free-search.ts'
import { readProductBrowserPage } from './browser-reader.ts'
import { prepareProductPage, ProductPageEmptyError } from './page-content.ts'

/** Cordis registration name. */
export const name = 'product-insight-source'
/** Product preset supplies an isolated Web registry. */
export const inject = ['web']

/** Free-search and browser deployment settings; no credentials are required. */
export interface Config {
  timeoutMs: number
  maximumResponseBytes: number
  maximumBodyCharacters: number
  maximumSearchResults: number
  browserEnabled: boolean
  browserChannel: string
  browserTimeoutMs: number
  browserMaximumRequests: number
  browserMinimumTextCharacters: number
}

export const Config: z<Config> = z.object({
  timeoutMs: z.number().default(25000),
  maximumResponseBytes: z.number().default(5_000_000),
  maximumBodyCharacters: z.number().default(500_000),
  maximumSearchResults: z.number().default(10),
  browserEnabled: z.boolean().default(true),
  browserChannel: z.string().default(process.platform === 'win32' ? 'msedge' : 'chrome'),
  browserTimeoutMs: z.number().default(30000),
  browserMaximumRequests: z.number().default(60),
  browserMinimumTextCharacters: z.number().default(300),
})

/**
 * Register free search and public-page readers; disposal removes all three providers.
 * @param ctx - Product-scoped context, isolated from other presets' search choices.
 * @param config - Validated deployment limits; browser failures retain their error rather than returning a shell.
 */
export function apply(ctx: Context, config: Config): void {
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647)) {
      throw new Error(`product-insight-source: ${key} must be a positive bounded integer`)
    }
  }
  const http = new HttpFetchProvider({ timeoutMs: config.timeoutMs, maxResponseBytes: config.maximumResponseBytes,
    maxBodyChars: config.maximumBodyCharacters, maxRedirects: 5,
    userAgent: 'deepseek-harness-product-insight/0.2 (+https://github.com/ZhouZhixian2021/insight-agent)' })
  ctx.web.registerFetchProvider(http)
  ctx.web.registerSearchProvider({ id: 'product-free-search', available: () => true,
    async search(request, signal) {
      const maximum = Math.min(request.maxResults ?? config.maximumSearchResults, config.maximumSearchResults)
      const url = new URL('https://html.duckduckgo.com/html/')
      url.searchParams.set('q', request.query)
      return parseDuckDuckGoResults(await http.fetch({ url: url.href }, signal), maximum)
    },
  })
  ctx.web.registerFetchProvider({ id: 'product-public-page', available: () => true,
    async fetch(request, signal): Promise<WebFetchResult> {
      const result = await http.fetch(request, signal)
      if (!config.browserEnabled || result.body.kind !== 'html' || result.truncated
        || result.statusCode < 200 || result.statusCode >= 300) return result
      if (/anomaly-modal|challenge-form|cf-chl-/iu.test(result.body.content)) {
        throw new WebError('网页要求人工验证，未将验证页面作为证据。', 'WEB_PROVIDER_CHALLENGE')
      }
      let plain: string
      try { plain = prepareProductPage(result, config.maximumBodyCharacters).text } catch (error) {
        if (!(error instanceof ProductPageEmptyError)) throw error
        plain = ''
      }
      if (plain.length >= config.browserMinimumTextCharacters
        && !/enable javascript|javascript is required|请启用\s*javascript/iu.test(plain)) return result
      return readProductBrowserPage(result.url, result, (url, active) => http.fetch({ url }, active), {
        channel: config.browserChannel, timeoutMs: config.browserTimeoutMs,
        maximumCharacters: config.maximumBodyCharacters, maximumRequests: config.browserMaximumRequests,
        minimumTextCharacters: config.browserMinimumTextCharacters,
      }, signal)
    },
  })
}
