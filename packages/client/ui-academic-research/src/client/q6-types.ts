/** Presentation input composed from the existing Q1 contracts, not a new scholarly model. */
import type {
  HybridSearchPlan, CandidateAssessment, AcademicCandidateRankingResult, ResearchQuestionCoverageResult,
  HybridSearchRound, SearchStopDecision, QueryWorkflowProgressEvent,
  AcademicWork, WorkVersion,
} from '@deepseek-ai/dsh-academic-model'
import type { AcademicQ6CandidateAssessmentView, AcademicQ6CandidateEvaluationView,
  AcademicQ6RankingView } from '@deepseek-ai/dsh-api-academic-research-controller/types'

/** Common presentation fields supplied by either the formal projection or the synthetic fixture. */
export interface Q6CandidateData {
  readonly plan: HybridSearchPlan
  readonly assessments: readonly AcademicQ6CandidateAssessmentView[]
  readonly rankingResult: AcademicQ6RankingView & { readonly evaluations: readonly AcademicQ6CandidateEvaluationView[] }
  readonly works?: readonly AcademicWork[]
  readonly versions?: readonly WorkVersion[]
}

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
