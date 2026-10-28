/** Deterministic pre-model review selection over the shared, round-spanning model-review budget. */
import type { AcademicCandidateEvaluation, AcademicCandidateRankingResult, AcademicWorkId,
  CandidateAssessment, CandidatePriority, CandidateReviewSelectionDecisionV1, CandidateReviewSelectionV1,
  ExecutableResearchBrief, HybridSearchPlan, SearchQueryId } from '@deepseek-ai/dsh-academic-model'

const priorityRank: Readonly<Record<CandidatePriority, number>> = { p0: 0, p1: 1, p2: 2, excluded: 3 }

/** One eligible candidate with its reviewed assessment and approved-question routing. */
interface EligibleCandidate {
  readonly evaluation: AcademicCandidateEvaluation
  readonly assessment: CandidateAssessment
  readonly routedQuestions: readonly string[]
}

/**
 * Choose which eligible candidates consume the shared model-review budget.
 * The budget bounds only the number of candidates sent to the model; it is independent of the Plan
 * candidate ceiling and the P0/P1/P2 queue sizes. Approved-question coverage claims budget first, then
 * the remaining slots fill by the deterministic lexical order. Discovery-query routing allocates slots
 * but never adds semantic match points. Hard exclusions, unresolved full text, and prior attempts are
 * never selected; an attempted candidate consumes budget even when its call failed.
 * @param brief - Approved Brief version whose questions define coverage and routing.
 * @param plan - Reviewed plan bound to the same Brief version.
 * @param ranking - B-owned ranking for the same plan, carrying hard filters and lexical scores.
 * @param assessments - One reviewed assessment per ranked candidate, supplying provider abstract availability.
 * @param attemptedWorkIds - Candidates already sent to the model in this or an earlier round.
 * @param maximumModelReviews - Shared total model-review budget across initial and gap rounds.
 * @param options - Optional per-batch limit and approved questions to prioritize before other questions.
 * @returns One decision per ranked candidate with zero-based selection order, routing, and reasons.
 * @throws {RangeError} The Brief, plan, ranking, assessments, or budget disagree.
 */
export function selectCandidateReviews(brief: ExecutableResearchBrief, plan: HybridSearchPlan,
  ranking: AcademicCandidateRankingResult, assessments: readonly CandidateAssessment[],
  attemptedWorkIds: ReadonlySet<AcademicWorkId>, maximumModelReviews: number,
  options: { readonly maximumReviews?: number; readonly questions?: readonly string[] } = {}): CandidateReviewSelectionV1 {
  if (brief.researchBriefId !== plan.researchBriefId || brief.version !== plan.researchBriefVersion
    || brief.approval.approvedBriefVersion !== brief.version) {
    throw new RangeError('review selection requires the approved Brief version bound to the plan')
  }
  if (ranking.researchBriefId !== plan.researchBriefId || ranking.researchBriefVersion !== plan.researchBriefVersion) {
    throw new RangeError('review selection requires the ranking bound to the reviewed plan')
  }
  if (!Number.isSafeInteger(maximumModelReviews) || maximumModelReviews < 0) {
    throw new RangeError('maximumModelReviews must be a non-negative safe integer')
  }
  const approvedQuestions = [...new Set(brief.questions)]
  if (options.maximumReviews !== undefined
    && (!Number.isSafeInteger(options.maximumReviews) || options.maximumReviews < 0)) {
    throw new RangeError('maximumReviews must be a non-negative safe integer')
  }
  if (options.questions?.some(question => !approvedQuestions.includes(question))) {
    throw new RangeError('review priorities must reference approved questions')
  }
  const questionOrder = [...new Set([...(options.questions ?? []), ...approvedQuestions])]
  const questionsByQuery = new Map(plan.queries.map(query => [query.searchQueryId, query.questions]))
  const byAssessment = new Map(assessments.map(assessment => [assessment.academicWorkId, assessment]))
  if (byAssessment.size !== assessments.length
    || ranking.evaluations.some(evaluation => !byAssessment.has(evaluation.academicWorkId))) {
    throw new RangeError('review selection requires exactly one assessment per ranked candidate')
  }
  const attemptedBefore = attemptedWorkIds.size
  const budget = Math.max(0, maximumModelReviews - attemptedBefore)
  const batchBudget = Math.min(budget, options.maximumReviews ?? budget)
  const routing = new Map<AcademicWorkId, readonly string[]>(ranking.evaluations.map(evaluation =>
    [evaluation.academicWorkId, routeQuestions(approvedQuestions, questionsByQuery, evaluation.discoveredBy)]))
  const eligible: EligibleCandidate[] = []
  for (const evaluation of ranking.evaluations) {
    const assessment = byAssessment.get(evaluation.academicWorkId)
    if (assessment === undefined) throw new RangeError('review selection requires exactly one assessment per ranked candidate')
    if (evaluation.hardFilter.status === 'excluded' || evaluation.fulltextAvailability.status !== 'resolvable'
      || attemptedWorkIds.has(evaluation.academicWorkId)) continue
    eligible.push({ evaluation, assessment,
      routedQuestions: routing.get(evaluation.academicWorkId) ?? [] })
  }
  eligible.sort(compareLexical)
  const chosen = new Map<AcademicWorkId, { readonly order: number; readonly reason: 'question_coverage' | 'lexical_fill' }>()
  const covered = new Set<string>()
  let order = 0
  for (const question of questionOrder) {
    if (order >= batchBudget) break
    if (covered.has(question)) continue
    const pick = eligible.find(candidate => !chosen.has(candidate.evaluation.academicWorkId)
      && candidate.routedQuestions.includes(question))
    if (pick === undefined) continue
    chosen.set(pick.evaluation.academicWorkId, { order, reason: 'question_coverage' })
    order += 1
    for (const coveredQuestion of pick.routedQuestions) covered.add(coveredQuestion)
  }
  for (const candidate of eligible) {
    if (order >= batchBudget) break
    if (chosen.has(candidate.evaluation.academicWorkId)) continue
    chosen.set(candidate.evaluation.academicWorkId, { order, reason: 'lexical_fill' })
    order += 1
  }
  const decisions = ranking.evaluations.map((evaluation): CandidateReviewSelectionDecisionV1 => {
    const picked = chosen.get(evaluation.academicWorkId)
    const status: CandidateReviewSelectionDecisionV1['status'] = picked !== undefined ? 'selected'
      : evaluation.hardFilter.status === 'excluded' ? 'hard_excluded'
        : evaluation.fulltextAvailability.status !== 'resolvable' ? 'fulltext_unresolvable'
          : attemptedWorkIds.has(evaluation.academicWorkId) ? 'already_attempted'
            : 'not_selected_budget'
    return {
      academicWorkId: evaluation.academicWorkId,
      workVersionId: evaluation.workVersionId,
      routedQuestions: routing.get(evaluation.academicWorkId) ?? [],
      status,
      selectionOrder: picked?.order ?? null,
      selectionReason: picked?.reason ?? null,
    }
  })
  return { schemaVersion: 1, maximumModelReviews, attemptedBefore, remainingBudget: budget, decisions }
}

function compareLexical(left: EligibleCandidate, right: EligibleCandidate): number {
  return priorityRank[left.evaluation.priority] - priorityRank[right.evaluation.priority]
    || abstractRank(left.assessment) - abstractRank(right.assessment)
    || right.evaluation.score.total - left.evaluation.score.total
    || left.evaluation.academicWorkId.localeCompare(right.evaluation.academicWorkId)
}

function abstractRank(assessment: CandidateAssessment): number {
  return assessment.abstract.status === 'available' ? 0 : 1
}

function routeQuestions(approvedQuestions: readonly string[],
  questionsByQuery: ReadonlyMap<SearchQueryId, readonly string[]>,
  discoveredBy: readonly SearchQueryId[]): readonly string[] {
  const reached = new Set<string>()
  for (const queryId of discoveredBy) {
    for (const question of questionsByQuery.get(queryId) ?? []) {
      if (approvedQuestions.includes(question)) reached.add(question)
    }
  }
  return approvedQuestions.filter(question => reached.has(question))
}
