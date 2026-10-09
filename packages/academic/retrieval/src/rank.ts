/** Explainable candidate evaluation over verified, deduplicated scholarly works. */
import { candidatePriorityForScore, createCandidateRankingResult, createCandidateScoreBreakdown,
  type AcademicCandidateEvaluation, type AcademicCandidateRankingResult, type AcademicWork,
  type CandidateAssessment, type CandidateClassification, type CandidateHardFilterReason,
  type ExecutableResearchBrief, type HybridSearchPlan, type PartialDate,
  type WorkVersion,
} from '@deepseek-ai/dsh-academic-model'
import type { PlannedSearchRoundResult } from './execute.ts'

/**
 * Evaluate each verified work against the exact approved Brief and plan.
 * The caller supplies semantic assessments; this library owns hard decisions,
 * weighted points, priority thresholds, stable diversity ordering, and reasons.
 * @param plan - Reviewed Q2 plan with approved constraints and ranking policy.
 * @param brief - Approved Brief version bound to the plan.
 * @param round - Q3 deduplicated works, versions, and query provenance.
 * @param assessments - Exactly one reviewed semantic assessment per work.
 * @returns Every work's evaluation and P0/P1/P2/excluded queues.
 * @throws {RangeError} The Brief, plan, work identities, or assessments disagree.
 */
export function rankPlannedCandidates(
  plan: HybridSearchPlan,
  brief: ExecutableResearchBrief,
  round: PlannedSearchRoundResult,
  assessments: readonly CandidateAssessment[],
): AcademicCandidateRankingResult {
  if (brief.researchBriefId !== plan.researchBriefId || brief.version !== plan.researchBriefVersion
    || brief.approval.approvedBriefVersion !== brief.version) {
    throw new RangeError('ranking requires the approved Brief version bound to the plan')
  }
  const works = round.ingested.works
  const byAssessment = new Map(assessments.map(assessment => [assessment.academicWorkId, assessment]))
  if (byAssessment.size !== works.length || assessments.length !== works.length
    || works.some(work => !byAssessment.has(work.academicWorkId))) {
    throw new RangeError('ranking requires exactly one assessment per verified work')
  }
  const versions = new Map(round.ingested.versions.map(version => [version.workVersionId, version]))
  const discoveredBy = new Map(round.discoveredBy.map(item => [item.academicWorkId, item.searchQueryIds]))
  const approvedQuestions = [...new Set(brief.questions)]
  const evaluations = works.map((work): AcademicCandidateEvaluation => {
    const version = versions.get(work.canonicalVersionId)
    const assessment = byAssessment.get(work.academicWorkId)
    const queryIds = discoveredBy.get(work.academicWorkId)
    if (version === undefined || assessment === undefined || queryIds === undefined) {
      throw new RangeError('ranked work requires a canonical version and query provenance')
    }
    validateAssessment(assessment, plan, approvedQuestions)
    const exclusions = hardExclusions(work, version, plan, brief, assessment)
    const hardFilter = exclusions.length === 0
      ? { status: 'eligible' as const, reasons: [] }
      : { status: 'excluded' as const,
        reasons: exclusions as [CandidateHardFilterReason, ...CandidateHardFilterReason[]] }
    const score = createCandidateScoreBreakdown({
      topicRelevance: points(plan.rankingPolicy.weights.topicRelevance, assessment.topicRelevance),
      questionMatch: points(plan.rankingPolicy.weights.questionMatch,
        assessment.matchedQuestions.length / approvedQuestions.length),
      evidencePotential: points(plan.rankingPolicy.weights.evidencePotential, assessment.evidencePotential),
      methodMatch: points(plan.rankingPolicy.weights.methodMatch, assessment.methodMatch),
      workTypeFit: points(plan.rankingPolicy.weights.workTypeFit, workTypeFits(version, plan, brief) ? 1 : 0),
      sourceQuality: points(plan.rankingPolicy.weights.sourceQuality, assessment.sourceQuality),
      recency: points(plan.rankingPolicy.weights.recency, assessment.recency),
      fulltextAvailability: points(plan.rankingPolicy.weights.fulltextAvailability,
        assessment.fulltextAvailability.status === 'resolvable' ? 1 : 0),
    }, plan.rankingPolicy)
    const priority = candidatePriorityForScore(score.total, hardFilter.status === 'excluded', plan.rankingPolicy)
    const classification = classify(assessment)
    const sourceTags = version.sourceRecords.map(record => `source:${record.provider}`)
    const teamTag = work.authors[0]?.trim().toLowerCase()
    const diversityTags = [...new Set([
      `class:${classification}`,
      ...sourceTags,
      ...(teamTag ? [`team:${teamTag}`] : []),
      ...assessment.matchedQuestions.map(question => `question:${question}`),
      ...assessment.diversityTags.map(tag => `label:${tag.trim().toLowerCase()}`),
    ])]
    return { schemaVersion: 1, academicWorkId: work.academicWorkId, workVersionId: version.workVersionId,
      discoveredBy: queryIds, classification, hardFilter, score, priority,
      matchedQuestions: assessment.matchedQuestions, fulltextAvailability: assessment.fulltextAvailability, diversityTags,
      decisionReasons: [
        `Classified as ${classification}; weighted score ${score.total} gives ${priority}.`,
        ...exclusions.map(describeHardFilterReason),
        ...assessment.reasons,
      ] }
  })
  const queues = { p0: [] as AcademicCandidateEvaluation[], p1: [] as AcademicCandidateEvaluation[],
    p2: [] as AcademicCandidateEvaluation[], excluded: [] as AcademicCandidateEvaluation[] }
  for (const evaluation of evaluations) queues[evaluation.priority].push(evaluation)
  for (const priority of ['p0', 'p1', 'p2'] as const) queues[priority] = diversify(queues[priority])
  queues.excluded.sort(compareScore)
  return createCandidateRankingResult({
    schemaVersion: 1,
    researchBriefId: brief.researchBriefId,
    researchBriefVersion: brief.version,
    evaluations,
    queues: {
      p0: queues.p0.map(evaluation => evaluation.workVersionId),
      p1: queues.p1.map(evaluation => evaluation.workVersionId),
      p2: queues.p2.map(evaluation => evaluation.workVersionId),
      excluded: queues.excluded.map(evaluation => evaluation.workVersionId),
    },
    limitations: [...new Set(assessments.flatMap(assessmentLimitations))],
  }, plan, approvedQuestions)
}

function validateAssessment(assessment: CandidateAssessment, plan: HybridSearchPlan,
  approvedQuestions: readonly string[]): void {
  if (assessment.inclusionRuleMatches.length !== plan.constraints.inclusionRules.length
    || assessment.exclusionRuleMatches.length !== plan.constraints.exclusionRules.length) {
    throw new RangeError('assessment must decide every approved inclusion and exclusion rule')
  }
  if (new Set(assessment.matchedQuestions).size !== assessment.matchedQuestions.length
    || assessment.matchedQuestions.some(question => !approvedQuestions.includes(question))) {
    throw new RangeError('matchedQuestions must be distinct approved Brief questions')
  }
  if ([...plan.constraints.requiredTerms, ...plan.constraints.excludedTerms].some(term => term.trim() === '')) {
    throw new RangeError('planned lexical terms must be non-empty')
  }
  for (const value of [assessment.topicRelevance, assessment.evidencePotential, assessment.methodMatch,
    assessment.sourceQuality, assessment.recency]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError('semantic score fractions must be between zero and one')
    }
  }
  if (assessment.diversityTags.some(tag => tag.trim() === '')) {
    throw new RangeError('diversityTags must be non-empty')
  }
}

function hardExclusions(work: AcademicWork, version: WorkVersion, plan: HybridSearchPlan,
  brief: ExecutableResearchBrief, assessment: CandidateAssessment): CandidateHardFilterReason[] {
  const reasons: CandidateHardFilterReason[] = []
  if (work.publicationStatus.status === 'available' && work.publicationStatus.value === 'retracted') {
    reasons.push({ code: 'work_retracted' })
  }
  if (version.status === 'retracted' || version.versionType === 'retracted') {
    reasons.push({ code: 'version_retracted' })
  }
  if (version.versionType === 'preprint' && !brief.evidenceRequirements.allowPreprints) {
    reasons.push({ code: 'preprint_not_allowed' })
  }
  if (!plan.constraints.includedWorkTypes.includes(version.versionType)) {
    reasons.push({ code: 'work_type_not_included', detail: version.versionType })
  }
  const { publicationWindow } = plan.constraints
  if (publicationWindow.start !== null || publicationWindow.end !== null) {
    const date = publicationWindow.dateBasis === 'first_public_release' ? work.firstPublicDate : version.releaseDate
    if (date.status !== 'available') reasons.push({ code: 'publication_date_unknown' })
    else {
      const bounds = dateBounds(date.value)
      if (publicationWindow.start !== null && bounds.end < dateBounds(publicationWindow.start).start) {
        reasons.push({ code: 'before_publication_window' })
      }
      if (publicationWindow.end !== null && bounds.start > dateBounds(publicationWindow.end).end) {
        reasons.push({ code: 'after_publication_window' })
      }
    }
  }
  const abstract = assessment.abstract.status === 'available' ? assessment.abstract.value : ''
  const keywords = assessment.keywords.status === 'available' ? assessment.keywords.value : []
  const text = [work.title, abstract, ...keywords].join(' ').toLowerCase()
  for (const term of plan.constraints.requiredTerms) {
    if (!text.includes(term.trim().toLowerCase())) reasons.push({ code: 'required_term_missing', detail: term })
  }
  for (const term of plan.constraints.excludedTerms) {
    if (text.includes(term.trim().toLowerCase())) reasons.push({ code: 'excluded_term_matched', detail: term })
  }
  assessment.inclusionRuleMatches.forEach((matched, index) => {
    const detail = plan.constraints.inclusionRules[index]
    if (matched === false && detail !== undefined) reasons.push({ code: 'inclusion_rule_not_met', detail })
  })
  assessment.exclusionRuleMatches.forEach((matched, index) => {
    const detail = plan.constraints.exclusionRules[index]
    if (matched === true && detail !== undefined) reasons.push({ code: 'exclusion_rule_matched', detail })
  })
  return reasons
}

function describeHardFilterReason(reason: CandidateHardFilterReason): string {
  const detail = reason.detail === undefined ? '' : `: ${reason.detail}`
  switch (reason.code) {
    case 'work_retracted': return 'The work is retracted.'
    case 'version_retracted': return 'The canonical version is retracted.'
    case 'preprint_not_allowed': return 'The reviewed Brief does not allow preprints.'
    case 'work_type_not_included': return `The work type is outside the reviewed scope${detail}.`
    case 'before_publication_window': return 'The publication date is before the reviewed window.'
    case 'after_publication_window': return 'The publication date is after the reviewed window.'
    case 'publication_date_unknown': return 'The publication date is unavailable for the reviewed window.'
    case 'required_term_missing': return `A required term is absent${detail}.`
    case 'excluded_term_matched': return `An excluded term is present${detail}.`
    case 'inclusion_rule_not_met': return `An inclusion rule is not met${detail}.`
    case 'exclusion_rule_matched': return `An exclusion rule applies${detail}.`
    default: return assertNever(reason.code)
  }
}

function assessmentLimitations(assessment: CandidateAssessment): string[] {
  const limitations: string[] = []
  if (assessment.abstract.status !== 'available') {
    limitations.push(`Work ${assessment.academicWorkId} has no usable provider abstract (${assessment.abstract.status}).`)
  }
  if (assessment.keywords.status !== 'available') {
    limitations.push(`Work ${assessment.academicWorkId} has no usable provider keywords (${assessment.keywords.status}).`)
  }
  if (assessment.fulltextAvailability.status !== 'resolvable') {
    limitations.push(`Work ${assessment.academicWorkId} full text is ${assessment.fulltextAvailability.status}: ${assessment.fulltextAvailability.reason}`)
  }
  const deferredInclusionRules = assessment.inclusionRuleMatches.filter(match => match === null).length
  const deferredExclusionRules = assessment.exclusionRuleMatches.filter(match => match === null).length
  if (deferredInclusionRules + deferredExclusionRules > 0) {
    limitations.push(`Work ${assessment.academicWorkId} defers ${deferredInclusionRules} inclusion and ${deferredExclusionRules} exclusion rule decision(s) to full-text scope validation.`)
  }
  return limitations
}

function workTypeFits(version: WorkVersion, plan: HybridSearchPlan, brief: ExecutableResearchBrief): boolean {
  return plan.constraints.includedWorkTypes.includes(version.versionType)
    && (brief.evidenceRequirements.allowPreprints || version.versionType !== 'preprint')
}

function classify(assessment: CandidateAssessment): CandidateClassification {
  if (assessment.topicRelevance === 0 && assessment.matchedQuestions.length === 0) return 'irrelevant'
  for (const kind of ['review', 'benchmark_or_dataset', 'empirical_evaluation', 'core_method',
    'application', 'adjacent_technology'] as const) {
    if (assessment.contributionSignals.includes(kind)) return kind
  }
  return 'background'
}

function points(weight: number, fraction: number): number {
  return Math.round(weight * fraction * 100) / 100
}

function dateBounds(date: PartialDate): { readonly start: string; readonly end: string } {
  switch (date.precision) {
    case 'year': return { start: `${date.iso}-01-01`, end: `${date.iso}-12-31` }
    case 'month': return { start: `${date.iso}-01`, end: `${date.iso}-31` }
    case 'day': return { start: date.iso, end: date.iso }
    default: return assertNever(date.precision)
  }
}

function assertNever(value: never): never {
  throw new Error(`unexpected candidate-ranking value: ${String(value)}`)
}

function compareScore(left: AcademicCandidateEvaluation, right: AcademicCandidateEvaluation): number {
  return right.score.total - left.score.total || left.academicWorkId.localeCompare(right.academicWorkId)
}

function diversify(input: readonly AcademicCandidateEvaluation[]): AcademicCandidateEvaluation[] {
  const remaining = [...input].sort(compareScore)
  const ordered: AcademicCandidateEvaluation[] = []
  const seen = new Set<string>()
  while (remaining.length > 0) {
    let best = 0
    if (ordered.length > 0) {
      for (let index = 1; index < remaining.length; index++) {
        const candidate = remaining[index], incumbent = remaining[best]
        if (candidate === undefined || incumbent === undefined) continue
        const novelty = candidate.diversityTags.filter(tag => !seen.has(tag)).length
        const previous = incumbent.diversityTags.filter(tag => !seen.has(tag)).length
        if (novelty > previous) best = index
      }
    }
    const [selected] = remaining.splice(best, 1)
    if (selected === undefined) break
    ordered.push(selected)
    for (const tag of selected.diversityTags) seen.add(tag)
  }
  return ordered
}
