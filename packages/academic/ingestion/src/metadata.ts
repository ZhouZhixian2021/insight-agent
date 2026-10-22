/** Preserve scholarly metadata within a single retained content version. */
import type { WorkVersion } from '@deepseek-ai/dsh-academic-model'
import type { IngestIndex, IngestRecord } from './types.ts'

type Metadata = NonNullable<IngestRecord['metadata']>

/**
 * Retain the first available abstract and union available keywords for records of the same version.
 * @param first Metadata retained from an earlier scholarly record.
 * @param second Metadata supplied by another record of that version.
 * @returns Merged availability states, or undefined when neither record supplies metadata.
 */
export function mergeRecordMetadata(first: Metadata | undefined, second: Metadata | undefined): Metadata | undefined {
  if (first === undefined) return second
  if (second === undefined) return first
  const abstract = first.abstract.status === 'available' ? first.abstract : second.abstract
  const left = first.keywords, right = second.keywords
  const keywords = left.status === 'available' && right.status === 'available'
    ? { status: 'available' as const, value: [...new Set([...left.value, ...right.value])] }
    : left.status === 'available' ? left : right
  return { abstract, keywords }
}

/**
 * Read scholarly abstracts and keywords for the requested retained version, without borrowing another version's text.
 * @param index Ingestion index retaining the contributing provider records.
 * @param version Retained version whose ID selects its contributing record metadata.
 * @returns Trusted metadata with explicit unknown states when no matching record supplies it.
 */
export function metadataForVersion(index: IngestIndex, version: WorkVersion): Metadata {
  const records = index.records.get(version.academicWorkId) ?? []
  const matching = records.filter(record => record.workVersion.workVersionId === version.workVersionId)
  return matching.reduce((metadata: Metadata | undefined, record: IngestRecord) =>
    mergeRecordMetadata(metadata, record.metadata), undefined) ?? {
    abstract: { status: 'unknown', reason: 'No scholarly abstract is retained for this version.' },
    keywords: { status: 'unknown', reason: 'No scholarly keywords are retained for this version.' },
  }
}
