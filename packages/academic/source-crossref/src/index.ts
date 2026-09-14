/**
 * Register a Crossref provider in `ctx.academicSource`. It queries the public `/works`
 * search endpoint and normalizes each returned record at the provider boundary, keeping
 * Crossref-specific field names inside this package.
 * @module @deepseek-ai/dsh-academic-source-crossref
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-academic-source'
import { CrossrefProvider, CROSSREF_DEFAULT_BASE_URL } from './provider.ts'
import type { CrossrefProviderOptions } from './provider.ts'

export {
  CrossrefProvider,
  CROSSREF_DEFAULT_BASE_URL,
  CROSSREF_PROVIDER_ID,
} from './provider.ts'
export type { CrossrefProviderOptions } from './provider.ts'
export { normalizeCrossrefWork } from './normalize.ts'
export type {
  CrossrefRawAuthor,
  CrossrefRawDate,
  CrossrefRawWork,
  CrossrefSearchResponse,
  NormalizedCrossrefWork,
} from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'academic-source-crossref'

/** The academic source seam this provider registers into. */
export const inject = ['academicSource']

/** Plugin config (all optional — `apply` fills the endpoint default). */
export interface Config {
  /** Crossref API base; `/works` is appended. Defaults to `https://api.crossref.org`. */
  baseURL?: string
  /** Polite-pool contact email sent as the `mailto` query parameter. */
  mailto?: string
}

export const Config: z<Config> = z.object({
  baseURL: z.string().default(CROSSREF_DEFAULT_BASE_URL),
  mailto: z.string(),
})

/** Register the Crossref search provider with `ctx.academicSource`. */
export function apply(ctx: Context, config: Config): void {
  ctx.academicSource.registerSearchProvider(new CrossrefProvider(() => resolveOptions(config)))
}

/** Project the plugin config into the options the provider serves its next search with. */
function resolveOptions(config: Config): CrossrefProviderOptions {
  return {
    baseURL: config.baseURL ?? CROSSREF_DEFAULT_BASE_URL,
    ...config.mailto !== undefined && config.mailto.length > 0 ? { mailto: config.mailto } : {},
  }
}
