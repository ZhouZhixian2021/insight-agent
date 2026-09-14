/**
 * Vocabulary for the academic ingestion library: deduplication keys, the in-memory
 * deduplication index, and the per-record audit. It is a library, not a Cordis service or
 * plugin; the durable mapping record and merge-audit persistence remain a later increment.
 * @module @deepseek-ai/dsh-academic-ingestion/types
 */

import type {
  AcademicWork,
  AcademicWorkId,
  ExternalIdentifierDedupKey,
  WorkVersion,
  WorkVersionId,
} from '@deepseek-ai/dsh-academic-model'

/** One provider-produced work/version pair handed to ingestion. */
export interface IngestRecord {
  readonly academicWork: AcademicWork
  readonly workVersion: WorkVersion
}

/** Exact and fuzzy keys identifying one work for deduplication. */
export interface WorkDedupKeys {
  /** Exact keys over external identifiers; any collision means the same work. */
  readonly exact: readonly ExternalIdentifierDedupKey[]
  /** Normalized title/author/year key, used only to flag suspected duplicates. */
  readonly fuzzy: string | null
}

/**
 * In-memory deduplication and merge state. A caller that needs durability
 * persists this value; the library neither reads nor writes storage.
 */
export interface IngestIndex {
  /** Exact external-identifier key to the work identity already assigned. */
  readonly byExactKey: ReadonlyMap<ExternalIdentifierDedupKey, AcademicWorkId>
  /** Fuzzy title/author/year key to the work identity already assigned. */
  readonly byFuzzyKey: ReadonlyMap<string, AcademicWorkId>
  /** Contributing provider records per assigned work identity, in ingestion order. */
  readonly records: ReadonlyMap<AcademicWorkId, readonly IngestRecord[]>
}

/** One ingestion decision, kept for traceability. */
export type IngestAuditEntry =
  | { readonly kind: 'new_work'; readonly academicWorkId: AcademicWorkId }
  | {
    readonly kind: 'merged_version'
    readonly academicWorkId: AcademicWorkId
    readonly workVersionId: WorkVersionId
  }
  | {
    readonly kind: 'suspected_duplicate'
    readonly academicWorkId: AcademicWorkId
    readonly existingAcademicWorkId: AcademicWorkId
    readonly reason: string
  }

/** The recorded decisions for one ingestion call. */
export interface IngestAudit {
  readonly entries: readonly IngestAuditEntry[]
}

/** The result of one ingestion call: the updated index plus its deduplicated output. */
export interface IngestOutcome {
  readonly index: IngestIndex
  /** Every deduplicated work, reconciled from its contributing records. */
  readonly works: readonly AcademicWork[]
  /** Every version, re-pointed at its assigned work identity. */
  readonly versions: readonly WorkVersion[]
  readonly audit: IngestAudit
}
