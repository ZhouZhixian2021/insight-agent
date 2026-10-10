/** Browser-safe request and result vocabulary for Academic research runs. */
import type {
  AcademicWork, AcademicWorkId, Availability, CandidateClassification, CandidateFulltextAvailability,
  CandidateHardFilterReason, CandidatePriority, CandidatePriorityQueues, CandidateScoreBreakdown,
  CandidateScreeningDetails,
  ClaimAssessmentId, ClaimId, EvidenceId, EvidenceSnapshotId, ExtractionMethod, HybridSearchPlan,
  HybridSearchRound, ResearchBriefId, ResearchQuestionCoverageResult, RetrievalRun, RetrievalRunId,
  SearchQueryId, SearchStopDecision, SourceLocatorId, WorkVersion, WorkVersionId,
} from '@deepseek-ai/dsh-academic-model'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  AcademicWorkflowProgressActivity,
  AcademicWorkflowProgressCounts,
  AcademicWorkflowProgressEvent,
  AcademicWorkflowProgressFailureCode,
  AcademicWorkflowProgressSnapshot,
  AcademicWorkflowProgressStage,
  AcademicWorkflowProgressStages,
  AcademicWorkflowProgressStageView,
  AcademicWorkflowProgressStatus,
  AcademicWorkflowProgressUnit,
} from '@deepseek-ai/dsh-academic-workflow/progress'
import type { AcademicBatchDecisionEvent,
  AcademicBatchSettlementEvent } from '@deepseek-ai/dsh-academic-workflow/query-workflow'

/** One bounded Academic research run attached to an existing Session. */
export interface AcademicResearchRunRequest {
  readonly sessionId: SessionId
  /** Identity returned by plan preview; a newer approved plan requires another preview. */
  readonly researchBriefId: ResearchBriefId
  /** Existing interrupted run to continue from its latest durable checkpoint. Omit to start a new run. */
  readonly resumeRetrievalRunId?: RetrievalRunId
  /** Global deduplicated candidate-work bound for the complete run. */
  readonly maxResults?: number
  readonly synthetic: boolean
}

/** Search channels that one approved query may execute. */
export type AcademicRetrievalChannel = 'academic' | 'web_discovery'

/** Providers supported for direct scholarly discovery in the first hybrid-plan version. */
export type AcademicDirectSearchProvider = 'openalex' | 'arxiv'

/** Providers with a first-version Web-reference verification contract. */
export type AcademicReferenceVerificationProvider = 'openalex' | 'arxiv' | 'acl' | 'pmlr' | 'cvf'

/** Approved per-query hybrid-retrieval policy; disabled Web discovery uses zero limits. */
export interface AcademicPlannedRetrieval {
  readonly channels: readonly AcademicRetrievalChannel[]
  /** Providers searched directly through the Academic source seam. */
  readonly academicProviders: readonly AcademicDirectSearchProvider[]
  /** Providers allowed to verify references found through Web discovery. */
  readonly verificationProviders: readonly AcademicReferenceVerificationProvider[]
  readonly maximumWebDiscoveryResults: number
  readonly maximumReferenceVerifications: number
}

/** One system-authored search direction retained with the reviewed plan. */
export interface AcademicPlannedSearch {
  /** Exact search expression sent to source providers. */
  readonly query: string
  /** Chinese explanation of this search direction. */
  readonly purpose: string
  /** Research questions from the same Brief that this search supports. */
  readonly questions: readonly string[]
  /** Required in schema-version-3 plans; absent on legacy plans without an explicit retrieval policy. */
  readonly retrieval?: AcademicPlannedRetrieval
}

/** Read-only summary of the latest approved, executable search plan. */
export interface AcademicResearchPlanView {
  readonly researchBriefId: ResearchBriefId
  readonly topic: string
  readonly questions: readonly string[]
  readonly searches: readonly AcademicPlannedSearch[]
}

/** Evidence identity captured when one report claim was formed. */
export interface AcademicEvidenceSnapshotItemView {
  readonly evidenceId: EvidenceId
  readonly academicWorkId: AcademicWorkId
  readonly workVersionId: WorkVersionId
  readonly contentHash: string | null
}

/** Browser projection of one evidence snapshot. */
export interface AcademicEvidenceSnapshotView {
  readonly schemaVersion: 1
  readonly evidenceSnapshotId: EvidenceSnapshotId
  readonly researchBriefId: ResearchBriefId
  readonly researchBriefVersion: number
  readonly evidenceItems: readonly AcademicEvidenceSnapshotItemView[]
  readonly createdAt: string
}

/** Browser projection of a report claim; confidence reasons remain non-empty in the producer model. */
export interface AcademicClaimView {
  readonly schemaVersion: 1
  readonly claimId: ClaimId
  readonly text: string
  readonly category: 'consensus' | 'trend' | 'comparison' | 'disagreement' | 'research_gap' | 'limitation'
  readonly scope: string
  readonly uncertainty: string | null
  readonly confidence: 'high' | 'medium' | 'low' | 'insufficient'
  readonly confidenceReasons: readonly string[]
  readonly evidenceSnapshot: AcademicEvidenceSnapshotView
  readonly validity: 'current' | 'stale'
}

/** Browser projection of one traceable evidence record. */
export interface AcademicEvidenceView {
  readonly schemaVersion: 1
  readonly evidenceId: EvidenceId
  readonly academicWorkId: AcademicWorkId
  readonly workVersionId: WorkVersionId
  readonly level: 'metadata' | 'abstract' | 'fulltext'
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

/** Browser projection of one semantic claim assessment. */
export interface AcademicClaimAssessmentView {
  readonly schemaVersion: 1
  readonly claimAssessmentId: ClaimAssessmentId
  readonly claimId: ClaimId
  readonly status: 'supported' | 'partially_supported' | 'contradicted' | 'unsupported' | 'insufficient'
  readonly reason: string
  readonly method: string
  readonly methodVersion: string
  readonly assessedEvidenceIds: readonly EvidenceId[]
  readonly assessedAt: string
}

/** Browser projection of draft quality evaluation. */
export interface AcademicEvaluationView {
  readonly status: 'ready' | 'needs_review' | 'blocked'
  readonly assessments: readonly AcademicClaimAssessmentView[]
  readonly issues: readonly { readonly claimId: ClaimId | null; readonly code: string; readonly message: string }[]
}

/** Report fields consumed by the Academic report renderer. */
export interface AcademicResearchReportView {
  /** True when server Markdown includes retrieval disclosure; clients must not append it again. */
  readonly retrievalDisclosureIncluded?: true
  readonly title: string
  readonly mode: 'draft' | 'final'
  readonly synthetic: boolean
  readonly markdown: string
  readonly evaluation: AcademicEvaluationView
  readonly claims: readonly AcademicClaimView[]
  readonly evidence: readonly AcademicEvidenceView[]
  readonly limitations: readonly string[]
}

/** Per-paper settlement exposed without internal extraction objects. */
export type AcademicPaperResultView =
  | {
    readonly status: 'extracted' | 'partially_extracted' | 'extraction_failed'
    readonly workVersionId: WorkVersionId
    readonly evidenceCount: number
    /** Rejected drafts never appear in accepted evidence or report citations. Indexes are zero-based. */
    readonly rejectedDrafts: readonly {
      readonly draftIndex: number
      readonly segmentIndex: number
      readonly code: 'EVIDENCE_EMPTY_EXCERPT' | 'EVIDENCE_INVALID_SEGMENT_INDEX' | 'EVIDENCE_EXCERPT_NOT_FOUND'
        | 'EVIDENCE_INVALID_QUESTION_INDEX'
      readonly reason: string
    }[]
  }
  | { readonly status: 'excluded'; readonly workVersionId: WorkVersionId; readonly reason: string }
  | { readonly status: 'paused'; readonly workVersionId: WorkVersionId; readonly reason: string }

/** Producer-settled result for one visible Academic pipeline stage. */
export type AcademicResearchStageStatus = 'success' | 'partial_success' | 'failed' | 'not_run'

/** Browser-safe stage settlements; the client must not infer them from aggregate counts. */
export interface AcademicResearchStageResults {
  readonly search: AcademicResearchStageStatus
  readonly fulltext: AcademicResearchStageStatus
  readonly extraction: AcademicResearchStageStatus
}

/** Producer-settled stages belonging only to the mixed discovery and verification path. */
export interface AcademicHybridRetrievalStageResults {
  readonly academicSearch: AcademicResearchStageStatus
  readonly webDiscovery: AcademicResearchStageStatus
  readonly referenceIdentification: AcademicResearchStageStatus
  readonly referenceVerification: AcademicResearchStageStatus
  readonly deduplication: AcademicResearchStageStatus
}

/** Observed hybrid-retrieval counts; URLs, references and deduplicated works remain separate units. */
export interface AcademicHybridRetrievalCounts {
  readonly academicDiscoveredRecords: number
  readonly webDiscoveredUrls: number
  readonly identifiedReferences: number
  readonly attemptedVerifications: number
  readonly verifiedReferences: number
  readonly failedVerifications: number
  readonly discardedWebCandidates: number
  /** Ingested record count minus distinct works, before the run-wide cap; excludes repeated unverified links and truncated records. */
  readonly mergedDuplicates: number
  /** Distinct works entering ingestion before the run-wide candidate cap, matching RetrievalRun coverage. */
  readonly deduplicatedWorks: number
}

/** Browser-safe settlement of one Web result before scholarly-reference verification. */
export interface AcademicWebDiscoveryCandidateView {
  /** Actual completed query; absent on older fixed samples. */
  readonly query?: string
  /** HTTP(S) URL without credentials, query or fragment; empty when unsafe or invalid. */
  readonly url: string
  readonly title: string | null
  readonly status: 'discovered' | 'references_identified' | 'discarded_non_paper'
  readonly identifiedReferenceCount: number
  readonly message: string | null
}

/** Browser-safe reference kind; source-specific provider records stay distinguishable. */
export type AcademicReferenceViewKind = 'doi' | 'arxiv' | 'acl' | 'pmlr' | 'cvf'

/** Settlement of one Web-discovered reference without exposing raw page content. */
export interface AcademicReferenceView {
  /** Actual completed query; absent on older fixed samples. */
  readonly query?: string
  readonly kind: AcademicReferenceViewKind
  readonly normalizedValue: string
  readonly discoveryUrl: string
  readonly verificationProvider: string | null
  readonly status: 'identified' | 'verified' | 'verification_failed' | 'merged_duplicate'
  readonly message: string | null
}

/** Terminal projection of completed hybrid queries; interrupted queries are disclosed in RetrievalRun limitations. */
export interface AcademicHybridRetrievalView {
  readonly schemaVersion: 1
  readonly stages: AcademicHybridRetrievalStageResults
  readonly counts: AcademicHybridRetrievalCounts
  readonly webCandidates: readonly AcademicWebDiscoveryCandidateView[]
  readonly references: readonly AcademicReferenceView[]
}

/** Ordered user-visible stages of one Academic research run. */
export type AcademicResearchProgressStage = AcademicWorkflowProgressStage

/** Live or terminal settlement of one progress stage. */
export type AcademicResearchProgressStatus = AcademicWorkflowProgressStatus

/** Unit attached to observed progress counts. */
export type AcademicResearchProgressUnit = AcademicWorkflowProgressUnit

/** Complete current settlement of one progress stage. */
export type AcademicResearchProgressStageView = AcademicWorkflowProgressStageView

/** Complete fixed stage map carried by every progress snapshot. */
export type AcademicResearchProgressStages = AcademicWorkflowProgressStages

/** Observed run totals; clients must not derive stage settlement from these counters. */
export type AcademicResearchProgressCounts = AcademicWorkflowProgressCounts

/** Sanitized reason codes that a client can translate without exposing provider diagnostics. */
export type AcademicResearchProgressFailureCode = AcademicWorkflowProgressFailureCode

/** Concurrent work that explains what an active stage is doing. */
export type AcademicResearchProgressActivityView = AcademicWorkflowProgressActivity

/** Latest committed producer event represented by a complete progress snapshot. */
export type AcademicResearchProgressEventView = AcademicWorkflowProgressEvent

/** Complete browser-safe progress snapshot; later sequences replace earlier snapshots for the same run. */
export interface AcademicResearchProgressView extends AcademicWorkflowProgressSnapshot {
  readonly sessionId: SessionId
}

/** Availability of one independently produced Q6 section; an available empty value is a completed result. */
export type AcademicQ6Section<T> =
  | { readonly state: 'pending' }
  | { readonly state: 'available'; readonly value: T }
  | { readonly state: 'truncated'; readonly value: T; readonly reason: string }
  | { readonly state: 'failed'; readonly code: string; readonly message: string; readonly retryable: boolean }

/** Browser-safe assessment facts; non-empty model tuples cross the Remote boundary as ordinary arrays. */
export interface AcademicQ6CandidateAssessmentView {
  readonly academicWorkId: AcademicWorkId
  readonly abstract: Availability<string>
  readonly keywords: Availability<readonly string[]>
  readonly fulltextAvailability: CandidateFulltextAvailability
  readonly matchedQuestions: readonly string[]
  readonly screening?: CandidateScreeningDetails
  readonly contributionSignals: readonly Exclude<CandidateClassification, 'background' | 'irrelevant'>[]
  readonly topicRelevance: number
  readonly evidencePotential: number
  readonly methodMatch: number
  readonly sourceQuality: number
  readonly recency: number
  readonly inclusionRuleMatches: readonly (boolean | null)[]
  readonly exclusionRuleMatches: readonly (boolean | null)[]
  readonly diversityTags: readonly string[]
  readonly reasons: readonly string[]
}

/** Browser-safe ranked evaluation with stable array fields for Typert and JSON transports. */
export interface AcademicQ6CandidateEvaluationView {
  readonly schemaVersion: 1
  readonly academicWorkId: AcademicWorkId
  readonly workVersionId: WorkVersionId
  readonly discoveredBy: readonly SearchQueryId[]
  readonly classification: CandidateClassification
  readonly hardFilter:
    | { readonly status: 'eligible'; readonly reasons: readonly CandidateHardFilterReason[] }
    | { readonly status: 'excluded'; readonly reasons: readonly CandidateHardFilterReason[] }
  readonly score: CandidateScoreBreakdown
  readonly priority: CandidatePriority
  readonly matchedQuestions: readonly string[]
  readonly fulltextAvailability: CandidateFulltextAvailability
  readonly diversityTags: readonly string[]
  readonly decisionReasons: readonly string[]
}

/** One ranked candidate joined to the exact work, version, assessment, and evaluation used by Q5. */
export interface AcademicQ6CandidateView {
  readonly work: AcademicWork
  readonly version: WorkVersion
  readonly assessment: AcademicQ6CandidateAssessmentView
  readonly evaluation: AcademicQ6CandidateEvaluationView
}

/** Ranking metadata shared by all joined candidate rows without duplicating evaluations. */
export interface AcademicQ6RankingView {
  readonly schemaVersion: 1
  readonly researchBriefId: ResearchBriefId
  readonly researchBriefVersion: number
  readonly queues: CandidatePriorityQueues
  readonly limitations: readonly string[]
}

/** Complete read-only Q6 snapshot derived from one live query-workflow observation. */
export interface AcademicQ6Projection {
  readonly schemaVersion: 1
  readonly sessionId: SessionId
  readonly retrievalRunId: RetrievalRunId
  readonly researchBriefId: ResearchBriefId
  readonly researchBriefVersion: number
  /** Monotonic only within this retrievalRunId. */
  readonly sequence: number
  readonly updatedAt: string
  readonly status: 'running' | 'settled' | 'cancelled'
  readonly plan: HybridSearchPlan
  readonly candidates: AcademicQ6Section<{
    readonly items: readonly AcademicQ6CandidateView[]
    readonly ranking: AcademicQ6RankingView
  }>
  readonly rounds: AcademicQ6Section<readonly HybridSearchRound[]>
  readonly batches: AcademicQ6Section<{
    readonly decisions: readonly AcademicBatchDecisionEvent[]
    readonly settlements: readonly AcademicBatchSettlementEvent[]
  }>
  readonly coverage: AcademicQ6Section<ResearchQuestionCoverageResult>
  readonly stopDecision: AcademicQ6Section<SearchStopDecision>
  readonly limitations: readonly string[]
}

/** Browser-safe frames emitted by `academicResearch.runStream` for one bounded research operation. */
export type AcademicResearchRunFrame =
  | { readonly type: 'progress'; readonly progress: AcademicResearchProgressView }
  | { readonly type: 'q6'; readonly projection: AcademicQ6Projection }
  | { readonly type: 'result'; readonly retrievalRunId: RetrievalRunId; readonly value: AcademicResearchRunValue }

/** Completed or cancelled Academic draft, observed retrieval run, and owning Session. */
export interface AcademicResearchRunValue {
  /** Insight generation outcome, independent of retrieval and semantic approval. */
  readonly synthesis: {
    readonly status: 'not_run' | 'blocked' | 'failed' | 'completed' | 'partial_success'
    readonly reasons: readonly string[]
  }
  readonly sessionId: SessionId
  readonly status: 'completed' | 'cancelled'
  /** Latest Q6 snapshot for this run; null when a legacy selector produced no ranked workflow. */
  readonly q6: AcademicQ6Projection | null
  readonly stages: AcademicResearchStageResults
  /** Absent when no hybrid query settled; cancellation can retain completed earlier queries only. */
  readonly hybridRetrieval?: AcademicHybridRetrievalView
  readonly retrievalRun: RetrievalRun
  readonly papers: readonly AcademicPaperResultView[]
  readonly failures: readonly {
    readonly workVersionId: WorkVersionId
    readonly stage: 'fulltext' | 'extraction'
  }[]
  readonly report: AcademicResearchReportView | null
}
