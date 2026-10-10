import { describe, expect, it } from 'vitest'
import {
  ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
  createAcademicWorkId,
  createResearchBriefId,
  createSearchQueryId,
  createWorkVersionId,
  type AcademicCandidateEvaluation,
  type AcademicCandidateRankingResult,
  type ExecutableResearchBrief,
  type HybridSearchPlan,
  type ResearchQuestionCoverageResult,
} from '@deepseek-ai/dsh-academic-model'
import { planCandidateBatch, type CandidateBatchPlanningInput } from '../src/index.ts'

const researchBriefId = createResearchBriefId()
const questions = ['How does the method work?', 'What evidence supports it?'] as const
const versions = [createWorkVersionId(), createWorkVersionId(), createWorkVersionId(), createWorkVersionId()]

function fixture(): CandidateBatchPlanningInput {
  const brief: ExecutableResearchBrief = {
    schemaVersion: 1,
    researchBriefId,
    version: 1,
    topic: 'Ranked batch scheduling',
    aliases: [],
    questions,
    publicationWindow: { start: null, end: null, dateBasis: 'first_public_release' },
    includedWorkTypes: ['version_of_record'],
    inclusionRules: [],
    exclusionRules: [],
    evidenceRequirements: { minimumIncludedWorks: 2, targetIncludedWorks: 3, minimumFulltextWorks: 2,
      minimumEvidenceLevel: 'fulltext', requireLocatableEvidence: true, allowPreprints: false,
      insufficientEvidencePolicy: 'continue_with_warning' },
    targetAudience: 'researcher',
    reportRequirements: { language: 'zh-CN', targetLength: { unit: 'words', minimum: null, maximum: null },
      requiredSections: [], citationStyle: 'numeric', includeEvidenceAppendix: true,
      includeMethodology: true, includeLimitations: true, includeResearchGaps: true },
    stopConditions: { maximumSearchRounds: 3, maximumCandidateWorks: 20, maximumIncludedWorks: 6,
      maximumElapsedMinutes: null, saturationRounds: 2, stopWhenEvidenceRequirementsMet: true },
    assumptions: [],
    approval: { status: 'approved', reviewedBy: 'fixture', reviewedAt: '2026-09-30T00:00:00.000Z',
      approvedBriefVersion: 1, comment: null },
  }
  const plan: HybridSearchPlan = {
    schemaVersion: 1,
    researchBriefId,
    researchBriefVersion: 1,
    constraints: { publicationWindow: brief.publicationWindow, includedWorkTypes: brief.includedWorkTypes,
      inclusionRules: [], exclusionRules: [], requiredTerms: [], excludedTerms: [] },
    inclusionTargets: { minimum: 2, target: 3, maximum: 6 },
    rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
    queries: questions.map((question, index) => ({ kind: 'academic' as const, searchQueryId: createSearchQueryId(),
      expression: `ranked batches ${index}`, purpose: 'core' as const, questions: [question],
      roundIndex: 1, providers: ['fixture'] })),
    citationExpansionSeeds: [],
    maximumSearchRounds: 3,
  }
  const evaluations = versions.map((workVersionId, index): AcademicCandidateEvaluation => ({
    schemaVersion: 1,
    academicWorkId: createAcademicWorkId(),
    workVersionId,
    discoveredBy: [plan.queries[index === 0 ? 0 : 1]!.searchQueryId],
    classification: 'core_method',
    hardFilter: { status: 'eligible', reasons: [] },
    score: { topicRelevance: 30, questionMatch: 20, evidencePotential: 15, methodMatch: 10,
      workTypeFit: 8, sourceQuality: 7, recency: 5, fulltextAvailability: 5, total: 100 - index },
    priority: index < 2 ? 'p0' : 'p1',
    matchedQuestions: index === 0 ? [questions[0]] : [questions[1]],
    fulltextAvailability: { status: 'resolvable' },
    diversityTags: [`fixture:${index}`],
    decisionReasons: ['fixture'],
  }))
  const ranking: AcademicCandidateRankingResult = {
    schemaVersion: 1,
    researchBriefId,
    researchBriefVersion: 1,
    evaluations,
    queues: { p0: versions.slice(0, 2), p1: versions.slice(2), p2: [], excluded: [] },
    limitations: [],
  }
  const coverage: ResearchQuestionCoverageResult = {
    schemaVersion: 1,
    researchBriefId,
    researchBriefVersion: 1,
    assessedAt: '2026-09-30T00:00:00.000Z',
    questions: questions.map(question => ({ question, status: 'uncovered', supportingWorkIds: [],
      evidenceIds: [], gaps: ['No evidence yet.'] })),
    evidenceRequirementsMet: false,
    allQuestionsCovered: false,
  }
  return { brief, plan, ranking, coverage,
    policy: { initialBatchSize: 2, evidenceGapBatchSize: 1, replenishmentBatchSize: 2,
      minimumQuestionSupportingWorks: 1 },
    scheduledWorkVersionIds: [], completedBatchCount: 0, consecutiveBatchesWithoutEvidence: 0,
    includedWorks: 0, completedSearchRounds: 1, cancelled: false,
    elapsedTimeLimitReached: false, reviewRequired: false }
}

describe('ranked candidate batch scheduling', () => {
  it('uses the authoritative P0 order for the first batch', () => {
    const input = fixture()
    const decision = planCandidateBatch(input)
    expect(decision.action).toBe('schedule_batch')
    expect(decision.batch).toMatchObject({ batchIndex: 1, reason: 'initial_priority',
      workVersionIds: versions.slice(0, 2) })
  })

  it('selects only remaining candidates that address an uncovered question', () => {
    const base = fixture()
    const input = { ...base, coverage: { ...base.coverage, questions: [
      { ...base.coverage.questions[0]!, status: 'covered' as const, gaps: [] },
      base.coverage.questions[1]!,
    ] }, scheduledWorkVersionIds: versions.slice(0, 2), completedBatchCount: 1, includedWorks: 2 }
    const decision = planCandidateBatch(input)
    expect(decision.action).toBe('schedule_batch')
    expect(decision.batch).toMatchObject({ batchIndex: 2, reason: 'evidence_gap',
      workVersionIds: [versions[2]], questions: [questions[1]] })
  })

  it('routes a topical candidate through its approved query without treating that route as a scored match', () => {
    const base = fixture()
    const input = { ...base, ranking: { ...base.ranking,
      evaluations: base.ranking.evaluations.map(evaluation => ({ ...evaluation,
        matchedQuestions: [], score: { ...evaluation.score, questionMatch: 0,
          total: evaluation.score.total - evaluation.score.questionMatch } })) },
    scheduledWorkVersionIds: versions.slice(0, 2), completedBatchCount: 1, includedWorks: 2,
    coverage: { ...base.coverage, questions: [
      { ...base.coverage.questions[0]!, status: 'covered' as const, gaps: [] },
      base.coverage.questions[1]!,
    ] } }
    const decision = planCandidateBatch(input)
    expect(decision).toMatchObject({ action: 'schedule_batch', batch: { reason: 'evidence_gap',
      workVersionIds: [versions[2]], questions: [questions[1]] } })
  })

  it('requests a gap search when ranked candidates cannot cover the remaining question', () => {
    const base = fixture()
    const input = { ...base, ranking: { ...base.ranking,
      evaluations: base.ranking.evaluations.map(evaluation => ({ ...evaluation,
        matchedQuestions: [questions[0]] })),
      queues: { p0: versions.slice(0, 2), p1: [], p2: [], excluded: versions.slice(2) } },
    scheduledWorkVersionIds: versions.slice(0, 2), completedBatchCount: 1, includedWorks: 3,
    coverage: { ...base.coverage, evidenceRequirementsMet: true, questions: [
      { ...base.coverage.questions[0]!, status: 'covered' as const, gaps: [] },
      base.coverage.questions[1]!,
    ] } }
    const decision = planCandidateBatch(input)
    expect(decision).toMatchObject({ action: 'search_evidence_gap',
      searchQuestions: [questions[1]], stop: { shouldStop: false } })
  })

  it('stops after the approved saturation threshold', () => {
    const input = { ...fixture(), completedBatchCount: 2, consecutiveBatchesWithoutEvidence: 2 }
    const decision = planCandidateBatch(input)
    expect(decision).toMatchObject({ action: 'stop', stop: { shouldStop: true, reason: 'saturated' } })
  })
})
