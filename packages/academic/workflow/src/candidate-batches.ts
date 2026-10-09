/** Deterministic Q5 scheduling over B's authoritative candidate queues. */
import { targetIncludedWorks,
  type AcademicCandidateRankingResult,
  type ExecutableResearchBrief,
  type HybridSearchPlan,
  type ResearchQuestionCoverageResult,
  type SearchStopDecision,
  type WorkVersionId } from '@deepseek-ai/dsh-academic-model'

/** Caller-owned batch sizes; deployments may tune them without changing scheduling semantics. */
export interface CandidateBatchPolicy {
  readonly initialBatchSize: number
  readonly evidenceGapBatchSize: number
  readonly replenishmentBatchSize: number
  /** Independent evidence-bearing works required before one question is considered covered. */
  readonly minimumQuestionSupportingWorks: number
}

/** Observed state required to replay one scheduling decision. */
export interface CandidateBatchPlanningInput {
  readonly brief: ExecutableResearchBrief
  readonly plan: HybridSearchPlan
  readonly ranking: AcademicCandidateRankingResult
  readonly coverage: ResearchQuestionCoverageResult
  readonly policy: CandidateBatchPolicy
  readonly scheduledWorkVersionIds: readonly WorkVersionId[]
  readonly completedBatchCount: number
  readonly consecutiveBatchesWithoutEvidence: number
  readonly includedWorks: number
  readonly completedSearchRounds: number
  readonly cancelled: boolean
  readonly elapsedTimeLimitReached: boolean
  readonly reviewRequired: boolean
}

/** Why the scheduler selected another full-text batch. */
export type CandidateBatchReason =
  | 'initial_priority'
  | 'evidence_gap'
  | 'inclusion_target'
  | 'evidence_requirement'

/** One immutable, one-based batch selected from Q4's ordered queues. */
export interface CandidateFulltextBatch {
  readonly batchIndex: number
  readonly reason: CandidateBatchReason
  readonly workVersionIds: readonly [WorkVersionId, ...WorkVersionId[]]
  readonly questions: readonly string[]
}

/** Q5 either schedules full text, asks B for a gap query, or stops with a stable reason. */
export type CandidateBatchDecision =
  | {
    readonly action: 'schedule_batch'
    readonly batch: CandidateFulltextBatch
    readonly searchQuestions: readonly []
    readonly stop: Extract<SearchStopDecision, { readonly shouldStop: false }>
  }
  | {
    readonly action: 'search_evidence_gap'
    readonly batch: null
    readonly searchQuestions: readonly [string, ...string[]]
    readonly stop: Extract<SearchStopDecision, { readonly shouldStop: false }>
  }
  | {
    readonly action: 'stop'
    readonly batch: null
    readonly searchQuestions: readonly []
    readonly stop: Extract<SearchStopDecision, { readonly shouldStop: true }>
  }

/**
 * Select the next Q5 action without changing Q4 scores, priorities, or queue order.
 *
 * @param input - Approved Brief, exact ranking, observed coverage, explicit batch policy, and run facts.
 * @returns A replayable decision to schedule a batch, request evidence-gap search, or stop.
 * @throws {RangeError} Contracts, counters, policy values, or scheduled identities are inconsistent.
 */
export function planCandidateBatch(input: CandidateBatchPlanningInput): CandidateBatchDecision {
  validateInput(input)
  const { brief, ranking, coverage } = input
  const gaps = coverage.questions.filter(question => question.status !== 'covered').map(question => question.question)
  const stop = terminalDecision(input)
  if (stop !== null) return { action: 'stop', batch: null, searchQuestions: [], stop }

  const scheduled = new Set(input.scheduledWorkVersionIds)
  const evaluations = new Map(ranking.evaluations.map(evaluation => [evaluation.workVersionId, evaluation]))
  const eligibleOrder = [...ranking.queues.p0, ...ranking.queues.p1, ...ranking.queues.p2]
    .filter(workVersionId => evaluations.get(workVersionId)?.fulltextAvailability.status === 'resolvable')
    .slice(0, brief.stopConditions.maximumCandidateWorks)
  const eligible = new Set(eligibleOrder)
  const remaining = eligibleOrder
    .filter(workVersionId => !scheduled.has(workVersionId))
  const gapSet = new Set(gaps)
  const gapCandidates = remaining.filter((workVersionId) => {
    const evaluation = evaluations.get(workVersionId)
    return evaluation !== undefined && evaluation.matchedQuestions.some(question => gapSet.has(question))
  })

  if (input.completedBatchCount === 0) {
    const initial = ranking.queues.p0.filter(workVersionId => eligible.has(workVersionId)
      && !scheduled.has(workVersionId))
      .slice(0, input.policy.initialBatchSize)
    if (initial.length > 0) return batchDecision(input, 'initial_priority', initial, [])
  }
  if (gapCandidates.length > 0) {
    return batchDecision(input, 'evidence_gap', gapCandidates.slice(0, input.policy.evidenceGapBatchSize), gaps)
  }
  const targetMet = input.includedWorks >= rankingTarget(input)
  if (remaining.length > 0 && (!targetMet || !coverage.evidenceRequirementsMet)) {
    const reason = targetMet ? 'evidence_requirement' : 'inclusion_target'
    return batchDecision(input, reason, remaining.slice(0, input.policy.replenishmentBatchSize), [])
  }
  if (input.completedSearchRounds < input.plan.maximumSearchRounds
    && eligibleOrder.length < brief.stopConditions.maximumCandidateWorks) {
    const questions = gaps.length > 0 ? gaps : brief.questions
    if (questions.length > 0) {
      return { action: 'search_evidence_gap', batch: null,
        searchQuestions: questions as [string, ...string[]], stop: continuing('No ranked candidate can fill the remaining evidence need.') }
    }
  }
  const exhausted = input.completedSearchRounds >= input.plan.maximumSearchRounds
    ? stopped('maximum_search_rounds', 'The approved search-round limit has been reached.')
    : eligibleOrder.length >= brief.stopConditions.maximumCandidateWorks
      ? stopped('maximum_candidate_works', 'The approved candidate-work limit has been reached.')
      : stopped('candidate_exhausted', 'No unscheduled ranked candidate remains.')
  return { action: 'stop', batch: null, searchQuestions: [], stop: exhausted }
}

function terminalDecision(input: CandidateBatchPlanningInput): Extract<SearchStopDecision, { shouldStop: true }> | null {
  if (input.cancelled) return stopped('cancelled', 'The caller cancelled this research run.')
  if (input.reviewRequired) return stopped('review_required', 'The run requires human review before more work is scheduled.')
  if (input.elapsedTimeLimitReached) {
    return stopped('maximum_elapsed_time', 'The approved elapsed-time limit has been reached.')
  }
  const { brief, coverage } = input
  if (brief.stopConditions.stopWhenEvidenceRequirementsMet
    && input.includedWorks >= rankingTarget(input)
    && coverage.evidenceRequirementsMet && coverage.allQuestionsCovered) {
    return stopped('target_and_coverage_met', 'The desired inclusion target and question coverage are satisfied.')
  }
  if (input.includedWorks >= brief.stopConditions.maximumIncludedWorks) {
    return stopped('maximum_included_works', 'The approved included-work limit has been reached.')
  }
  if (input.completedBatchCount > 0
    && input.consecutiveBatchesWithoutEvidence >= brief.stopConditions.saturationRounds) {
    return stopped('saturated', 'Consecutive completed batches added no usable evidence.')
  }
  return null
}

function batchDecision(input: CandidateBatchPlanningInput, reason: CandidateBatchReason,
  selected: readonly WorkVersionId[], questions: readonly string[]): CandidateBatchDecision {
  const availableSlots = input.brief.stopConditions.maximumIncludedWorks - input.includedWorks
  const bounded = selected.slice(0, availableSlots)
  if (bounded.length === 0) throw new RangeError('A scheduled candidate batch cannot be empty.')
  return {
    action: 'schedule_batch',
    batch: { batchIndex: input.completedBatchCount + 1, reason,
      workVersionIds: bounded as [WorkVersionId, ...WorkVersionId[]], questions },
    searchQuestions: [],
    stop: continuing(`Scheduled ${bounded.length} ranked candidate(s) for ${reason}.`),
  }
}

function rankingTarget(input: CandidateBatchPlanningInput): number {
  return input.plan.inclusionTargets.target
}

function validateInput(input: CandidateBatchPlanningInput): void {
  const { brief, plan, ranking, coverage, policy } = input
  if (brief.researchBriefId !== ranking.researchBriefId || brief.version !== ranking.researchBriefVersion
    || brief.researchBriefId !== coverage.researchBriefId || brief.version !== coverage.researchBriefVersion
    || brief.researchBriefId !== plan.researchBriefId || brief.version !== plan.researchBriefVersion
    || brief.approval.approvedBriefVersion !== brief.version) {
    throw new RangeError('Batch scheduling requires one exact approved ResearchBrief version.')
  }
  if (plan.inclusionTargets.minimum !== brief.evidenceRequirements.minimumIncludedWorks
    || plan.inclusionTargets.target !== targetIncludedWorks(brief)
    || plan.inclusionTargets.maximum !== brief.stopConditions.maximumIncludedWorks
    || plan.maximumSearchRounds > brief.stopConditions.maximumSearchRounds) {
    throw new RangeError('The search plan does not preserve the approved ResearchBrief inclusion counts and limits.')
  }
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer.`)
  }
  for (const [name, value] of [
    ['completedBatchCount', input.completedBatchCount],
    ['consecutiveBatchesWithoutEvidence', input.consecutiveBatchesWithoutEvidence],
    ['includedWorks', input.includedWorks],
    ['completedSearchRounds', input.completedSearchRounds],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer.`)
  }
  const approvedQuestions = new Set(brief.questions)
  if (coverage.questions.length !== approvedQuestions.size
    || new Set(coverage.questions.map(question => question.question)).size !== coverage.questions.length
    || coverage.questions.some(question => !approvedQuestions.has(question.question))) {
    throw new RangeError('Coverage must decide every distinct approved ResearchBrief question exactly once.')
  }
  const eligible = new Set([...ranking.queues.p0, ...ranking.queues.p1, ...ranking.queues.p2])
  if (new Set(input.scheduledWorkVersionIds).size !== input.scheduledWorkVersionIds.length
    || input.scheduledWorkVersionIds.some(workVersionId => !eligible.has(workVersionId))) {
    throw new RangeError('Scheduled versions must be distinct members of the eligible ranking queues.')
  }
}

function continuing(detail: string): Extract<SearchStopDecision, { shouldStop: false }> {
  return { shouldStop: false, reason: null, details: [detail] }
}

function stopped(reason: Extract<SearchStopDecision, { shouldStop: true }>['reason'],
  detail: string): Extract<SearchStopDecision, { shouldStop: true }> {
  return { shouldStop: true, reason, details: [detail] }
}
