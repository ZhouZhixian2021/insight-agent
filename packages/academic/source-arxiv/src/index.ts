/**
 * Register an arXiv provider in `ctx.academicSource`. It queries the public Atom `/api/query`
 * endpoint and normalizes each returned entry at the provider boundary, keeping arXiv-specific
 * field names inside this package.
 * @module @deepseek-ai/dsh-academic-source-arxiv
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-academic-source'
import { ArxivProvider, ARXIV_DEFAULT_BASE_URL } from './provider.ts'
import type { ArxivProviderOptions } from './provider.ts'

export {
  ArxivProvider,
  ARXIV_DEFAULT_BASE_URL,
  ARXIV_PROVIDER_ID,
} from './provider.ts'
export type { ArxivProviderOptions } from './provider.ts'
export { normalizeArxivWork } from './normalize.ts'
export { parseArxivFeed } from './parse.ts'
export type {
  ArxivRawWork,
  NormalizedArxivWork,
} from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'academic-source-arxiv'

/** The academic source seam this provider registers into. */
export const inject = ['academicSource']

/** Plugin config (optional — `apply` fills the endpoint default). */
export interface Config {
  /** arXiv export API base; `/api/query` is appended. Defaults to `https://export.arxiv.org`. */
  baseURL?: string
}

export const Config: z<Config> = z.object({
  baseURL: z.string().default(ARXIV_DEFAULT_BASE_URL),
})

/** Register the arXiv search provider with `ctx.academicSource`. */
export function apply(ctx: Context, config: Config): void {
  ctx.academicSource.registerSearchProvider(new ArxivProvider(() => resolveOptions(config)))
}

/** Project the plugin config into the options the provider serves its next search with. */
function resolveOptions(config: Config): ArxivProviderOptions {
  return { baseURL: config.baseURL ?? ARXIV_DEFAULT_BASE_URL }
}
