/** Register OpenAlex discovery without changing the caller's single-query search interface. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-academic-source'
import { OpenAlexProvider } from './provider.ts'

export { OpenAlexProvider } from './provider.ts'
export type { OpenAlexOptions } from './provider.ts'
export { normalizeOpenAlexWork } from './normalize.ts'

/** Loader plugin id. */
export const name = 'academic-source-openalex'
/** Required source registry. */
export const inject = ['academicSource']

/** OpenAlex request settings; API keys remain in the configured environment variable. */
export interface Config {
  readonly baseURL?: string
  readonly apiKeyEnv?: string
  readonly searchMode?: 'keyword' | 'semantic'
  readonly publicationYears?: string
  readonly timeoutMs?: number
  readonly maxResults?: number
  readonly maxCachedRecords?: number
}

export const Config: z<Config> = z.object({
  baseURL: z.string().default('https://api.openalex.org'),
  apiKeyEnv: z.string().default('OPENALEX_API_KEY'),
  searchMode: z.union(['keyword', 'semantic']).default('keyword'),
  publicationYears: z.string(),
  timeoutMs: z.number().default(20_000),
  maxResults: z.number().default(50),
  maxCachedRecords: z.number().default(1000),
})

/** Register a validated provider; misconfiguration fails before any network request.
 * @param ctx Source service context.
 * @param config Deployment configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const baseURL = config.baseURL ?? 'https://api.openalex.org'
  if (!URL.canParse(baseURL) || new URL(baseURL).protocol !== 'https:'
    || new URL(baseURL).username || new URL(baseURL).password || new URL(baseURL).search || new URL(baseURL).hash) {
    throw new Error('OpenAlex baseURL must be an HTTPS URL without credentials, query or fragment')
  }
  const timeoutMs = config.timeoutMs ?? 20_000
  const maxResults = config.maxResults ?? 50
  const maxCachedRecords = config.maxCachedRecords ?? 1000
  const searchMode = config.searchMode ?? 'keyword'
  const cap = searchMode === 'semantic' ? 50 : 100
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647
    || !Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > cap
    || !Number.isSafeInteger(maxCachedRecords) || maxCachedRecords < maxResults) {
    throw new Error('invalid OpenAlex timeout, result limit or full-text cache capacity')
  }
  const years = config.publicationYears
  if (years !== undefined && (!/^\d{4}-\d{4}$/u.test(years) || years.slice(0, 4) > years.slice(5))) {
    throw new Error('OpenAlex publicationYears must be an ascending YYYY-YYYY range')
  }
  ctx.academicSource.registerSearchProvider(new OpenAlexProvider({ baseURL,
    apiKey: process.env[config.apiKeyEnv ?? 'OPENALEX_API_KEY'], searchMode, publicationYears: years,
    timeoutMs, maxResults, maxCachedRecords }))
}
