/**
 * Translates one arXiv Atom entry into shared academic-model records. Every arXiv entry is a
 * preprint version: it records no journal venue, preserves the Atom entry's `vN` revision and
 * update date, and carries an optional DOI that lets ingestion merge it with the publisher's version.
 * @module @deepseek-ai/dsh-academic-source-arxiv/normalize
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
} from '@deepseek-ai/dsh-academic-model'

import type { ArxivRawWork, NormalizedArxivWork } from './types.ts'

const ARXIV_PROVIDER = 'arxiv'

/** Strips the arXiv host, preserving the version suffix of a concrete provider record. */
function arxivRecordId(id: string): string {
  return id.replace(/^https?:\/\/arxiv\.org\/abs\//u, '')
}

/** Drops the version suffix so every revision contributes the same work-level key. */
function normalizeArxivId(id: string): string {
  return arxivRecordId(id).replace(/v\d+$/u, '')
}

/** Folds the DOI to a lowercase bare form for cross-provider comparison. */
function normalizeDoi(doi: string): string {
  return doi.trim().replace(/^https:\/\/doi\.org\//u, '').toLowerCase()
}

/** Reads an Atom timestamp as a day-precision date. */
function partialDateFrom(value: string | null, reason: string): Availability<PartialDate> {
  if (value !== null && value.length >= 10) {
    return { status: 'available', value: { iso: value.slice(0, 10), precision: 'day' } }
  }
  return { status: 'unknown', reason }
}

/** Builds the work-level external identifiers carried by one entry. */
function externalIdentifiersFrom(raw: ArxivRawWork): readonly ExternalIdentifier[] {
  const identifiers: ExternalIdentifier[] = [{
    kind: 'arxiv',
    normalizedValue: normalizeArxivId(raw.id),
    originalValue: raw.id,
    sourceProvider: ARXIV_PROVIDER,
  }]
  if (raw.doi !== null) {
    identifiers.push({
      kind: 'doi',
      normalizedValue: normalizeDoi(raw.doi),
      originalValue: raw.doi,
      sourceProvider: ARXIV_PROVIDER,
    })
  }
  return identifiers
}

/** Every arXiv entry is a preprint version. */
function publicationStatus(): Availability<PublicationStatus> {
  return { status: 'available', value: 'preprint' }
}

/**
 * Translates one arXiv Atom entry into shared academic-model records.
 *
 * @param raw - the distilled arXiv entry to translate.
 * @returns the work and its single preprint version, sharing fresh internal ids.
 */
export function normalizeArxivWork(raw: ArxivRawWork): NormalizedArxivWork {
  const academicWorkId = createAcademicWorkId()
  const workVersionId = createWorkVersionId()
  const firstPublicDate = partialDateFrom(raw.published, 'arXiv entry carries no publication timestamp.')
  const recordId = arxivRecordId(raw.id)
  const version = recordId.match(/v\d+$/u)?.[0]
  const versionIdentifier: ExternalIdentifier = {
    kind: 'arxiv',
    normalizedValue: recordId,
    originalValue: raw.id,
    sourceProvider: ARXIV_PROVIDER,
  }
  const academicWork: AcademicWork = {
    schemaVersion: 1,
    academicWorkId,
    title: raw.title,
    authors: [...raw.authors],
    externalIdentifiers: externalIdentifiersFrom(raw),
    workVersionIds: [workVersionId],
    canonicalVersionId: workVersionId,
    firstPublicDate,
    publicationStatus: publicationStatus(),
    venue: { status: 'unknown', reason: 'arXiv entry names no journal venue.' },
  }
  const workVersion: WorkVersion = {
    schemaVersion: 1,
    workVersionId,
    academicWorkId,
    versionType: 'preprint',
    versionLabel: version === undefined
      ? { status: 'unknown', reason: 'arXiv entry id carries no version suffix.' }
      : { status: 'available', value: version },
    releaseDate: partialDateFrom(raw.updated ?? raw.published, 'arXiv entry carries no update or publication timestamp.'),
    externalIdentifiers: [versionIdentifier],
    sourceRecords: [{ provider: ARXIV_PROVIDER, recordId }],
    contentHash: { status: 'not_extracted', reason: 'Fulltext content hashing arrives with the evidence increment.' },
    supersedesWorkVersionId: null,
    status: 'active',
  }
  return { academicWork, workVersion }
}
