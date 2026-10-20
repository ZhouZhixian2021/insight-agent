import { describe, expect, it } from 'vitest'
import { ACADEMIC_CANDIDATE_RANKING_POLICY_V1, createAcademicWorkId, createResearchBriefId,
  createSearchQueryId, createWorkVersionId, type AcademicCandidateEvaluation, type AcademicCandidateRankingResult,
  type AcademicWorkId, type CandidateAssessment, type CandidatePriority, type ExecutableResearchBrief,
  type HybridSearchPlan, type SearchQueryId, type WorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { selectCandidateReviews } from '../src/index.ts'

const q1 = 'Q1', q2 = 'Q2', q3 = 'Q3'
const queryA = createSearchQueryId(), queryB = createSearchQueryId(), queryC = createSearchQueryId()
const queryAB = createSearchQueryId()

const brief: ExecutableResearchBrief = {
  schemaVersion: 1, researchBriefId: createResearchBriefId(), version: 1,
  topic: 'retrieval', aliases: [], questions: [q1, q2, q3],
  publicationWindow: { start: null, end: null, dateBasis: 'first_public_release' },
  includedWorkTypes: ['version_of_record'], inclusionRules: [], exclusionRules: [],
  evidenceRequirements: { minimumIncludedWorks: 1, minimumFulltextWorks: 0, minimumEvidenceLevel: 'abstract',
    requireLocatableEvidence: false, allowPreprints: false, insufficientEvidencePolicy: 'continue_with_warning' },
  targetAudience: 'Researchers', reportRequirements: { language: 'en',
    targetLength: { unit: 'words', minimum: null, maximum: null }, requiredSections: [], citationStyle: 'numeric',
    includeEvidenceAppendix: false, includeMethodology: false, includeLimitations: false, includeResearchGaps: false },
  stopConditions: { maximumSearchRounds: 2, maximumCandidateWorks: 20, maximumIncludedWorks: 6,
    maximumElapsedMinutes: null, saturationRounds: 2, stopWhenEvidenceRequirementsMet: true },
  assumptions: [], approval: { status: 'approved', reviewedBy: 'user', reviewedAt: '2026-10-20T00:00:00Z',
    approvedBriefVersion: 1, comment: null },
}

const plan: HybridSearchPlan = {
  schemaVersion: 1, researchBriefId: brief.researchBriefId, researchBriefVersion: brief.version,
  constraints: { publicationWindow: brief.publicationWindow, includedWorkTypes: brief.includedWorkTypes,
    inclusionRules: [], exclusionRules: [], requiredTerms: [], excludedTerms: [] },
  inclusionTargets: { minimum: 1, target: 3, maximum: 6 },
  rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
  queries: [
    { kind: 'academic', searchQueryId: queryA, expression: 'a', purpose: 'core', questions: [q1], roundIndex: 1,
      providers: ['openalex'] },
    { kind: 'academic', searchQueryId: queryB, expression: 'b', purpose: 'core', questions: [q2], roundIndex: 1,
      providers: ['openalex'] },
    { kind: 'academic', searchQueryId: queryC, expression: 'c', purpose: 'core', questions: [q3], roundIndex: 1,
      providers: ['openalex'] },
    { kind: 'academic', searchQueryId: queryAB, expression: 'ab', purpose: 'core', questions: [q1, q2], roundIndex: 1,
      providers: ['openalex'] },
  ],
  citationExpansionSeeds: [], maximumSearchRounds: 2,
}

interface CandidateSpec {
  readonly priority: CandidatePriority
  readonly score: number
  readonly discoveredBy: readonly SearchQueryId[]
  readonly abstract: 'available' | 'missing'
  readonly hardExcluded?: boolean
  readonly fulltext?: 'resolvable' | 'unresolved'
}

interface Built {
  readonly evaluation: AcademicCandidateEvaluation
  readonly assessment: CandidateAssessment
}

function build(spec: CandidateSpec): Built {
  const academicWorkId = createAcademicWorkId(), workVersionId = createWorkVersionId()
  const score = { topicRelevance: spec.score, questionMatch: 0, evidencePotential: 0, methodMatch: 0,
    workTypeFit: 0, sourceQuality: 0, recency: 0, fulltextAvailability: 0, total: spec.score }
  const evaluation: AcademicCandidateEvaluation = {
    schemaVersion: 1, academicWorkId, workVersionId, discoveredBy: spec.discoveredBy, classification: 'core_method',
    hardFilter: spec.hardExcluded === true
      ? { status: 'excluded', reasons: [{ code: 'off_topic', detail: 'excluded' }] }
      : { status: 'eligible', reasons: [] },
    score, priority: spec.priority, matchedQuestions: [],
    fulltextAvailability: spec.fulltext === 'unresolved'
      ? { status: 'unresolved', reason: 'no link' } : { status: 'resolvable' },
    diversityTags: [], decisionReasons: ['built for selection'],
  }
  const assessment: CandidateAssessment = {
    academicWorkId, abstract: spec.abstract === 'available'
      ? { status: 'available', value: 'Retrieval evaluation.' } : { status: 'not_extracted', reason: 'missing' },
    keywords: { status: 'unknown', reason: 'missing' }, fulltextAvailability: evaluation.fulltextAvailability,
    matchedQuestions: [], contributionSignals: [], topicRelevance: 0, evidencePotential: 0, methodMatch: 0,
    sourceQuality: 0, recency: 0, inclusionRuleMatches: [], exclusionRuleMatches: [], diversityTags: [],
    reasons: ['built for selection'],
  }
  return { evaluation, assessment }
}

function rankingOf(items: readonly Built[]): AcademicCandidateRankingResult {
  const queues: Record<CandidatePriority, WorkVersionId[]> = { p0: [], p1: [], p2: [], excluded: [] }
  for (const item of items) queues[item.evaluation.priority].push(item.evaluation.workVersionId)
  return { schemaVersion: 1, researchBriefId: brief.researchBriefId, researchBriefVersion: brief.version,
    evaluations: items.map(item => item.evaluation),
    queues: { p0: queues.p0, p1: queues.p1, p2: queues.p2, excluded: queues.excluded },
    limitations: [] }
}

function select(items: readonly Built[], attempted: readonly AcademicWorkId[], maximumModelReviews: number) {
  return selectCandidateReviews(brief, plan, rankingOf(items), items.map(item => item.assessment),
    new Set(attempted), maximumModelReviews)
}

describe('pre-model candidate review selection', () => {
  it('claims budget for question coverage before filling by lexical order', () => {
    const a = build({ priority: 'p0', score: 90, discoveredBy: [queryA], abstract: 'available' })
    const b = build({ priority: 'p0', score: 95, discoveredBy: [queryC], abstract: 'missing' })
    const c = build({ priority: 'p0', score: 80, discoveredBy: [queryC], abstract: 'available' })
    const d = build({ priority: 'p1', score: 70, discoveredBy: [queryAB], abstract: 'available' })
    const e = build({ priority: 'p0', score: 88, discoveredBy: [queryA], abstract: 'available', hardExcluded: true })
    const f = build({ priority: 'p0', score: 87, discoveredBy: [queryA], abstract: 'available', fulltext: 'unresolved' })
    const g = build({ priority: 'p0', score: 92, discoveredBy: [queryA], abstract: 'available' })
    const result = select([a, b, c, d, e, f, g], [g.evaluation.academicWorkId], 5)
    const decision = (item: Built) => result.decisions.find(entry =>
      entry.academicWorkId === item.evaluation.academicWorkId)
    expect(result).toMatchObject({ schemaVersion: 1, maximumModelReviews: 5, attemptedBefore: 1, remainingBudget: 4 })
    expect(decision(a)).toMatchObject({ status: 'selected', selectionOrder: 0, selectionReason: 'question_coverage',
      routedQuestions: [q1] })
    expect(decision(d)).toMatchObject({ status: 'selected', selectionOrder: 1, selectionReason: 'question_coverage',
      routedQuestions: [q1, q2] })
    expect(decision(c)).toMatchObject({ status: 'selected', selectionOrder: 2, selectionReason: 'question_coverage',
      routedQuestions: [q3] })
    expect(decision(b)).toMatchObject({ status: 'selected', selectionOrder: 3, selectionReason: 'lexical_fill' })
    expect(decision(e)).toMatchObject({ status: 'hard_excluded', selectionOrder: null, selectionReason: null })
    expect(decision(f)).toMatchObject({ status: 'fulltext_unresolvable', selectionOrder: null, selectionReason: null })
    expect(decision(g)).toMatchObject({ status: 'already_attempted', selectionOrder: null, selectionReason: null })
  })

  it('marks eligible candidates as budget-limited when coverage exhausts the budget', () => {
    const a = build({ priority: 'p0', score: 90, discoveredBy: [queryA], abstract: 'available' })
    const b = build({ priority: 'p0', score: 95, discoveredBy: [queryC], abstract: 'missing' })
    const c = build({ priority: 'p0', score: 80, discoveredBy: [queryC], abstract: 'available' })
    const d = build({ priority: 'p1', score: 70, discoveredBy: [queryAB], abstract: 'available' })
    const result = select([a, b, c, d], [], 2)
    expect(result.remainingBudget).toBe(2)
    expect(result.decisions.filter(entry => entry.status === 'selected')).toHaveLength(2)
    const status = (item: Built) => result.decisions.find(entry =>
      entry.academicWorkId === item.evaluation.academicWorkId)?.status
    expect(status(a)).toBe('selected')
    expect(status(d)).toBe('selected')
    expect(status(b)).toBe('not_selected_budget')
    expect(status(c)).toBe('not_selected_budget')
  })

  it('never selects when prior attempts consume the whole shared budget', () => {
    const a = build({ priority: 'p0', score: 90, discoveredBy: [queryA], abstract: 'available' })
    const g = build({ priority: 'p0', score: 92, discoveredBy: [queryA], abstract: 'available' })
    const result = select([a, g], [g.evaluation.academicWorkId], 1)
    expect(result).toMatchObject({ attemptedBefore: 1, remainingBudget: 0 })
    expect(result.decisions.every(entry => entry.status !== 'selected')).toBe(true)
    expect(result.decisions.find(entry => entry.academicWorkId === a.evaluation.academicWorkId)?.status)
      .toBe('not_selected_budget')
  })

  it('breaks ties by canonical work identity for equal priority, abstract, and score', () => {
    const one = build({ priority: 'p0', score: 90, discoveredBy: [queryC], abstract: 'available' })
    const two = build({ priority: 'p0', score: 90, discoveredBy: [queryC], abstract: 'available' })
    const three = build({ priority: 'p0', score: 90, discoveredBy: [queryC], abstract: 'available' })
    const items = [one, two, three].sort((left, right) =>
      left.evaluation.academicWorkId.localeCompare(right.evaluation.academicWorkId))
    const result = select([one, two, three], [], 3)
    const orderOf = (item: Built) => result.decisions.find(entry =>
      entry.academicWorkId === item.evaluation.academicWorkId)?.selectionOrder
    expect(items.map(orderOf)).toEqual([0, 1, 2])
  })

  it('fails loud when approvals, ranking, assessments, or budget disagree', () => {
    const a = build({ priority: 'p0', score: 90, discoveredBy: [queryA], abstract: 'available' })
    expect(() => selectCandidateReviews({ ...brief, version: 2 }, plan, rankingOf([a]), [a.assessment], new Set(), 1))
      .toThrow(/approved Brief version/u)
    expect(() => selectCandidateReviews(brief, plan, { ...rankingOf([a]), researchBriefVersion: 2 }, [a.assessment],
      new Set(), 1)).toThrow(/ranking bound/u)
    expect(() => selectCandidateReviews(brief, plan, rankingOf([a]), [], new Set(), 1))
      .toThrow(/exactly one assessment/u)
    expect(() => select([a], [], -1)).toThrow(/non-negative safe integer/u)
    expect(() => selectCandidateReviews(brief, plan, rankingOf([a]), [a.assessment], new Set(), 1.5))
      .toThrow(/non-negative safe integer/u)
  })
})
