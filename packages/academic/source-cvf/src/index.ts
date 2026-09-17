/** Register CVF Open Access as an academic source provider. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-academic-source'

import { CvfProvider } from './provider.ts'

export { parseCvfCatalog } from './parse.ts'
export { CvfProvider, CVF_PROVIDER_ID } from './provider.ts'
export type { CvfProviderOptions } from './provider.ts'

/** Cordis plugin name. */
export const name = 'academic-source-cvf'
/** Required service seam. */
export const inject = ['academicSource']

/** Official CVF conference pages searched by this deployment. */
export interface Config {
  /** Official CVF conference catalog pages searched by this provider. */
  readonly catalogUrls?: string[]
}

export const Config: z<Config> = z.object({
  catalogUrls: z.array(z.string()).default([]),
})

/** Register the CVF provider. */
export function apply(ctx: Context, config: Config): void {
  ctx.academicSource.registerSearchProvider(new CvfProvider(() => ({ catalogUrls: config.catalogUrls ?? [] })))
}
