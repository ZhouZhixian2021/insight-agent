import { createBatchResult, createFailureId, createSearchQueryId,
  type ResearchQuestionCoverageResult } from '@deepseek-ai/dsh-academic-model'
import { createIngestIndex, ingestWorks } from '@deepseek-ai/dsh-academic-ingestion'
import type { AcademicSourceWork } from '@deepseek-ai/dsh-academic-source'
import { describe, expect, it, vi } from 'vitest'
import { draftFixture } from '../../../academic/workflow/tests/pipeline-fixture.ts'
import { approvedPaperAdapters } from '../src/search.ts'
import type { AcademicCandidateScreening } from '../src/candidate-screening.ts'

const batchPolicy = {
  initialBatchSize: 2,
  evidenceGapBatchSize: 2,
  replenishmentBatchSize: 2,
  minimumQuestionSupportingWorks: 1,
}

const gapPolicy = {
  maximumQueriesPerRound: 4,
  maximumAcademicResultsPerQuery: 20,
}

function identified(record: AcademicSourceWork, value: string): AcademicSourceWork {
  const identifier = { kind: 'provider_record' as const, normalizedValue: value,
    originalValue: value, sourceProvider: 'arxiv' }
  return {
    academicWork: { ...record.academicWork, externalIdentifiers: [identifier] },
    workVersion: { ...record.workVersion, externalIdentifiers: [identifier],
      sourceRecords: [{ provider: 'arxiv', recordId: value }] },
  }
}

function setup(options: {
  readonly questions?: readonly string[]
  readonly gapWorks?: readonly AcademicSourceWork[]
  readonly failGapSearch?: boolean
  readonly unresolved?: ReadonlySet<string>
  readonly metadata?: NonNullable<AcademicSourceWork['metadata']>
  readonly candidateScreening?: AcademicCandidateScreening
} = {}) {
  const fixture = draftFixture(3)
  const questions = [...options.questions ?? ['Which method works?']]
  const works = fixture.records.map((record, index) => {
    const work = identified(record, `fixture-${index + 1}`)
    return index === 0 && options.metadata !== undefined ? { ...work, metadata: options.metadata } : work
  })
  const brief = { ...fixture.input.brief, questions,
    stopConditions: { ...fixture.input.brief.stopConditions, maximumSearchRounds: 2,
      maximumCandidateWorks: 3, maximumIncludedWorks: 2, saturationRounds: 3 } }
  const searchProviders = vi.fn(async (request: { query: string }) => {
    if (request.query !== 'synthetic') {
      if (options.failGapSearch === true) {
        const failure = { schemaVersion: 1 as const, failureId: createFailureId(), provider: 'arxiv',
          operation: 'search', category: 'upstream_error' as const, message: 'temporary provider failure',
          retryable: true, retryAfter: null }
        const batch = createBatchResult([], [failure])
        return { works: batch.items, batch, providers: ['arxiv'], discoveredRecords: 0,
          limitations: [], truncated: false }
      }
      const selected = options.gapWorks ?? [works[1]!]
      const batch = createBatchResult(selected, [])
      return { works: batch.items, batch, providers: ['arxiv'], discoveredRecords: selected.length,
        limitations: [], truncated: false }
    }
    const batch = createBatchResult([works[0]!], [])
    return { works: batch.items, batch, providers: ['arxiv'], discoveredRecords: 1,
      limitations: [], truncated: false }
  })
  const resolveFullText = vi.fn((version: { sourceRecords: readonly { provider: string; recordId: string }[] }) => {
    const record = version.sourceRecords[0]
    if (record === undefined || options.unresolved?.has(record.recordId) === true) return null
    return { sourceProvider: record.provider, urls: [`https://example.org/${record.recordId}.pdf`] }
  })
  const academicSource = { searchProviders, resolveFullText, searchAll: vi.fn(), verifyReference: vi.fn() } as never
  const web = { search: vi.fn(), fetch: vi.fn() } as never
  const adapters = approvedPaperAdapters(brief, [{ query: 'synthetic', purpose: 'Find evidence', questions,
    retrieval: { channels: ['academic'], academicProviders: ['arxiv'], verificationProviders: ['arxiv'],
      maximumWebDiscoveryResults: 1, maximumReferenceVerifications: 1 } }], academicSource, web,
  batchPolicy, gapPolicy, undefined, options.candidateScreening)
  const replenishCandidates = adapters.replenishCandidates
  if (replenishCandidates === undefined) throw new Error('expected evidence-gap replenishment adapter')
  return { adapters, brief, searchProviders, works, replenishCandidates }
}

async function initialState(setupResult: ReturnType<typeof setup>) {
  const searched = await setupResult.adapters.search({ query: 'synthetic', maxResults: 3 })
  const ingested = ingestWorks(createIngestIndex(), searched.works)
  const selection = setupResult.adapters.selectPapers(ingested, setupResult.brief)
  if (selection.candidateScheduling === undefined) throw new Error('expected ranked candidate scheduling')
  return { ingested, scheduling: selection.candidateScheduling }
}

function uncovered(brief: ReturnType<typeof setup>['brief']): ResearchQuestionCoverageResult {
  return { schemaVersion: 1, researchBriefId: brief.researchBriefId, researchBriefVersion: brief.version,
    assessedAt: '2026-09-30T00:00:00Z', evidenceRequirementsMet: false, allQuestionsCovered: false,
    questions: brief.questions.map(question => ({ question, status: 'uncovered' as const,
      supportingWorkIds: [], evidenceIds: [], gaps: [question] })) }
}

describe('Q5 evidence-gap replenishment', () => {
  it('uses retained scholarly metadata and conservative reviewed criteria in formal ranking', async () => {
    const prepared = setup({ metadata: {
      abstract: { status: 'available', value: 'Synthetic evaluation reports comparative results.' },
      keywords: { status: 'available', value: ['synthetic', 'comparison'] },
    } })

    const state = await initialState(prepared)
    expect(state.scheduling.assessments).toHaveLength(1)
    expect(state.scheduling.assessments[0]).toMatchObject({
      abstract: { status: 'available', value: 'Synthetic evaluation reports comparative results.' },
      keywords: { status: 'available', value: ['synthetic', 'comparison'] },
      methodMatch: 0,
      evidencePotential: 0,
      contributionSignals: [],
      recency: 0,
      fulltextAvailability: { status: 'resolvable' },
    })
    expect(state.scheduling.assessments[0]?.matchedQuestions).toEqual(prepared.brief.questions)
    expect(state.scheduling.assessments[0]?.reasons.join(' '))
      .toContain('Recency scoring is disabled because the reviewed publication window has no complete year range.')
  })

  it('uses reviewed method and evidence cues in the formal P0 score', async () => {
    const question = 'Which method works?'
    const prepared = setup({
      metadata: { abstract: { status: 'available', value: 'Synthetic evaluation reports comparative results.' },
        keywords: { status: 'available', value: ['synthetic', 'comparison'] } },
      candidateScreening: {
        questions: [{ question, concepts: [['comparative results']] }],
        methods: [['evaluation']], evidence: [['comparative results']],
        contributions: [{ classification: 'empirical_evaluation', concepts: [['evaluation']] }],
      },
    })
    const state = await initialState(prepared)
    expect(state.scheduling.assessments[0]).toMatchObject({ methodMatch: 1, evidencePotential: 1,
      matchedQuestions: [question], contributionSignals: ['empirical_evaluation'] })
    expect(state.scheduling.ranking.evaluations[0]).toMatchObject({ priority: 'p0',
      score: { methodMatch: 10, evidencePotential: 15, questionMatch: 20 } })
  })

  it('requires an approved executable Brief for ranked scheduling', () => {
    const prepared = setup()
    expect(() => approvedPaperAdapters({ ...prepared.brief,
      approval: { status: 'pending', reason: 'awaiting review' } } as never,
    [{ query: 'synthetic', purpose: 'Find evidence', questions: prepared.brief.questions,
      retrieval: { channels: ['academic'], academicProviders: ['arxiv'], verificationProviders: ['arxiv'],
        maximumWebDiscoveryResults: 1, maximumReferenceVerifications: 1 } }],
    {} as never, {} as never, batchPolicy, gapPolicy)).toThrow('requires an approved ResearchBrief')
  })

  it('retains only matching verified Provider resolutions and ignores failed references', async () => {
    const fixture = draftFixture(1)
    const base = identified(fixture.records[0]!, '1810.04805')
    const verifiedWork = { ...base, workVersion: { ...base.workVersion, sourceRecords: [
      { provider: 'openalex', recordId: 'W-mismatch' },
      { provider: 'arxiv', recordId: '1810.04805' },
      { provider: 'arxiv', recordId: '1810.04805' },
    ] } }
    const empty = createBatchResult([], [])
    const verifyReference = vi.fn(async (reference: { normalizedValue: string }) => reference.normalizedValue === '1706.03762'
      ? { status: 'failed' as const, failure: { reference, verificationProvider: 'arxiv', category: 'not_found' as const,
        message: 'not found', retryable: false, retryAfter: null } }
      : { status: 'verified' as const, value: { reference, verificationProvider: 'arxiv', work: verifiedWork,
        fullText: { sourceProvider: 'arxiv', urls: ['https://arxiv.org/pdf/1810.04805'] }, fullTextFailure: null } })
    const academicSource = { searchProviders: vi.fn(async () => ({ works: [], batch: empty, providers: ['arxiv'],
      discoveredRecords: 0, limitations: [], truncated: false })), resolveFullText: vi.fn(() => null),
    searchAll: vi.fn(), verifyReference } as never
    const web = { search: vi.fn(async () => ({ sources: [
      { url: 'https://arxiv.org/abs/1706.03762' }, { url: 'https://arxiv.org/abs/1810.04805' },
    ], content: '', truncated: false })), fetch: vi.fn() } as never
    const adapters = approvedPaperAdapters(fixture.input.brief, [{ query: 'synthetic', purpose: 'Find evidence',
      questions: fixture.input.brief.questions, retrieval: { channels: ['academic', 'web_discovery'],
        academicProviders: ['arxiv'], verificationProviders: ['arxiv'], maximumWebDiscoveryResults: 2,
        maximumReferenceVerifications: 2 } }], academicSource, web, batchPolicy, gapPolicy)

    const progress = vi.fn()
    const result = await adapters.search({ query: 'synthetic', maxResults: 3 }, undefined, undefined, progress)

    expect(verifyReference).toHaveBeenCalledTimes(2)
    expect(result.works).toHaveLength(1)
    expect(result.hybridObservation).toMatchObject({
      stages: { academicSearch: 'success', webDiscovery: 'success',
        referenceIdentification: 'success', referenceVerification: 'partial_success' },
      webDiscoveredUrls: 2,
      attemptedVerifications: 2,
      verifiedReferences: 1,
      failedVerifications: 1,
    })
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'reference_verification', phase: 'settled', status: 'success',
    }))
  })

  it('rejects missing query provenance after conservatively assessing an unknown source', () => {
    const prepared = setup()
    const withoutSource = { ...prepared.works[0]!, workVersion: { ...prepared.works[0]!.workVersion,
      sourceRecords: [] } }
    const ingested = ingestWorks(createIngestIndex(), [withoutSource])

    expect(() => prepared.adapters.selectPapers(ingested, prepared.brief))
      .toThrow('candidate provenance must contain distinct planned queries')
  })

  it('rejects candidate provenance that does not belong to the reviewed plan', () => {
    const prepared = setup()
    const ingested = ingestWorks(createIngestIndex(), [{ ...prepared.works[0]!, discoveredBy: [createSearchQueryId()] }])

    expect(() => prepared.adapters.selectPapers(ingested, prepared.brief))
      .toThrow('candidate provenance must reference a planned query')
  })

  it('drops works already ranked and duplicates repeated by sibling gap queries', async () => {
    const questions = ['Which method works?', 'What are the limitations?']
    const prepared = setup({ questions })
    const state = await initialState(prepared)
    const oldWork = prepared.works[0]!
    const newWork = prepared.works[1]!
    prepared.searchProviders.mockImplementation(async (request: { query: string }) => {
      const selected = request.query === 'synthetic' ? [oldWork] : [oldWork, newWork]
      const batch = createBatchResult(selected, [])
      return { works: batch.items, batch, providers: ['arxiv'], discoveredRecords: selected.length,
        limitations: [], truncated: false }
    })

    const replenished = await prepared.replenishCandidates(
      state.scheduling, state.ingested, uncovered(prepared.brief), 2,
    )

    expect(prepared.searchProviders).toHaveBeenCalledTimes(3)
    expect(replenished.ingested.works).toHaveLength(2)
    expect(replenished.papers).toHaveLength(1)
    expect(replenished.papers[0]?.workVersionId).toBe(newWork.workVersion.workVersionId)
  })

  it('returns an empty increment when every gap Provider call fails', async () => {
    const prepared = setup({ failGapSearch: true })
    const state = await initialState(prepared)

    const replenished = await prepared.replenishCandidates(
      state.scheduling, state.ingested, uncovered(prepared.brief), 2,
    )

    expect(prepared.searchProviders).toHaveBeenCalledTimes(2)
    expect(replenished.ingested.works).toHaveLength(1)
    expect(replenished.papers).toEqual([])
  })

  it('retains a newly discovered work without scheduling it when full text is unresolved', async () => {
    const prepared = setup({ unresolved: new Set(['fixture-2']) })
    const state = await initialState(prepared)

    const replenished = await prepared.replenishCandidates(
      state.scheduling, state.ingested, uncovered(prepared.brief), 2,
    )

    expect(replenished.ingested.works).toHaveLength(2)
    expect(replenished.papers).toEqual([])
    const evaluation = replenished.scheduling.ranking.evaluations
      .find(item => item.workVersionId === prepared.works[1]!.workVersion.workVersionId)
    expect(evaluation?.fulltextAvailability.status).toBe('unresolved')
    expect(evaluation?.fulltextAvailability).toHaveProperty('reason')
  })

  it('rejects an unapproved direct Provider before executing a gap query', async () => {
    const prepared = setup()
    const state = await initialState(prepared)
    const scheduling = { ...state.scheduling, plan: { ...state.scheduling.plan,
      queries: state.scheduling.plan.queries.map(query => query.kind === 'academic'
        ? { ...query, providers: ['acl'] } : query) } } as typeof state.scheduling

    await expect(prepared.replenishCandidates(
      scheduling, state.ingested, uncovered(prepared.brief), 2,
    )).rejects.toThrow('Evidence-gap search requires an approved direct provider, received "acl".')
  })
})
