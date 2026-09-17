/** CVF Open Access provider over configured official conference catalogs. */
import type {
  AcademicSourceProvider,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
} from '@deepseek-ai/dsh-academic-source'
import { searchAcademicCatalogs } from '@deepseek-ai/dsh-academic-source'

import { parseCvfCatalog } from './parse.ts'

/** Stable provider id. */
export const CVF_PROVIDER_ID = 'cvf'

/** Resolved official conference catalogs searched by the provider. */
export interface CvfProviderOptions {
  readonly catalogUrls: readonly string[]
}

/** CVF catalog search plus deterministic Open Access PDF resolution. */
export class CvfProvider implements AcademicSourceProvider {
  readonly id = CVF_PROVIDER_ID

  /** Surfaced through `searchAll()`; catalog search never leaves the configured pages. */
  readonly limitations = ['CVF search covers only configured catalog pages and performs no site-wide crawl.']

  /** @param resolveOptions - current configured official conference catalogs. */
  constructor(private readonly resolveOptions: () => CvfProviderOptions) {}

  available(): boolean {
    const urls = this.resolveOptions().catalogUrls
    return urls.length > 0 && urls.every(url => URL.canParse(url))
  }

  search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult> {
    return searchAcademicCatalogs(
      { providerId: this.id, catalogUrls: this.resolveOptions().catalogUrls, parse: parseCvfCatalog },
      request,
      signal,
    )
  }

  fullTextUrls(recordId: string): readonly string[] {
    if (!URL.canParse(recordId)) return []
    const url = new URL(recordId)
    if (url.hostname !== 'openaccess.thecvf.com' || !url.pathname.includes('/html/') || !url.pathname.endsWith('.html')) return []
    url.pathname = url.pathname.replace('/html/', '/papers/').replace(/\.html$/u, '.pdf')
    url.search = ''
    url.hash = ''
    return [url.href]
  }
}
