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

import type { NormalizedOpenAlexWork, OpenAlexRawWork } from './types.ts'

const OPENALEX_PROVIDER = 'openalex'

/** Strips the OpenAlex DOI host prefix and folds case for comparison. */
function normalizeDoi(doiUrl: string): string {
  return doiUrl.replace(/^https:\/\/doi\.org\//u, '').toLowerCase()
}

/** Strips the OpenAlex record host prefix, leaving the bare record id. */
function normalizeOpenalexId(recordId: string): string {
  return recordId.replace(/^https:\/\/openalex\.org\//u, '')
}

/** Collects the display author names, skipping unnamed authorship rows. */
function authorsFrom(raw: OpenAlexRawWork): readonly string[] {
  return raw.authorships
    .map(authorship => authorship.author.display_name)
    .filter((authorName): authorName is string => authorName !== null)
}

/** Builds the work-level external identifiers carried by one record. */
function externalIdentifiersFrom(raw: OpenAlexRawWork): readonly ExternalIdentifier[] {
  const identifiers: ExternalIdentifier[] = [{
    kind: 'openalex',
    normalizedValue: normalizeOpenalexId(raw.id),
    originalValue: raw.id,
    sourceProvider: OPENALEX_PROVIDER,
  }]
  if (raw.doi !== null) {
    identifiers.push({
      kind: 'doi',
      normalizedValue: normalizeDoi(raw.doi),
      originalValue: raw.doi,
      sourceProvider: OPENALEX_PROVIDER,
    })
  }
  return identifiers
}

/** Reads the release date, keeping the precision OpenAlex actually provided. */
function partialDateFrom(raw: OpenAlexRawWork): Availability<PartialDate> {
  if (raw.publication_date !== null) {
    return { status: 'available', value: { iso: raw.publication_date, precision: 'day' } }
  }
  if (raw.publication_year !== null) {
    return { status: 'available', value: { iso: String(raw.publication_year), precision: 'year' } }
  }
  return { status: 'unknown', reason: 'OpenAlex record carries no publication date or year.' }
}

/** Maps retraction and OpenAlex type onto the shared publication status. */
function publicationStatusFrom(raw: OpenAlexRawWork): Availability<PublicationStatus> {
  if (raw.is_retracted === true) {
    return { status: 'available', value: 'retracted' }
  }
  if (raw.type === 'article') {
    return { status: 'available', value: 'published' }
  }
  if (raw.type === 'preprint') {
    return { status: 'available', value: 'preprint' }
  }
  return { status: 'unknown', reason: 'OpenAlex record type has no publication-status mapping.' }
}

/** Maps retraction and OpenAlex type onto the shared version type. */
function versionTypeFrom(raw: OpenAlexRawWork): WorkVersionType {
  if (raw.is_retracted === true) {
    return 'retracted'
  }
  if (raw.type === 'preprint') {
    return 'preprint'
  }
  if (raw.type === 'article') {
    return 'version_of_record'
  }
  return 'unknown'
}

/** Reads the venue from the primary location, when the record names one. */
function venueFrom(raw: OpenAlexRawWork): Availability<string> {
  const source = raw.primary_location === null ? null : raw.primary_location.source
  const displayName = source === null ? null : source.display_name
  if (displayName === null) {
    return { status: 'unknown', reason: 'OpenAlex record names no primary venue.' }
  }
  return { status: 'available', value: displayName }
}

/** Maps retraction onto the shared work-version status. */
function versionStatusFrom(raw: OpenAlexRawWork): WorkVersion['status'] {
  return raw.is_retracted === true ? 'retracted' : 'active'
}

/**
 * Translates one OpenAlex work record into shared academic-model records.
 *
 * Each record becomes one new work identity with one immutable version;
 * cross-record version linking and deduplication belong to the ingestion
 * increment.
 *
 * @param raw - OpenAlex `/works` record subset to translate.
 * @returns The work and its single version, sharing fresh internal ids.
 */
export function normalizeOpenAlexWork(raw: OpenAlexRawWork): NormalizedOpenAlexWork {
  const academicWorkId = createAcademicWorkId()
  const workVersionId = createWorkVersionId()
  const academicWork: AcademicWork = {
    schemaVersion: 1,
    academicWorkId,
    title: raw.display_name,
    authors: authorsFrom(raw),
    externalIdentifiers: externalIdentifiersFrom(raw),
    workVersionIds: [workVersionId],
    canonicalVersionId: workVersionId,
    firstPublicDate: partialDateFrom(raw),
    publicationStatus: publicationStatusFrom(raw),
    venue: venueFrom(raw),
  }
  const workVersion: WorkVersion = {
    schemaVersion: 1,
    workVersionId,
    academicWorkId,
    versionType: versionTypeFrom(raw),
    versionLabel: { status: 'unknown', reason: 'OpenAlex records do not carry a version label.' },
    releaseDate: partialDateFrom(raw),
    externalIdentifiers: [],
    sourceRecords: [{ provider: OPENALEX_PROVIDER, recordId: raw.id }],
    contentHash: { status: 'not_extracted', reason: 'Fulltext content hashing arrives with the evidence increment.' },
    supersedesWorkVersionId: null,
    status: versionStatusFrom(raw),
  }
  return { academicWork, workVersion }
}
