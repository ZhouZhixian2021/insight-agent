/** Optional academic browser provider using the initiating Agent's DSH browser tools. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { AcademicSourceError } from '@deepseek-ai/dsh-academic-source'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-browser-use'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-web'
import { BrowserAcademicProvider } from './provider.ts'
import type { BrowserAcademicOptions, BrowserAcademicSite } from './types.ts'
import { academicBrowserWebSearch } from './web-search.ts'

/** Cordis plugin identity. */
export const name = 'academic-source-browser'
/** Existing browser capability and Academic registration dependencies. */
export const inject = ['academicSource', 'agents', 'tools', 'browserUse', 'web']

/** Explicit search scopes and bounded browser operations. */
export interface Config extends BrowserAcademicOptions {}

const siteSchema: Schema<BrowserAcademicSite> = Schema.object({
  url: Schema.string().required(), scope: Schema.string().required(), inputSelector: Schema.string().required(),
  submitSelector: Schema.string(), mode: Schema.union(['submit', 'filter']).required(),
  readySelector: Schema.string().required(), resultSelector: Schema.string().required(),
  resultUrlRewrite: Schema.union([Schema.const(undefined),
    Schema.object({ pattern: Schema.string().required(), replacement: Schema.string().required() })]),
  paperUrlPattern: Schema.string().required(), pdfOrigins: Schema.array(Schema.string()).required(),
  nextSelector: Schema.string(),
})

export const Config: Schema<Config> = Schema.object({
  sites: Schema.array(siteSchema).required(),
  maximumResults: Schema.number().default(6), maximumCachedRecords: Schema.number().default(1000),
  operationTimeoutMs: Schema.number().default(15000), maximumMetadataCharacters: Schema.number().default(32000),
  maximumPdfBytes: Schema.number().default(20000000), otherFetchProvider: Schema.string().default('http'),
})

/**
 * Register browser search without changing the generic Web service or default provider selection.
 * @param ctx Existing Agent, browser tools, and Academic source service.
 * @param config Loader-resolved site selectors and limits.
 */
export function apply(ctx: Context, config: Config): void {
  if (!config.sites.length) throw new Error('Academic browser search requires at least one search scope.')
  for (const site of config.sites) {
    const url = new URL(site.url)
    if (url.protocol !== 'https:' || url.username || url.password || !site.scope.trim()
      || !site.inputSelector.trim() || !site.readySelector.trim() || !site.resultSelector.trim()
      || !site.paperUrlPattern.startsWith('^') || !site.pdfOrigins.length) throw new Error('Invalid academic browser search scope.')
    new RegExp(site.paperUrlPattern)
    if (site.resultUrlRewrite !== undefined) {
      if (!site.resultUrlRewrite.pattern.startsWith('^') || !site.resultUrlRewrite.pattern.endsWith('$')
        || !site.resultUrlRewrite.replacement.trim()) throw new Error('Academic result URL rewrites require an anchored publisher route.')
      new RegExp(site.resultUrlRewrite.pattern)
    }
    for (const origin of site.pdfOrigins) {
      const parsed = new URL(origin)
      if (parsed.protocol !== 'https:' || parsed.origin !== origin) throw new Error('PDF origins must be HTTPS origins.')
    }
  }
  if (!config.otherFetchProvider.trim() || config.otherFetchProvider === 'browser') {
    throw new Error('Academic browser otherFetchProvider must name a different fetch provider.')
  }
  const limits = [config.maximumResults, config.maximumCachedRecords, config.operationTimeoutMs,
    config.maximumMetadataCharacters, config.maximumPdfBytes]
  for (const value of limits) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) throw new Error('Academic browser limits must be positive timer-safe integers.')
  }
  const provider = new BrowserAcademicProvider(config, async (code, signal) => {
    const agent = ctx.agents.requireInitiator()
    const tool = 'mcp__playwright-mcp__browser_run_code_unsafe'
    if (ctx.tools.get(tool, agent) === undefined) {
      throw new AcademicSourceError('Academic browser search requires this Session’s Playwright browser tools.',
        'ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE')
    }
    const result = await ctx.tools.execute({ agent, name: tool, arguments: { code }, callId: ToolCallId(randomUUID()), signal })
    if (result.isError) throw new AcademicSourceError('Academic browser operation failed.', 'ACADEMIC_SOURCE_PROVIDER_ERROR')
    const block = result.content.find(item => item.type === 'text' && item.text.startsWith('### Result\n'))
    if (block?.type !== 'text') throw new AcademicSourceError('Browser returned no scholarly results.', 'ACADEMIC_SOURCE_PARSE_ERROR')
    const payload = block.text.slice('### Result\n'.length).split('\n### ')[0] ?? ''
    try { const value: unknown = JSON.parse(payload); return value }
    catch (cause: unknown) { throw new AcademicSourceError('Browser returned unreadable scholarly results.', 'ACADEMIC_SOURCE_PARSE_ERROR', { cause }) }
  }, () => ctx.browserUse.providerName === 'playwright-mcp',
  (request, signal) => ctx.web.fetch(request, signal, { providerId: config.otherFetchProvider }))
  ctx.effect(() => () => provider.dispose(), 'academicBrowser.pending')
  ctx.academicSource.registerSearchProvider(provider)
  ctx.web.registerSearchProvider(academicBrowserWebSearch(provider))
  ctx.web.registerFetchProvider(provider)
}
