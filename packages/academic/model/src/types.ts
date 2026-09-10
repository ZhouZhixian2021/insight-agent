import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity shared by every known representation of one academic work. */
export type AcademicWorkId = Branded<'AcademicWorkId'>

/** Immutable identity of one content version of an academic work. */
export type WorkVersionId = Branded<'WorkVersionId'>

/** Stable identity of one traceable evidence record. */
export type EvidenceId = Branded<'EvidenceId'>

/** Stable identity of one evidence card. */
export type EvidenceCardId = Branded<'EvidenceCardId'>

/** Stable identity of one item inside an evidence card. */
export type EvidenceCardItemId = Branded<'EvidenceCardItemId'>

/** Stable identity of one source locator. */
export type SourceLocatorId = Branded<'SourceLocatorId'>

/** Stable identity of one immutable evidence snapshot. */
export type EvidenceSnapshotId = Branded<'EvidenceSnapshotId'>

/** Stable identity of one report claim. */
export type ClaimId = Branded<'ClaimId'>

/** Stable identity of one approved research brief. */
export type ResearchBriefId = Branded<'ResearchBriefId'>

/** Stable identity of one provider or processing failure. */
export type FailureId = Branded<'FailureId'>

/** Collision-safe key derived from an external identifier's kind and normalized value. */
export type ExternalIdentifierDedupKey = Branded<'ExternalIdentifierDedupKey'>

/** A value that distinguishes absence, access limits, and processing outcomes. */
export type Availability<T> =
  | { readonly status: 'available'; readonly value: T }
  | { readonly status: 'unknown'; readonly reason: string }
  | { readonly status: 'not_applicable'; readonly reason: string }
  | { readonly status: 'not_extracted'; readonly reason?: string }
  | { readonly status: 'failed'; readonly failureId: FailureId; readonly reason: string }

/** An availability record that contains a usable value. */
export type Available<T> = Extract<Availability<T>, { readonly status: 'available' }>

/** Precision carried by a partial academic publication date. */
export type PartialDatePrecision = 'year' | 'month' | 'day'

/** Calendar date that preserves how much of the source date is known. */
export interface PartialDate {
  readonly iso: string
  readonly precision: PartialDatePrecision
}

/** Date basis used to decide whether a work falls inside a publication window. */
export type PublicationDateBasis = 'published' | 'first_public_release'

/** Optional lower and upper publication dates approved for one research run. */
export interface PublicationWindow {
  readonly start: PartialDate | null
  readonly end: PartialDate | null
  readonly dateBasis: PublicationDateBasis
}

/** Minimum source depth required for substantive academic conclusions. */
export type RequiredEvidenceLevel = 'abstract' | 'fulltext'

/** Behavior when a run cannot meet its approved evidence requirements. */
export type InsufficientEvidencePolicy = 'continue_with_warning' | 'stop_for_review'

/** Minimum evidence quantity, depth, and traceability approved for one research run. */
export interface EvidenceRequirements {
  readonly minimumIncludedWorks: number
  readonly minimumFulltextWorks: number
  readonly minimumEvidenceLevel: RequiredEvidenceLevel
  readonly requireLocatableEvidence: boolean
  readonly allowPreprints: boolean
  readonly insufficientEvidencePolicy: InsufficientEvidencePolicy
}

/** Approved lower and upper target for report length in a named unit. */
export interface ReportTargetLength {
  readonly unit: string
  readonly minimum: number | null
  readonly maximum: number | null
}

/** Language, structure, citation, and appendix requirements for a report. */
export interface ReportRequirements {
  readonly language: string
  readonly targetLength: ReportTargetLength
  readonly requiredSections: readonly string[]
  readonly citationStyle: 'numeric' | 'author_year'
  readonly includeEvidenceAppendix: boolean
  readonly includeMethodology: boolean
  readonly includeLimitations: boolean
  readonly includeResearchGaps: boolean
}

/** Resource ceilings and early-stop rules approved for one research run. */
export interface StopConditions {
  readonly maximumSearchRounds: number
  readonly maximumCandidateWorks: number
  readonly maximumIncludedWorks: number
  readonly maximumElapsedMinutes: number | null
  readonly saturationRounds: number
  readonly stopWhenEvidenceRequirementsMet: boolean
}

/** Review state attached to one immutable research-brief version. */
export type BriefApproval =
  | { readonly status: 'pending' }
  | {
    readonly status: 'approved'
    readonly reviewedBy: string
    readonly reviewedAt: string
    readonly approvedBriefVersion: number
    readonly comment: string | null
  }
  | {
    readonly status: 'revision_requested'
    readonly reviewedBy: string
    readonly reviewedAt: string
    readonly reviewedBriefVersion: number
    readonly comment: string
  }

/** Approval record that authorizes execution of its reviewed brief version. */
export type ApprovedBriefApproval = Extract<
  BriefApproval,
  { readonly status: 'approved' }
>

/** User-reviewed research scope and delivery constraints for one plan version. */
export interface ResearchBrief {
  readonly schemaVersion: 1
  readonly researchBriefId: ResearchBriefId
  readonly version: number
  readonly topic: string
  readonly aliases: readonly string[]
  readonly questions: readonly string[]
  readonly publicationWindow: PublicationWindow
  readonly includedWorkTypes: readonly string[]
  readonly inclusionRules: readonly string[]
  readonly exclusionRules: readonly string[]
  readonly evidenceRequirements: EvidenceRequirements
  readonly targetAudience: string
  readonly reportRequirements: ReportRequirements
  readonly stopConditions: StopConditions
  readonly assumptions: readonly string[]
  readonly approval: BriefApproval
}

/** Research brief whose approval targets the brief's current version. */
export type ExecutableResearchBrief = ResearchBrief & {
  readonly approval: ApprovedBriefApproval
}

/** Extensible external-identifier kinds shared by academic providers. */
export interface ExternalIdentifierKindMap {
  readonly doi: never
  readonly arxiv: never
  readonly openalex: never
  readonly pubmed: never
  readonly provider_record: never
}

/** Registered kind of an external academic identifier. */
export type ExternalIdentifierKind = keyof ExternalIdentifierKindMap

/** Provider-observed external identifier with a caller-normalized comparison value. */
export interface ExternalIdentifier {
  readonly kind: ExternalIdentifierKind
  readonly normalizedValue: string
  readonly originalValue: string
  readonly sourceProvider: string
}

/** Reference to the provider record that exposed a work version. */
export interface ProviderRecordReference {
  readonly provider: string
  readonly recordId: string
}

/** Current publication state of an academic work. */
export type PublicationStatus =
  | 'preprint'
  | 'accepted'
  | 'published'
  | 'corrected'
  | 'retracted'
  | 'unknown'

/** Source-level role of an immutable work version. */
export type WorkVersionType =
  | 'preprint'
  | 'accepted_manuscript'
  | 'version_of_record'
  | 'corrected'
  | 'retracted'
  | 'unknown'

/** Current validity state of an immutable work version. */
export type WorkVersionStatus = 'active' | 'corrected' | 'retracted'

/** Provider-neutral identity and bibliography shared by every version of one work. */
export interface AcademicWork {
  readonly schemaVersion: 1
  readonly academicWorkId: AcademicWorkId
  readonly title: string
  readonly authors: readonly string[]
  readonly externalIdentifiers: readonly ExternalIdentifier[]
  readonly workVersionIds: readonly WorkVersionId[]
  readonly canonicalVersionId: WorkVersionId
  readonly firstPublicDate: Availability<PartialDate>
  readonly publicationStatus: Availability<PublicationStatus>
  readonly venue: Availability<string>
}

/** Immutable content version of one academic work. */
export interface WorkVersion {
  readonly schemaVersion: 1
  readonly workVersionId: WorkVersionId
  readonly academicWorkId: AcademicWorkId
  readonly versionType: WorkVersionType
  readonly versionLabel: Availability<string>
  readonly releaseDate: Availability<PartialDate>
  readonly externalIdentifiers: readonly ExternalIdentifier[]
  readonly sourceRecords: readonly ProviderRecordReference[]
  readonly contentHash: Availability<string>
  readonly supersedesWorkVersionId: WorkVersionId | null
  readonly status: WorkVersionStatus
}

/** Source depth available to support one evidence record. */
export type EvidenceLevel = 'metadata' | 'abstract' | 'fulltext'

/** Named extraction implementation and version that produced evidence. */
export interface ExtractionMethod {
  readonly method: string
  readonly methodVersion: string
}

/** Traceable source material and its producer-authored statement. */
export interface EvidenceRecord {
  readonly schemaVersion: 1
  readonly evidenceId: EvidenceId
  readonly academicWorkId: AcademicWorkId
  readonly workVersionId: WorkVersionId
  readonly level: EvidenceLevel
  readonly verbatimExcerpt: Availability<string>
  readonly sourcedStatement: string
  readonly sourceLocatorId: SourceLocatorId
  readonly sourceProvider: string
  readonly sourceUrl: string
  readonly retrievedAt: string
  readonly contentHash: Availability<string>
  readonly extractionMethod: ExtractionMethod
  readonly qualityNotes: readonly string[]
}

/** Fields shared by every source-locator variant. */
export interface SourceLocatorBase {
  readonly sourceLocatorId: SourceLocatorId
  readonly schemaVersion: 1
  readonly workVersionId: WorkVersionId
  readonly contentHash: string | null
}

/** Locator for a provider-owned metadata record. */
export interface ProviderRecordLocator extends SourceLocatorBase {
  readonly kind: 'provider_record'
  readonly provider: string
  readonly recordId: string
  readonly url: string
}

/** Locator for a character range inside an abstract. */
export interface AbstractLocator extends SourceLocatorBase {
  readonly kind: 'abstract'
  readonly characterStart: number
  readonly characterEnd: number
}

/** Locator for a section on a PDF and optional printed page. */
export interface PageSectionLocator extends SourceLocatorBase {
  readonly kind: 'page_section'
  readonly sectionTitle: string
  readonly pdfPage: number
  readonly printedPage: string | null
}

/** Locator for a numbered paragraph inside an optional section. */
export interface ParagraphLocator extends SourceLocatorBase {
  readonly kind: 'paragraph'
  readonly sectionTitle: string | null
  readonly paragraphNumber: number
}

/** Locator for a numbered table and its page context. */
export interface TableLocator extends SourceLocatorBase {
  readonly kind: 'table'
  readonly tableNumber: string
  readonly title: string | null
  readonly pdfPage: number | null
  readonly printedPage: string | null
}

/** Locator for a numbered figure and its page context. */
export interface FigureLocator extends SourceLocatorBase {
  readonly kind: 'figure'
  readonly figureNumber: string
  readonly title: string | null
  readonly pdfPage: number | null
  readonly printedPage: string | null
}

/** Exact source location for one evidence record. */
export type SourceLocator =
  | ProviderRecordLocator
  | AbstractLocator
  | PageSectionLocator
  | ParagraphLocator
  | TableLocator
  | FigureLocator

/** Evidence-card item whose statement has at least one direct evidence record. */
export interface EvidenceCardItem {
  readonly evidenceCardItemId: EvidenceCardItemId
  readonly statement: string
  readonly evidenceIds: readonly [EvidenceId, ...EvidenceId[]]
}

/** Research-question classification used by one evidence-card item. */
export type ResearchQuestionType =
  | 'descriptive'
  | 'comparative'
  | 'causal'
  | 'exploratory'
  | 'other'

/** Research question stated by one academic work. */
export interface ResearchQuestionEntry extends EvidenceCardItem {
  readonly questionType: Availability<ResearchQuestionType>
}

/** Role played by a method inside one academic work. */
export type MethodRole = 'proposed' | 'baseline' | 'evaluation' | 'analysis' | 'other'

/** Method described by one academic work. */
export interface MethodEntry extends EvidenceCardItem {
  readonly methodName: Availability<string>
  readonly methodRole: Availability<MethodRole>
}

/** Dataset described or used by one academic work. */
export interface DatasetEntry extends EvidenceCardItem {
  readonly datasetName: Availability<string>
  readonly version: Availability<string>
  readonly split: Availability<string>
  readonly scale: Availability<string>
}

/** Interpretation direction for a reported metric. */
export type MetricDirection =
  | 'higher_better'
  | 'lower_better'
  | 'context_dependent'

/** Metric and evaluation context reported by one academic work. */
export interface MetricEntry extends EvidenceCardItem {
  readonly metricName: Availability<string>
  readonly value: Availability<string | number>
  readonly unit: Availability<string>
  readonly direction: Availability<MetricDirection>
  readonly evaluationContext: Availability<string>
}

/** Role played by one reported finding. */
export type FindingType = 'primary' | 'secondary' | 'negative' | 'null_result' | 'other'

/** Finding reported by one academic work. */
export interface FindingEntry extends EvidenceCardItem {
  readonly findingType: Availability<FindingType>
  readonly conditions: Availability<string>
}

/** Source of one limitation recorded for an academic work. */
export type LimitationType =
  | 'data'
  | 'method'
  | 'evaluation'
  | 'generalizability'
  | 'author_stated'
  | 'other'

/** Limitation supported by evidence from one academic work. */
export interface LimitationEntry extends EvidenceCardItem {
  readonly limitationType: Availability<LimitationType>
}

/** Six evidence-backed sections extracted from one immutable work version. */
export interface EvidenceCard {
  readonly schemaVersion: 1
  readonly evidenceCardId: EvidenceCardId
  readonly academicWorkId: AcademicWorkId
  readonly workVersionId: WorkVersionId
  readonly researchQuestions: readonly ResearchQuestionEntry[]
  readonly methods: readonly MethodEntry[]
  readonly datasets: readonly DatasetEntry[]
  readonly metrics: readonly MetricEntry[]
  readonly findings: readonly FindingEntry[]
  readonly limitations: readonly LimitationEntry[]
}

/** Version and content identity of one evidence record at analysis time. */
export interface EvidenceSnapshotItem {
  readonly evidenceId: EvidenceId
  readonly academicWorkId: AcademicWorkId
  readonly workVersionId: WorkVersionId
  readonly contentHash: string | null
}

/** Immutable evidence set used for one brief version and model analysis. */
export interface EvidenceSnapshot {
  readonly schemaVersion: 1
  readonly evidenceSnapshotId: EvidenceSnapshotId
  readonly researchBriefId: ResearchBriefId
  readonly researchBriefVersion: number
  readonly evidenceItems: readonly EvidenceSnapshotItem[]
  readonly createdAt: string
}
