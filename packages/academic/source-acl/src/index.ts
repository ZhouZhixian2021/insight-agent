/** Register ACL Anthology as an academic source provider. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-academic-source'

import { AclProvider, ACL_DEFAULT_BASE_URL } from './provider.ts'

export { parseAclCatalog } from './parse.ts'
export { AclProvider, ACL_DEFAULT_BASE_URL, ACL_PROVIDER_ID } from './provider.ts'
export type { AclProviderOptions } from './provider.ts'

/** Cordis plugin name. */
export const name = 'academic-source-acl'
/** Required service seam. */
export const inject = ['academicSource']

/** Official ACL volume pages searched by this deployment. */
export interface Config {
  /** ACL Anthology base used to resolve paper PDFs. */
  readonly baseURL?: string
  /** Official ACL Anthology volume pages searched by this provider. */
  readonly catalogUrls?: string[]
}

export const Config: z<Config> = z.object({
  baseURL: z.string().default(ACL_DEFAULT_BASE_URL),
  catalogUrls: z.array(z.string()).default([]),
})

/** Register the ACL provider. */
export function apply(ctx: Context, config: Config): void {
  ctx.academicSource.registerSearchProvider(new AclProvider(() => ({
    baseURL: config.baseURL ?? ACL_DEFAULT_BASE_URL,
    catalogUrls: config.catalogUrls ?? [],
  })))
}
