/** Product-local free search and anonymous HTTP/browser page retrieval. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { WebError, type WebFetchRequest, type WebFetchResult } from '@deepseek-ai/dsh-web'
import { HttpFetchProvider } from '@deepseek-ai/dsh-web-fetch-http'
import { parseSearchResults, searchMultiple, type SearchEngine } from './multi-search.ts'
import { observeSearchPage, resolveSearchSelection } from './search-recovery.ts'
import { readProductBrowserPage } from './browser-reader.ts'
import { prepareProductPage, ProductPageEmptyError } from './page-content.ts'

const imageReader = new HttpFetchProvider({ timeoutMs: 25_000, maxResponseBytes: 8 * 1024 * 1024,
  maxBodyChars: 1, maxRedirects: 5, userAgent: 'deepseek-harness-product-insight/0.2' })

/**
 * Fetch an article's original raster image for the product investigation.
 * @param url - Absolute image URL resolved from the article.
 * @param signal - Optional cancellation signal for the download.
 * @returns The downloaded bytes and their declared media type.
 */
export function fetchProductImage(url: string, signal?: AbortSignal): ReturnType<HttpFetchProvider['fetchImage']> {
  return imageReader.fetchImage(url, signal)
}

/** Cordis registration name. */
export const name = 'product-insight-source'
/** Product preset supplies an isolated Web registry. */
export const inject = ['web']

/** Statuses that usually mean an automation block rather than a missing page. */
const BLOCKED_PAGE_STATUSES = new Set([403, 405, 429, 503])
/** Browser-like agent for one blocked-page retry; every transport limit still applies. */
const BLOCKED_PAGE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Free-search and browser deployment settings; no credentials are required. */
export interface Config {
  searchEngines?: SearchEngine[]
  searchHttp1Only: boolean
  searchRecoveryCharacters?: number
  searchRecoveryLinks?: number
  timeoutMs: number
  maximumResponseBytes: number
  maximumBodyCharacters: number
  maximumSearchResults: number
  browserEnabled: boolean
  browserChannel: string
  browserTimeoutMs: number
  browserMaximumRequests: number
  browserMinimumTextCharacters: number
  /** Whether a page fetch may follow a redirect onto another host (redirector and media links do). */
  followPageRedirects: boolean
}

export const Config: z<Config> = z.object({
  searchEngines: z.array(z.union(['duckduckgo', 'bing', 'yahoo'])).default(['duckduckgo', 'bing', 'yahoo']),
  searchHttp1Only: z.boolean().default(true),
  searchRecoveryCharacters: z.number().default(20000),
  searchRecoveryLinks: z.number().default(100),
  timeoutMs: z.number().default(25000),
  maximumResponseBytes: z.number().default(67_108_864),
  maximumBodyCharacters: z.number().default(16_777_216),
  maximumSearchResults: z.number().default(60),
  browserEnabled: z.boolean().default(true),
  browserChannel: z.string().default(process.platform === 'win32' ? 'msedge' : 'chrome'),
  browserTimeoutMs: z.number().default(30000),
  browserMaximumRequests: z.number().default(60),
  browserMinimumTextCharacters: z.number().default(300),
  followPageRedirects: z.boolean().default(true),
})

/**
 * Register free search and public-page readers; disposal removes all three providers.
 * @param ctx - Product-scoped context, isolated from other presets' search choices.
 * @param config - Validated deployment limits; browser failures retain their error rather than returning a shell.
 */
export function apply(ctx: Context, config: Config): void {
  const engines = config.searchEngines
  const { searchRecoveryCharacters, searchRecoveryLinks } = config
  if (searchRecoveryCharacters === undefined || searchRecoveryLinks === undefined) {
    throw new Error('product-insight-source: search recovery limits must be resolved by Config')
  }
  if (!engines?.length || new Set(engines).size !== engines.length) {
    throw new Error('product-insight-source: searchEngines must contain unique supported engines')
  }
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647)) {
      throw new Error(`product-insight-source: ${key} must be a positive bounded integer`)
    }
  }
  const http = new HttpFetchProvider({ timeoutMs: config.timeoutMs, maxResponseBytes: config.maximumResponseBytes,
    maxBodyChars: config.maximumBodyCharacters, maxRedirects: 5, followCrossOriginRedirects: config.followPageRedirects,
    userAgent: 'deepseek-harness-product-insight/0.2 (+https://github.com/ZhouZhixian2021/insight-agent)' })
  ctx.web.registerFetchProvider(http)
  const browserAgent = new HttpFetchProvider({ timeoutMs: config.timeoutMs, maxResponseBytes: config.maximumResponseBytes,
    maxBodyChars: config.maximumBodyCharacters, maxRedirects: 5, followCrossOriginRedirects: config.followPageRedirects,
    userAgent: BLOCKED_PAGE_USER_AGENT })
  const searchHttp = new HttpFetchProvider({ timeoutMs: config.timeoutMs, maxResponseBytes: config.maximumResponseBytes,
    maxBodyChars: config.maximumBodyCharacters, maxRedirects: 5, http1Only: config.searchHttp1Only,
    userAgent: 'deepseek-harness-product-insight/0.2 (+https://github.com/ZhouZhixian2021/insight-agent)' })
  ctx.web.registerSearchProvider({ id: 'product-free-search', available: () => true,
    async search(request, signal) {
      const maximum = Math.min(request.maxResults ?? config.maximumSearchResults, config.maximumSearchResults)
      const result = await searchMultiple(request.query, maximum, engines, (url, active) => searchHttp.fetch({ url }, active), signal,
        config.browserEnabled ? async (engine, initial) => {
          const active = signal ? AbortSignal.any([signal, AbortSignal.timeout(config.browserTimeoutMs * 3)])
            : AbortSignal.timeout(config.browserTimeoutMs * 3)
          const rendered = await readProductBrowserPage(initial.url, initial,
            (url, current) => searchHttp.fetch({ url }, current), {
              channel: config.browserChannel, timeoutMs: config.browserTimeoutMs,
              maximumCharacters: config.maximumBodyCharacters, maximumRequests: config.browserMaximumRequests,
              minimumTextCharacters: 1,
            }, active)
          try { return parseSearchResults(engine, rendered, maximum) } catch (error) {
            if (!(error instanceof WebError) || error.code !== 'WEB_PROVIDER_LAYOUT_CHANGED') throw error
          }
          if (rendered.body.kind !== 'html') throw new WebError('搜索页没有可读内容。', 'WEB_PROVIDER_FAILED')
          const observation = observeSearchPage(engine, rendered.url, rendered.body.content, request.query,
            maximum, searchRecoveryCharacters, searchRecoveryLinks)
          const ids = await ctx.serial('product/search-recognize', observation, active)
          if (!ids) throw new WebError('当前会话没有可用的搜索识别模型。', 'WEB_PROVIDER_FAILED')
          return resolveSearchSelection(observation, ids)
        } : undefined)
      ctx.logger.info(result.content)
      return result
    },
  })
  /**
   * Retry one blocked page with a browser-like agent.
   * @param blocked - First acquisition, kept when the retry stays blocked or fails.
   * @param request - Same public URL under the same transport limits.
   * @param signal - Cancellation shared with the original acquisition.
   * @returns The successful retry, or the original blocked result.
   */
  async function retryBlockedPage(blocked: WebFetchResult, request: WebFetchRequest,
    signal?: AbortSignal): Promise<WebFetchResult> {
    try {
      const retried = await browserAgent.fetch(request, signal)
      return retried.statusCode >= 200 && retried.statusCode < 300 ? retried : blocked
    } catch { return blocked }
  }
  /**
   * Acquire one public page, retrying once when the site answers the product agent with no usable content type.
   * @param request - Public URL under the configured transport limits.
   * @param signal - Cancellation shared with the retry.
   * @returns The first usable acquisition.
   */
  async function acquirePage(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    try { return await http.fetch(request, signal) } catch (error) {
      // Some sites answer the product agent with an empty, typeless response and read normally as a browser.
      if (!(error instanceof WebError) || error.code !== 'WEB_UNSUPPORTED_CONTENT_TYPE') throw error
      try { return await browserAgent.fetch(request, signal) } catch { throw error }
    }
  }
  ctx.web.registerFetchProvider({ id: 'product-public-page', available: () => true,
    async fetch(request, signal): Promise<WebFetchResult> {
      const first = await acquirePage(request, signal)
      // A blocked page often answers a browser-like agent; the retry keeps the same guarded transport.
      const result = BLOCKED_PAGE_STATUSES.has(first.statusCode)
        ? await retryBlockedPage(first, request, signal) : first
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
