/**
 * Academic ingestion: deduplicates provider records into stable work identities and merges
 * their versions. It is a library, not a Cordis service or plugin; the durable mapping record
 * and merge-audit persistence remain a later increment.
 * @module @deepseek-ai/dsh-academic-ingestion
 */

import { createAcademicWorkId, externalIdentifierDedupKey } from '@deepseek-ai/dsh-academic-model'
import type { AcademicWorkId, ExternalIdentifierDedupKey } from '@deepseek-ai/dsh-academic-model'

import { dedupKeys } from './dedup.ts'
import { reconcileWork, workVersionsOf } from './merge.ts'
import type { IngestAuditEntry, IngestIndex, IngestOutcome, IngestRecord } from './types.ts'

export { dedupKeys } from './dedup.ts'
export { reconcileWork, selectCanonicalVersion, workVersionsOf } from './merge.ts'
export type {
  IngestAudit,
  IngestAuditEntry,
  IngestIndex,
  IngestOutcome,
  IngestRecord,
  WorkDedupKeys,
} from './types.ts'

/** Creates an empty deduplication index.
 * @returns an empty index with no assigned keys or records.
 */
export function createIngestIndex(): IngestIndex {
  return {
    byExactKey: new Map(),
    byFuzzyKey: new Map(),
    records: new Map(),
  }
}

/**
 * Deduplicates one batch of provider records into the index. Exact external-identifier
 * collisions merge into one work, including identities bridged by different exact keys; a
 * title/author/year collision without a shared identifier is reported and retained separately.
 *
 * @param index - the current deduplication state (empty from {@link createIngestIndex}).
 * @param records - the provider records to ingest, in order.
 * @returns the updated index, deduplicated works and versions, verified Web discoveries, and audit.
 */
export function ingestWorks(index: IngestIndex, records: readonly IngestRecord[]): IngestOutcome {
  const byExactKey = new Map(index.byExactKey)
  const byFuzzyKey = new Map(index.byFuzzyKey)
  const recordsByWork = new Map(index.records)
  const entries: IngestAuditEntry[] = []

  for (const record of records) {
    const keys = dedupKeys(record.academicWork)
    const matchedWorkIds = exactMatches(keys.exact, byExactKey)
    const [exactWorkId, ...duplicateWorkIds] = [...recordsByWork.keys()].filter(workId => matchedWorkIds.has(workId))
    if (exactWorkId !== undefined) {
      for (const duplicateWorkId of duplicateWorkIds) {
        mergeWorkIdentity(exactWorkId, duplicateWorkId, byExactKey, byFuzzyKey, recordsByWork, entries)
      }
      mergeVersion(exactWorkId, record, keys.exact, keys.fuzzy, byExactKey, byFuzzyKey, recordsByWork, entries)
      continue
    }
    if (keys.fuzzy !== null && byFuzzyKey.has(keys.fuzzy)) {
      const workId = createAcademicWorkId()
      recordsByWork.set(workId, [record])
      for (const key of keys.exact) byExactKey.set(key, workId)
      entries.push({
        kind: 'suspected_duplicate',
        academicWorkId: workId,
        existingAcademicWorkId: byFuzzyKey.get(keys.fuzzy) as AcademicWorkId,
        reason: 'title/author/year matches an already-ingested work without a shared external identifier',
      })
      continue
    }
    const workId = createAcademicWorkId()
    recordsByWork.set(workId, [record])
    for (const key of keys.exact) byExactKey.set(key, workId)
    if (keys.fuzzy !== null) byFuzzyKey.set(keys.fuzzy, workId)
    entries.push({ kind: 'new_work', academicWorkId: workId })
  }

  const works = [...recordsByWork].map(([workId, workRecords]) => reconcileWork(workId, workRecords))
  const versions = [...recordsByWork].flatMap(([workId, workRecords]) => workVersionsOf(workId, workRecords))
  const verifiedDiscoveries = [...recordsByWork].flatMap(([academicWorkId, workRecords]) => workRecords.flatMap(
    record => (record.verifiedDiscoveries ?? []).map(discovery => ({
      ...discovery,
      academicWorkId,
      workVersionId: record.workVersion.workVersionId,
    })),
  ))

  return {
    index: { byExactKey, byFuzzyKey, records: recordsByWork },
    works,
    versions,
    verifiedDiscoveries,
    audit: { entries },
  }
}

/** Every distinct work identity matched by the record's exact keys. */
function exactMatches(
  keys: readonly ExternalIdentifierDedupKey[],
  byExactKey: ReadonlyMap<ExternalIdentifierDedupKey, AcademicWorkId>,
): ReadonlySet<AcademicWorkId> {
  const matches = new Set<AcademicWorkId>()
  for (const key of keys) {
    const workId = byExactKey.get(key)
    if (workId !== undefined) matches.add(workId)
  }
  return matches
}

/** Consolidates a second exact-match identity into the first and rewires every index key. */
function mergeWorkIdentity(
  workId: AcademicWorkId,
  duplicateWorkId: AcademicWorkId,
  byExactKey: Map<ExternalIdentifierDedupKey, AcademicWorkId>,
  byFuzzyKey: Map<string, AcademicWorkId>,
  recordsByWork: Map<AcademicWorkId, readonly IngestRecord[]>,
  entries: IngestAuditEntry[],
): void {
  const existing = recordsByWork.get(workId) as readonly IngestRecord[]
  const duplicate = recordsByWork.get(duplicateWorkId) as readonly IngestRecord[]
  recordsByWork.set(workId, duplicate.reduce(appendRecord, existing))
  recordsByWork.delete(duplicateWorkId)
  for (const [key, id] of byExactKey) if (id === duplicateWorkId) byExactKey.set(key, workId)
  for (const [key, id] of byFuzzyKey) if (id === duplicateWorkId) byFuzzyKey.set(key, workId)
  entries.push({ kind: 'merged_work', academicWorkId: workId, mergedAcademicWorkId: duplicateWorkId })
}

/** Registers one record's keys and appends its version unless provider provenance repeats one already stored. */
function mergeVersion(
  workId: AcademicWorkId,
  record: IngestRecord,
  exactKeys: readonly ExternalIdentifierDedupKey[],
  fuzzyKey: string | null,
  byExactKey: Map<ExternalIdentifierDedupKey, AcademicWorkId>,
  byFuzzyKey: Map<string, AcademicWorkId>,
  recordsByWork: Map<AcademicWorkId, readonly IngestRecord[]>,
  entries: IngestAuditEntry[],
): void {
  const existing = recordsByWork.get(workId) as readonly IngestRecord[]
  const matchedVersion = matchingVersion(existing, record)
  recordsByWork.set(workId, appendRecord(existing, record))
  for (const key of exactKeys) byExactKey.set(key, workId)
  if (fuzzyKey !== null && !byFuzzyKey.has(fuzzyKey)) byFuzzyKey.set(fuzzyKey, workId)
  entries.push({
    kind: 'merged_version',
    academicWorkId: workId,
    workVersionId: matchedVersion?.workVersion.workVersionId ?? record.workVersion.workVersionId,
  })
}

/** Retains new identifiers and verified discoveries when a provider record repeats an existing version. */
function appendRecord(records: readonly IngestRecord[], record: IngestRecord): readonly IngestRecord[] {
  const matched = matchingVersion(records, record)
  if (matched === undefined) return [...records, record]
  const workIdentifiers = uniqueBy([
    ...matched.academicWork.externalIdentifiers, ...record.academicWork.externalIdentifiers,
  ], externalIdentifierDedupKey)
  const versionIdentifiers = uniqueBy([
    ...matched.workVersion.externalIdentifiers, ...record.workVersion.externalIdentifiers,
  ], externalIdentifierDedupKey)
  const sourceRecords = uniqueBy([
    ...matched.workVersion.sourceRecords, ...record.workVersion.sourceRecords,
  ], source => JSON.stringify([source.provider, source.recordId]))
  const verifiedDiscoveries = uniqueBy([
    ...(matched.verifiedDiscoveries ?? []), ...(record.verifiedDiscoveries ?? []),
  ], discovery => JSON.stringify([discovery.discoveryUrl, discovery.verificationProvider]))
  if (workIdentifiers.length === matched.academicWork.externalIdentifiers.length
    && versionIdentifiers.length === matched.workVersion.externalIdentifiers.length
    && sourceRecords.length === matched.workVersion.sourceRecords.length
    && verifiedDiscoveries.length === (matched.verifiedDiscoveries?.length ?? 0)) return records
  return records.map(existing => existing === matched ? {
    ...existing,
    academicWork: { ...existing.academicWork, externalIdentifiers: workIdentifiers },
    workVersion: { ...existing.workVersion, externalIdentifiers: versionIdentifiers, sourceRecords },
    verifiedDiscoveries,
  } : existing)
}

/** Keep the first record for each exact key. */
function uniqueBy<T>(values: readonly T[], keyOf: (value: T) => string): readonly T[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = keyOf(value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Finds a record that repeats an internal id or provider-owned version record. */
function matchingVersion(records: readonly IngestRecord[], record: IngestRecord): IngestRecord | undefined {
  return records.find(existing => (
    existing.workVersion.workVersionId === record.workVersion.workVersionId
    || existing.workVersion.sourceRecords.some(left => record.workVersion.sourceRecords.some(
      right => left.provider === right.provider && left.recordId === right.recordId,
    ))
  ))
}
