/** PMLR provider over configured official volume catalogs. */
import type {
  AcademicReference,
  AcademicSourceProvider,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
  AcademicSourceWork,
} from '@deepseek-ai/dsh-academic-source'
import { AcademicSourceError, fetchAcademicPaperPage, normalizeAcademicCatalogRecord,
  parseAcademicPaperCitation, searchAcademicCatalogs } from '@deepseek-ai/dsh-academic-source'

import { parsePmlrCatalog } from './parse.ts'

/** Stable provider id. */
export const PMLR_PROVIDER_ID = 'pmlr'
/** Official PMLR site base. */
export const PMLR_DEFAULT_BASE_URL = 'https://proceedings.mlr.press'

/** Resolved PMLR volume options. */
export interface PmlrProviderOptions {
  readonly baseURL: string
  readonly catalogUrls: readonly string[]
  readonly maxCachedRecords: number
}

/** PMLR volume search and canonical PDF resolution. */
export class PmlrProvider implements AcademicSourceProvider {
  readonly id = PMLR_PROVIDER_ID
  private readonly verifiedUrls = new Map<string, readonly string[]>()

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

  /** Verify one PMLR paper against its official landing-page metadata. */
  async verifyReference(reference: AcademicReference, signal?: AbortSignal): Promise<AcademicSourceWork | null> {
    if (reference.kind !== 'provider_record' || reference.provider !== this.id
      || !/^(v\d+)\/([a-z0-9][a-z0-9._-]*)$/iu.test(reference.recordId)) {
      throw new AcademicSourceError('Invalid PMLR paper reference', 'ACADEMIC_SOURCE_INVALID_REQUEST')
    }
    const { recordId } = reference
    const url = new URL(`${recordId}.html`, `${this.resolveOptions().baseURL.replace(/\/$/u, '')}/`)
    const html = await fetchAcademicPaperPage(this.id, url, signal)
    if (html === null) return null
    const citation = parseAcademicPaperCitation(html)
    if (citation.abstractUrl !== url.href) return null
    const pdf = citation.pdfUrl === null ? null : URL.canParse(citation.pdfUrl) ? new URL(citation.pdfUrl) : null
    const urls = pdf?.protocol === 'https:' && !pdf.username && !pdf.password ? [pdf.href] : []
    this.verifiedUrls.delete(recordId)
    this.verifiedUrls.set(recordId, urls)
    while (this.verifiedUrls.size > this.resolveOptions().maxCachedRecords) {
      this.verifiedUrls.delete(this.verifiedUrls.keys().next().value as string)
    }
    return normalizeAcademicCatalogRecord(this.id, { recordId, title: citation.title, authors: citation.authors,
      year: citation.year, venue: citation.venue, doi: citation.doi })
  }

  fullTextUrls(recordId: string): readonly string[] {
    const verified = this.verifiedUrls.get(recordId)
    if (verified !== undefined) return verified
    const match = recordId.match(/^(v\d+)\/([a-z0-9][a-z0-9._-]*)$/iu)
    if (match === null) return []
    const baseURL = this.resolveOptions().baseURL.replace(/\/$/u, '')
    return [`${baseURL}/${match[1]}/${match[2]}/${match[2]}.pdf`]
  }
}
