/** ACL Anthology provider over configured official volume catalogs. */
import type {
  AcademicReference,
  AcademicSourceProvider,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
  AcademicSourceWork,
} from '@deepseek-ai/dsh-academic-source'
import { AcademicSourceError, fetchAcademicPaperPage, normalizeAcademicCatalogRecord,
  parseAcademicPaperCitation, searchAcademicCatalogs } from '@deepseek-ai/dsh-academic-source'

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

  /* jscpd:ignore-start -- ACL and PMLR validate their independently configured official catalogs. */
  available(): boolean {
    const options = this.resolveOptions()
    return URL.canParse(options.baseURL) && options.catalogUrls.length > 0
      && options.catalogUrls.every(url => URL.canParse(url))
  }
  /* jscpd:ignore-end */

  search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult> {
    return searchAcademicCatalogs({ providerId: this.id, catalogUrls: this.resolveOptions().catalogUrls,
      parse: html => parseAclCatalog(html) }, request, signal)
  }

  /** Verify one ACL paper against its official landing-page metadata. */
  async verifyReference(reference: AcademicReference, signal?: AbortSignal): Promise<AcademicSourceWork | null> {
    if (reference.kind !== 'provider_record' || reference.provider !== this.id || this.fullTextUrls(reference.recordId).length === 0) {
      throw new AcademicSourceError('Invalid ACL paper reference', 'ACADEMIC_SOURCE_INVALID_REQUEST')
    }
    const { recordId } = reference
    const url = new URL(`${recordId}/`, `${this.resolveOptions().baseURL.replace(/\/$/u, '')}/`)
    const html = await fetchAcademicPaperPage(this.id, url, signal)
    if (html === null) return null
    const citation = parseAcademicPaperCitation(html)
    if (citation.pdfUrl !== `https://aclanthology.org/${recordId}.pdf`) return null
    return normalizeAcademicCatalogRecord(this.id, { recordId, title: citation.title, authors: citation.authors,
      year: citation.year, venue: citation.venue, doi: citation.doi })
  }

  fullTextUrls(recordId: string): readonly string[] {
    if (!/^(?:\d{4}\.[a-z0-9]+-[a-z0-9]+(?:\.[a-z0-9-]+)+|[A-Z]\d{2}-\d{4}(?:v\d+)?)$/u.test(recordId)) return []
    return [new URL(`${recordId}.pdf`, `${this.resolveOptions().baseURL.replace(/\/$/u, '')}/`).href]
  }
}
