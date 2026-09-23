/** Shared catalog-page search and normalization for HTML-backed academic sources. */
import {
  createAcademicWorkId,
  createWorkVersionId,
  type ExternalIdentifier,
  type PartialDate,
} from '@deepseek-ai/dsh-academic-model'

import { AcademicSourceError } from './types.ts'
import type {
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
  AcademicSourceWork,
} from './types.ts'

const USER_AGENT = 'deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)'

/** Provider-neutral metadata distilled from one official conference or volume page. */
export interface AcademicCatalogRecord {
  readonly recordId: string
  readonly title: string
  readonly authors: readonly string[]
  readonly year: string | null
  readonly venue: string | null
  readonly doi: string | null
  readonly searchText?: string
}

/** Inputs shared by catalog-backed providers. */
export interface AcademicCatalogSearchOptions {
  readonly providerId: string
  readonly catalogUrls: readonly string[]
  readonly parse: (html: string, catalogUrl: URL) => readonly AcademicCatalogRecord[]
}

/** Metadata published on one official paper page. */
export interface AcademicPaperCitation {
  readonly title: string
  readonly authors: readonly string[]
  readonly year: string | null
  readonly venue: string | null
  readonly doi: string | null
  readonly pdfUrl: string | null
  readonly abstractUrl: string | null
}

/**
 * Fetch one official paper page; a missing record resolves to null.
 * @param providerId - source owning the requested paper.
 * @param url - validated official paper-page URL.
 * @param signal - optional caller cancellation.
 * @returns page HTML or null for HTTP 404.
 */
export async function fetchAcademicPaperPage(providerId: string, url: URL, signal?: AbortSignal): Promise<string | null> {
  signal?.throwIfAborted()
  try {
    const response = await fetch(url, { redirect: 'error', headers: { accept: 'text/html', 'user-agent': USER_AGENT },
      ...signal === undefined ? {} : { signal } })
    if (response.status === 404) { await response.body?.cancel(); return null }
    if (!response.ok) {
      await response.body?.cancel()
      throw new AcademicSourceError(`${providerId} paper request returned HTTP ${response.status}`,
        response.status === 429 ? 'ACADEMIC_SOURCE_RATE_LIMIT' : 'ACADEMIC_SOURCE_PROVIDER_ERROR')
    }
    return await response.text()
  } catch (error: unknown) {
    if (signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new AcademicSourceError(`${providerId} paper request aborted`, 'ACADEMIC_SOURCE_ABORTED', { cause: error })
    }
    if (error instanceof AcademicSourceError) throw error
    throw new AcademicSourceError(`${providerId} paper request failed`, 'ACADEMIC_SOURCE_NETWORK_ERROR', { cause: error })
  }
}

/**
 * Read citation metadata from one official paper page.
 * @param html - official paper-page HTML.
 * @returns title, authors, date, venue, DOI, and page-provided URLs.
 */
export function parseAcademicPaperCitation(html: string): AcademicPaperCitation {
  const fields = new Map<string, string[]>()
  for (const tag of html.matchAll(/<meta\b[^>]*>/giu)) {
    const attributes = new Map<string, string>()
    for (const match of tag[0].matchAll(/([a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu)) {
      attributes.set((match[1] as string).toLowerCase(), academicCatalogHtmlText((match[2] ?? match[3] ?? match[4]) as string))
    }
    const name = attributes.get('name')?.toLowerCase()
    const value = attributes.get('content')
    if (name?.startsWith('citation_') && value !== undefined) {
      fields.set(name, [...(fields.get(name) ?? []), value])
    }
  }
  const first = (name: string): string | null => fields.get(name)?.[0] || null
  const title = first('citation_title')
  const authors = fields.get('citation_author')?.filter(Boolean) ?? []
  if (title === null || authors.length === 0) {
    throw new AcademicSourceError('Official paper page has no title or authors', 'ACADEMIC_SOURCE_PARSE_ERROR')
  }
  const year = first('citation_publication_date')?.match(/^(?:19|20)\d{2}/u)?.[0] ?? null
  return { title, authors, year,
    venue: first('citation_conference_title') ?? first('citation_journal_title') ?? first('citation_inbook_title'),
    doi: first('citation_doi'), pdfUrl: first('citation_pdf_url'),
    abstractUrl: first('citation_abstract_html_url') }
}

/**
 * Fetch configured official catalog pages, filter them by all query terms, and normalize matches.
 * @param options - provider id, catalog URLs, and the provider-specific page parser.
 * @param request - query and optional provider-level result bound.
 * @param signal - optional cancellation forwarded to every fetch.
 * @returns normalized records in catalog order.
 */
export async function searchAcademicCatalogs(
  options: AcademicCatalogSearchOptions,
  request: AcademicSourceSearchRequest,
  signal?: AbortSignal,
): Promise<AcademicSourceSearchResult> {
  const pages = await Promise.all(options.catalogUrls.map(url => fetchCatalog(options.providerId, url, signal)))
  const terms = normalizedTerms(request.query)
  const records: AcademicCatalogRecord[] = []
  const seen = new Set<string>()
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index] as string
    const catalogUrl = new URL(options.catalogUrls[index] as string)
    for (const record of options.parse(page, catalogUrl)) {
      if (seen.has(record.recordId) || !matches(record, terms)) continue
      seen.add(record.recordId)
      records.push(record)
    }
  }
  const selected = request.maxResults === undefined ? records : records.slice(0, request.maxResults)
  return {
    works: selected.map(record => normalizeAcademicCatalogRecord(options.providerId, record)),
    truncated: selected.length < records.length,
  }
}

/**
 * Translate one distilled published record into the shared work/version model.
 * @param providerId - provider that owns the record.
 * @param record - distilled official catalog metadata.
 * @returns one published work and version pair.
 */
export function normalizeAcademicCatalogRecord(
  providerId: string,
  record: AcademicCatalogRecord,
): AcademicSourceWork {
  const academicWorkId = createAcademicWorkId()
  const workVersionId = createWorkVersionId()
  const providerIdentifier: ExternalIdentifier = {
    kind: 'provider_record',
    normalizedValue: `${providerId}:${record.recordId}`,
    originalValue: record.recordId,
    sourceProvider: providerId,
  }
  const identifiers: ExternalIdentifier[] = [providerIdentifier]
  if (record.doi !== null) {
    identifiers.push({
      kind: 'doi',
      normalizedValue: normalizeDoi(record.doi),
      originalValue: record.doi,
      sourceProvider: providerId,
    })
  }
  const releaseDate = yearAvailability(record.year, `${providerId} catalog record carries no publication year.`)
  return {
    academicWork: {
      schemaVersion: 1,
      academicWorkId,
      title: record.title,
      authors: [...record.authors],
      externalIdentifiers: identifiers,
      workVersionIds: [workVersionId],
      canonicalVersionId: workVersionId,
      firstPublicDate: releaseDate,
      publicationStatus: { status: 'available', value: 'published' },
      venue: record.venue === null
        ? { status: 'unknown', reason: `${providerId} catalog record carries no venue.` }
        : { status: 'available', value: record.venue },
    },
    workVersion: {
      schemaVersion: 1,
      workVersionId,
      academicWorkId,
      versionType: 'version_of_record',
      versionLabel: { status: 'available', value: record.recordId },
      releaseDate,
      externalIdentifiers: identifiers,
      sourceRecords: [{ provider: providerId, recordId: record.recordId }],
      contentHash: { status: 'not_extracted', reason: 'Full text has not been fetched.' },
      supersedesWorkVersionId: null,
      status: 'active',
    },
  }
}

/**
 * Convert a small HTML fragment to plain text for provider parsers.
 * @param html - trusted provider response fragment.
 * @returns decoded, whitespace-collapsed text.
 */
export function academicCatalogHtmlText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/&#(\d+);/gu, (entity, code: string) => {
      const point = Number(code)
      return Number.isSafeInteger(point) && point <= 0x10FFFF ? String.fromCodePoint(point) : entity
    })
    .replace(/\s+/gu, ' ')
    .trim()
}

async function fetchCatalog(providerId: string, url: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  try {
    const response = await fetch(new URL(url), {
      headers: { 'user-agent': USER_AGENT, 'accept': 'text/html' },
      ...signal === undefined ? {} : { signal },
    })
    if (!response.ok) {
      throw new AcademicSourceError(
        `${providerId} catalog request failed (HTTP ${response.status})`,
        'ACADEMIC_SOURCE_PROVIDER_ERROR',
      )
    }
    return await response.text()
  } catch (error: unknown) {
    if (error instanceof AcademicSourceError) throw error
    if (signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new AcademicSourceError(`${providerId} search aborted`, 'ACADEMIC_SOURCE_ABORTED', { cause: error })
    }
    throw new AcademicSourceError(
      `${providerId} catalog request failed: ${String(error)}`,
      'ACADEMIC_SOURCE_PROVIDER_ERROR',
      { cause: error },
    )
  }
}

function normalizedTerms(query: string): readonly string[] {
  return query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

function matches(record: AcademicCatalogRecord, terms: readonly string[]): boolean {
  const text = `${record.title} ${record.authors.join(' ')} ${record.venue ?? ''} ${record.searchText ?? ''}`.toLowerCase()
  return terms.every(term => text.includes(term))
}

function normalizeDoi(doi: string): string {
  return doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '').toLowerCase()
}

function yearAvailability(year: string | null, reason: string) {
  if (year !== null && /^\d{4}$/u.test(year)) {
    const value: PartialDate = { iso: year, precision: 'year' }
    return { status: 'available' as const, value }
  }
  return { status: 'unknown' as const, reason }
}
