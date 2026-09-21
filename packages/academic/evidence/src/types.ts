/**
 * Vocabulary for the academic evidence library: source-locator construction inputs,
 * evidence-record construction, evidence-card sections, single-paper extraction, and
 * validation failures. It is a library, not a Cordis service or plugin; callers own model
 * routing and durable request logging.
 * @module @deepseek-ai/dsh-academic-evidence/types
 */

import type {
  AcademicWorkId,
  Availability,
  DatasetEntry,
  EvidenceCard,
  EvidenceRecord,
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

/** Locator metadata attached to one abstract or full-text segment before evidence exists. */
export type EvidenceContentLocatorInput =
  | { readonly kind: 'abstract'; readonly characterOffset?: number }
  | Omit<Extract<SourceLocatorInput, { readonly kind: 'page_section' }>, 'workVersionId' | 'contentHash'>
  | Omit<Extract<SourceLocatorInput, { readonly kind: 'paragraph' }>, 'workVersionId' | 'contentHash'>
  | Omit<Extract<SourceLocatorInput, { readonly kind: 'table' }>, 'workVersionId' | 'contentHash'>
  | Omit<Extract<SourceLocatorInput, { readonly kind: 'figure' }>, 'workVersionId' | 'contentHash'>

/** One locatable piece of an abstract or parsed full text supplied for extraction. */
export interface EvidenceContentSegment {
  readonly text: string
  readonly locator: EvidenceContentLocatorInput
}

/** One evidence-backed card item proposed by an extraction implementation. */
export type EvidenceCardItemDraft =
  | ({ readonly section: 'researchQuestions' } & Omit<ResearchQuestionEntry, 'evidenceCardItemId' | 'evidenceIds'>)
  | ({ readonly section: 'methods' } & Omit<MethodEntry, 'evidenceCardItemId' | 'evidenceIds'>)
  | ({ readonly section: 'datasets' } & Omit<DatasetEntry, 'evidenceCardItemId' | 'evidenceIds'>)
  | ({ readonly section: 'metrics' } & Omit<MetricEntry, 'evidenceCardItemId' | 'evidenceIds'>)
  | ({ readonly section: 'findings' } & Omit<FindingEntry, 'evidenceCardItemId' | 'evidenceIds'>)
  | ({ readonly section: 'limitations' } & Omit<LimitationEntry, 'evidenceCardItemId' | 'evidenceIds'>)

/** Structured extraction for one exact excerpt in a source segment. */
export interface EvidenceDraft {
  readonly segmentIndex: number
  readonly sourcedStatement: string
  readonly verbatimExcerpt: string
  readonly cardItems: readonly EvidenceCardItemDraft[]
  readonly qualityNotes?: readonly string[]
}

/** Model-independent request passed to the caller's extraction implementation. */
export interface EvidenceGenerationRequest {
  readonly instruction: string
  readonly focusQuestions: readonly string[]
  readonly segments: readonly EvidenceContentSegment[]
  readonly signal?: AbortSignal
}

/** Caller-provided semantic extractor; model adapters validate their output before returning it. */
export type EvidenceGenerator = (request: EvidenceGenerationRequest) => Promise<readonly EvidenceDraft[]>

/** Paper identity, provenance, and locatable content for one extraction call. */
export interface EvidenceExtractionInput {
  readonly academicWorkId: AcademicWorkId
  readonly workVersionId: WorkVersionId
  readonly sourceProvider: string
  readonly sourceUrl: string
  readonly retrievedAt: string
  readonly contentHash: string
  readonly extractionMethod: ExtractionMethod
  readonly focusQuestions?: readonly string[]
  readonly segments: readonly EvidenceContentSegment[]
}

/** The `ctx.web.fetch()` result fields used by academic full-text preparation. */
export interface AcademicWebFetchResult {
  readonly url: string
  readonly statusCode: number
  readonly body:
    | { readonly kind: 'html'; readonly content: string }
    | { readonly kind: 'text'; readonly content: string }
    | { readonly kind: 'pdf'; readonly content: Uint8Array }
  readonly truncated: boolean
}

/** Paper identity and provenance attached to one fetched full-text response. */
export interface FetchedAcademicFullTextInput {
  readonly academicWorkId: AcademicWorkId
  readonly workVersionId: WorkVersionId
  readonly sourceProvider: string
  readonly retrievedAt: string
  readonly extractionMethod: ExtractionMethod
  readonly focusQuestions?: readonly string[]
  /** The unrendered value returned by `ctx.web.fetch()`. */
  readonly fetched: AcademicWebFetchResult
}

/** Paper provenance plus ordered candidate URLs for full-text acquisition. */
export interface AcademicFullTextFetchInput extends Omit<FetchedAcademicFullTextInput, 'fetched'> {
  /** Candidate URLs in preference order, normally HTML before PDF. */
  readonly urls: readonly string[]
}

/** Caller-owned adapter over `ctx.web.fetch()`. */
export type AcademicWebFetcher = (url: string, signal?: AbortSignal) => Promise<AcademicWebFetchResult>

/** One model draft withheld from evidence because its exact source could not be verified. */
export interface EvidenceDraftRejection {
  /** Zero-based position in the model's evidence array. */
  readonly draftIndex: number
  readonly segmentIndex: number
  readonly code: 'EVIDENCE_EMPTY_EXCERPT' | 'EVIDENCE_INVALID_SEGMENT_INDEX' | 'EVIDENCE_EXCERPT_NOT_FOUND'
  /** Diagnostic without the rejected source text or model statement. */
  readonly reason: string
}

/** Accepted records and card items, plus individually rejected source references. */
export interface EvidenceExtractionResult {
  readonly sourceLocators: readonly SourceLocator[]
  readonly evidenceRecords: readonly EvidenceRecord[]
  readonly evidenceCard: EvidenceCard
  readonly rejectedDrafts: readonly EvidenceDraftRejection[]
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
