/**
 * Register an OpenAlex provider in `ctx.academicSource`. It queries the public `/works`
 * search endpoint and normalizes each returned record at the provider boundary, keeping
 * OpenAlex-specific field names inside this package.
 * @module @deepseek-ai/dsh-academic-source-openalex
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-academic-source'
import {
  OpenAlexProvider,
  OPENALEX_DEFAULT_BASE_URL,
} from './provider.ts'
import type { OpenAlexProviderOptions } from './provider.ts'

export {
  OpenAlexProvider,
  OPENALEX_DEFAULT_BASE_URL,
  OPENALEX_PROVIDER_ID,
} from './provider.ts'
export type { OpenAlexProviderOptions } from './provider.ts'
export { normalizeOpenAlexWork } from './normalize.ts'
export type {
  NormalizedOpenAlexWork,
  OpenAlexRawAuthorship,
  OpenAlexRawPrimaryLocation,
  OpenAlexRawWork,
  OpenAlexSearchResponse,
} from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'academic-source-openalex'

/** The academic source seam this provider registers into. */
export const inject = ['academicSource']

/** Plugin config (all optional — `apply` fills the endpoint default). */
export interface Config {
  /** OpenAlex API base; `/works` is appended. Defaults to `https://api.openalex.org`. */
  baseURL?: string
  /** Polite-pool contact email sent as the `mailto` query parameter. */
  mailto?: string
  /** Premium-pool API key sent as the `api_key` query parameter. */
  apiKey?: string
}

export const Config: z<Config> = z.object({
  baseURL: z.string().default(OPENALEX_DEFAULT_BASE_URL),
  mailto: z.string(),
  apiKey: z.string().role('secret'),
})

/** Register the OpenAlex search provider with `ctx.academicSource`. */
export function apply(ctx: Context, config: Config): void {
  ctx.academicSource.registerSearchProvider(new OpenAlexProvider(() => resolveOptions(config)))
}

/** Project the plugin config into the options the provider serves its next search with. */
function resolveOptions(config: Config): OpenAlexProviderOptions {
  return {
    baseURL: config.baseURL ?? OPENALEX_DEFAULT_BASE_URL,
    ...config.mailto !== undefined && config.mailto.length > 0 ? { mailto: config.mailto } : {},
    ...config.apiKey !== undefined && config.apiKey.length > 0 ? { apiKey: config.apiKey } : {},
  }
}
