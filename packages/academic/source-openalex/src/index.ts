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
  /** OpenAlex REST API base; `/works` requests resolve against it. Defaults to `https://api.openalex.org`. */
  readonly baseURL?: string
  /** Environment variable that may hold an OpenAlex API key sent as a bearer token. Defaults to `OPENALEX_API_KEY`. */
  readonly apiKeyEnv?: string
  /** Query interpretation: `keyword` sends `search`, `semantic` sends `search.semantic`. Defaults to `keyword`. */
  readonly searchMode?: 'keyword' | 'semantic'
  /** Optional ascending `YYYY-YYYY` range restricting discovery to `publication_year`; not a first-public-release filter. */
  readonly publicationYears?: string
  /** Per-request timeout in milliseconds. Defaults to `20000`. */
  readonly timeoutMs?: number
  /** Maximum records requested per query; semantic mode caps this at `50` and keyword mode at `100`. Defaults to `50`. */
  readonly maxResults?: number
  /** Capacity of the instance-local full-text candidate map; must be at least `maxResults`. Defaults to `1000`. */
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
