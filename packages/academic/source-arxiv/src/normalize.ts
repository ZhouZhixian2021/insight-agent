/**
 * Translates one arXiv Atom entry into shared academic-model records. Every arXiv entry is a
 * preprint version: it records no journal venue and carries an `arxiv` external identifier plus
 * an optional `doi` that lets ingestion merge it with the publisher's version.
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

/** Strips the arXiv host and version suffix, leaving the bare archive id. */
function normalizeArxivId(id: string): string {
  return id.replace(/^https?:\/\/arxiv\.org\/abs\//u, '').replace(/v\d+$/u, '')
}

/** Folds the DOI to a lowercase bare form for cross-provider comparison. */
function normalizeDoi(doi: string): string {
  return doi.trim().replace(/^https:\/\/doi\.org\//u, '').toLowerCase()
}

/** Reads the `<published>` timestamp as a day-precision date. */
function partialDateFrom(raw: ArxivRawWork): Availability<PartialDate> {
  if (raw.published !== null && raw.published.length >= 10) {
    return { status: 'available', value: { iso: raw.published.slice(0, 10), precision: 'day' } }
  }
  return { status: 'unknown', reason: 'arXiv entry carries no publication timestamp.' }
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
  const date = partialDateFrom(raw)
  const academicWork: AcademicWork = {
    schemaVersion: 1,
    academicWorkId,
    title: raw.title,
    authors: [...raw.authors],
    externalIdentifiers: externalIdentifiersFrom(raw),
    workVersionIds: [workVersionId],
    canonicalVersionId: workVersionId,
    firstPublicDate: date,
    publicationStatus: publicationStatus(),
    venue: { status: 'unknown', reason: 'arXiv entry names no journal venue.' },
  }
  const workVersion: WorkVersion = {
    schemaVersion: 1,
    workVersionId,
    academicWorkId,
    versionType: 'preprint',
    versionLabel: { status: 'unknown', reason: 'arXiv entries do not carry a version label.' },
    releaseDate: date,
    externalIdentifiers: [],
    sourceRecords: [{ provider: ARXIV_PROVIDER, recordId: normalizeArxivId(raw.id) }],
    contentHash: { status: 'not_extracted', reason: 'Fulltext content hashing arrives with the evidence increment.' },
    supersedesWorkVersionId: null,
    status: 'active',
  }
  return { academicWork, workVersion }
}
