import { describe, expect, it, vi } from 'vitest'
import { ACADEMIC_CANDIDATE_RANKING_POLICY_V1, createAcademicWorkId, createBatchResult, createSearchQueryId,
  createWorkVersionId, type AcademicCandidateEvaluation, type AcademicCandidateRankingResult,
  type HybridSearchPlan } from '@deepseek-ai/dsh-academic-model'
import { runResearchDraft, selectResearchPapers, type DraftPipelineAdapters } from '../src/index.ts'
import { draftFixture } from './pipeline-fixture.ts'

function fixture() {
  const f = draftFixture(), base = f.records[0]!
  f.records.splice(0, f.records.length, ...Array.from({ length: 5 }, (_, index) => {
    const academicWorkId = createAcademicWorkId(), workVersionId = createWorkVersionId()
    return { academicWork: { ...base.academicWork, academicWorkId, canonicalVersionId: workVersionId,
      workVersionIds: [workVersionId], title: `Candidate ${index}` },
    workVersion: { ...base.workVersion, academicWorkId, workVersionId,
      sourceRecords: [{ provider: 'fixture', recordId: String(index) }] } }
  }))
  f.input.brief = { ...f.input.brief, stopConditions: { ...f.input.brief.stopConditions,
    maximumCandidateWorks: 5, maximumIncludedWorks: 2, stopWhenEvidenceRequirementsMet: true } }
  f.adapters.selectPapers = (ingested, brief) => selectResearchPapers(ingested, brief, (_work, version) => ({
    urls: [`https://example.org/${version.sourceRecords[0]!.recordId}`], sourceProvider: 'fixture',
    extractionMethod: { method: 'fixture', methodVersion: '1' }, hasHistoricalEvidence: false,
  }))
  return f
}

describe('bounded candidate replenishment', () => {
  it.each(['excluded', 'empty', 'failed', 'all_rejected', 'unlinked'] as const)('continues past %s papers and stops on usable evidence', async (kind) => {
    const { input, adapters } = fixture()
    const generated = vi.mocked(adapters.generator)
    for (let index = 0; index < 2; index++) {
      if (kind === 'failed') generated.mockRejectedValueOnce(new Error('model failed'))
      else generated.mockResolvedValueOnce({ scope: { status: kind === 'excluded' ? 'excluded' : 'included', reason: 'Synthetic scope.' },
        evidence: kind === 'all_rejected' || kind === 'unlinked'
          ? [{ segmentIndex: 0, questionIndexes: [0], sourcedStatement: 'Uses reranking.',
            verbatimExcerpt: kind === 'unlinked' ? 'Uses reranking.' : 'Missing excerpt.', cardItems: [] }] : [] })
    }
    const result = await runResearchDraft(input, adapters)
    expect(adapters.search).toHaveBeenCalledTimes(1)
    expect(adapters.fetcher).toHaveBeenCalledTimes(4)
    expect(adapters.generator).toHaveBeenCalledTimes(4)
    expect(result.retrievalRun.coverageSummary).toMatchObject({ includedWorks: 2, availableFulltextWorks: 4 })
    expect(result.retrievalRun.coverageSummary.limitations.join('\n')).toContain('证据已达到计划数量要求')
    expect(result.synthesis.status).toBe('completed')
    expect(result.report).not.toBeNull()
  })

  it('replenishes after full-text failure without revisiting the failed candidate', async () => {
    const { input, adapters } = fixture()
    vi.mocked(adapters.fetcher).mockRejectedValueOnce(new Error('HTTP failed'))
    const result = await runResearchDraft(input, adapters)
    expect(adapters.fetcher).toHaveBeenCalledTimes(3)
    expect(new Set(vi.mocked(adapters.fetcher).mock.calls.map(call => call[0])).size).toBe(3)
    expect(result.failures).toHaveLength(1)
    expect(result.synthesis.status).toBe('completed')
  })

  it('stops at the successful inclusion cap when the plan minimum is unattainable', async () => {
    const { input, adapters } = fixture()
    input.brief = { ...input.brief, evidenceRequirements: { ...input.brief.evidenceRequirements, minimumIncludedWorks: 3 } }
    const result = await runResearchDraft(input, adapters)
    expect(adapters.generator).toHaveBeenCalledTimes(2)
    expect(result.synthesis.status).toBe('partial_success')
    expect(result.report?.evaluation.status).toBe('blocked')
    expect(result.report?.markdown).toContain('证据有限的研究草稿')
    expect(result.retrievalRun.coverageSummary.limitations.join('\n')).toContain('达到成功纳入上限 2 篇')
  })

  it('continues to the included cap when early stopping is disabled', async () => {
    const { input, adapters } = fixture()
    input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions,
      maximumIncludedWorks: 3, stopWhenEvidenceRequirementsMet: false } }
    const result = await runResearchDraft(input, adapters)
    expect(adapters.generator).toHaveBeenCalledTimes(3)
    expect(result.retrievalRun.coverageSummary.includedWorks).toBe(3)
  })

  it('exhausts the bounded pool once, preserves outcomes and reports unmet requirements', async () => {
    const { input, adapters } = fixture()
    vi.mocked(adapters.generator).mockResolvedValue({ scope: { status: 'excluded', reason: 'Out of scope.' }, evidence: [] })
    const result = await runResearchDraft(input, adapters)
    expect(adapters.generator).toHaveBeenCalledTimes(5)
    expect(result.papers).toHaveLength(5)
    expect(result.retrievalRun.coverageSummary.includedWorks).toBe(0)
    expect(result.retrievalRun.coverageSummary.limitations.join('\n')).toContain('可处理候选已用完（5 篇）')
    expect(adapters.synthesize).not.toHaveBeenCalled()
  })

  it('does not replenish outside a smaller request candidate bound', async () => {
    const { input, adapters } = fixture()
    vi.mocked(adapters.generator).mockResolvedValue({ scope: { status: 'excluded', reason: 'Out of scope.' }, evidence: [] })
    const result = await runResearchDraft({ ...input, searches: [{ query: 'bounded', maxResults: 2,
      channels: ['academic'] }] }, adapters)
    expect(adapters.generator).toHaveBeenCalledTimes(2)
    expect(result.report).toBeNull()
  })

  it('forwards the plan deadline and preserves finished papers when it expires', async () => {
    const { input, adapters } = fixture(), deadline = new AbortController()
    input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions, maximumElapsedMinutes: 1 } }
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
    const fetch = adapters.fetcher
    let calls = 0
    adapters.fetcher = vi.fn<typeof adapters.fetcher>(async (...args) => {
      if (++calls === 2) {
        deadline.abort(new DOMException('Deadline', 'TimeoutError'))
        throw deadline.signal.reason
      }
      return fetch(...args)
    })
    try {
      const result = await runResearchDraft(input, adapters)
      expect(timeout).toHaveBeenCalledWith(60_000)
      expect(adapters.fetcher).toHaveBeenCalledTimes(2)
      expect(result.papers).toHaveLength(1)
      expect(result.status).toBe('cancelled')
      expect(result.synthesis.reasons.join('\n')).toContain('计划时间上限')
      expect(adapters.synthesize).not.toHaveBeenCalled()
    } finally { timeout.mockRestore() }
  })

  it.each([true, false])('stops ranked full-text batches only when evidence covers both questions: %s', async (coverBoth) => {
    const { input, adapters, records } = fixture()
    const observations: Parameters<NonNullable<DraftPipelineAdapters['onQueryWorkflow']>>[0][] = []
    adapters.onQueryWorkflow = observation => observations.push(observation)
    input.brief = { ...input.brief, questions: ['Compare methods', 'Identify limitations'],
      stopConditions: { ...input.brief.stopConditions,
        maximumCandidateWorks: 5, maximumIncludedWorks: 5, stopWhenEvidenceRequirementsMet: true } }
    const generate = adapters.generator
    let extractionCall = 0
    adapters.generator = vi.fn<typeof adapters.generator>(async (...args) => {
      const response = await generate(...args)
      const questionIndex = coverBoth ? extractionCall++ : 0
      return { ...response, evidence: response.evidence.map(draft => ({ ...draft, questionIndexes: [questionIndex] })) }
    })
    const queryId = createSearchQueryId()
    const plan: HybridSearchPlan = { schemaVersion: 1, researchBriefId: input.brief.researchBriefId,
      researchBriefVersion: input.brief.version,
      constraints: { publicationWindow: input.brief.publicationWindow,
        includedWorkTypes: input.brief.includedWorkTypes, inclusionRules: [], exclusionRules: [],
        requiredTerms: [], excludedTerms: [] }, inclusionTargets: { minimum: 2, target: 2, maximum: 5 },
      rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
      queries: [{ kind: 'academic', searchQueryId: queryId, expression: 'synthetic methods', purpose: 'core',
        questions: input.brief.questions, roundIndex: 1, providers: ['fixture'] }],
      citationExpansionSeeds: [], maximumSearchRounds: 1 }
    const evaluations = records.map(({ academicWork, workVersion }, index): AcademicCandidateEvaluation => ({
      schemaVersion: 1, academicWorkId: academicWork.academicWorkId,
      workVersionId: workVersion.workVersionId, discoveredBy: [queryId], classification: 'background',
      hardFilter: { status: 'eligible', reasons: [] },
      score: { topicRelevance: 30, questionMatch: 20, evidencePotential: 15, methodMatch: 10,
        workTypeFit: 8, sourceQuality: 7, recency: 5, fulltextAvailability: 5, total: 100 - index },
      priority: 'p0', matchedQuestions: input.brief.questions,
      fulltextAvailability: { status: 'resolvable' }, diversityTags: [`candidate:${index}`],
      decisionReasons: ['fixture'],
    }))
    const ranking: AcademicCandidateRankingResult = { schemaVersion: 1,
      researchBriefId: input.brief.researchBriefId, researchBriefVersion: input.brief.version,
      evaluations, queues: { p0: evaluations.map(item => item.workVersionId), p1: [], p2: [], excluded: [] },
      limitations: [] }
    adapters.selectPapers = ingested => ({
      papers: ingested.versions.map(version => ({ workVersionId: version.workVersionId,
        urls: [`https://example.org/${version.sourceRecords[0]!.recordId}`], sourceProvider: 'fixture',
        extractionMethod: { method: 'fixture', methodVersion: '1' }, hasHistoricalEvidence: false })),
      truncated: false,
      candidateScheduling: { plan, assessments: [], ranking, policy: { initialBatchSize: 2, evidenceGapBatchSize: 1,
        replenishmentBatchSize: 1, minimumQuestionSupportingWorks: 1 } },
    })
    const result = await runResearchDraft(input, adapters)
    expect(adapters.fetcher).toHaveBeenCalledTimes(coverBoth ? 2 : 5)
    expect(result.retrievalRun.coverageSummary.includedWorks).toBe(coverBoth ? 2 : 5)
    if (coverBoth) expect(result.retrievalRun.coverageSummary.limitations.join(' ')).toContain('desired inclusion target')
    expect(observations[0]).toMatchObject({ sequence: 0, status: 'running', coverage: null })
    expect(observations.at(-1)).toMatchObject({ status: 'settled',
      stopDecision: { shouldStop: true, reason: coverBoth ? 'target_and_coverage_met' : 'maximum_included_works' } })
    const coverage = observations.at(-1)?.coverage
    if (!coverBoth) {
      expect(coverage?.questions[0]?.status).toBe('covered')
      expect(coverage?.questions[1]).toMatchObject({ question: 'Identify limitations',
        status: 'uncovered', supportingWorkIds: [], evidenceIds: [], gaps: [expect.any(String)] })
      expect(result.queryWorkflow).toEqual(observations.at(-1))
      return
    }
    expect(coverage?.questions).toEqual([
      expect.objectContaining({ question: 'Compare methods', status: 'covered' }),
      expect.objectContaining({ question: 'Identify limitations', status: 'covered' }),
    ])
    expect(coverage?.questions[0]?.evidenceIds).toHaveLength(1)
    expect(coverage?.questions[1]?.evidenceIds).toHaveLength(1)
    expect(coverage?.questions[0]?.evidenceIds).not.toEqual(coverage?.questions[1]?.evidenceIds)
    expect(result.queryWorkflow).toEqual(observations.at(-1))
  })

  it('resumes a pending ranked batch without repeating retrieval or screening', async () => {
    const { input, adapters, records } = fixture()
    input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions,
      maximumCandidateWorks: 5, maximumIncludedWorks: 2, stopWhenEvidenceRequirementsMet: true } }
    const queryId = createSearchQueryId()
    const plan: HybridSearchPlan = { schemaVersion: 1, researchBriefId: input.brief.researchBriefId,
      researchBriefVersion: input.brief.version,
      constraints: { publicationWindow: input.brief.publicationWindow,
        includedWorkTypes: input.brief.includedWorkTypes, inclusionRules: [], exclusionRules: [],
        requiredTerms: [], excludedTerms: [] }, inclusionTargets: { minimum: 2, target: 2, maximum: 2 },
      rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
      queries: [{ kind: 'academic', searchQueryId: queryId, expression: 'synthetic methods', purpose: 'core',
        questions: input.brief.questions, roundIndex: 1, providers: ['fixture'] }],
      citationExpansionSeeds: [], maximumSearchRounds: 1 }
    const evaluations = records.map(({ academicWork, workVersion }, index): AcademicCandidateEvaluation => ({
      schemaVersion: 1, academicWorkId: academicWork.academicWorkId, workVersionId: workVersion.workVersionId,
      discoveredBy: [queryId], classification: 'background', hardFilter: { status: 'eligible', reasons: [] },
      score: { topicRelevance: 30, questionMatch: 20, evidencePotential: 15, methodMatch: 10,
        workTypeFit: 8, sourceQuality: 7, recency: 5, fulltextAvailability: 5, total: 100 - index },
      priority: 'p0', matchedQuestions: input.brief.questions, fulltextAvailability: { status: 'resolvable' },
      diversityTags: [`candidate:${index}`], decisionReasons: ['fixture'],
    }))
    const ranking: AcademicCandidateRankingResult = { schemaVersion: 1,
      researchBriefId: input.brief.researchBriefId, researchBriefVersion: input.brief.version,
      evaluations, queues: { p0: evaluations.map(item => item.workVersionId), p1: [], p2: [], excluded: [] },
      limitations: [] }
    adapters.selectPapers = vi.fn<DraftPipelineAdapters['selectPapers']>(ingested => ({
      papers: ingested.versions.map(version => ({ workVersionId: version.workVersionId,
        urls: [`https://example.org/${version.sourceRecords[0]!.recordId}`], sourceProvider: 'fixture',
        extractionMethod: { method: 'fixture', methodVersion: '1' }, hasHistoricalEvidence: false })),
      truncated: false, candidateScheduling: { plan, assessments: [], ranking,
        policy: { initialBatchSize: 2, evidenceGapBatchSize: 1, replenishmentBatchSize: 1,
          minimumQuestionSupportingWorks: 1 } },
    }))
    let checkpoint: Parameters<NonNullable<DraftPipelineAdapters['onRecoveryCheckpoint']>>[0] | undefined
    adapters.onRecoveryCheckpoint = (value) => { checkpoint = value; throw new Error('simulated process exit') }
    await expect(runResearchDraft(input, adapters)).rejects.toThrow('simulated process exit')
    expect(checkpoint).toMatchObject({ pendingBatchIndex: 1, completedBatchCount: 0 })
    expect(adapters.fetcher).not.toHaveBeenCalled()
    adapters.onRecoveryCheckpoint = vi.fn()
    const result = await runResearchDraft({ ...input, recovery: checkpoint! }, adapters)
    expect(adapters.search).toHaveBeenCalledOnce()
    expect(adapters.selectPapers).toHaveBeenCalledOnce()
    expect(adapters.fetcher).toHaveBeenCalledTimes(2)
    expect(result.retrievalRun.retrievalRunId).toBe(checkpoint!.retrievalRunId)
    expect(result.retrievalRun.coverageSummary.includedWorks).toBe(2)
  })

  it('drives a gap round instead of stopping when the ranked pool cannot cover a question', async () => {
    const { input, adapters, records } = fixture()
    input.searches = [{ query: 'synthetic methods', channels: ['academic'] },
      { query: 'synthetic limitations', channels: ['academic'] }]
    const search = adapters.search
    adapters.search = vi.fn<typeof adapters.search>(async (...args) => {
      if (args[0].query !== 'synthetic limitations') return search(...args)
      const batch = createBatchResult([], [])
      return { works: batch.items, truncated: false, providers: ['fixture'], discoveredRecords: 0,
        batch, limitations: [] }
    })
    vi.mocked(adapters.generator).mockResolvedValue({ scope: { status: 'excluded', reason: 'Out of scope.' }, evidence: [] })
    input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions,
      maximumCandidateWorks: 10, maximumIncludedWorks: 5, maximumSearchRounds: 2, saturationRounds: 10,
      stopWhenEvidenceRequirementsMet: true } }
    const queryId = createSearchQueryId(), secondQueryId = createSearchQueryId()
    const plan: HybridSearchPlan = { schemaVersion: 1, researchBriefId: input.brief.researchBriefId,
      researchBriefVersion: input.brief.version,
      constraints: { publicationWindow: input.brief.publicationWindow,
        includedWorkTypes: input.brief.includedWorkTypes, inclusionRules: [], exclusionRules: [],
        requiredTerms: [], excludedTerms: [] }, inclusionTargets: { minimum: 2, target: 2, maximum: 5 },
      rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
      queries: [{ kind: 'academic', searchQueryId: queryId, expression: 'synthetic methods', purpose: 'core',
        questions: input.brief.questions, roundIndex: 1, providers: ['fixture'] },
      { kind: 'academic', searchQueryId: secondQueryId, expression: 'synthetic limitations', purpose: 'core',
        questions: input.brief.questions, roundIndex: 1, providers: ['fixture'] }],
      citationExpansionSeeds: [], maximumSearchRounds: 2 }
    const evaluations = records.map(({ academicWork, workVersion }): AcademicCandidateEvaluation => ({
      schemaVersion: 1, academicWorkId: academicWork.academicWorkId,
      workVersionId: workVersion.workVersionId, discoveredBy: [queryId], classification: 'background',
      hardFilter: { status: 'eligible', reasons: [] },
      score: { topicRelevance: 30, questionMatch: 20, evidencePotential: 15, methodMatch: 10,
        workTypeFit: 8, sourceQuality: 7, recency: 5, fulltextAvailability: 5, total: 100 },
      priority: 'p0', matchedQuestions: input.brief.questions,
      fulltextAvailability: { status: 'resolvable' }, diversityTags: ['fixture'],
      decisionReasons: ['fixture'],
    }))
    const ranking: AcademicCandidateRankingResult = { schemaVersion: 1,
      researchBriefId: input.brief.researchBriefId, researchBriefVersion: input.brief.version,
      evaluations, queues: { p0: evaluations.map(item => item.workVersionId), p1: [], p2: [], excluded: [] },
      limitations: [] }
    const policy = { initialBatchSize: 2, evidenceGapBatchSize: 1, replenishmentBatchSize: 1,
      minimumQuestionSupportingWorks: 1 }
    adapters.selectPapers = ingested => ({
      papers: ingested.versions.map(version => ({ workVersionId: version.workVersionId,
        urls: [`https://example.org/${version.sourceRecords[0]!.recordId}`], sourceProvider: 'fixture',
        extractionMethod: { method: 'fixture', methodVersion: '1' }, hasHistoricalEvidence: false })),
      truncated: false, candidateScheduling: { plan, assessments: [], ranking, policy },
    })
    const replenish = vi.fn<NonNullable<DraftPipelineAdapters['replenishCandidates']>>(async (scheduling, ingested) => (
      { scheduling, ingested, papers: [] }))
    adapters.replenishCandidates = replenish
    const result = await runResearchDraft(input, adapters)
    expect(replenish).toHaveBeenCalledOnce()
    expect(replenish).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 2,
      expect.any(AbortSignal))
    expect(adapters.generator).toHaveBeenCalledTimes(5)
    expect(result.retrievalRun.coverageSummary.limitations.join(' ')).toContain('The approved search-round limit has been reached.')
  })
})


it.each(['continue_with_warning', 'stop_for_review'] as const)('exhausts remaining candidates before applying %s', async (policy) => {
  const { input, adapters } = fixture()
  input.brief = { ...input.brief, evidenceRequirements: { ...input.brief.evidenceRequirements,
    minimumIncludedWorks: 6, minimumFulltextWorks: 3, insufficientEvidencePolicy: policy },
  stopConditions: { ...input.brief.stopConditions, maximumIncludedWorks: 10 } }
  const generator = adapters.generator
  let count = 0
  adapters.generator = vi.fn<typeof adapters.generator>(async (...args) => ++count <= 3 ? generator(...args)
    : { scope: { status: 'excluded' as const, reason: 'Outside scope.' }, evidence: [] })
  const result = await runResearchDraft(input, adapters)
  expect(adapters.generator).toHaveBeenCalledTimes(5)
  expect(result.retrievalRun.coverageSummary.includedWorks).toBe(3)
  expect(result.retrievalRun.coverageSummary.limitations.join(' ')).toContain('可处理候选已用完（5 篇）')
  expect(result.synthesis.status).toBe(policy === 'continue_with_warning' ? 'partial_success' : 'blocked')
  if (policy === 'continue_with_warning') {
    expect(adapters.synthesize).toHaveBeenCalledOnce()
    expect(result.report?.markdown).toContain('Plan 至少要求 6 篇')
    expect(result.report?.evaluation.status).toBe('blocked')
  } else {
    expect(adapters.synthesize).not.toHaveBeenCalled()
    expect(result.report).toBeNull()
  }
})
