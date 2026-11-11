/** Product-scoped search selection and anonymous HTTP/browser page retrieval. */
import type { Context } from '@deepseek-ai/cordis'
import { setTimeout as delay } from 'node:timers/promises'
import z from '@deepseek-ai/schemastery'
import { WebError, type WebFetchResult } from '@deepseek-ai/dsh-web'
import { HttpFetchProvider } from '@deepseek-ai/dsh-web-fetch-http'
import { parseSearchResults, searchMultiple, type SearchEngine } from './multi-search.ts'
import { observeSearchPage, resolveSearchSelection } from './search-recovery.ts'
import { readProductBrowserPage } from './browser-reader.ts'
import { prepareProductPage, ProductPageEmptyError } from './page-content.ts'

/** Cordis registration name. */
export const name = 'product-insight-source'
/** Product preset supplies an isolated Web registry. */
export const inject = ['web']

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
})

/**
 * Register free and installed-plugin search plus public-page readers; disposal removes all four providers.
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
    maxBodyChars: config.maximumBodyCharacters, maxRedirects: 5,
    userAgent: 'deepseek-harness-product-insight/0.2 (+https://github.com/ZhouZhixian2021/insight-agent)' })
  ctx.web.registerFetchProvider(http)
  const searchHttp = new HttpFetchProvider({ timeoutMs: config.timeoutMs, maxResponseBytes: config.maximumResponseBytes,
    maxBodyChars: config.maximumBodyCharacters, maxRedirects: 5, http1Only: config.searchHttp1Only,
    userAgent: 'deepseek-harness-product-insight/0.2 (+https://github.com/ZhouZhixian2021/insight-agent)' })
  ctx.web.registerSearchProvider({ id: 'product-free-search', available: () => true,
    async search(request, signal) {
      const maximum = Math.min(request.maxResults ?? config.maximumSearchResults, config.maximumSearchResults)
      const result = await searchMultiple(request.query, maximum, engines, async (url, active) => {
        let fetched = await searchHttp.fetch({ url }, active)
        if (url.startsWith('https://html.duckduckgo.com/') && fetched.statusCode === 202 && !fetched.truncated) {
          await delay(500, undefined, { signal: active })
          fetched = await searchHttp.fetch({ url }, active)
        }
        return fetched
      }, signal,
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
  ctx.web.registerSearchProvider({ id: 'product-installed-search', available: () => ctx.root.get('web') !== undefined,
    search: (request, signal) => {
      const installed = ctx.root.get('web')
      if (!installed) throw new WebError('Web search service is unavailable.', 'WEB_PROVIDER_UNAVAILABLE')
      return installed.search(request, signal, { providerId: 'dsh-web-tools' })
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
