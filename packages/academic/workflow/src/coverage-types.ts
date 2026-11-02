/** Explicit limits and durable state for stop-time coverage review and one repair round. */
import type { AcademicWork, EvidenceId, EvidenceRecord, ResearchAspectId, ResearchAspectCoverage, ResearchBrief,
  ResearchCoverageRequirement, ResearchQuestionCoverageResult, RetrievalRunId, WorkVersionId } from '@deepseek-ai/dsh-academic-model'
import type { EvidenceExtractionInput, EvidenceExtractionResult } from '@deepseek-ai/dsh-academic-evidence'

/** Deployment-supplied bounds; all model dispatches, including failed ones, consume the counters. */
export interface CoverageRepairPolicy {
  /** Opt-in targeted repair; absent historical checkpoints retain the original algorithm. */
  readonly targeting?: CoverageTargetingPolicy
  readonly minimumSupportingWorks: number
  readonly maximumReviews: number
  readonly maximumRepairRounds: number
  readonly maximumRepairPapers: number
  readonly maximumNewCandidateWorks: number
  readonly maximumExcerptCharacters: number
  readonly maximumRepairCharacters: number
}

/** Explicit bounds for gap-driven selection, model admission and one retained-pool candidate. */
export interface CoverageTargetingPolicy {
  readonly maximumWindowsPerPaper: number
  readonly maximumWindowCharacters: number
  readonly maximumSourceOptions: number
  readonly maximumPreviewCharacters: number
  readonly maximumTotalCharacters: number
  readonly contextCharacters: number
  readonly maximumCandidateReads: number
  readonly maximumModelTokens: number
  readonly maximumModelCalls: number
  readonly maximumElapsedMs: number
  readonly repairMaxTokens: number
  readonly deltaReviewMaxTokens: number
  readonly candidateMaxTokens: number
  readonly finalReviewReserveTokens: number
}

/** Operation-owned token reservation callbacks; never serialized into a model prompt. */
export interface CoverageModelBudget {
  readonly reserve: (inputTokens: number, outputTokens: number) => Promise<number>
  readonly settle: (reservation: number, actualTokens: number | undefined) => Promise<void>
}

/** Durable reservations survive interrupted calls without granting their allowance again. */
export interface CoverageTargetingState {
  readonly startedAt: string
  readonly characters: number
  readonly candidateReads: readonly WorkVersionId[]
  readonly dispatches: readonly { readonly reservedTokens: number; readonly actualTokens: number | null }[]
  readonly exhausted: 'tokens' | 'time' | 'characters' | null
}

/** Frozen evidence view submitted to one logged semantic review. */
export interface CoverageReviewInput {
  /** Bounded source previews for repair routing only; these are never admitted evidence. */
  readonly repairSources?: readonly {
    readonly workVersionId: WorkVersionId
    readonly title: string
    readonly windows: readonly {
      readonly segmentIndex: number
      readonly start: number
      readonly end: number
      readonly aspectIds: readonly ResearchAspectId[]
      readonly preview: string
    }[]
  }[]
  /** Only affected aspects are rechecked; complete unmodified support is retained by the runtime. */
  readonly delta?: {
    readonly aspectIds: readonly ResearchAspectId[]
    readonly baseline: CoverageReview
    readonly newEvidenceIds?: readonly EvidenceId[]
  }
  readonly retrievalRunId: RetrievalRunId
  readonly brief: ResearchBrief
  readonly works: readonly AcademicWork[]
  readonly evidence: readonly EvidenceRecord[]
  readonly questionLinks: readonly { readonly evidenceId: EvidenceRecord['evidenceId']; readonly question: string }[]
}

/** Semantic review output; program-owned aggregation decides whole-question coverage. */
export interface CoverageReview {
  /** Source routing chosen during the same initial review, checked against supplied previews. */
  readonly preferredRepairs?: readonly {
    readonly question: string
    readonly workVersionId: WorkVersionId
    readonly windowIndexes: readonly number[]
  }[]
  /** Bounded discovery phrases for missing approved aspects; they never change acceptance criteria. */
  readonly gapTerms?: readonly { readonly aspectId: ResearchAspectId; readonly terms: readonly string[] }[]
  /** Covered baseline aspects contradicted by the newly supplied evidence; they become uncertain. */
  readonly invalidatedAspectIds?: readonly ResearchAspectId[]
  readonly aspects: readonly ResearchAspectCoverage[]
}

/** State committed before a review or repair is dispatched and after its result is retained. */
export interface CoverageRepairState {
  readonly targeting?: CoverageTargetingState
  readonly evidenceDigests?: readonly { readonly evidenceId: EvidenceId; readonly digest: string }[]
  readonly schemaVersion: 1 | 2
  readonly policy: CoverageRepairPolicy
  readonly requirements: readonly ResearchCoverageRequirement[]
  readonly reviewCalls: number
  readonly repairRounds: number
  readonly repairedWorkVersionIds: readonly WorkVersionId[]
  readonly repairCandidateIds: readonly WorkVersionId[]
  readonly repairSearchRounds: number
  /** Evidence snapshot of the last settled review; a pending call retains this baseline. */
  readonly fingerprint: string | null
  /** Last settled review, also retained while its successor is pending. Null before the first review. */
  readonly review: CoverageReview | null
  readonly coverage: ResearchQuestionCoverageResult | null
  readonly pending: 'review' | 'repair' | null
  readonly failure: 'review_failed' | 'repair_failed' | null
}

/** Existing verified paper and approved gaps for one bounded extraction dispatch. */
export interface CoverageEvidenceRepairInput {
  readonly retrievalRunId: RetrievalRunId
  readonly source: EvidenceExtractionInput
  readonly initial: EvidenceExtractionResult
  readonly requirements: readonly ResearchCoverageRequirement[]
  /** Exact preselected original-source windows, charged before dispatch by the run owner. */
  readonly windows?: EvidenceExtractionInput['segments']
}
