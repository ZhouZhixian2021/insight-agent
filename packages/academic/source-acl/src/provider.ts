/** ACL Anthology provider over configured official volume catalogs. */
import type {
  AcademicSourceProvider,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
} from '@deepseek-ai/dsh-academic-source'
import { searchAcademicCatalogs } from '@deepseek-ai/dsh-academic-source'

import { parseAclCatalog } from './parse.ts'

/** Stable provider id. */
export const ACL_PROVIDER_ID = 'acl'
/** Official paper and PDF base. */
export const ACL_DEFAULT_BASE_URL = 'https://aclanthology.org'

/** Resolved ACL catalog options. */
export interface AclProviderOptions {
  readonly baseURL: string
  readonly catalogUrls: readonly string[]
}

/** ACL Anthology catalog search and direct `.pdf` resolution. */
export class AclProvider implements AcademicSourceProvider {
  readonly id = ACL_PROVIDER_ID

  /** Surfaced through `searchAll()`; catalog search never leaves the configured volumes. */
  readonly limitations = ['ACL Anthology search covers only configured volume catalogs and performs no site-wide crawl.']

  /** @param resolveOptions - current base URL and official volume catalogs. */
  constructor(private readonly resolveOptions: () => AclProviderOptions) {}

  available(): boolean {
    const options = this.resolveOptions()
    return URL.canParse(options.baseURL) && options.catalogUrls.length > 0
      && options.catalogUrls.every(url => URL.canParse(url))
  }

  search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult> {
    return searchAcademicCatalogs({ providerId: this.id, catalogUrls: this.resolveOptions().catalogUrls,
      parse: html => parseAclCatalog(html) }, request, signal)
  }

  fullTextUrls(recordId: string): readonly string[] {
    if (!/^(?:\d{4}\.[a-z0-9]+-[a-z0-9]+(?:\.[a-z0-9-]+)+|[A-Z]\d{2}-\d{4}(?:v\d+)?)$/u.test(recordId)) return []
    return [new URL(`${recordId}.pdf`, `${this.resolveOptions().baseURL.replace(/\/$/u, '')}/`).href]
  }
}
