/** PMLR provider over configured official volume catalogs. */
import type {
  AcademicSourceProvider,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
} from '@deepseek-ai/dsh-academic-source'
import { searchAcademicCatalogs } from '@deepseek-ai/dsh-academic-source'

import { parsePmlrCatalog } from './parse.ts'

/** Stable provider id. */
export const PMLR_PROVIDER_ID = 'pmlr'
/** Official PMLR site base. */
export const PMLR_DEFAULT_BASE_URL = 'https://proceedings.mlr.press'

/** Resolved PMLR volume options. */
export interface PmlrProviderOptions {
  readonly baseURL: string
  readonly catalogUrls: readonly string[]
}

/** PMLR volume search and canonical PDF resolution. */
export class PmlrProvider implements AcademicSourceProvider {
  readonly id = PMLR_PROVIDER_ID

  /** Surfaced through `searchAll()`; catalog search never leaves the configured volumes. */
  readonly limitations = ['PMLR search covers only configured volume catalogs and performs no site-wide crawl.']

  /** @param resolveOptions - current base URL and official volume catalogs. */
  constructor(private readonly resolveOptions: () => PmlrProviderOptions) {}

  available(): boolean {
    const options = this.resolveOptions()
    return URL.canParse(options.baseURL) && options.catalogUrls.length > 0
      && options.catalogUrls.every(url => URL.canParse(url))
  }

  search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult> {
    return searchAcademicCatalogs(
      { providerId: this.id, catalogUrls: this.resolveOptions().catalogUrls, parse: parsePmlrCatalog },
      request,
      signal,
    )
  }

  fullTextUrls(recordId: string): readonly string[] {
    const match = recordId.match(/^(v\d+)\/([a-z0-9][a-z0-9._-]*)$/iu)
    if (match === null) return []
    const baseURL = this.resolveOptions().baseURL.replace(/\/$/u, '')
    return [`${baseURL}/${match[1]}/${match[2]}/${match[2]}.pdf`]
  }
}
