/**
 * Academic ingestion: deduplicates provider records into stable work identities and merges
 * their versions. It is a library, not a Cordis service or plugin; the durable mapping record
 * and merge-audit persistence remain a later increment.
 * @module @deepseek-ai/dsh-academic-ingestion
 */

import { createAcademicWorkId } from '@deepseek-ai/dsh-academic-model'
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
 * collisions merge into one work; a title/author/year collision without a shared identifier
 * is reported as a suspected duplicate and never auto-merged; anything else starts a new work.
 *
 * @param index - the current deduplication state (empty from {@link createIngestIndex}).
 * @param records - the provider records to ingest, in order.
 * @returns the updated index, the deduplicated works and versions, and the audit.
 */
export function ingestWorks(index: IngestIndex, records: readonly IngestRecord[]): IngestOutcome {
  const byExactKey = new Map(index.byExactKey)
  const byFuzzyKey = new Map(index.byFuzzyKey)
  const recordsByWork = new Map(index.records)
  const entries: IngestAuditEntry[] = []

  for (const record of records) {
    const keys = dedupKeys(record.academicWork)
    const exactWorkId = firstExactMatch(keys.exact, byExactKey)
    if (exactWorkId !== undefined) {
      mergeVersion(exactWorkId, record, keys.exact, keys.fuzzy, byExactKey, byFuzzyKey, recordsByWork, entries)
      continue
    }
    if (keys.fuzzy !== null && byFuzzyKey.has(keys.fuzzy)) {
      entries.push({
        kind: 'suspected_duplicate',
        academicWorkId: record.academicWork.academicWorkId,
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

  return {
    index: { byExactKey, byFuzzyKey, records: recordsByWork },
    works,
    versions,
    audit: { entries },
  }
}

/** The first exact-key collision in the index, if any. */
function firstExactMatch(
  keys: readonly ExternalIdentifierDedupKey[],
  byExactKey: ReadonlyMap<ExternalIdentifierDedupKey, AcademicWorkId>,
): AcademicWorkId | undefined {
  for (const key of keys) {
    const workId = byExactKey.get(key)
    if (workId !== undefined) return workId
  }
  return undefined
}

/** Appends one record's version to an existing work and registers its keys. */
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
  const existing = recordsByWork.get(workId) ?? []
  const alreadyPresent = existing.some(item => item.workVersion.workVersionId === record.workVersion.workVersionId)
  if (!alreadyPresent) recordsByWork.set(workId, [...existing, record])
  for (const key of exactKeys) byExactKey.set(key, workId)
  if (fuzzyKey !== null && !byFuzzyKey.has(fuzzyKey)) byFuzzyKey.set(fuzzyKey, workId)
  entries.push({ kind: 'merged_version', academicWorkId: workId, workVersionId: record.workVersion.workVersionId })
}
