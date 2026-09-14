/** Analysis-local preparation results; these do not define shared Claim records. */
import type {
  AcademicWork, EvidenceCard, EvidenceCardItemId, EvidenceId,
  EvidenceRecord, SourceLocator, WorkVersion,
} from '@deepseek-ai/dsh-academic-model'

/** Typed, same-process evidence batch supplied by the caller. */
export interface AnalysisInput {
  readonly academicWorks: readonly AcademicWork[]
  readonly workVersions: readonly WorkVersion[]
  readonly evidenceRecords: readonly EvidenceRecord[]
  readonly evidenceCards: readonly EvidenceCard[]
  readonly sourceLocators: readonly SourceLocator[]
}

/** The six sections retain their existing model entry types. */
export type AnalysisSection = 'researchQuestions' | 'methods' | 'datasets' | 'metrics' | 'findings' | 'limitations'

/** Stable reasons for excluding material or restricting its use. */
export type PreparationIssueCode =
  | 'missing_work' | 'missing_version' | 'version_mismatch' | 'retracted_version'
  | 'missing_evidence' | 'missing_locator' | 'locator_level_mismatch'
  | 'hash_mismatch' | 'metadata_only' | 'abstract_only'
  | 'unavailable_field' | 'empty_section' | 'unavailable_excerpt' | 'unavailable_hash'

/** Issue location identifies the supplied card and, when applicable, its entry. */
export interface PreparationIssue {
  readonly code: PreparationIssueCode
  readonly disposition: 'excluded' | 'limitation'
  readonly evidenceCardId: EvidenceCard['evidenceCardId']
  readonly section: AnalysisSection | null
  readonly itemId: EvidenceCardItemId | null
  readonly evidenceId: EvidenceId | null
  readonly field: string | null
  readonly message: string
}

/** Accepted entries and their original supporting records for one content version. */
export interface PreparedVersion {
  readonly version: WorkVersion
  readonly cards: readonly EvidenceCard[]
  readonly evidenceRecords: readonly EvidenceRecord[]
  readonly sourceLocators: readonly SourceLocator[]
}

/** One work counts once even when several evidence versions are retained. */
export interface PreparedWork {
  readonly work: AcademicWork
  readonly versions: readonly PreparedVersion[]
}

/** Usable means at least one entry survived; it does not certify comparability or truth. */
export interface PreparedAnalysisInput {
  readonly status: 'usable' | 'no_usable_input'
  readonly works: readonly PreparedWork[]
  readonly issues: readonly PreparationIssue[]
}
