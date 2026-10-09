import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
  candidatePriorityForScore,
  createCandidateRankingResult,
  createCandidateScoreBreakdown,
  createInclusionTargets,
  createSearchQueryId,
  type AcademicCandidateRankingResult,
  type CandidateAssessment,
  type CandidateRankingPolicy,
  type HybridSearchPlan,
  type HybridSearchRound,
  type QueryWorkflowProgressEvent,
  type ResearchQuestionCoverageResult,
  type SearchStopDecision,
} from '../src/index.ts'

interface QueryWorkflowSample {
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

const sample = JSON.parse(readFileSync(new URL(
  '../../../../z-team_docs/interface-samples/academic-model-v1/academic-query-workflow-v1.sample.json',
  import.meta.url,
), 'utf8')) as QueryWorkflowSample

const highScore = {
  topicRelevance: 28,
  questionMatch: 18,
  evidencePotential: 13,
  methodMatch: 9,
  workTypeFit: 7,
  sourceQuality: 6,
  recency: 4,
  fulltextAvailability: 5,
}

describe('Academic query-workflow shared rules', () => {
  it('creates stable query identities independently from expressions', () => {
    expect(createSearchQueryId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )
    expect(createSearchQueryId()).not.toBe(createSearchQueryId())
  })

  it('keeps minimum, target, and maximum inclusion counts distinct and ordered', () => {
    const input = { minimum: 3, target: 8, maximum: 12 }
    const targets = createInclusionTargets(input)
    expect(targets).toEqual(input)
    expect(targets).not.toBe(input)
    expect(() => createInclusionTargets({ minimum: 9, target: 8, maximum: 12 })).toThrow(RangeError)
    expect(() => createInclusionTargets({ minimum: 0, target: 0, maximum: 12 })).toThrow(RangeError)
    expect(() => createInclusionTargets({ minimum: 1.5, target: 8, maximum: 12 })).toThrow(RangeError)
  })

  it('computes the visible weighted total and maps exact priority boundaries', () => {
    const score = createCandidateScoreBreakdown(highScore, ACADEMIC_CANDIDATE_RANKING_POLICY_V1)
    expect(score.total).toBe(90)
    expect(candidatePriorityForScore(80, false, ACADEMIC_CANDIDATE_RANKING_POLICY_V1)).toBe('p0')
    expect(candidatePriorityForScore(79, false, ACADEMIC_CANDIDATE_RANKING_POLICY_V1)).toBe('p1')
    expect(candidatePriorityForScore(65, false, ACADEMIC_CANDIDATE_RANKING_POLICY_V1)).toBe('p1')
    expect(candidatePriorityForScore(64, false, ACADEMIC_CANDIDATE_RANKING_POLICY_V1)).toBe('p2')
    expect(candidatePriorityForScore(50, false, ACADEMIC_CANDIDATE_RANKING_POLICY_V1)).toBe('p2')
    expect(candidatePriorityForScore(49, false, ACADEMIC_CANDIDATE_RANKING_POLICY_V1)).toBe('excluded')
    expect(candidatePriorityForScore(100, true, ACADEMIC_CANDIDATE_RANKING_POLICY_V1)).toBe('excluded')
  })

  it('rejects hidden score ranges and malformed policies', () => {
    expect(() => createCandidateScoreBreakdown({ ...highScore, topicRelevance: 31 },
      ACADEMIC_CANDIDATE_RANKING_POLICY_V1)).toThrow('topicRelevance')
    const wrongTotal: CandidateRankingPolicy = { ...ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
      weights: { ...ACADEMIC_CANDIDATE_RANKING_POLICY_V1.weights, recency: 4 } }
    expect(() => createCandidateScoreBreakdown(highScore, wrongTotal)).toThrow('sum to 100')
    const reversed: CandidateRankingPolicy = { ...ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
      thresholds: { p0: 65, p1: 80, p2: 50 } }
    expect(() => candidatePriorityForScore(80, false, reversed)).toThrow('thresholds')
    expect(() => candidatePriorityForScore(101, false, ACADEMIC_CANDIDATE_RANKING_POLICY_V1)).toThrow(RangeError)
  })

  it('keeps the fixed Q1 handoff internally consistent for B and C', () => {
    const queryIds = new Set(sample.plan.queries.map(query => query.searchQueryId))
    expect(queryIds.size).toBe(sample.plan.queries.length)
    expect(sample.rankingResult.evaluations.every(candidate =>
      candidate.discoveredBy.every(queryId => queryIds.has(queryId)))).toBe(true)
    const questions = sample.coverage.questions.map(item => item.question)
    const ranking = createCandidateRankingResult(sample.rankingResult, sample.plan, questions)
    for (const candidate of ranking.evaluations) {
      const { total, ...components } = candidate.score
      expect(createCandidateScoreBreakdown(components, sample.plan.rankingPolicy).total).toBe(total)
      const expected = candidatePriorityForScore(candidate.score.total,
        candidate.hardFilter.status === 'excluded', sample.plan.rankingPolicy)
      expect(candidate.priority).toBe(expected)
    }
    expect(ranking.queues).toEqual({
      p0: ['work-version-candidate-a'],
      p1: ['work-version-candidate-b'],
      p2: [],
      excluded: ['work-version-candidate-c'],
    })
    expect(createInclusionTargets(sample.plan.inclusionTargets)).toEqual({ minimum: 2, target: 4, maximum: 6 })
    expect(sample.coverage.questions.map(question => question.question)).toEqual([
      'How does retrieval affect factual faithfulness?',
      'Which evaluation methods expose remaining failure modes?',
    ])
    expect(sample.round.searchQueryIds.every(queryId => queryIds.has(queryId))).toBe(true)
    expect(sample.stopDecision).toMatchObject({ shouldStop: true, reason: 'candidate_exhausted' })
    expect(sample.progressEvents.map(event => event.sequence)).toEqual([0, 1, 2])
    expect(sample.progressEvents.at(-1)?.stopReason).toBe(sample.stopDecision.reason)
  })

  it('rejects inconsistent queue membership', () => {
    expect(() => createCandidateRankingResult({
      ...sample.rankingResult,
      queues: { ...sample.rankingResult.queues, p0: [], p1: ['work-version-candidate-a' as never,
        ...sample.rankingResult.queues.p1] },
    }, sample.plan, sample.coverage.questions.map(item => item.question))).toThrow('queue must match its priority')
  })
})
