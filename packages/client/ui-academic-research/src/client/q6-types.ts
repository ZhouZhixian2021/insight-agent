/** Presentation input composed from the existing Q1 contracts, not a new scholarly model. */
import type {
  HybridSearchPlan, CandidateAssessment, AcademicCandidateRankingResult, ResearchQuestionCoverageResult,
  HybridSearchRound, SearchStopDecision, QueryWorkflowProgressEvent,
} from '@deepseek-ai/dsh-academic-model'

/** Fixed, explicitly synthetic material for the first read-only Q6 delivery. */
export interface Q6Sample {
  readonly sampleSchemaVersion: 1
  readonly synthetic: true
  readonly plan: HybridSearchPlan
  readonly assessments: readonly CandidateAssessment[]
  readonly rankingResult: AcademicCandidateRankingResult
  readonly coverage: ResearchQuestionCoverageResult
  readonly round: HybridSearchRound
  readonly stopDecision: SearchStopDecision
  readonly progressEvents: readonly QueryWorkflowProgressEvent[]
}
