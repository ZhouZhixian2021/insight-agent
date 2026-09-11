/**
 * Translates one Crossref `/works` record into shared academic-model records. Each record
 * becomes one new work identity with one immutable version; cross-record version linking and
 * deduplication belong to ingestion.
 * @module @deepseek-ai/dsh-academic-source-crossref/normalize
 */

import {
  createAcademicWorkId,
  createWorkVersionId,
  type AcademicWork,
  type Availability,
  type ExternalIdentifier,
  type PartialDate,
  type PublicationStatus,
  type WorkVersion,
  type WorkVersionType,
} from '@deepseek-ai/dsh-academic-model'

import type { NormalizedCrossrefWork, CrossrefRawWork } from './types.ts'

const CROSSREF_PROVIDER = 'crossref'

/** Folds the DOI to a lowercase bare form for cross-provider comparison. */
function normalizeDoi(doi: string): string {
  return doi.trim().replace(/^https:\/\/doi\.org\//u, '').toLowerCase()
}

/** Collects display author names, skipping unnamed authorship rows. */
function authorsFrom(raw: CrossrefRawWork): readonly string[] {
  return (raw.author ?? [])
    .map(author => [author.name, [author.given, author.family].filter(Boolean).join(' ')].find(name => (name ?? '').trim().length > 0))
    .filter((authorName): authorName is string => authorName !== undefined)
}

/** Builds the work-level external identifiers carried by one record. */
function externalIdentifiersFrom(raw: CrossrefRawWork): readonly ExternalIdentifier[] {
  return [{ kind: 'doi', normalizedValue: normalizeDoi(raw.DOI), originalValue: raw.DOI, sourceProvider: CROSSREF_PROVIDER }]
}

/** Reads the earliest available Crossref publication date, keeping its precision. */
function partialDateFrom(raw: CrossrefRawWork): Availability<PartialDate> {
  const date = raw.published ?? raw['published-print'] ?? raw['published-online']
  const parts = date?.['date-parts']?.[0]
  if (parts !== undefined && parts.length > 0) {
    const [year, month, day] = parts
    if (year !== undefined && day !== undefined && month !== undefined) {
      return { status: 'available', value: { iso: `${year}-${pad(month)}-${pad(day)}`, precision: 'day' } }
    }
    if (year !== undefined && month !== undefined) {
      return { status: 'available', value: { iso: `${year}-${pad(month)}`, precision: 'month' } }
    }
    if (year !== undefined) {
      return { status: 'available', value: { iso: String(year), precision: 'year' } }
    }
  }
  return { status: 'unknown', reason: 'Crossref record carries no publication date.' }
}

/** Maps the Crossref type onto the shared publication status. */
function publicationStatusFrom(raw: CrossrefRawWork): Availability<PublicationStatus> {
  if (raw.type === 'posted-content') {
    return { status: 'available', value: 'preprint' }
  }
  if (METADATA_TYPES.includes(raw.type ?? '')) {
    return { status: 'available', value: 'published' }
  }
  return { status: 'unknown', reason: 'Crossref record type has no publication-status mapping.' }
}

/** Crossref types whose records are (or index) formally published works. */
const METADATA_TYPES: readonly string[] = [
  'journal-article',
  'proceedings-article',
  'book-chapter',
  'book',
  'reference-entry',
]

/** Maps the Crossref type onto the shared version type. */
function versionTypeFrom(raw: CrossrefRawWork): WorkVersionType {
  if (raw.type === 'posted-content') return 'preprint'
  if (METADATA_TYPES.includes(raw.type ?? '')) return 'version_of_record'
  return 'unknown'
}

/** Reads the venue from the first container title, when present. */
function venueFrom(raw: CrossrefRawWork): Availability<string> {
  const container = raw['container-title']?.[0]
  if (container === undefined || container.trim().length === 0) {
    return { status: 'unknown', reason: 'Crossref record names no container title.' }
  }
  return { status: 'available', value: container }
}

/** Left-pads a month or day component. */
function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Translates one Crossref work record into shared academic-model records.
 *
 * @param raw - Crossref `/works` record subset to translate.
 * @returns the work and its single version, sharing fresh internal ids.
 */
export function normalizeCrossrefWork(raw: CrossrefRawWork): NormalizedCrossrefWork {
  const academicWorkId = createAcademicWorkId()
  const workVersionId = createWorkVersionId()
  const date = partialDateFrom(raw)
  const academicWork: AcademicWork = {
    schemaVersion: 1,
    academicWorkId,
    title: raw.title?.[0] ?? '',
    authors: authorsFrom(raw),
    externalIdentifiers: externalIdentifiersFrom(raw),
    workVersionIds: [workVersionId],
    canonicalVersionId: workVersionId,
    firstPublicDate: date,
    publicationStatus: publicationStatusFrom(raw),
    venue: venueFrom(raw),
  }
  const workVersion: WorkVersion = {
    schemaVersion: 1,
    workVersionId,
    academicWorkId,
    versionType: versionTypeFrom(raw),
    versionLabel: { status: 'unknown', reason: 'Crossref records do not carry a version label.' },
    releaseDate: date,
    externalIdentifiers: [],
    sourceRecords: [{ provider: CROSSREF_PROVIDER, recordId: raw.DOI }],
    contentHash: { status: 'not_extracted', reason: 'Fulltext content hashing arrives with the evidence increment.' },
    supersedesWorkVersionId: null,
    status: 'active',
  }
  return { academicWork, workVersion }
}
