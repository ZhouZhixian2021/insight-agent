/** Reviewed query planning and verified candidate acquisition for Academic insight. */
export { planHybridSearch, extendPlanForEvidenceGaps } from './planner.ts'
export type { QueryExpansion, QueryPlanningOptions } from './planner.ts'
export { executePlannedSearchRound } from './execute.ts'
export type { PlannedSearchAdapters, PlannedSearchLimits, PlannedSearchProgressObservation,
  PlannedSearchProgressObserver, PlannedSearchRoundResult } from './execute.ts'
export { rankPlannedCandidates } from './rank.ts'
export type { CandidateAssessment } from '@deepseek-ai/dsh-academic-model'
