/**
 * Vocabulary for the academic evidence library: source-locator construction inputs, the
 * evidence-record construction input, the evidence-card section inputs, and the validation
 * error. It is a library, not a Cordis service or plugin; extraction that fills these records
 * from retrieved material belongs to a later model-facing increment.
 * @module @deepseek-ai/dsh-academic-evidence/types
 */

import type {
  AcademicWorkId,
  Availability,
  DatasetEntry,
  ExtractionMethod,
  FindingEntry,
  LimitationEntry,
  MethodEntry,
  MetricEntry,
  ResearchQuestionEntry,
  SourceLocator,
  WorkVersionId,
} from '@deepseek-ai/dsh-academic-model'

/** Construction input for one source-locator variant; the id and schema version are minted. */
export type SourceLocatorInput =
  | {
    readonly kind: 'provider_record'
    readonly workVersionId: WorkVersionId
    readonly contentHash?: string | null
    readonly provider: string
    readonly recordId: string
    readonly url: string
  }
  | {
    readonly kind: 'abstract'
    readonly workVersionId: WorkVersionId
    readonly contentHash?: string | null
    readonly characterStart: number
    readonly characterEnd: number
  }
  | {
    readonly kind: 'page_section'
    readonly workVersionId: WorkVersionId
    readonly contentHash?: string | null
    readonly sectionTitle: string
    readonly pdfPage: number
    readonly printedPage?: string | null
  }
  | {
    readonly kind: 'paragraph'
    readonly workVersionId: WorkVersionId
    readonly contentHash?: string | null
    readonly sectionTitle?: string | null
    readonly paragraphNumber: number
  }
  | {
    readonly kind: 'table'
    readonly workVersionId: WorkVersionId
    readonly contentHash?: string | null
    readonly tableNumber: string
    readonly title?: string | null
    readonly pdfPage?: number | null
    readonly printedPage?: string | null
  }
  | {
    readonly kind: 'figure'
    readonly workVersionId: WorkVersionId
    readonly contentHash?: string | null
    readonly figureNumber: string
    readonly title?: string | null
    readonly pdfPage?: number | null
    readonly printedPage?: string | null
  }

/** Construction input for one evidence record; the identity is minted. */
export interface EvidenceRecordInput {
  readonly academicWorkId: AcademicWorkId
  readonly workVersionId: WorkVersionId
  readonly level: 'metadata' | 'abstract' | 'fulltext'
  /** The producer-authored standalone statement; the level names its allowed scope. */
  readonly sourcedStatement: string
  /** The already-built locator this record references; its kind must match `level`. */
  readonly sourceLocator: SourceLocator
  readonly verbatimExcerpt: Availability<string>
  readonly sourceProvider: string
  readonly sourceUrl: string
  readonly retrievedAt: string
  readonly contentHash: Availability<string>
  readonly extractionMethod: ExtractionMethod
  readonly qualityNotes?: readonly string[]
}

/** Construction input for one evidence card; the card and item identities are minted. */
export interface EvidenceCardInput {
  readonly academicWorkId: AcademicWorkId
  readonly workVersionId: WorkVersionId
  readonly researchQuestions: readonly Omit<ResearchQuestionEntry, 'evidenceCardItemId'>[]
  readonly methods: readonly Omit<MethodEntry, 'evidenceCardItemId'>[]
  readonly datasets: readonly Omit<DatasetEntry, 'evidenceCardItemId'>[]
  readonly metrics: readonly Omit<MetricEntry, 'evidenceCardItemId'>[]
  readonly findings: readonly Omit<FindingEntry, 'evidenceCardItemId'>[]
  readonly limitations: readonly Omit<LimitationEntry, 'evidenceCardItemId'>[]
}

/**
 * Typed failure for evidence construction, carrying a stable machine-routable `code`.
 *
 * Deliberately re-implements the `HarnessError` shape instead of extending a base owned by
 * another package: the academic group stays free of unrelated capability packages, and
 * callers route on `code`, never the prototype chain.
 */
export class EvidenceError extends Error {
  /** Stable machine-routable failure code. */
  readonly code: string

  /**
   * @param message - human-readable failure description.
   * @param code - stable machine-routable code.
   * @param options - optional chained cause.
   */
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'EvidenceError'
    this.code = code
  }
}
