/** Browser-safe request and result vocabulary for Academic research runs. */
import type {
  AcademicWorkId, Availability, ClaimAssessmentId, ClaimId, EvidenceId, EvidenceSnapshotId,
  ExtractionMethod, ResearchBriefId, RetrievalRun, SourceLocatorId, WorkVersionId,
} from '@deepseek-ai/dsh-academic-model'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One bounded Academic research run attached to an existing Session. */
export interface AcademicResearchRunRequest {
  readonly sessionId: SessionId
  /** Identity returned by plan preview; a newer approved plan requires another preview. */
  readonly researchBriefId: ResearchBriefId
  /** Global deduplicated candidate-work bound for the complete run. */
  readonly maxResults?: number
  readonly synthetic: boolean
}

/** One system-authored search direction retained with the reviewed plan. */
export interface AcademicPlannedSearch {
  /** Exact search expression sent to source providers. */
  readonly query: string
  /** Chinese explanation of this search direction. */
  readonly purpose: string
  /** Research questions from the same Brief that this search supports. */
  readonly questions: readonly string[]
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

/** Completed or cancelled Academic draft, observed retrieval run, and owning Session. */
export interface AcademicResearchRunValue {
  /** Insight generation outcome, independent of retrieval and semantic approval. */
  readonly synthesis: {
    readonly status: 'not_run' | 'blocked' | 'failed' | 'completed' | 'partial_success'
    readonly reasons: readonly string[]
  }
  readonly sessionId: SessionId
  readonly status: 'completed' | 'cancelled'
  readonly stages: AcademicResearchStageResults
  readonly retrievalRun: RetrievalRun
  readonly papers: readonly AcademicPaperResultView[]
  readonly failures: readonly {
    readonly workVersionId: WorkVersionId
    readonly stage: 'fulltext' | 'extraction'
  }[]
  readonly report: AcademicResearchReportView | null
}
