/** Results owned by the paper-level workflow handoff; no durable schema. */
import type { WorkVersion } from '@deepseek-ai/dsh-academic-model'
import type { EvidenceExtractionResult } from '@deepseek-ai/dsh-academic-evidence'

/** A paper withheld from extraction; the caller retains this record and continues other papers. */
export interface PaperPause {
  readonly academicWorkId: WorkVersion['academicWorkId']
  readonly workVersionId: WorkVersion['workVersionId']
  readonly oldHash: WorkVersion['contentHash']
  readonly newHash: string
  readonly sourceUrl: string
  /** Acquisition time supplied by the parser's caller, not a new wall-clock reading. */
  readonly retrievedAt: string
  readonly reason: 'identity_mismatch' | 'empty_hash' | 'hash_conflict' | 'history_requires_review' | 'hash_unavailable'
    | 'input_too_large'
}

/** Only an extracted result contains a version suitable for downstream analysis. */
export type PaperEvidenceResult =
  | { readonly status: 'paused'; readonly pause: PaperPause }
  | { readonly status: 'extracted'; readonly version: WorkVersion; readonly evidence: EvidenceExtractionResult }
