/** Register PMLR as an academic source provider. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-academic-source'

import { PmlrProvider, PMLR_DEFAULT_BASE_URL } from './provider.ts'

export { parsePmlrCatalog } from './parse.ts'
export { PmlrProvider, PMLR_DEFAULT_BASE_URL, PMLR_PROVIDER_ID } from './provider.ts'
export type { PmlrProviderOptions } from './provider.ts'

/** Cordis plugin name. */
export const name = 'academic-source-pmlr'
/** Required service seam. */
export const inject = ['academicSource']

/** Official PMLR volume pages searched by this deployment. */
export interface Config {
  /** PMLR base used to resolve paper PDFs. */
  readonly baseURL?: string
  /** Official PMLR volume pages searched by this provider. */
  readonly catalogUrls?: string[]
  /** Number of verified paper PDF locations retained for later full-text resolution. */
  readonly maxCachedRecords?: number
}

export const Config: z<Config> = z.object({
  baseURL: z.string().default(PMLR_DEFAULT_BASE_URL),
  catalogUrls: z.array(z.string()).default([]),
  maxCachedRecords: z.number().default(100),
})

/** Register the PMLR provider. */
export function apply(ctx: Context, config: Config): void {
  if (config.maxCachedRecords !== undefined && (!Number.isSafeInteger(config.maxCachedRecords) || config.maxCachedRecords < 1)) {
    throw new Error('maxCachedRecords must be a positive safe integer')
  }
  ctx.academicSource.registerSearchProvider(new PmlrProvider(() => ({
    baseURL: config.baseURL ?? PMLR_DEFAULT_BASE_URL,
    catalogUrls: config.catalogUrls ?? [],
    maxCachedRecords: config.maxCachedRecords ?? 100,
  })))
}
