/** Type-only Q5 observation fields shared with browser projections. */
import type {
  AcademicCandidateRankingResult,
  AcademicWork,
  CandidateAssessment,
  HybridSearchPlan,
  HybridSearchRound,
  ResearchQuestionCoverageResult,
  RetrievalRunId,
  SearchStopDecision,
  WorkVersion,
  WorkVersionId,
} from '@deepseek-ai/dsh-academic-model'

/** One Q5 scheduling decision: schedule a ranked batch, request a gap round, or stop selection. */
export interface AcademicBatchDecisionEvent {
  readonly retrievalRunId: RetrievalRunId
  /** One-based batch number; null when the decision is not a scheduled batch. */
  readonly batchIndex: number | null
  readonly action: 'schedule_batch' | 'search_evidence_gap' | 'stop'
  readonly workVersionIds: readonly WorkVersionId[]
  readonly searchQuestions: readonly string[]
  readonly reason: string | null
}

/** One Q5 batch settlement: how much evidence the batch admitted after processing. */
export interface AcademicBatchSettlementEvent {
  readonly retrievalRunId: RetrievalRunId
  /** One-based batch number matching its scheduling decision. */
  readonly batchIndex: number
  readonly admittedEvidence: number
  readonly completedAt: string
}

/** Complete run-local Q5 facts used to build browser projections without replaying Session events. */
export interface AcademicQueryWorkflowObservation {
  readonly schemaVersion: 1
  readonly retrievalRunId: RetrievalRunId
  readonly sequence: number
  readonly observedAt: string
  readonly status: 'running' | 'settled' | 'cancelled'
  readonly plan: HybridSearchPlan
  readonly works: readonly AcademicWork[]
  readonly versions: readonly WorkVersion[]
  readonly assessments: readonly CandidateAssessment[]
  readonly ranking: AcademicCandidateRankingResult
  readonly rounds: readonly HybridSearchRound[]
  readonly decisions: readonly AcademicBatchDecisionEvent[]
  readonly settlements: readonly AcademicBatchSettlementEvent[]
  readonly coverage: ResearchQuestionCoverageResult | null
  readonly stopDecision: SearchStopDecision | null
  readonly limitations: readonly string[]
}

/** Observe complete Q5 snapshots; subscriber failures do not interrupt research. */
export type AcademicQueryWorkflowObserver = (observation: AcademicQueryWorkflowObservation) => void
