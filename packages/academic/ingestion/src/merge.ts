/**
 * Version merging and work reconciliation. The canonical record owns the work-level
 * bibliography; the reconciled work unions external identifiers and version ids and selects
 * the canonical version by publication type and, secondarily, by release date.
 * @module @deepseek-ai/dsh-academic-ingestion/merge
 */

import { externalIdentifierDedupKey } from '@deepseek-ai/dsh-academic-model'
import type {
  AcademicWork,
  AcademicWorkId,
  Availability,
  ExternalIdentifier,
  PartialDate,
  WorkVersion,
  WorkVersionId,
  WorkVersionType,
} from '@deepseek-ai/dsh-academic-model'

import type { IngestRecord } from './types.ts'

/** Canonical preference across version types, highest first. */
const VERSION_TYPE_PRIORITY: Readonly<Record<WorkVersionType, number>> = {
  version_of_record: 4,
  corrected: 3,
  accepted_manuscript: 2,
  preprint: 1,
  retracted: 0,
  unknown: 0,
}

/**
 * Selects the canonical version: the highest-priority non-retracted version,
 * tie-broken by the later release date and then ingestion order.
 *
 * @param versions - the versions of one work, already re-pointed at its identity.
 * @returns the selected version id.
 */
export function selectCanonicalVersion(versions: readonly WorkVersion[]): WorkVersionId {
  const nonRetracted = versions.filter(version => version.status !== 'retracted')
  const candidates = nonRetracted.length > 0 ? nonRetracted : versions
  const canonical = candidates.reduce((best, current) => (
    compareVersions(current, best) < 0 ? current : best
  ))
  return canonical.workVersionId
}

/** Re-points one work's records at the assigned identity and returns the merged versions. */
function rewrittenVersions(academicWorkId: AcademicWorkId, records: readonly IngestRecord[]): readonly WorkVersion[] {
  return records.map(record => ({ ...record.workVersion, academicWorkId }))
}

/**
 * Reconciles the records of one work into a single `AcademicWork`: the record whose version
 * is canonical owns title, authors, publication status, and venue; external identifiers and
 * version ids are unions; `firstPublicDate` is the earliest available date.
 *
 * @param academicWorkId - the stable identity already assigned by the index.
 * @param records - the contributing provider records, in ingestion order, non-empty.
 * @returns the reconciled work.
 */
export function reconcileWork(academicWorkId: AcademicWorkId, records: readonly IngestRecord[]): AcademicWork {
  const versions = rewrittenVersions(academicWorkId, records)
  const canonicalRecord = selectCanonicalRecord(records)
  const base = canonicalRecord.academicWork
  return {
    schemaVersion: 1,
    academicWorkId,
    title: base.title,
    authors: base.authors,
    externalIdentifiers: unionIdentifiers(records),
    workVersionIds: versions.map(version => version.workVersionId),
    canonicalVersionId: canonicalRecord.workVersion.workVersionId,
    firstPublicDate: earliestFirstPublicDate(records, base.firstPublicDate),
    publicationStatus: base.publicationStatus,
    venue: base.venue,
  }
}

/** Builds the versions of one work re-pointed at its assigned identity.
 * @param academicWorkId - the assigned stable identity.
 * @param records - the contributing provider records.
 * @returns the versions, each re-pointed at the assigned identity.
 */
export function workVersionsOf(academicWorkId: AcademicWorkId, records: readonly IngestRecord[]): readonly WorkVersion[] {
  return rewrittenVersions(academicWorkId, records)
}

/** Unions external identifiers across records, deduplicating by their exact key. */
function unionIdentifiers(records: readonly IngestRecord[]): readonly ExternalIdentifier[] {
  const seen = new Set<string>()
  const identifiers: ExternalIdentifier[] = []
  for (const record of records) {
    for (const identifier of record.academicWork.externalIdentifiers) {
      const key = externalIdentifierDedupKey(identifier)
      if (seen.has(key)) continue
      seen.add(key)
      identifiers.push(identifier)
    }
  }
  return identifiers
}

/** The record whose version wins canonical selection. */
function selectCanonicalRecord(records: readonly IngestRecord[]): IngestRecord {
  const nonRetracted = records.filter(record => record.workVersion.status !== 'retracted')
  const candidates = nonRetracted.length > 0 ? nonRetracted : records
  return candidates.reduce((best, current) => (
    compareVersions(current.workVersion, best.workVersion) < 0 ? current : best
  ))
}

/** The earliest available publication date, falling back to the canonical record's state. */
function earliestFirstPublicDate(
  records: readonly IngestRecord[],
  fallback: Availability<PartialDate>,
): Availability<PartialDate> {
  let earliest: PartialDate | null = null
  for (const record of records) {
    const date = record.academicWork.firstPublicDate
    if (date.status !== 'available') continue
    if (earliest === null || date.value.iso < earliest.iso) earliest = date.value
  }
  if (earliest === null) return fallback
  return { status: 'available', value: earliest }
}

/** The release date of one version as an ISO string, or `null` when unavailable. */
function isoOf(version: WorkVersion): string | null {
  return version.releaseDate.status === 'available' ? version.releaseDate.value.iso : null
}

/** Negative when `a` outranks `b` for canonical selection, positive when `b` wins, zero on tie. */
function compareVersions(a: WorkVersion, b: WorkVersion): number {
  const priorityA = VERSION_TYPE_PRIORITY[a.versionType]
  const priorityB = VERSION_TYPE_PRIORITY[b.versionType]
  if (priorityA !== priorityB) return priorityB - priorityA
  const isoA = isoOf(a)
  const isoB = isoOf(b)
  if (isoA !== null && isoB !== null && isoA !== isoB) return isoA > isoB ? -1 : 1
  if (isoA !== null && isoB === null) return -1
  if (isoA === null && isoB !== null) return 1
  return 0
}
