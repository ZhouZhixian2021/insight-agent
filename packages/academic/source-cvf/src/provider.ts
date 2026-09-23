/** CVF Open Access provider over configured official conference catalogs. */
import type {
  AcademicReference,
  AcademicSourceProvider,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
  AcademicSourceWork,
} from '@deepseek-ai/dsh-academic-source'
import { AcademicSourceError, fetchAcademicPaperPage, normalizeAcademicCatalogRecord,
  parseAcademicPaperCitation, searchAcademicCatalogs } from '@deepseek-ai/dsh-academic-source'

import { parseCvfCatalog } from './parse.ts'

/** Stable provider id. */
export const CVF_PROVIDER_ID = 'cvf'
const CVF_PAGE = /^\/content(?:\/[^/]+(?:\/[^/]+)?|_[^/]+)\/html\/[^/]+_paper\.html$/u

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

  /** Verify one CVF paper against its official landing-page metadata. */
  async verifyReference(reference: AcademicReference, signal?: AbortSignal): Promise<AcademicSourceWork | null> {
    if (reference.kind !== 'provider_record' || reference.provider !== this.id
      || this.fullTextUrls(reference.recordId).length === 0) {
      throw new AcademicSourceError('Invalid CVF paper reference', 'ACADEMIC_SOURCE_INVALID_REQUEST')
    }
    const url = new URL(reference.recordId)
    const html = await fetchAcademicPaperPage(this.id, url, signal)
    if (html === null) return null
    const citation = parseAcademicPaperCitation(html)
    if (citation.pdfUrl !== this.fullTextUrls(reference.recordId)[0]) return null
    return normalizeAcademicCatalogRecord(this.id, { recordId: reference.recordId, title: citation.title,
      authors: citation.authors, year: citation.year, venue: citation.venue, doi: citation.doi })
  }

  fullTextUrls(recordId: string): readonly string[] {
    if (!URL.canParse(recordId)) return []
    const url = new URL(recordId)
    if (url.protocol !== 'https:' || url.hostname !== 'openaccess.thecvf.com' || url.port || url.username
      || url.password || url.search || url.hash || !CVF_PAGE.test(url.pathname)) return []
    url.pathname = url.pathname.replace('/html/', '/papers/').replace(/\.html$/u, '.pdf')
    url.search = ''
    url.hash = ''
    return [url.href]
  }
}
