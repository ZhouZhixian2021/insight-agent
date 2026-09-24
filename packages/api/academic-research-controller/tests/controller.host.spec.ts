import { Context } from '@deepseek-ai/cordis'
import { createAcademicWorkId, createBatchResult, createCoverageSummary, createFailureId, createResearchBriefId, createRetrievalRunId,
  createWorkVersionId, type RetrievalRun } from '@deepseek-ai/dsh-academic-model'
import { createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { AcademicSourceRuntime } from '@deepseek-ai/dsh-academic-source'
import type { WebRuntime } from '@deepseek-ai/dsh-web'
import { afterEach, describe, expect, it, vi } from 'vitest'

type RunAcademicResearchDraft = typeof import('@deepseek-ai/dsh-academic-workflow')['runAcademicResearchDraft']
const runAcademicResearchDraft = vi.hoisted(() => vi.fn<RunAcademicResearchDraft>())
vi.mock('@deepseek-ai/dsh-academic-workflow', async load => ({
  ...await load<typeof import('@deepseek-ai/dsh-academic-workflow')>(),
  runAcademicResearchDraft,
}))

import AcademicResearchController from '../src/index.ts'
import { researchBriefFromApprovedPlan, researchPlanFromApprovedPlan } from '../src/research-brief-plan.ts'
import type { AcademicPlannedRetrieval } from '../src/types.ts'
import { draftFixture } from '../../../academic/workflow/tests/pipeline-fixture.ts'
import { runResearchDraft } from '@deepseek-ai/dsh-academic-workflow'

const contexts: Context[] = []
afterEach(async () => {
  runAcademicResearchDraft.mockReset()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

function brief() {
  return { schemaVersion: 1 as const, researchBriefId: createResearchBriefId(), version: 1, topic: 'Retrieval', aliases: [],
    questions: ['Which method works?'], publicationWindow: { start: null, end: null, dateBasis: 'first_public_release' as const },
    includedWorkTypes: ['preprint'], inclusionRules: ['Include retrieval studies.'], exclusionRules: ['Exclude surveys.'],
    evidenceRequirements: { minimumIncludedWorks: 1, minimumFulltextWorks: 1, minimumEvidenceLevel: 'fulltext' as const,
      requireLocatableEvidence: true, allowPreprints: true, insufficientEvidencePolicy: 'continue_with_warning' as const },
    targetAudience: 'researchers', reportRequirements: { language: 'zh-CN', targetLength: { unit: 'characters', minimum: null, maximum: null },
      requiredSections: [], citationStyle: 'numeric' as const, includeEvidenceAppendix: true, includeMethodology: true,
      includeLimitations: true, includeResearchGaps: false }, stopConditions: { maximumSearchRounds: 3, maximumCandidateWorks: 3,
      maximumIncludedWorks: 2, maximumElapsedMinutes: null, saturationRounds: 1, stopWhenEvidenceRequirementsMet: false },
    assumptions: [], approval: { status: 'approved' as const, reviewedBy: 'tester', reviewedAt: '2026-09-16T00:00:00Z',
      approvedBriefVersion: 1, comment: null } }
}

function retrievalRun(stage: 'completed' | 'cancelled' = 'completed'): RetrievalRun {
  return { schemaVersion: 1, retrievalRunId: createRetrievalRunId(), researchBriefId: createResearchBriefId(),
    researchBriefVersion: 1, stage, status: 'success', startedAt: '2026-09-16T00:00:00Z',
    completedAt: '2026-09-16T00:01:00Z', queries: ['retrieval'], providers: ['fixture'], academicWorkIds: [],
    coverageSummary: createCoverageSummary({ discoveredRecords: 0, deduplicatedWorks: 0, includedWorks: 0,
      availableFulltextWorks: 0, abstractOnlyWorks: 0, metadataOnlyWorks: 0, failedOperations: 0,
      truncated: false, limitations: [], providerBreakdown: null }), failures: [] }
}

function briefPayload() {
  const { researchBriefId: _researchBriefId, version: _version, approval: _approval, ...payload } = brief()
  return payload
}

function briefPlan(payload: unknown = briefPayload()): string {
  return `# Retrieval research\n\n\`\`\`academic-research-brief-json\n${JSON.stringify(payload)}\n\`\`\``
}

function nativePlanEvents(plan: string, options: { isError?: boolean; time?: number; argumentsJson?: string } = {}) {
  const callId = ToolCallId('approved-brief-call')
  return [
    { type: 'tool/call', seq: 1, time: 1,
      data: { turn: 1, step: 1, callId, name: 'exit_plan_mode',
        arguments: options.argumentsJson ?? JSON.stringify({ plan }) } },
    { type: 'tool/result', seq: 2, time: options.time ?? Date.parse('2026-09-16T00:00:01Z'), surfaceOp: 'append',
      data: { turn: 1, step: 1, message: createToolResultMessage({ callId, content: [], isError: options.isError ?? false }) } },
  ] as never
}

async function harness(options: {
  searches?: readonly string[]
  legacyPlan?: boolean
  busy?: boolean
  header?: boolean
  approvedPlan?: boolean
  model?: boolean
  missingModel?: boolean
  eventsError?: boolean
  resolveError?: boolean
  reasoning?: boolean
  hybridPlan?: boolean
  retrieval?: AcademicPlannedRetrieval
} = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  const dispose = (): void => {}
  ctx.provide('typert', { lookups: { configure: () => dispose }, contexts: { configureHost: () => dispose } } as never)
  const search = vi.fn()
  const searchProviders = vi.fn()
  const verifyReference = vi.fn<AcademicSourceRuntime['verifyReference']>()
  const webSearch = vi.fn()
  const resolveFullText = vi.fn((version: { sourceRecords: readonly { provider: string; recordId: string }[] }) => {
    const record = version.sourceRecords[0]
    return record === undefined || record.provider === 'unregistered' ? null : {
      sourceProvider: record.provider,
      urls: [`https://arxiv.org/html/${record.recordId}`, `https://arxiv.org/pdf/${record.recordId}`],
    }
  })
  const fetch = vi.fn<WebRuntime['fetch']>()
  await ctx.plugin((serviceCtx: Context) => {
    serviceCtx.provide('academicSource', { searchAll: search, searchProviders, verifyReference, resolveFullText } as never)
    serviceCtx.provide('web', { fetch, search: webSearch } as never)
  })
  let agentContext: Context | undefined
  await ctx.plugin((agentCtx: Context) => { agentContext = agentCtx })
  if (agentContext === undefined) throw new Error('missing Agent context fixture')
  const sessionId = SessionId('academic-session')
  const signal = new AbortController().signal
  const fallback = options.model === false ? {} : { provider: 'fixture', model: 'fallback', maxTokens: 4000 }
  const selected = options.model === false ? {} : options.missingModel ? { provider: 'fixture' }
    : { provider: 'fixture', model: 'selected', ...options.reasoning ? { reasoningEffort: 'low' } : { maxTokens: 8000 } }
  const agent = {
    id: sessionId,
    ctx: agentContext,
    options: fallback,
    session: {
      id: sessionId,
      snapshotEvents: () => {
        if (options.eventsError === true) throw 'invalid event source'
        return options.approvedPlan === false ? [] : nativePlanEvents(briefPlan({ ...briefPayload(),
          ...options.hybridPlan === true ? { schemaVersion: 3 } : {},
          ...options.legacyPlan ? {} : { searchPlan: (options.searches ?? ['retrieval']).map(query => ({ query,
            purpose: '查找相关研究', questions: briefPayload().questions,
            ...options.hybridPlan === true ? { retrieval: options.retrieval ?? {
              channels: ['academic', 'web_discovery'],
              academicProviders: ['openalex', 'arxiv'],
              verificationProviders: ['openalex', 'arxiv', 'acl', 'pmlr', 'cvf'],
              maximumWebDiscoveryResults: 8,
              maximumReferenceVerifications: 5,
            } } : {},
          })) },
        }))
      },
      requestHeader: () => options.header === false ? undefined : { config: selected },
    },
    runMaintenance: options.busy ? () => { throw new Error('already has active work') }
      : (task: (maintenanceSignal: AbortSignal) => Promise<unknown>) => task(signal),
  }
  const resolution = options.resolveError === true ? { error: new Error('missing Session') } : { agent }
  ctx.provide('sessionController', { resolveAgent: () => Promise.resolve(resolution) } as never)
  const controller = new AcademicResearchController(ctx, {
    fulltextFetchProvider: 'academic-raw',
    extractionMaxTokens: 16_384,
    extractionMaxAttempts: 2,
  })
  return { controller, search, searchProviders, verifyReference, webSearch, fetch, sessionId, signal }
}

describe('AcademicResearchController', () => {
  it('reports unavailable sessions and unreadable history during preview without running research', async () => {
    const missing = await harness({ resolveError: true })
    await expect(missing.controller.plan(missing.sessionId)).rejects.toThrow('missing Session')
    const invalid = await harness({ eventsError: true })
    await expect(invalid.controller.plan(invalid.sessionId)).rejects.toThrow('无法读取研究计划')
    expect(runAcademicResearchDraft).not.toHaveBeenCalled()
  })

  it.each([
    [null, '至少一条查询'],
    [[], '至少一条查询'],
    [[{ query: 'x', purpose: '检索', questions: ['不在计划中的问题'] }], '计划之外'],
    [[{ query: ' ', purpose: '检索', questions: ['Which method works?'] }], 'query must be a non-empty string'],
    [[{ query: 'x', purpose: '', questions: ['Which method works?'] }], 'purpose must be a non-empty string'],
    [[{ query: 'x', purpose: '检索', questions: [] }], 'questions must contain'],
    [[{ query: 'x', purpose: '检索', questions: ['Which method works?'], extra: true }], 'unknown: extra'],
  ])('rejects malformed saved searches before retrieval: %j', (searchPlan, message) => {
    expect(() => researchPlanFromApprovedPlan('s', nativePlanEvents(briefPlan({ ...briefPayload(), searchPlan })))).toThrow(message)
  })

  it('requires every research question to be covered within the approved round bound', () => {
    const searchPlan = [{ query: 'first', purpose: '比较方法', questions: ['Which method works?'] }]
    expect(() => researchPlanFromApprovedPlan('s', nativePlanEvents(briefPlan({ ...briefPayload(), searchPlan,
      questions: ['Which method works?', 'What are the limitations?'] })))).toThrow('未覆盖全部研究问题')
    expect(() => researchPlanFromApprovedPlan('s', nativePlanEvents(briefPlan({ ...briefPayload(),
      stopConditions: { ...briefPayload().stopConditions, maximumSearchRounds: 1 },
      searchPlan: [...searchPlan, { ...searchPlan[0], query: 'second' }] })))).toThrow('1 条查询上限')
  })

  it('rejects duplicate expressions with different approved retrieval policies', () => {
    const retrieval = {
      channels: ['academic', 'web_discovery'],
      academicProviders: ['openalex', 'arxiv'],
      verificationProviders: ['openalex', 'arxiv', 'acl', 'pmlr', 'cvf'],
      maximumWebDiscoveryResults: 8,
      maximumReferenceVerifications: 5,
    }
    const search = { query: 'retrieval', purpose: '查找相关研究', questions: ['Which method works?'], retrieval }
    expect(() => researchPlanFromApprovedPlan('s', nativePlanEvents(briefPlan({ ...briefPayload(), schemaVersion: 3,
      searchPlan: [search, { ...search, retrieval: { ...retrieval, maximumReferenceVerifications: 4 } }] }))))
      .toThrow('完全相同的检索表达必须使用完全相同的检索策略')
  })

  it('previews the approved plan without retrieval and refuses a different approval identity', async () => {
    const fixture = await harness()
    const preview = await fixture.controller.plan(fixture.sessionId)
    expect(preview).toMatchObject({ topic: 'Retrieval', questions: ['Which method works?'],
      searches: [{ query: 'retrieval', purpose: '查找相关研究', questions: ['Which method works?'] }] })
    expect(fixture.search).not.toHaveBeenCalled()
    expect(runAcademicResearchDraft).not.toHaveBeenCalled()
    await expect(fixture.controller.run({ sessionId: fixture.sessionId, researchBriefId: createResearchBriefId(),
      synthetic: false }, fixture.signal))
      .rejects.toThrow('研究计划已更新')
    expect(runAcademicResearchDraft).not.toHaveBeenCalled()
  })

  it('executes the reviewed hybrid policy and hands verified works to the real paper pipeline', async () => {
    const fixture = await harness({ hybridPlan: true })
    const pipeline = draftFixture(1)
    const work = pipeline.records[0]!
    fixture.searchProviders.mockResolvedValue({ works: [], batch: createBatchResult([], []),
      providers: ['arxiv', 'openalex'], discoveredRecords: 0, limitations: [], truncated: false })
    fixture.webSearch.mockResolvedValue({ sources: [{ url: 'https://arxiv.org/abs/1706.03762', title: 'Untrusted title' },
      { url: 'https://example.org/blog', snippet: 'Not evidence' }], content: 'Generated answer is not evidence', truncated: false })
    fixture.verifyReference.mockImplementation(async reference => ({ status: 'verified', value: {
      reference, verificationProvider: 'arxiv', work, fullText: null,
    } }))
    fixture.fetch.mockImplementation(async ({ url }, signal) => pipeline.adapters.fetcher(url, signal))
    runAcademicResearchDraft.mockImplementation(async request => ({
      ...await runResearchDraft(request.input, { ...request.adapters,
        generator: pipeline.adapters.generator, synthesize: pipeline.adapters.synthesize }, request.signal),
      sessionId: request.session.id,
    }))
    const preview = await fixture.controller.plan(fixture.sessionId)
    expect(preview.searches[0]?.retrieval).toEqual({
      channels: ['academic', 'web_discovery'],
      academicProviders: ['openalex', 'arxiv'],
      verificationProviders: ['openalex', 'arxiv', 'acl', 'pmlr', 'cvf'],
      maximumWebDiscoveryResults: 8,
      maximumReferenceVerifications: 5,
    })
    const result = await fixture.controller.run({ sessionId: fixture.sessionId,
      researchBriefId: preview.researchBriefId, synthetic: true }, fixture.signal)
    expect(fixture.search).not.toHaveBeenCalled()
    expect(fixture.searchProviders).toHaveBeenCalledWith({ query: 'retrieval', maxResults: 3 },
      ['openalex', 'arxiv'], expect.any(AbortSignal))
    expect(fixture.webSearch).toHaveBeenCalledWith({ query: 'retrieval', maxResults: 8 }, expect.any(AbortSignal))
    expect(fixture.verifyReference).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'arxiv',
      normalizedValue: '1706.03762' }), ['arxiv'], expect.any(AbortSignal))
    expect(result.retrievalRun.coverageSummary).toMatchObject({ discoveredRecords: 1, deduplicatedWorks: 1,
      availableFulltextWorks: 1, includedWorks: 1 })
    expect(result.report).not.toBeNull()
    expect(result.report?.markdown).not.toContain('Untrusted title')
    expect(result.report?.markdown).not.toContain('Generated answer is not evidence')
    expect(result.hybridRetrieval).toMatchObject({ counts: { academicDiscoveredRecords: 0,
      webDiscoveredUrls: 2, identifiedReferences: 1, attemptedVerifications: 1, verifiedReferences: 1,
      discardedWebCandidates: 1, mergedDuplicates: 0, deduplicatedWorks: 1 },
    stages: { referenceIdentification: 'partial_success', referenceVerification: 'success', deduplication: 'success' } })
    expect(result.hybridRetrieval?.references[0]).toMatchObject({ query: 'retrieval', kind: 'arxiv',
      verificationProvider: 'arxiv', status: 'verified' })
  })

  it('requires legacy plans to be completed and approved instead of inventing search expressions', async () => {
    const fixture = await harness({ legacyPlan: true })
    await expect(fixture.controller.plan(fixture.sessionId)).rejects.toThrow('缺少检索方案')
    await expect(fixture.controller.run({ sessionId: fixture.sessionId, researchBriefId: createResearchBriefId(),
      synthetic: false }, fixture.signal))
      .rejects.toThrow('缺少检索方案')
    expect(fixture.search).not.toHaveBeenCalled()
    expect(runAcademicResearchDraft).not.toHaveBeenCalled()
  })

  it.each(['web_search', 'verify_reference'])('includes %s failures in discovery stage settlement', async (operation) => {
    const fixture = await harness({ hybridPlan: true })
    const observed = retrievalRun()
    runAcademicResearchDraft.mockResolvedValue({ synthesis: { status: 'not_run', reasons: [] }, status: 'completed',
      sessionId: fixture.sessionId, retrievalRun: { ...observed, failures: [{ schemaVersion: 1,
        failureId: createFailureId(), provider: 'web', operation, category: 'network_error', message: 'offline',
        retryable: true, retryAfter: null }] }, papers: [], failures: [], analysis: null, report: null })
    const preview = await fixture.controller.plan(fixture.sessionId)
    const result = await fixture.controller.run({ sessionId: fixture.sessionId,
      researchBriefId: preview.researchBriefId, synthetic: true }, fixture.signal)
    expect(result.stages.search).toBe('failed')
    expect(result.retrievalRun.failures[0]?.operation).toBe(operation)
  })

  it.each([0, 1])('does not present an interrupted search as successful after %i completed queries', async (count) => {
    const fixture = await harness({ hybridPlan: true })
    runAcademicResearchDraft.mockResolvedValue({ synthesis: { status: 'not_run', reasons: ['Cancelled'] }, status: 'cancelled',
      sessionId: fixture.sessionId, completedSearchQueries: count === 0 ? [] : ['one'],
      retrievalRun: { ...retrievalRun(), queries: ['one', 'two'], stage: 'cancelled', status: 'success',
        completedAt: '2026-09-24T00:00:00Z' },
      papers: [], failures: [], analysis: null, report: null })
    const preview = await fixture.controller.plan(fixture.sessionId)
    const result = await fixture.controller.run({ sessionId: fixture.sessionId,
      researchBriefId: preview.researchBriefId, synthetic: true }, fixture.signal)
    expect(result.status).toBe('cancelled')
    expect(result.stages.search).toBe(count === 0 ? 'not_run' : 'partial_success')
    expect(result.hybridRetrieval).toBeUndefined()
  })

  it.each(['partially_extracted', 'extraction_failed'] as const)('projects %s without presenting complete extraction success', async (status) => {
    const fixture = await harness()
    const workVersionId = createWorkVersionId()
    const observedRun = retrievalRun()
    const rejectedDrafts = [{ draftIndex: 1, segmentIndex: 39, code: 'EVIDENCE_EXCERPT_NOT_FOUND', reason: 'Exact quote missing.' }]
    runAcademicResearchDraft.mockResolvedValue({ synthesis: { status: 'not_run', reasons: [] }, status: 'completed', sessionId: fixture.sessionId,
      retrievalRun: { ...observedRun, coverageSummary: { ...observedRun.coverageSummary, availableFulltextWorks: 1 } },
      papers: [{ status, version: { workVersionId }, evidence: { evidenceRecords: status === 'partially_extracted' ? [{}, {}] : [], rejectedDrafts } }],
      failures: status === 'extraction_failed' ? [{ workVersionId, stage: 'extraction' }] : [], analysis: null, report: null } as never)
    const result = await fixture.controller.run({ sessionId: fixture.sessionId, researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false }, fixture.signal)
    expect(result.stages).toMatchObject({ fulltext: 'success', extraction: status === 'partially_extracted' ? 'partial_success' : 'failed' })
    expect(result.papers).toEqual([{ status, workVersionId, evidenceCount: status === 'partially_extracted' ? 2 : 0, rejectedDrafts }])
  })
  it('runs the formal workflow with the Session model and registered source adapters', async () => {
    const fixture = await harness()
    const resultWorkVersionId = createWorkVersionId()
    const observedRun = retrievalRun()
    runAcademicResearchDraft.mockResolvedValue({ synthesis: { status: 'not_run', reasons: [] }, status: 'completed', sessionId: fixture.sessionId, retrievalRun: observedRun,
      papers: [
        { status: 'extracted', version: { workVersionId: resultWorkVersionId }, evidence: { evidenceRecords: [{}, {}], rejectedDrafts: [] } },
        { status: 'excluded', exclusion: { workVersionId: resultWorkVersionId, reason: 'survey' } },
        { status: 'paused', pause: { workVersionId: resultWorkVersionId, reason: 'too long' } },
      ], failures: [], analysis: null, report: null } as never)
    const result = await fixture.controller.run({ sessionId: fixture.sessionId, researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never, maxResults: 2,
      synthetic: false }, new AbortController().signal)
    expect(result.papers).toEqual([
      { status: 'extracted', workVersionId: resultWorkVersionId, evidenceCount: 2, rejectedDrafts: [] },
      { status: 'excluded', workVersionId: resultWorkVersionId, reason: 'survey' },
      { status: 'paused', workVersionId: resultWorkVersionId, reason: 'too long' },
    ])
    expect(result.retrievalRun).toBe(observedRun)
    expect(result.stages).toEqual({ search: 'success', fulltext: 'not_run', extraction: 'not_run' })
    const call = runAcademicResearchDraft.mock.calls[0]?.[0]
    if (call === undefined) throw new Error('missing Academic workflow invocation')
    expect(call).toMatchObject({ session: { id: fixture.sessionId }, model: { provider: 'fixture', model: 'selected', maxTokens: 8000 },
      modelPolicy: { maxAttempts: 2 },
      input: { paperConcurrency: 3, brief: { topic: 'Retrieval', version: 1, approval: { status: 'approved', reviewedBy: 'session-user',
        approvedBriefVersion: 1, reviewedAt: '2026-09-16T00:00:01.000Z' } },
      searches: [{ query: 'retrieval', maxResults: 2 }], synthetic: false } })
    await call.adapters.search({ query: 'retrieval' }, fixture.signal)
    await expect(call.adapters.search({ query: 'unapproved' }, fixture.signal)).rejects.toThrow('not in the approved plan')
    await call.adapters.fetcher('https://arxiv.org/pdf/1', fixture.signal)
    expect(Date.parse(call.adapters.now())).not.toBeNaN()
    expect(fixture.search).toHaveBeenCalledExactlyOnceWith({ query: 'retrieval' }, fixture.signal)
    expect(fixture.fetch).toHaveBeenCalledWith(
      { url: 'https://arxiv.org/pdf/1' }, fixture.signal, { providerId: 'academic-raw' },
    )

    const academicWorkId = createAcademicWorkId(), workVersionId = createWorkVersionId()
    const selected = call.adapters.selectPapers({ works: [{ schemaVersion: 1, academicWorkId, title: 'Paper', authors: [],
      externalIdentifiers: [], workVersionIds: [workVersionId], canonicalVersionId: workVersionId,
      firstPublicDate: { status: 'available', value: { iso: '2026', precision: 'year' } },
      publicationStatus: { status: 'available', value: 'preprint' }, venue: { status: 'unknown', reason: 'none' } }],
    versions: [{ schemaVersion: 1, workVersionId, academicWorkId, versionType: 'preprint',
      versionLabel: { status: 'available', value: 'v1' }, releaseDate: { status: 'available', value: { iso: '2026', precision: 'year' } },
      externalIdentifiers: [], sourceRecords: [{ provider: 'arxiv', recordId: '2406.12345v1' }],
      contentHash: { status: 'not_extracted' }, supersedesWorkVersionId: null, status: 'active' }],
    index: { byExactKey: new Map(), byFuzzyKey: new Map(), records: new Map() }, audit: { entries: [] } }, brief())
    expect(selected.papers[0]).toMatchObject({ sourceProvider: 'arxiv', urls: [
      'https://arxiv.org/html/2406.12345v1', 'https://arxiv.org/pdf/2406.12345v1',
    ] })
    expect(call.adapters.selectPapers({ works: [{ schemaVersion: 1, academicWorkId, title: 'Paper', authors: [],
      externalIdentifiers: [], workVersionIds: [workVersionId], canonicalVersionId: workVersionId,
      firstPublicDate: { status: 'available', value: { iso: '2026', precision: 'year' } },
      publicationStatus: { status: 'available', value: 'preprint' }, venue: { status: 'unknown', reason: 'none' } }],
    versions: [{ schemaVersion: 1, workVersionId, academicWorkId,
      versionType: 'preprint', versionLabel: { status: 'available', value: 'v1' },
      releaseDate: { status: 'available', value: { iso: '2026', precision: 'year' } }, externalIdentifiers: [],
      sourceRecords: [{ provider: 'unregistered', recordId: 'missing' }], contentHash: { status: 'not_extracted' },
      supersedesWorkVersionId: null, status: 'active' }], index: { byExactKey: new Map(), byFuzzyKey: new Map(), records: new Map() },
    audit: { entries: [] } }, brief())).toEqual({ papers: [], truncated: false })
  })

  it('uses the Agent fallback selection before the Session has a request header', async () => {
    const fixture = await harness({ header: false })
    runAcademicResearchDraft.mockResolvedValue({ synthesis: { status: 'not_run', reasons: [] }, status: 'cancelled', sessionId: fixture.sessionId,
      retrievalRun: retrievalRun('cancelled'),
      papers: [], failures: [], analysis: null, report: null } as never)
    await fixture.controller.run({ sessionId: fixture.sessionId, researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never, synthetic: true },
      new AbortController().signal)
    expect(runAcademicResearchDraft.mock.calls[0]?.[0].model).toEqual({ provider: 'fixture', model: 'fallback', maxTokens: 4000 })
  })

  it('settles successful search and full text separately from failed evidence extraction', async () => {
    const fixture = await harness()
    const first = createWorkVersionId(), second = createWorkVersionId()
    const observed = retrievalRun()
    runAcademicResearchDraft.mockResolvedValue({ synthesis: { status: 'not_run', reasons: [] }, status: 'completed', sessionId: fixture.sessionId,
      retrievalRun: { ...observed, status: 'failed', coverageSummary: { ...observed.coverageSummary,
        discoveredRecords: 20, deduplicatedWorks: 8, includedWorks: 0, availableFulltextWorks: 2,
        failedOperations: 2 } },
      papers: [], failures: [
        { workVersionId: first, stage: 'extraction' },
        { workVersionId: second, stage: 'extraction' },
      ], analysis: null, report: null } as never)

    const result = await fixture.controller.run({ sessionId: fixture.sessionId, researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false }, fixture.signal)
    expect(result.stages).toEqual({ search: 'success', fulltext: 'success', extraction: 'failed' })
    expect(result.retrievalRun.status).toBe('failed')
  })

  it('executes only saved plan queries, trims them, and removes exact repeats', async () => {
    const fixture = await harness({ searches: ['  Transformer long-range dependencies  ', 'BERT bidirectional pre-training', 'Transformer long-range dependencies'] })
    runAcademicResearchDraft.mockResolvedValue({ synthesis: { status: 'not_run', reasons: [] }, status: 'completed', sessionId: fixture.sessionId,
      retrievalRun: retrievalRun(), papers: [], failures: [], analysis: null, report: null } as never)

    await fixture.controller.run({ sessionId: fixture.sessionId,
      researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      maxResults: 5, synthetic: false }, fixture.signal)

    expect(runAcademicResearchDraft.mock.calls[0]?.[0].input.searches).toEqual([
      { query: 'Transformer long-range dependencies', maxResults: 5 },
      { query: 'BERT bidirectional pre-training', maxResults: 5 },
    ])
  })

  it('rejects more queries than the hard and approved bound before starting maintenance', async () => {
    const fixture = await harness({ searches: ['one', 'two', 'three', 'four'] })
    await expect(fixture.controller.run({ sessionId: fixture.sessionId, researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false }, fixture.signal))
      .rejects.toMatchObject({ code: 'gateway/bad-request', message: '检索方案超过已批准的 3 条查询上限，请缩小方案后重新审核。' })
    expect(runAcademicResearchDraft).not.toHaveBeenCalled()
  })

  it('reports a busy Session before starting workflow work', async () => {
    const fixture = await harness({ busy: true })
    await expect(fixture.controller.run({ sessionId: fixture.sessionId, researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false },
    new AbortController().signal)).rejects.toMatchObject({ code: 'session/agent-busy' })
    expect(runAcademicResearchDraft).not.toHaveBeenCalled()
  })

  it('refuses to run without a successfully approved structured Brief plan', async () => {
    const fixture = await harness({ approvedPlan: false })
    await expect(fixture.controller.run({ sessionId: fixture.sessionId, researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false },
    new AbortController().signal)).rejects.toMatchObject({
      code: 'gateway/bad-request',
      message: '请先在当前会话完成研究计划审核。',
    })
    expect(runAcademicResearchDraft).not.toHaveBeenCalled()
  })

  it('refuses to run when the Session has no model selection', async () => {
    const fixture = await harness({ model: false })
    await expect(fixture.controller.run({ sessionId: fixture.sessionId, researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false },
    new AbortController().signal)).rejects.toMatchObject({
      code: 'gateway/bad-request',
      message: 'the Session has no selected model',
    })
  })

  it('also rejects a partially selected model', async () => {
    const fixture = await harness({ missingModel: true })
    await expect(fixture.controller.run({ sessionId: fixture.sessionId, researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false },
    new AbortController().signal)).rejects.toMatchObject({ code: 'gateway/bad-request' })
  })

  it('preserves reasoning effort and supplies the configured extraction cap when Session max tokens are absent', async () => {
    const fixture = await harness({ reasoning: true })
    runAcademicResearchDraft.mockResolvedValue({ synthesis: { status: 'not_run', reasons: [] }, status: 'completed', sessionId: fixture.sessionId,
      retrievalRun: retrievalRun(),
      papers: [], failures: [], analysis: null, report: null } as never)
    await fixture.controller.run({ sessionId: fixture.sessionId, researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false }, fixture.signal)
    expect(runAcademicResearchDraft.mock.calls[0]?.[0].model).toEqual({
      provider: 'fixture', model: 'selected', reasoningEffort: 'low', maxTokens: 16_384,
    })
  })

  it('forwards Session lookup errors and normalizes non-Error Brief failures', async () => {
    const missing = await harness({ resolveError: true })
    await expect(missing.controller.run({ sessionId: missing.sessionId, researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false }, missing.signal))
      .rejects.toThrow('missing Session')
    const malformed = await harness({ eventsError: true })
    await expect(malformed.controller.run({ sessionId: malformed.sessionId, researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false }, malformed.signal))
      .rejects.toMatchObject({ code: 'gateway/bad-request', message: 'invalid Academic Research Brief' })
  })
})

describe('approved Research Brief plan handoff', () => {
  it('accepts a successful PTC dispatch and preserves a complete typed payload', () => {
    const base = briefPayload()
    const payload = {
      ...base,
      publicationWindow: { ...base.publicationWindow,
        start: { iso: '2020-01', precision: 'month' as const },
        end: { iso: '2026-09-16', precision: 'day' as const } },
      reportRequirements: { ...base.reportRequirements,
        targetLength: { unit: 'characters', minimum: 1000, maximum: 2000 } },
      stopConditions: { ...base.stopConditions, maximumElapsedMinutes: 30 },
    }
    const events = [
      { type: 'other', seq: 0, time: 0, data: {} },
      { type: 'tool/code-dispatch', seq: 1, time: 1, data: { name: 'other', isError: false } },
      { type: 'tool/code-dispatch', seq: 2, time: 2, data: { name: 'exit_plan_mode', isError: true } },
      { type: 'tool/code-dispatch', seq: 3, time: 3, data: { name: 'exit_plan_mode', isError: false, arguments: null } },
      { type: 'tool/code-dispatch', seq: 4, time: Date.parse('2026-09-16T01:02:03Z'), data: {
        rootCallId: 'root', parentCallId: 'root', subCallId: 'root:code:1', name: 'exit_plan_mode',
        arguments: { plan: briefPlan(payload) }, isError: false, content: [],
      } },
    ] as never

    expect(researchBriefFromApprovedPlan('session-1', events)).toMatchObject({
      ...payload,
      researchBriefId: 'session-1:approved-plan:root:code:1',
      version: 1,
      approval: { status: 'approved', reviewedBy: 'session-user', reviewedAt: '2026-09-16T01:02:03.000Z',
        approvedBriefVersion: 1, comment: null },
    })
  })

  it('ignores failed and malformed plan calls', () => {
    expect(() => researchBriefFromApprovedPlan('session-1', nativePlanEvents(briefPlan(), { isError: true })))
      .toThrow('请先在当前会话完成研究计划审核')
    expect(() => researchBriefFromApprovedPlan('session-1', nativePlanEvents(briefPlan(), { argumentsJson: '{' })))
      .toThrow('请先在当前会话完成研究计划审核')
    expect(() => researchBriefFromApprovedPlan('session-1', nativePlanEvents(briefPlan(), { argumentsJson: 'null' })))
      .toThrow('请先在当前会话完成研究计划审核')
    expect(() => researchBriefFromApprovedPlan('session-1', nativePlanEvents(briefPlan(), {
      argumentsJson: JSON.stringify({ unrelated: true }),
    }))).toThrow('请先在当前会话完成研究计划审核')
  })

  it('rejects an invalid review timestamp', () => {
    expect(() => researchBriefFromApprovedPlan('session-1', nativePlanEvents(briefPlan(), { time: Number.NaN })))
      .toThrow('invalid review timestamp')
  })

  it.each([
    ['missing block', '# Plan only', 'exactly one'],
    ['duplicate block', `${briefPlan()}\n${briefPlan()}`, 'exactly one'],
    ['invalid JSON', '# Plan\n\n```academic-research-brief-json\n{\n```', 'valid JSON'],
  ])('rejects %s', (_label, plan, message) => {
    expect(() => researchBriefFromApprovedPlan('session-1', nativePlanEvents(plan))).toThrow(message)
  })

  it.each([
    ['object', null, 'must be an object'],
    ['missing field', omitTopic(), 'missing: topic'],
    ['unknown field', { ...briefPayload(), extra: true }, 'unknown: extra'],
    ['schema version', { ...briefPayload(), schemaVersion: 4 }, 'schemaVersion must be 1, 2, or 3'],
    ['topic', { ...briefPayload(), topic: '' }, 'topic must be a non-empty string'],
    ['aliases type', { ...briefPayload(), aliases: 'retrieval' }, 'aliases must be an array'],
    ['alias item', { ...briefPayload(), aliases: [''] }, 'aliases[0] must be a non-empty string'],
    ['questions', { ...briefPayload(), questions: [] }, 'questions must contain at least one item'],
    ['publication window', { ...briefPayload(), publicationWindow: null }, 'publicationWindow must be an object'],
    ['partial date', { ...briefPayload(), publicationWindow: { ...briefPayload().publicationWindow, start: 2020 } },
      'publicationWindow.start must be an object'],
    ['date basis', { ...briefPayload(), publicationWindow: { ...briefPayload().publicationWindow, dateBasis: 'created' } },
      'publicationWindow.dateBasis must be one of'],
    ['work types', { ...briefPayload(), includedWorkTypes: [] }, 'includedWorkTypes must contain at least one item'],
    ['evidence requirements', { ...briefPayload(), evidenceRequirements: null }, 'evidenceRequirements must be an object'],
    ['non-integer count', withEvidence({ minimumIncludedWorks: 1.5 }), 'must be a non-negative integer'],
    ['negative count', withEvidence({ minimumFulltextWorks: -1 }), 'must be a non-negative integer'],
    ['evidence level', withEvidence({ minimumEvidenceLevel: 1 }), 'minimumEvidenceLevel must be one of'],
    ['boolean', withEvidence({ requireLocatableEvidence: 'yes' }), 'requireLocatableEvidence must be a boolean'],
    ['evidence policy', withEvidence({ insufficientEvidencePolicy: 'ignore' }), 'insufficientEvidencePolicy must be one of'],
    ['report requirements', { ...briefPayload(), reportRequirements: null }, 'reportRequirements must be an object'],
    ['target length', withReport({ targetLength: null }), 'targetLength must be an object'],
    ['length count', withReport({ targetLength: { unit: 'words', minimum: -1, maximum: null } }),
      'minimum must be a non-negative integer'],
    ['length order', withReport({ targetLength: { unit: 'words', minimum: 2, maximum: 1 } }),
      'minimum must not exceed maximum'],
    ['citation style', withReport({ citationStyle: 'links' }), 'citationStyle must be one of'],
    ['report boolean', withReport({ includeMethodology: 'yes' }), 'includeMethodology must be a boolean'],
    ['stop conditions', { ...briefPayload(), stopConditions: null }, 'stopConditions must be an object'],
    ['positive count', withStop({ maximumSearchRounds: 0 }), 'maximumSearchRounds must be a positive integer'],
    ['elapsed count', withStop({ maximumElapsedMinutes: -1 }), 'maximumElapsedMinutes must be a non-negative integer'],
    ['stop boolean', withStop({ stopWhenEvidenceRequirementsMet: 'yes' }), 'stopWhenEvidenceRequirementsMet must be a boolean'],
  ])('rejects an invalid %s field', (_label, payload, message) => {
    expect(() => researchBriefFromApprovedPlan('session-1', nativePlanEvents(briefPlan(payload)))).toThrow(message)
  })
})

function omitTopic(): Omit<ReturnType<typeof briefPayload>, 'topic'> {
  const { topic: _topic, ...rest } = briefPayload()
  return rest
}

function withEvidence(patch: Record<string, unknown>) {
  const payload = briefPayload()
  return { ...payload, evidenceRequirements: { ...payload.evidenceRequirements, ...patch } }
}

function withReport(patch: Record<string, unknown>) {
  const payload = briefPayload()
  return { ...payload, reportRequirements: { ...payload.reportRequirements, ...patch } }
}

function withStop(patch: Record<string, unknown>) {
  const payload = briefPayload()
  return { ...payload, stopConditions: { ...payload.stopConditions, ...patch } }
}
