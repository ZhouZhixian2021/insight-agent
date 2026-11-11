/** Shared records for one product-insight investigation; producers own I/O and persistence. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity of one product across investigations and source pages. */
export type ProductId = Branded<'ProductInsightProductId'>
/** Stable identity shared by all versions of one investigation plan. */
export type ProductPlanId = Branded<'ProductInsightPlanId'>
/** Identity of one question within a plan. */
export type ProductQuestionId = Branded<'ProductInsightQuestionId'>
/** Identity of one discovered page, independent of later content snapshots. */
export type CandidatePageId = Branded<'ProductInsightCandidatePageId'>
/** Identity of one fetch attempt and its observed content, when available. */
export type SourceSnapshotId = Branded<'ProductInsightSourceSnapshotId'>
/** Identity of one extracted passage retained as evidence. */
export type ProductEvidenceId = Branded<'ProductInsightEvidenceId'>
/** Identity of one analysis conclusion. */
export type ProductClaimId = Branded<'ProductInsightClaimId'>
/** Identity of one missing-evidence request. */
export type EvidenceGapId = Branded<'ProductInsightEvidenceGapId'>
/** Identity of one investigation execution. */
export type ProductRunId = Branded<'ProductInsightRunId'>
/** Identity of one generated report artifact. */
export type ProductReportId = Branded<'ProductInsightReportId'>
/** Identity of one observed operation failure. */
export type ProductFailureId = Branded<'ProductInsightFailureId'>

/** Product identity and official home, without assuming a public version number. */
export interface Product {
  readonly schemaVersion: 1
  readonly productId: ProductId
  readonly name: string
  readonly developer: string
  readonly officialUrl: string
  readonly aliases?: readonly string[]
  readonly category?: string
}

/** Exact user-reviewed question; identifiers survive wording changes only within a plan version. */
export interface ProductQuestion {
  readonly questionId: ProductQuestionId
  readonly text: string
}

/** Approval belongs to one immutable plan version. */
export type ProductPlanApproval =
  | { readonly status: 'pending' }
  | { readonly status: 'approved'; readonly approvedPlanVersion: number; readonly reviewedBy: string; readonly reviewedAt: string; readonly comment: string | null }
  | { readonly status: 'revision_requested'; readonly reviewedPlanVersion: number; readonly reviewedBy: string; readonly reviewedAt: string; readonly comment: string }

/** Bounds selected for one approved investigation, not hidden workflow defaults. */
export interface ProductPlanLimits {
  readonly maximumCandidatePages?: number
  readonly maximumElapsedMinutes?: number
  /** Approved full-text characters per selected page; omission retains the 12,000-character legacy bound. */
  readonly maximumPageCharacters?: number
  /** Additional searches for unanswered questions or missing independent support. Omission disables follow-up search. */
  readonly maximumGapSearches?: number
  /** Additional reads of saved source fragments after semantic review. Omission disables them. */
  readonly maximumGapReads?: number
}

/** Publisher and host identity reviewed by the user before external pages are used for corroboration. */
export interface ProductSourcePublisher {
  readonly name: string
  readonly domain: string
}

/** Explicit applicability requirements; omitted fields impose no hidden threshold. */
export interface ProductSourceCriteria {
  readonly region?: string
  readonly productVersion?: string
  readonly minimumSourceDate?: string
}

/** Investigation scope, questions and approval state consumed by the workflow. */
export interface ProductPlan {
  readonly schemaVersion: 1
  readonly planId: ProductPlanId
  readonly version: number
  readonly productId: ProductId
  readonly questions: readonly ProductQuestion[]
  readonly scope: string
  readonly limits?: ProductPlanLimits
  readonly sourcePublishers?: readonly ProductSourcePublisher[]
  readonly sourceCriteria?: ProductSourceCriteria
  readonly approval: ProductPlanApproval
}

/** A plan that received approval for its current version. */
export type ExecutableProductPlan = ProductPlan & {
  readonly approval: Extract<ProductPlanApproval, { readonly status: 'approved' }>
}

/** Source role recorded separately from publisher verification. */
export type ProductSourceType = 'official_product_page' | 'official_documentation' | 'official_release_note' | 'other'

/** A's explainable decision about whether C should inspect one discovered page. */
export interface CandidatePage {
  readonly schemaVersion: 1
  readonly candidatePageId: CandidatePageId
  readonly planId: ProductPlanId
  readonly productId: ProductId
  readonly url: string
  readonly title?: string
  readonly sourceType: ProductSourceType
  readonly discoveredAt: string
  readonly questionIds: readonly ProductQuestionId[]
  readonly screening: {
    readonly status: 'selected' | 'excluded' | 'needs_review'
    readonly reason: string
    readonly screenedAt: string
  }
  readonly publisher?: string
  readonly discoveryChannel?: string
}

/** Recorded failure; retryability does not authorize exceeding plan limits. */
export interface ProductFailure {
  readonly schemaVersion: 1
  readonly failureId: ProductFailureId
  readonly stage: 'discovery' | 'screening' | 'fetch' | 'extraction' | 'analysis' | 'report'
  readonly category: 'invalid_request' | 'authentication_failed' | 'rate_limited' | 'timeout' | 'network_error' | 'upstream_error' | 'not_found' | 'parse_failed' | 'unknown'
  readonly message: string
  readonly retryable: boolean
  readonly occurredAt: string
  readonly candidatePageId?: CandidatePageId
}

/** One page fetch attempt. Failed attempts never invent content or a content hash. */
export type SourceSnapshot =
  | {
    readonly schemaVersion: 1
    readonly sourceSnapshotId: SourceSnapshotId
    readonly candidatePageId: CandidatePageId
    readonly observedAt: string
    readonly status: 'available'
    readonly contentRef: string
    readonly contentHash: string
    readonly sourcePublishedAt?: string
    readonly sourceUpdatedAt?: string
    readonly productVersionLabel?: string
    readonly sourceRegionLabel?: string
    readonly declaredPublisher?: string
  }
  | {
    readonly schemaVersion: 1
    readonly sourceSnapshotId: SourceSnapshotId
    readonly candidatePageId: CandidatePageId
    readonly observedAt: string
    readonly status: 'failed'
    readonly failureId: ProductFailureId
  }

/** Fetch attempt that produced content usable for evidence extraction. */
export type AvailableSourceSnapshot = Extract<SourceSnapshot, { readonly status: 'available' }>

/** Position of an exact excerpt in the captured page content. */
export type ProductSourceLocator =
  | { readonly kind: 'url_fragment'; readonly fragment: string }
  | { readonly kind: 'heading'; readonly heading: string; readonly occurrence: number }
  | { readonly kind: 'text_range'; readonly start: number; readonly end: number; readonly pdfPage?: number }

/** Fields shared by historical and multi-excerpt source evidence. */
interface ProductEvidenceFields {
  readonly evidenceId: ProductEvidenceId
  readonly candidatePageId: CandidatePageId
  readonly sourceSnapshotId: SourceSnapshotId
  readonly contentHash: string
  readonly questionIds: readonly ProductQuestionId[]
  readonly verbatimExcerpt: string
  readonly sourcedStatement: string
  readonly locator: ProductSourceLocator
  readonly extractionMethod: { readonly name: string; readonly version: string }
  readonly qualityNotes?: readonly string[]
}

/** One contiguous excerpt retained by existing investigations. */
export interface ProductEvidenceV1 extends ProductEvidenceFields {
  readonly schemaVersion: 1
}

/** One additional exact excerpt needed to interpret the primary excerpt. */
export interface ProductSupportingExcerpt {
  readonly verbatimExcerpt: string
  readonly locator: Extract<ProductSourceLocator, { readonly kind: 'text_range' }>
}

/** Source evidence whose several exact positions jointly support one statement. */
export interface ProductEvidenceV2 extends ProductEvidenceFields {
  readonly schemaVersion: 2
  readonly locator: Extract<ProductSourceLocator, { readonly kind: 'text_range' }>
  readonly supportingExcerpts: readonly ProductSupportingExcerpt[]
}

/** Source-bound evidence in either persisted representation. */
export type ProductEvidence = ProductEvidenceV1 | ProductEvidenceV2

/** The role one evidence record plays for a conclusion. */
export type ProductEvidenceRelation = 'supports' | 'contradicts' | 'background'

/** Explicit link from a conclusion to one evidence record. */
export interface ProductClaimEvidenceLink {
  readonly evidenceId: ProductEvidenceId
  readonly relation: ProductEvidenceRelation
  readonly rationale: string
}

/** Content identity captured when a conclusion was formed. */
export interface ProductClaimEvidenceSnapshotItem {
  readonly evidenceId: ProductEvidenceId
  readonly candidatePageId: CandidatePageId
  readonly contentHash: string
}

/** Exact plan version and source contents used for one analysis conclusion. */
export interface ProductClaimEvidenceSnapshot {
  readonly planId: ProductPlanId
  readonly planVersion: number
  readonly evidenceItems: readonly ProductClaimEvidenceSnapshotItem[]
}

/** An explained conclusion whose current evidence still requires consumer-time checks. */
export interface ProductClaim {
  readonly schemaVersion: 1
  readonly claimId: ProductClaimId
  readonly text: string
  readonly scope: string
  readonly questionIds: readonly ProductQuestionId[]
  readonly confidence: 'high' | 'medium' | 'low' | 'insufficient'
  readonly confidenceReasons: readonly [string, ...string[]]
  readonly uncertainty?: string
  readonly evidenceLinks: readonly ProductClaimEvidenceLink[]
  readonly evidenceSnapshot: ProductClaimEvidenceSnapshot
  readonly validity: 'current' | 'stale'
}

/** C's specific request for more source material, resolved by A's workflow. */
export interface ProductEvidenceGap {
  readonly schemaVersion: 1
  readonly gapId: EvidenceGapId
  readonly planId: ProductPlanId
  readonly questionId: ProductQuestionId
  readonly missingContent: string
  readonly reason: string
  readonly status: 'open' | 'resolved' | 'unavailable'
  readonly suggestedSourceTypes?: readonly ProductSourceType[]
}

/** Outcome of a bounded operation; success may contain zero items. */
export type ProductBatchStatus = 'success' | 'partial_success' | 'failed'

/** Successful items and observed failures retained together. */
export interface ProductBatchResult<T> {
  readonly schemaVersion: 1
  readonly status: ProductBatchStatus
  readonly items: readonly T[]
  readonly failures: readonly ProductFailure[]
}

/** A run may finish with partial results, or be cancelled after saving useful work. */
export type ProductRun = {
  readonly schemaVersion: 1
  readonly runId: ProductRunId
  readonly planId: ProductPlanId
  readonly planVersion: number
  readonly startedAt: string | null
  readonly failures: readonly ProductFailure[]
  readonly reportId: ProductReportId | null
} & (
  | { readonly state: 'pending' | 'running'; readonly outcome: null; readonly completedAt: null }
  | { readonly state: 'completed'; readonly outcome: 'success' | 'partial_success'; readonly completedAt: string }
  | { readonly state: 'failed'; readonly outcome: 'failed'; readonly completedAt: string }
  | { readonly state: 'cancelled'; readonly outcome: 'failed' | 'partial_success'; readonly completedAt: string }
)

/** Report content and its source-visible limitations, created only when evidence exists. */
export interface ProductReport {
  readonly schemaVersion: 1
  readonly reportId: ProductReportId
  readonly planId: ProductPlanId
  readonly planVersion: number
  readonly generatedAt: string
  readonly assessedAt: string
  readonly claimIds: readonly ProductClaimId[]
  readonly evidenceIds: readonly ProductEvidenceId[]
  readonly limitations: readonly string[]
  readonly contentRef: string
}

/** Delivery decision kept separate from the run's processing outcome. */
export type ProductReportDelivery =
  | { readonly status: 'blocked'; readonly reasons: readonly string[]; readonly report: null }
  | { readonly status: 'draft' | 'final'; readonly reasons: readonly string[]; readonly report: ProductReport }
