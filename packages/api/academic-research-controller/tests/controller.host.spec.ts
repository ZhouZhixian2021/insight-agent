import { Context } from '@deepseek-ai/cordis'
import { ACADEMIC_CANDIDATE_RANKING_POLICY_V1, createAcademicWorkId, createBatchResult, createCoverageSummary,
  createFailureId, createResearchBriefId, createRetrievalRunId, createSearchQueryId,
  createWorkVersionId, type RetrievalRun } from '@deepseek-ai/dsh-academic-model'
import { createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionQueryError } from '@deepseek-ai/dsh-session-query'
import type { PtcDispatchEventData } from '@deepseek-ai/dsh-tools/types'
import type { AcademicSourceRuntime, AcademicSourceWork } from '@deepseek-ai/dsh-academic-source'
import type { WebRuntime } from '@deepseek-ai/dsh-web'
import type { AcademicQueryWorkflowObservation, AcademicWorkflowProgressSnapshot } from '@deepseek-ai/dsh-academic-workflow'
import { afterEach, describe, expect, it, vi } from 'vitest'

type RunAcademicResearchDraft = typeof import('@deepseek-ai/dsh-academic-workflow')['runAcademicResearchDraft']
const runAcademicResearchDraft = vi.hoisted(() => vi.fn<RunAcademicResearchDraft>())
type RunAcademicEvidenceEnhancement = typeof import('@deepseek-ai/dsh-academic-workflow')['runAcademicEvidenceEnhancement']
const runAcademicEvidenceEnhancement = vi.hoisted(() => vi.fn<RunAcademicEvidenceEnhancement>())
vi.mock('@deepseek-ai/dsh-academic-workflow', async load => ({
  ...await load<typeof import('@deepseek-ai/dsh-academic-workflow')>(),
  runAcademicResearchDraft, runAcademicEvidenceEnhancement,
}))
// These Controller tests exercise orchestration; model dispatch and durable review writes have their own real-service tests.
vi.mock('../src/candidate-review-model.ts', async load => ({
  ...await load<typeof import('../src/candidate-review-model.ts')>(),
  createModelCandidateReviewer: () => async () => ({ status: 'validated', screening: {
    schemaVersion: 1, signals: [], surfaceKeywordHits: [], uncertainties: [],
    scope: { status: 'potentially_relevant', reason: 'Synthetic scholarly metadata matches the question.' },
  } }),
  recordCandidateReviewSelection: async () => SessionSeq(1),
}))

import AcademicResearchController from '../src/index.ts'
import { academicResearchProjectionDefinition } from '../src/academic-research-projection.ts'
import type { AcademicCandidateScreening } from '../src/candidate-screening.ts'
import { researchBriefFromApprovedPlan, researchPlanFromApprovedPlan } from '../src/research-brief-plan.ts'
import type { AcademicBackgroundRunView, AcademicPlannedRetrieval } from '../src/types.ts'
import { draftFixture } from '../../../academic/workflow/tests/pipeline-fixture.ts'
import { academicTraceSpan, runResearchDraft } from '@deepseek-ai/dsh-academic-workflow'

const contexts: Context[] = []
afterEach(async () => {
  runAcademicResearchDraft.mockReset()
  runAcademicEvidenceEnhancement.mockReset()
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

function retrievalWork(record: AcademicSourceWork, recordId: string): AcademicSourceWork {
  return {
    ...record,
    academicWork: { ...record.academicWork, title: `Retrieval study ${recordId}` },
    workVersion: { ...record.workVersion, sourceRecords: [{ provider: 'arxiv', recordId }] },
    metadata: {
      abstract: { status: 'available', value: 'This retrieval study compares methods and reports results.' },
      keywords: { status: 'available', value: ['retrieval', 'methods'] },
    },
  }
}

function retrievalRun(stage: 'completed' | 'cancelled' = 'completed'): RetrievalRun {
  return { schemaVersion: 1, retrievalRunId: createRetrievalRunId(), researchBriefId: createResearchBriefId(),
    researchBriefVersion: 1, stage, status: 'success', startedAt: '2026-09-16T00:00:00Z',
    completedAt: '2026-09-16T00:01:00Z', queries: ['retrieval'], providers: ['fixture'], academicWorkIds: [],
    coverageSummary: createCoverageSummary({ discoveredRecords: 0, deduplicatedWorks: 0, includedWorks: 0,
      availableFulltextWorks: 0, abstractOnlyWorks: 0, metadataOnlyWorks: 0, failedOperations: 0,
      truncated: false, limitations: [], providerBreakdown: null }), failures: [] }
}

function progressSnapshot(
  retrievalRunId: RetrievalRun['retrievalRunId'],
  sequence: number,
  status: 'running' | 'success' = 'running',
): AcademicWorkflowProgressSnapshot {
  const pending = { status: 'pending' as const, startedAt: null, completedAt: null,
    completedItems: 0, totalItems: null, unit: null }
  return {
    schemaVersion: 1,
    retrievalRunId,
    sequence,
    startedAt: '2026-09-28T00:00:00.000Z',
    updatedAt: `2026-09-28T00:00:0${String(sequence)}.000Z`,
    elapsedMs: sequence * 1000,
    primaryStage: status === 'running' ? 'retrieval' : null,
    activeStages: status === 'running' ? ['retrieval'] : [],
    stages: {
      retrieval: { status, startedAt: '2026-09-28T00:00:00.000Z',
        completedAt: status === 'success' ? '2026-09-28T00:00:01.000Z' : null,
        completedItems: status === 'success' ? 1 : 0, totalItems: 1, unit: 'queries' },
      screening: pending,
      fulltext: pending,
      extraction: pending,
      analysis: pending,
      report: pending,
    },
    counts: { completedQueries: status === 'success' ? 1 : 0, totalQueries: 1, discoveredRecords: 0,
      deduplicatedWorks: 0, mergedWorkIdentities: 0, mergedVersionRecords: 0, retainedWorkVersions: 0,
      suspectedDuplicateRecords: 0, candidateWorks: 0, completedPapers: 0, totalPapers: null, includedPapers: 0,
      availableFulltextPapers: 0, validatedEvidenceRecords: 0, rejectedEvidenceDrafts: 0,
      completedQuestions: 0, totalQuestions: 1 },
    activities: [],
    latestEvent: { code: status === 'running' ? 'run_started' : 'stage_settled',
      occurredAt: `2026-09-28T00:00:0${String(sequence)}.000Z`, stage: 'retrieval',
      academicWorkId: null, workVersionId: null, providerId: null, failureCode: null },
  }
}

function queryWorkflowObservation(retrievalRunId: RetrievalRun['retrievalRunId']): AcademicQueryWorkflowObservation {
  const researchBriefId = createResearchBriefId()
  const plan = {
    schemaVersion: 1 as const,
    researchBriefId,
    researchBriefVersion: 1,
    constraints: { publicationWindow: { start: null, end: null, dateBasis: 'first_public_release' as const },
      includedWorkTypes: ['preprint'], inclusionRules: [], exclusionRules: [], requiredTerms: [], excludedTerms: [] },
    inclusionTargets: { minimum: 1, target: 1, maximum: 2 },
    rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
    queries: [],
    citationExpansionSeeds: [],
    maximumSearchRounds: 1,
  }
  return {
    schemaVersion: 1,
    retrievalRunId,
    sequence: 0,
    observedAt: '2026-10-09T00:00:00.000Z',
    status: 'running',
    plan,
    works: [],
    versions: [],
    assessments: [],
    ranking: { schemaVersion: 1, researchBriefId, researchBriefVersion: 1, evaluations: [],
      queues: { p0: [], p1: [], p2: [], excluded: [] }, limitations: [] },
    rounds: [],
    decisions: [],
    settlements: [],
    coverage: null,
    stopDecision: null,
    limitations: [],
  }
}

function briefPayload() {
  const { researchBriefId: _researchBriefId, version: _version, approval: _approval, ...payload } = brief()
  return payload
}

function briefPlan(payload: unknown = briefPayload()): string {
  return `# Retrieval research\n\n\`\`\`academic-research-brief-json\n${JSON.stringify(payload)}\n\`\`\``
}

function nativePlanEvents(plan: string, options: {
  isError?: boolean
  time?: number
  argumentsJson?: string
  approved?: boolean
  callId?: string
} = {}) {
  const callId = ToolCallId(options.callId ?? 'approved-brief-call')
  return [
    { type: 'tool/call', seq: 1, time: 1,
      data: { turn: 1, step: 1, callId, name: 'exit_plan_mode',
        arguments: options.argumentsJson ?? JSON.stringify({ plan }) } },
    { type: 'tool/result', seq: 2, time: options.time ?? Date.parse('2026-09-16T00:00:01Z'), surfaceOp: 'append',
      data: { turn: 1, step: 1, meta: { approved: options.approved ?? true }, message: createToolResultMessage({ callId, content: [{ type: 'text', text: JSON.stringify({ approved: options.approved ?? true }) }], isError: options.isError ?? false }) } },
  ] as never
}

function ptcPlanEvent(plan: string, data: Partial<PtcDispatchEventData> = {}): SessionEvent<'tool/ptc-dispatch'> {
  return { type: 'tool/ptc-dispatch', seq: SessionSeq(3), time: Date.parse('2026-09-16T00:00:02Z'), data: {
    rootCallId: ToolCallId('root'), parentCallId: ToolCallId('parent'), subCallId: ToolCallId('parent:ptc:1'),
    name: 'exit_plan_mode', arguments: { plan }, isError: false, content: [], meta: { approved: true }, ...data,
  } }
}

async function harness(options: {
  searches?: readonly string[]
  questions?: readonly string[]
  saturationRounds?: number
  legacyPlan?: boolean
  busy?: boolean
  header?: boolean
  approvedPlan?: boolean
  model?: boolean
  missingModel?: boolean
  eventsError?: boolean
  resolveError?: boolean
  writerHeld?: boolean
  reasoning?: boolean
  hybridPlan?: boolean
  retrieval?: AcademicPlannedRetrieval
  candidateScreening?: AcademicCandidateScreening
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
  const sessionEvents: unknown[][] = []
  const planQuestions = [...options.questions ?? briefPayload().questions]
  const approvedPlanEvents = options.approvedPlan === false ? [] : nativePlanEvents(briefPlan({ ...briefPayload(), questions: planQuestions,
    ...options.saturationRounds === undefined ? {} : { stopConditions: {
      ...briefPayload().stopConditions, saturationRounds: options.saturationRounds,
    } },
    ...options.candidateScreening === undefined ? options.hybridPlan === true ? { schemaVersion: 3 } : {} : {
      schemaVersion: 5, candidateScreening: options.candidateScreening,
      evidenceRequirements: { ...briefPayload().evidenceRequirements, targetIncludedWorks: 2 },
    },
    ...options.legacyPlan ? {} : { searchPlan: (options.searches ?? ['retrieval']).map(query => ({ query,
      purpose: '查找相关研究', questions: planQuestions,
      ...options.hybridPlan === true ? { retrieval: options.retrieval ?? {
        channels: ['academic', 'web_discovery'],
        academicProviders: ['openalex', 'arxiv'],
        verificationProviders: ['openalex', 'arxiv', 'acl', 'pmlr', 'cvf'],
        maximumWebDiscoveryResults: 8,
        maximumReferenceVerifications: 5,
      } } : {},
    })) },
  }))
  const fallback = options.model === false ? {} : { provider: 'fixture', model: 'fallback', maxTokens: 4000 }
  const selected = options.model === false ? {} : options.missingModel ? { provider: 'fixture' }
    : { provider: 'fixture', model: 'selected', ...options.reasoning ? { reasoningEffort: 'low' } : { maxTokens: 8000 } }
  const currentEvents = () => {
    if (options.eventsError === true) throw 'invalid event source'
    return [...approvedPlanEvents, ...sessionEvents.map(([type, data], index) => ({ type, data,
      seq: approvedPlanEvents.length + index + 1, time: Date.parse('2026-10-09T00:00:00Z') + index }))] as SessionEvent[]
  }
  const legacySnapshotRead = vi.fn(() => { throw new Error('deprecated Session snapshot read') })
  const agent = {
    id: sessionId,
    ctx: agentContext,
    options: fallback,
    session: {
      id: sessionId,
      snapshotEvents: legacySnapshotRead,
      requestHeader: () => options.header === false ? undefined : { config: selected },
      append: (...args: unknown[]) => {
        const index = sessionEvents.push(args)
        return { type: args[0], data: args[1], seq: approvedPlanEvents.length + index,
          time: Date.parse('2026-10-09T00:00:00Z') + index - 1 }
      },
    },
    runMaintenance: options.busy ? () => { throw new Error('already has active work') }
      : (task: (maintenanceSignal: AbortSignal) => Promise<unknown>) => task(signal),
  }
  const resolution = options.resolveError === true ? { error: new Error('missing Session') }
    : options.writerHeld === true ? { error: new Error('active write handle') } : { agent }
  const resolveAgent = vi.fn(() => Promise.resolve(resolution))
  ctx.provide('sessionController', { resolveAgent } as never)
  const observationDisposed = vi.fn()
  const observeSession = vi.fn((_sessionId: unknown, readOptions: { signal?: AbortSignal; projectionMode?: 'none' } = {}) => {
    readOptions.signal?.throwIfAborted()
    if (options.resolveError === true) {
      throw new SessionQueryError('missing Session', 'SESSION_QUERY_SESSION_NOT_FOUND')
    }
    const events = currentEvents()
    return Promise.resolve({ header: { id: sessionId, cwd: '/work' }, inheritedEventCount: 0,
      events, cursor: events.at(-1)?.seq ?? -1, [Symbol.dispose]: observationDisposed })
  })
  ctx.provide('sessionQuery', { observeSession } as never)
  ctx.provide('sessions', { flush: () => Promise.resolve(true) } as never)
  ctx.provide('sessionPersistence', { open: () => Promise.resolve({
    read: (seq: number) => Promise.resolve({ eventState: 'detached',
      events: currentEvents().filter(event => event.seq === seq) }),
    [Symbol.asyncDispose]: () => Promise.resolve(),
  }) } as never)
  let academicProjection: typeof academicResearchProjectionDefinition | undefined
  ctx.provide('sessionProjections', {
    register: (definition: typeof academicResearchProjectionDefinition) => { academicProjection = definition; return dispose },
    stateOf: (session: { id: unknown }, key: string) => {
      if (key !== 'academicResearch' || academicProjection === undefined) return undefined
      if (options.eventsError === true) throw 'invalid event source'
      let state = academicProjection.init({ id: session.id } as never, undefined as never)
      for (const event of currentEvents()) {
        state = academicProjection.apply(state, event)
      }
      return state
    },
  } as never)
  const controller = new AcademicResearchController(ctx, {
    fulltextFetchProvider: 'academic-raw',
    extractionMaxTokens: 16_384,
    synthesisMaxTokens: 32_768,
    extractionMaxAttempts: 2,
    extractionRetryInitialDelayMs: 10_000,
    extractionBatchMaxInputTokens: 12_000,
    extractionBatchOverlapCharacters: 512,
    extractionAttemptTimeoutMs: 150_000,
    synthesisMaxAttempts: 3,
    synthesisRetryInitialDelayMs: 1_000,
  })
  return { controller, search, searchProviders, verifyReference, webSearch, resolveFullText, fetch, sessionId, signal, sessionEvents,
    observeSession, observationDisposed, legacySnapshotRead, resolveAgent }
}

describe('AcademicResearchController', () => {
  it('reopens a saved plan and completed run while another Web process owns the Session writer', async () => {
    const fixture = await harness({ writerHeld: true })
    const plan = await fixture.controller.plan(fixture.sessionId)
    const observed = { ...retrievalRun(), researchBriefId: plan.researchBriefId }
    const saved: AcademicBackgroundRunView = {
      schemaVersion: 1, sessionId: fixture.sessionId, backgroundRunId: 'saved-run',
      researchBriefId: plan.researchBriefId, state: 'completed',
      startedAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:01:00Z',
      retrievalRunId: observed.retrievalRunId, progress: null, q6: null,
      result: { synthesis: { status: 'not_run', reasons: [] }, status: 'completed',
        sessionId: fixture.sessionId, q6: null,
        stages: { search: 'success', fulltext: 'not_run', extraction: 'not_run' },
        retrievalRun: observed, papers: [], failures: [], report: null },
      error: null, cancelReason: null,
    }
    fixture.sessionEvents.push(['academic/background-run-state', saved])
    expect(await fixture.controller.listBackgroundRuns(fixture.sessionId)).toMatchObject([
      { backgroundRunId: saved.backgroundRunId, state: 'completed' },
    ])
    expect(await fixture.controller.getBackgroundRun(saved)).toEqual(saved)
    const span = academicTraceSpan('run', null, 'run', null, 'research')
    fixture.sessionEvents.push(['academic/trace-v1', { schemaVersion: 1,
      researchRunId: observed.retrievalRunId, span }])
    expect((await fixture.controller.traceList({ sessionId: fixture.sessionId,
      researchRunId: observed.retrievalRunId }, fixture.signal)).items).toHaveLength(1)
    expect(fixture.resolveAgent).not.toHaveBeenCalled()
    expect(fixture.observationDisposed).toHaveBeenCalledTimes(4)
  })

  it('reads Trace from one disposable observation without appending or starting research', async () => {
    const fixture = await harness()
    const researchRunId = createRetrievalRunId()
    const span = academicTraceSpan('run', null, 'run', null, 'research')
    fixture.sessionEvents.push(['academic/trace-v1', { schemaVersion: 1, researchRunId, span }])
    const before = structuredClone(fixture.sessionEvents)
    const page = await fixture.controller.traceList({ sessionId: fixture.sessionId, researchRunId }, fixture.signal)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.spanId).toBe(span.spanId)
    expect(fixture.observeSession).toHaveBeenCalledExactlyOnceWith(fixture.sessionId,
      { signal: fixture.signal, projectionMode: 'none' })
    expect(fixture.observationDisposed).toHaveBeenCalledOnce()
    expect(fixture.sessionEvents).toEqual(before)
    expect(fixture.legacySnapshotRead).not.toHaveBeenCalled()
    expect(runAcademicResearchDraft).not.toHaveBeenCalled()
  })

  it('disposes Trace observations on invalid cursors and rejects detail requests without a span', async () => {
    const fixture = await harness()
    const query = { sessionId: fixture.sessionId, researchRunId: createRetrievalRunId() }
    await expect(fixture.controller.traceList({ ...query, cursor: 'invalid' }, fixture.signal)).rejects.toThrow('invalid_cursor')
    expect(fixture.observationDisposed).toHaveBeenCalledOnce()
    await expect(fixture.controller.traceDetail(query, fixture.signal)).rejects.toThrow('invalid_query')
    expect(fixture.observeSession).toHaveBeenCalledOnce()
  })

  it('rejects a missing Session and an already-aborted Trace viewer', async () => {
    const missing = await harness({ resolveError: true })
    const query = { sessionId: missing.sessionId, researchRunId: createRetrievalRunId() }
    await expect(missing.controller.traceList(query, missing.signal)).rejects.toMatchObject({ code: 'session/not-found' })
    expect(missing.observeSession).toHaveBeenCalledOnce()
    expect(missing.resolveAgent).not.toHaveBeenCalled()
    const cancelled = await harness()
    const abort = new AbortController()
    abort.abort(new Error('viewer stopped'))
    await expect(cancelled.controller.traceList(query, abort.signal)).rejects.toThrow('viewer stopped')
    expect(cancelled.observeSession).not.toHaveBeenCalled()
    expect(runAcademicResearchDraft).not.toHaveBeenCalled()
  })

  it('releases a Trace observation when its viewer aborts during observation', async () => {
    const fixture = await harness()
    const abort = new AbortController()
    fixture.observeSession.mockImplementationOnce(() => {
      abort.abort(new Error('viewer stopped during read'))
      return Promise.resolve({ header: { id: fixture.sessionId, cwd: '/work' }, inheritedEventCount: 0,
        events: [] as SessionEvent[], cursor: -1, [Symbol.dispose]: fixture.observationDisposed })
    })
    await expect(fixture.controller.traceList({ sessionId: fixture.sessionId, researchRunId: createRetrievalRunId() }, abort.signal))
      .rejects.toThrow('viewer stopped during read')
    expect(fixture.observationDisposed).toHaveBeenCalledOnce()
    expect(fixture.legacySnapshotRead).not.toHaveBeenCalled()
    expect(runAcademicResearchDraft).not.toHaveBeenCalled()
  })

  it('enhances only one selected paper after a completed first-tier run and retains the draft', async () => {
    const fixture = await harness({ hybridPlan: true })
    const pipeline = draftFixture(1)
    const work = retrievalWork(pipeline.records[0]!, '1706.03762')
    fixture.searchProviders.mockResolvedValue({ works: [work], batch: createBatchResult([work], []),
      providers: ['arxiv'], discoveredRecords: 1, limitations: [], truncated: false })
    fixture.webSearch.mockResolvedValue({ sources: [], content: '', truncated: false })
    fixture.fetch.mockImplementation(async ({ url }, signal) => pipeline.adapters.fetcher(url, signal))
    runAcademicResearchDraft.mockImplementation(async request => ({
      ...await runResearchDraft(request.input, { ...request.adapters,
        generator: pipeline.adapters.generator, synthesize: pipeline.adapters.synthesize }, request.signal),
      sessionId: request.session.id,
    }))
    const preview = await fixture.controller.plan(fixture.sessionId)
    const first = await fixture.controller.run({ sessionId: fixture.sessionId,
      researchBriefId: preview.researchBriefId, synthetic: true }, fixture.signal)
    const selected = first.papers.find(paper => paper.status === 'extracted' || paper.status === 'partially_extracted')
    expect(selected).toBeDefined()
    const request = { sessionId: fixture.sessionId, retrievalRunId: first.retrievalRun.retrievalRunId,
      workVersionId: selected!.workVersionId }
    runAcademicEvidenceEnhancement.mockImplementation(async ({ initial }) => ({
      evidence: { ...initial, evidenceRecords: [...initial.evidenceRecords, initial.evidenceRecords[0]!] },
      failures: [], incompleteFragments: [],
    }))
    const result = await fixture.controller.enhanceEvidence(request, fixture.signal)
    expect(result).toMatchObject({ status: 'completed', addedEvidenceRecords: 1, incompleteFragments: 0 })
    expect(runAcademicEvidenceEnhancement).toHaveBeenCalledOnce()
    expect(first.report).not.toBeNull()
    expect(fixture.sessionEvents.map(([name]) => name)).toEqual(expect.arrayContaining([
      'academic/evidence-enhancement-selection', 'academic/evidence-enhancement-settlement',
    ]))
    await expect(fixture.controller.enhanceEvidence(request, fixture.signal)).rejects.toThrow('已经选择一篇')
    expect(runAcademicEvidenceEnhancement).toHaveBeenCalledOnce()
  })
  it('keeps the completed first-tier report when selected enhancement fails', async () => {
    const fixture = await harness({ hybridPlan: true })
    const pipeline = draftFixture(1)
    const work = retrievalWork(pipeline.records[0]!, '1706.03762')
    fixture.searchProviders.mockResolvedValue({ works: [work], batch: createBatchResult([work], []),
      providers: ['arxiv'], discoveredRecords: 1, limitations: [], truncated: false })
    fixture.webSearch.mockResolvedValue({ sources: [], content: '', truncated: false })
    fixture.fetch.mockImplementation(async ({ url }, signal) => pipeline.adapters.fetcher(url, signal))
    runAcademicResearchDraft.mockImplementation(async request => ({
      ...await runResearchDraft(request.input, { ...request.adapters,
        generator: pipeline.adapters.generator, synthesize: pipeline.adapters.synthesize }, request.signal),
      sessionId: request.session.id,
    }))
    const preview = await fixture.controller.plan(fixture.sessionId)
    const first = await fixture.controller.run({ sessionId: fixture.sessionId,
      researchBriefId: preview.researchBriefId, synthetic: true }, fixture.signal)
    const selected = first.papers.find(paper => paper.status === 'extracted' || paper.status === 'partially_extracted')
    expect(selected).toBeDefined()
    runAcademicEvidenceEnhancement.mockRejectedValueOnce(new Error('model unavailable'))
    await expect(fixture.controller.enhanceEvidence({ sessionId: fixture.sessionId,
      retrievalRunId: first.retrievalRun.retrievalRunId, workVersionId: selected!.workVersionId }, fixture.signal))
      .rejects.toThrow('model unavailable')
    expect(first.report).not.toBeNull()
    expect(fixture.sessionEvents.find(([name]) => name === 'academic/evidence-enhancement-settlement')?.[1])
      .toMatchObject({ status: 'failed', addedEvidenceRecords: 0 })
  })
  it('reports unavailable sessions and unreadable history during preview without running research', async () => {
    const missing = await harness({ resolveError: true })
    await expect(missing.controller.plan(missing.sessionId)).rejects.toMatchObject({ code: 'session/not-found' })
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

  it.each(['retrieval faithfulness', 'planning 规划'])(
    'recovers approved candidate cues without rewriting historical aliases: %s', (alias) => {
      const question = 'Which method works?'
      const candidateScreening = {
        questions: [{ question, concepts: [[alias]] }],
        methods: [['retrieval evaluation']], evidence: [['benchmark comparison']],
        contributions: [],
      }
      const base = briefPayload()
      const payload = { ...base, schemaVersion: 5, candidateScreening,
        evidenceRequirements: { ...base.evidenceRequirements, targetIncludedWorks: 2 },
        searchPlan: [{ query: 'retrieval faithfulness', purpose: '比较方法', questions: [question], retrieval: {
          channels: ['academic'], academicProviders: ['openalex'], verificationProviders: [],
          maximumWebDiscoveryResults: 0, maximumReferenceVerifications: 0,
        } }] }
      expect(researchPlanFromApprovedPlan('s', nativePlanEvents(briefPlan(payload))).candidateScreening)
        .toEqual(candidateScreening)
    },
  )

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

  it('does not recover an approval from a dismissed plan review', () => {
    expect(() => researchPlanFromApprovedPlan('dismissed', nativePlanEvents(briefPlan(), { approved: false })))
      .toThrow('请先在当前会话完成研究计划审核。')
  })

  it('recovers a PTC approval using its unchanged sub-call identity and review time', () => {
    const event = ptcPlanEvent(briefPlan())
    const saved = structuredClone(event)
    const result = researchPlanFromApprovedPlan('ptc-session', [event])
    expect(result.brief.researchBriefId).toBe('ptc-session:approved-plan:parent:ptc:1')
    expect(result.brief.approval).toMatchObject({ status: 'approved', reviewedAt: '2026-09-16T00:00:02.000Z' })
    expect(result.brief.questions).toEqual(brief().questions)
    expect(event).toEqual(saved)
  })

  it.each([
    { meta: { approved: false } }, { meta: { approved: 'true' } }, { meta: null },
    { meta: true }, { meta: [] }, { meta: {} },
  ])('rejects a PTC review without explicit approval: %j', ({ meta }) => {
    expect(() => researchPlanFromApprovedPlan('ptc', [ptcPlanEvent(briefPlan(), { meta })]))
      .toThrow('请先在当前会话完成研究计划审核。')
  })

  it('rejects missing approval metadata for both native and PTC results', () => {
    const event = ptcPlanEvent(briefPlan())
    delete event.data.meta
    expect(() => researchPlanFromApprovedPlan('ptc', [event])).toThrow('请先在当前会话完成研究计划审核。')
    const events: SessionEvent[] = nativePlanEvents(briefPlan())
    for (const item of events) if (item.type === 'tool/result') delete item.data.meta
    expect(() => researchPlanFromApprovedPlan('native', events)).toThrow('请先在当前会话完成研究计划审核。')
  })

  it.each<Partial<PtcDispatchEventData>>([
    { isError: true }, { name: 'another_tool' }, { arguments: null },
    { arguments: { plan: 42 } }, { arguments: {} },
  ])('rejects unrelated, failed, or malformed PTC settlements: %j', (data) => {
    expect(() => researchPlanFromApprovedPlan('ptc', [ptcPlanEvent(briefPlan(), data)]))
      .toThrow('请先在当前会话完成研究计划审核。')
  })

  it('validates the structured Brief recovered from a PTC approval', () => {
    expect(() => researchPlanFromApprovedPlan('ptc', [ptcPlanEvent('# Plan without a Brief')]))
      .toThrow('must contain exactly one academic-research-brief-json fenced block')
  })

  it('does not infer approval from a retired code-dispatch record', () => {
    const retired = { ...ptcPlanEvent(briefPlan()), type: 'tool/code-dispatch' }
    expect(() => researchPlanFromApprovedPlan('retired', [retired as never]))
      .toThrow('请先在当前会话完成研究计划审核。')
  })

  it('keeps the latest explicitly approved identity in mixed native and PTC history', () => {
    const ptc = ptcPlanEvent(briefPlan({ ...briefPayload(), topic: 'PTC topic' }))
    const native: SessionEvent[] = nativePlanEvents(briefPlan())
    const dismissed = ptcPlanEvent(briefPlan(), { subCallId: ToolCallId('parent:ptc:2'), meta: { approved: false } })
    const failed = ptcPlanEvent(briefPlan(), { subCallId: ToolCallId('parent:ptc:3'), isError: true })
    const ordered = (events: SessionEvent[]) => events.map((event, index) => ({ ...event, seq: SessionSeq(index), time: index }))
    const latest = researchPlanFromApprovedPlan('mixed', ordered([...native, ptc, dismissed, failed]))
    expect(latest.brief).toMatchObject({ topic: 'PTC topic', researchBriefId: 'mixed:approved-plan:parent:ptc:1' })
    expect(researchPlanFromApprovedPlan('mixed', ordered([ptc, ...native])).brief.researchBriefId)
      .toBe('mixed:approved-plan:approved-brief-call')
  })

  it('gives a fresh review its own Brief identity even when the plan text is identical', () => {
    const markdown = briefPlan()
    const old: SessionEvent[] = nativePlanEvents(markdown, { callId: 'historical-call' })
    const fresh: SessionEvent[] = nativePlanEvents(markdown, { callId: 'fresh-review-call' })
    const events = [...old, ...fresh].map((event, seq) => ({ ...event, seq: SessionSeq(seq), time: seq }))
    const before = structuredClone(events)
    expect(researchPlanFromApprovedPlan('session', old).brief.researchBriefId)
      .toBe('session:approved-plan:historical-call')
    expect(researchPlanFromApprovedPlan('session', events).brief.researchBriefId)
      .toBe('session:approved-plan:fresh-review-call')
    expect(events).toEqual(before)
  })

  it('keeps identical call identities in different Sessions separate', () => {
    const events: SessionEvent[] = nativePlanEvents(briefPlan(), { callId: 'historical-call' })
    expect(researchPlanFromApprovedPlan('first', events).brief.researchBriefId)
      .not.toBe(researchPlanFromApprovedPlan('second', events).brief.researchBriefId)
  })

  it.each([{ sameBrief: true, reason: 'candidate_state_missing' }, { sameBrief: false, reason: 'brief_identity_mismatch' }])(
    'refuses historical continuation without a matching executable checkpoint: %j', async ({ sameBrief, reason }) => {
      const fixture = await harness()
      const preview = await fixture.controller.plan(fixture.sessionId)
      const retrievalRunId = createRetrievalRunId()
      fixture.sessionEvents.push(['academic/search-plan', { schemaVersion: 1,
        researchBriefId: sameBrief ? preview.researchBriefId : createResearchBriefId(), researchBriefVersion: 1,
        maximumSearchRounds: 1, queries: [{ searchQueryId: createSearchQueryId(), kind: 'academic', expression: 'retrieval',
          purpose: 'historical search', questions: ['Which method works?'], roundIndex: 1, providers: ['arxiv'],
          maximumResults: null, siteHost: null }] }],
      ['academic/candidate-batch-decision', { retrievalRunId, batchIndex: null, action: 'stop',
        workVersionIds: [], searchQuestions: [], reason: 'historical boundary' }])
      const before = structuredClone(fixture.sessionEvents)
      await expect(fixture.controller.run({ sessionId: fixture.sessionId, researchBriefId: preview.researchBriefId,
        resumeRetrievalRunId: retrievalRunId, synthetic: false }, fixture.signal)).rejects.toThrow(reason)
      expect(fixture.sessionEvents).toEqual(before)
      expect(fixture.search).not.toHaveBeenCalled()
      expect(runAcademicResearchDraft).not.toHaveBeenCalled()
    },
  )

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
    const work = retrievalWork(pipeline.records[0]!, '1706.03762')
    fixture.searchProviders.mockResolvedValue({ works: [], batch: createBatchResult([], []),
      providers: ['arxiv', 'openalex'], discoveredRecords: 0, limitations: [], truncated: false })
    fixture.webSearch.mockResolvedValue({ sources: [{ url: 'https://arxiv.org/abs/1706.03762', title: 'Untrusted title' },
      { url: 'https://example.org/blog', snippet: 'Not evidence' }], content: 'Generated answer is not evidence', truncated: false })
    fixture.verifyReference.mockImplementation(async reference => ({ status: 'verified', value: {
      reference, verificationProvider: 'arxiv', work,
      fullText: { sourceProvider: 'arxiv', urls: ['https://arxiv.org/html/1706.03762'] }, fullTextFailure: null,
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
    expect(fixture.resolveFullText).not.toHaveBeenCalled()
    expect(fixture.search).not.toHaveBeenCalled()
    expect(fixture.searchProviders).toHaveBeenCalledWith({ query: 'retrieval', maxResults: 100 },
      ['openalex', 'arxiv'], expect.any(AbortSignal), expect.any(Function))
    expect(fixture.webSearch).toHaveBeenCalledWith({ query: 'retrieval', maxResults: 8 }, expect.any(AbortSignal))
    expect(fixture.verifyReference).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'arxiv',
      normalizedValue: '1706.03762' }), ['arxiv'], expect.any(AbortSignal))
    expect(result.retrievalRun.coverageSummary).toMatchObject({ discoveredRecords: 1, deduplicatedWorks: 1,
      availableFulltextWorks: 1, includedWorks: 1 })
    expect(result.report).not.toBeNull()
    expect(fixture.fetch).toHaveBeenCalledWith({ url: 'https://arxiv.org/html/1706.03762' },
      expect.any(AbortSignal), { providerId: 'academic-raw' })
    expect(result.report?.retrievalDisclosureIncluded).toBe(true)
    expect(result.report?.markdown).toContain('Web 发现上限: 8')
    expect(result.report?.markdown).not.toContain('Untrusted title')
    expect(result.report?.markdown).not.toContain('Generated answer is not evidence')
    expect(result.hybridRetrieval).toMatchObject({ counts: { academicDiscoveredRecords: 0,
      webDiscoveredUrls: 2, identifiedReferences: 1, attemptedVerifications: 1, verifiedReferences: 1,
      discardedWebCandidates: 1, mergedDuplicates: 0, deduplicatedWorks: 1 },
    stages: { referenceIdentification: 'partial_success', referenceVerification: 'success', deduplication: 'success' } })
    expect(result.hybridRetrieval?.references[0]).toMatchObject({ query: 'retrieval', kind: 'arxiv',
      verificationProvider: 'arxiv', status: 'verified' })
  })

  it('replenishes an evidence gap through the real Controller adapters and records settlements', async () => {
    const questions = ['Which method works?']
    const fixture = await harness({ hybridPlan: true, questions, saturationRounds: 3 })
    const pipeline = draftFixture(2)
    const works = pipeline.records.map((record, index) =>
      retrievalWork(record, ['1706.03762', '1810.04805'][index]!))
    fixture.searchProviders.mockImplementation(async ({ query }: { query: string }) => {
      const selected = query === 'retrieval' ? [works[0]!] : works.slice(1)
      const batch = createBatchResult(selected, [])
      return { works: batch.items, batch, providers: ['arxiv'], discoveredRecords: selected.length,
        limitations: [], truncated: false }
    })
    fixture.webSearch.mockResolvedValue({ sources: [], content: '', truncated: false })
    fixture.fetch.mockImplementation(async ({ url }, signal) => pipeline.adapters.fetcher(url, signal))
    vi.mocked(pipeline.adapters.generator).mockImplementationOnce(async () => ({
      scope: { status: 'excluded', reason: 'The first candidate does not satisfy the evidence scope.' }, evidence: [],
    }))
    runAcademicResearchDraft.mockImplementation(async request => ({
      ...await runResearchDraft(request.input, { ...request.adapters,
        generator: pipeline.adapters.generator, synthesize: pipeline.adapters.synthesize }, request.signal),
      sessionId: request.session.id,
    }))
    const preview = await fixture.controller.plan(fixture.sessionId)
    const result = await fixture.controller.run({ sessionId: fixture.sessionId,
      researchBriefId: preview.researchBriefId, synthetic: true }, fixture.signal)
    expect(fixture.searchProviders.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(fixture.searchProviders.mock.calls.some(([request]) =>
      (request as { query: string }).query !== 'retrieval')).toBe(true)
    expect(result.retrievalRun.coverageSummary.includedWorks).toBeGreaterThanOrEqual(1)
    expect(result.report).not.toBeNull()
    expect(fixture.sessionEvents.map(([name]) => name)).toEqual(expect.arrayContaining([
      'academic/search-plan', 'academic/candidate-batch-decision',
      'academic/recovery-checkpoint', 'academic/candidate-batch-settlement', 'academic/run-settlement',
    ]))
    expect(fixture.sessionEvents.some(([name, event]) => name === 'academic/candidate-batch-decision'
      && (event as { action?: string }).action === 'search_evidence_gap')).toBe(true)
  })

  it('resumes an interrupted pending batch through the Controller without repeating retrieval or screening', async () => {
    const fixture = await harness({ hybridPlan: true })
    const pipeline = draftFixture(2)
    const works = pipeline.records.map((record, index) =>
      retrievalWork(record, ['1706.03762', '1810.04805'][index]!))
    fixture.searchProviders.mockResolvedValue({ works, batch: createBatchResult(works, []),
      providers: ['arxiv'], discoveredRecords: works.length, limitations: [], truncated: false })
    fixture.webSearch.mockResolvedValue({ sources: [], content: '', truncated: false })
    fixture.fetch.mockImplementation(async ({ url }, signal) => pipeline.adapters.fetcher(url, signal))
    let interruptAtNextCheckpoint = true
    runAcademicResearchDraft.mockImplementation(async request => ({
      ...await runResearchDraft(request.input, { ...request.adapters,
        generator: pipeline.adapters.generator,
        synthesize: pipeline.adapters.synthesize,
        onRecoveryCheckpoint: (checkpoint) => {
          request.adapters.onRecoveryCheckpoint?.(checkpoint)
          if (interruptAtNextCheckpoint) {
            interruptAtNextCheckpoint = false
            throw new Error('simulated process exit')
          }
        },
      }, request.signal),
      sessionId: request.session.id,
    }))
    const preview = await fixture.controller.plan(fixture.sessionId)
    const request = { sessionId: fixture.sessionId, researchBriefId: preview.researchBriefId, synthetic: true }
    await expect(fixture.controller.run(request, fixture.signal)).rejects.toThrow('simulated process exit')
    const checkpoint = fixture.sessionEvents.find(([name]) => name === 'academic/recovery-checkpoint')?.[1] as
      | { retrievalRunId: RetrievalRun['retrievalRunId'] }
      | undefined
    expect(checkpoint).toMatchObject({ policy: { fulltext: { maximumWorks: 24, maximumUncertainWorks: 15 } } })
    const searchCallsBeforeResume = fixture.searchProviders.mock.calls.length
    const result = await fixture.controller.run({ ...request,
      resumeRetrievalRunId: checkpoint!.retrievalRunId }, fixture.signal)
    expect(fixture.searchProviders).toHaveBeenCalledTimes(searchCallsBeforeResume)
    expect(fixture.webSearch).toHaveBeenCalledOnce()
    expect(result.retrievalRun.retrievalRunId).toBe(checkpoint!.retrievalRunId)
    expect(result.retrievalRun.coverageSummary.includedWorks).toBe(2)
    expect(result.report).not.toBeNull()
    expect(fixture.sessionEvents.map(([name]) => name)).toContain('academic/run-settlement')
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
      researchBriefId: preview.researchBriefId, synthetic: true, maxResults: 1 }, fixture.signal)
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
  it.each(['fulltext_unavailable', 'parse_failed'] as const)('retains %s beside verified identity and processes another paper', async (category) => {
    const fixture = await harness({ hybridPlan: true })
    const pipeline = draftFixture(2)
    const ids = ['1706.03762', '1810.04805']
    const works = pipeline.records.map((record, index) => retrievalWork(record, ids[index]!))
    fixture.searchProviders.mockResolvedValue({ works: [], batch: createBatchResult([], []), providers: ['arxiv'],
      discoveredRecords: 0, truncated: false, limitations: [] })
    fixture.webSearch.mockResolvedValue({ sources: ids.map(id => ({ url: `https://arxiv.org/abs/${id}` })), truncated: false })
    fixture.resolveFullText.mockImplementation(() => { throw new Error('Do not repeat verified full-text resolution') })
    fixture.verifyReference.mockImplementation(async (reference) => {
      const first = reference.kind === 'arxiv' && reference.normalizedValue === ids[0]
      return { status: 'verified', value: { reference, verificationProvider: 'arxiv', work: works[first ? 0 : 1]!,
        fullText: first ? null : { sourceProvider: 'arxiv', urls: ['https://arxiv.org/html/1810.04805'] },
        fullTextFailure: first ? { reference, verificationProvider: 'arxiv', category,
          message: 'Internal source diagnostic', retryable: false, retryAfter: null } : null } }
    })
    fixture.fetch.mockImplementation(async ({ url }, signal) => pipeline.adapters.fetcher(url, signal))
    runAcademicResearchDraft.mockImplementation(async request => ({
      ...await runResearchDraft(request.input, { ...request.adapters,
        generator: pipeline.adapters.generator, synthesize: pipeline.adapters.synthesize }, request.signal), sessionId: request.session.id,
    }))
    const preview = await fixture.controller.plan(fixture.sessionId)
    const result = await fixture.controller.run({ sessionId: fixture.sessionId,
      researchBriefId: preview.researchBriefId, synthetic: true }, fixture.signal)
    expect(fixture.resolveFullText).not.toHaveBeenCalled()
    expect(fixture.fetch).toHaveBeenCalledTimes(1)
    expect(result.stages).toMatchObject({ search: 'success', fulltext: 'partial_success' })
    expect(result.hybridRetrieval?.counts).toMatchObject({ verifiedReferences: 2, failedVerifications: 0 })
    expect(result.hybridRetrieval?.references[0]?.status).toBe('verified')
    expect(result.hybridRetrieval?.references[0]?.message).toContain(category)
    expect(result.retrievalRun.coverageSummary).toMatchObject({ deduplicatedWorks: 2, includedWorks: 1, failedOperations: 1 })
    expect(result.retrievalRun.failures[0]).toMatchObject({ operation: 'resolve_fulltext', category })
    expect(result.report?.markdown).toContain('检索渠道与覆盖说明')
    expect(JSON.stringify(result)).not.toContain('Internal source diagnostic')
  })
  it('passes approved per-question aliases to first-tier extraction', async () => {
    const question = 'Which method works?'
    const fixture = await harness({ hybridPlan: true, candidateScreening: {
      questions: [{ question, concepts: [['retrieval', 'retrieval method'], ['faithfulness']] }],
      methods: [['retrieval evaluation']], evidence: [['benchmark comparison']],
      contributions: [{ classification: 'empirical_evaluation', concepts: [['comparison']] }],
    } })
    runAcademicResearchDraft.mockResolvedValue({ synthesis: { status: 'not_run', reasons: [] }, status: 'completed',
      sessionId: fixture.sessionId, retrievalRun: retrievalRun(), papers: [], failures: [],
      analysis: null, report: null } as never)
    await fixture.controller.run({ sessionId: fixture.sessionId,
      researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never, synthetic: false }, fixture.signal)
    expect(runAcademicResearchDraft.mock.calls[0]?.[0].modelPolicies.evidence)
      .toMatchObject({ depth: 'minimal', fragmentMaximumCalls: 8,
        questionTerms: [['retrieval', 'retrieval method', 'faithfulness']] })
  })

  it('runs the formal workflow with the Session model and registered source adapters', async () => {
    const fixture = await harness()
    fixture.search.mockResolvedValue({ works: [], batch: createBatchResult([], []), providers: [],
      discoveredRecords: 0, truncated: false, limitations: [] })
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
      modelPolicies: {
        evidence: { maxAttempts: 2, retryOutputLimit: true,
          inputBatchTokenLimit: 12_000, inputBatchOverlapCharacters: 512, attemptTimeoutMs: 150_000,
          transientRetry: { failureCodes: ['TRANSPORT', 'TIMEOUT'], initialDelayMs: 10_000 } },
        synthesis: { maxAttempts: 3, retryOutputLimit: true,
          transientRetry: { failureCodes: ['TRANSPORT', 'TIMEOUT'], initialDelayMs: 1_000 } },
      },
      input: { paperConcurrency: 3, brief: { topic: 'Retrieval', version: 1, approval: { status: 'approved', reviewedBy: 'session-user',
        approvedBriefVersion: 1, reviewedAt: '2026-09-16T00:00:01.000Z' } },
      searches: [{ query: 'retrieval', channels: ['academic'], maxResults: 2 }], synthetic: false } })
    await call.adapters.search({ query: 'retrieval' }, fixture.signal)
    await expect(call.adapters.search({ query: 'unapproved' }, fixture.signal)).rejects.toThrow('not in the approved plan')
    await call.adapters.fetcher('https://arxiv.org/pdf/1', fixture.signal)
    expect(Date.parse(call.adapters.now())).not.toBeNaN()
    expect(fixture.search).toHaveBeenCalledExactlyOnceWith({ query: 'retrieval' }, fixture.signal, undefined)
    expect(fixture.fetch).toHaveBeenCalledWith(
      { url: 'https://arxiv.org/pdf/1' }, fixture.signal, { providerId: 'academic-raw' },
    )

    const academicWorkId = createAcademicWorkId(), workVersionId = createWorkVersionId()
    const selected = await call.adapters.selectPapers({ works: [{ schemaVersion: 1, academicWorkId, title: 'Paper', authors: [],
      externalIdentifiers: [], workVersionIds: [workVersionId], canonicalVersionId: workVersionId,
      firstPublicDate: { status: 'available', value: { iso: '2026', precision: 'year' } },
      publicationStatus: { status: 'available', value: 'preprint' }, venue: { status: 'unknown', reason: 'none' } }],
    versions: [{ schemaVersion: 1, workVersionId, academicWorkId, versionType: 'preprint',
      versionLabel: { status: 'available', value: 'v1' }, releaseDate: { status: 'available', value: { iso: '2026', precision: 'year' } },
      externalIdentifiers: [], sourceRecords: [{ provider: 'arxiv', recordId: '2406.12345v1' }],
      contentHash: { status: 'not_extracted' }, supersedesWorkVersionId: null, status: 'active' }],
    index: { byExactKey: new Map(), byFuzzyKey: new Map(), records: new Map() },
    verifiedDiscoveries: [], audit: { entries: [] } }, brief())
    expect(selected.papers[0]).toMatchObject({ sourceProvider: 'arxiv', urls: [
      'https://arxiv.org/html/2406.12345v1', 'https://arxiv.org/pdf/2406.12345v1',
    ] })
    expect(await call.adapters.selectPapers({ works: [{ schemaVersion: 1, academicWorkId, title: 'Paper', authors: [],
      externalIdentifiers: [], workVersionIds: [workVersionId], canonicalVersionId: workVersionId,
      firstPublicDate: { status: 'available', value: { iso: '2026', precision: 'year' } },
      publicationStatus: { status: 'available', value: 'preprint' }, venue: { status: 'unknown', reason: 'none' } }],
    versions: [{ schemaVersion: 1, workVersionId, academicWorkId,
      versionType: 'preprint', versionLabel: { status: 'available', value: 'v1' },
      releaseDate: { status: 'available', value: { iso: '2026', precision: 'year' } }, externalIdentifiers: [],
      sourceRecords: [{ provider: 'unregistered', recordId: 'missing' }], contentHash: { status: 'not_extracted' },
      supersedesWorkVersionId: null, status: 'active' }], index: { byExactKey: new Map(), byFuzzyKey: new Map(), records: new Map() },
    verifiedDiscoveries: [], audit: { entries: [] } }, brief())).toEqual({ papers: [], truncated: false })
  })

  it('keeps a background run alive after a subscriber disconnects and reopens its terminal result', async () => {
    const fixture = await harness()
    const observed = retrievalRun()
    let settle: ((value: Awaited<ReturnType<RunAcademicResearchDraft>>) => void) | undefined
    runAcademicResearchDraft.mockImplementation(request => new Promise((resolve) => {
      request.adapters.onProgress?.(progressSnapshot(observed.retrievalRunId, 0))
      request.adapters.onProgress?.(progressSnapshot(observed.retrievalRunId, 1))
      settle = resolve
    }))
    const caller = new AbortController()
    const started = await fixture.controller.startBackgroundRun({ sessionId: fixture.sessionId,
      researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false }, caller.signal)
    expect(started).toMatchObject({ state: 'running', sessionId: fixture.sessionId, result: null })
    expect(await fixture.controller.listBackgroundRuns(fixture.sessionId)).toMatchObject([
      { backgroundRunId: started.backgroundRunId, state: 'running' },
    ])
    const viewer = new AbortController()
    const watch = fixture.controller.watchBackgroundRun(started, viewer.signal)[Symbol.asyncIterator]()
    await expect(watch.next()).resolves.toMatchObject({ value: { state: 'running' } })
    viewer.abort()
    caller.abort()
    await expect(watch.next()).resolves.toEqual({ done: true, value: undefined })
    await vi.waitFor(() => { expect(settle).toBeDefined() })
    expect(runAcademicResearchDraft.mock.calls[0]?.[0].signal?.aborted).toBe(false)
    settle?.({ synthesis: { status: 'not_run', reasons: [] }, status: 'completed', sessionId: fixture.sessionId,
      retrievalRun: observed, papers: [], failures: [], analysis: null, report: null } as never)
    await vi.waitFor(async () => { expect((await fixture.controller.getBackgroundRun(started)).state).toBe('completed') })
    expect(await fixture.controller.getBackgroundRun(started)).toMatchObject({
      state: 'completed', result: { status: 'completed', retrievalRun: { retrievalRunId: observed.retrievalRunId } },
    })
    expect(await fixture.controller.listBackgroundRuns(fixture.sessionId)).toMatchObject([
      { backgroundRunId: started.backgroundRunId, state: 'completed' },
    ])
    expect(fixture.sessionEvents.map(([type]) => type)).toContain('academic/background-run-state')
    const progressEvents = fixture.sessionEvents.filter(([type]) => type === 'academic/background-run-progress')
    expect(progressEvents).toHaveLength(1)
    expect(progressEvents[0]?.[1]).toMatchObject({
      sessionId: fixture.sessionId, backgroundRunId: started.backgroundRunId,
      retrievalRunId: observed.retrievalRunId, progress: { sequence: 1 },
    })
    expect(progressEvents[0]?.[1]).not.toHaveProperty('q6')
    expect(progressEvents[0]?.[1]).not.toHaveProperty('result')
  })

  it('persists new Q6 observations as metadata updates until an actual candidate fact changes', async () => {
    const fixture = await harness()
    const approved = await fixture.controller.plan(fixture.sessionId)
    const observed = { ...retrievalRun(), researchBriefId: approved.researchBriefId }
    const seed = queryWorkflowObservation(observed.retrievalRunId)
    const record = draftFixture(1).records[0]
    if (record === undefined) throw new Error('the controller fixture needs one candidate')
    const first: AcademicQueryWorkflowObservation = {
      ...seed, plan: { ...seed.plan, researchBriefId: approved.researchBriefId },
      works: [record.academicWork], versions: [record.workVersion],
      assessments: [{ academicWorkId: record.academicWork.academicWorkId,
        abstract: { status: 'available', value: 'Uses reranking.' },
        keywords: { status: 'available', value: ['reranking'] }, fulltextAvailability: { status: 'resolvable' },
        matchedQuestions: approved.questions, contributionSignals: ['core_method'], topicRelevance: 1,
        evidencePotential: 1, methodMatch: 1, sourceQuality: 1, recency: 1,
        inclusionRuleMatches: [], exclusionRuleMatches: [], diversityTags: [], reasons: ['Synthetic candidate fact.'] }],
      ranking: { ...seed.ranking, researchBriefId: approved.researchBriefId,
        evaluations: [{ schemaVersion: 1, academicWorkId: record.academicWork.academicWorkId,
          workVersionId: record.workVersion.workVersionId, discoveredBy: [], classification: 'core_method',
          hardFilter: { status: 'eligible', reasons: [] },
          score: { topicRelevance: 30, questionMatch: 20, evidencePotential: 15, methodMatch: 10,
            workTypeFit: 8, sourceQuality: 7, recency: 5, fulltextAvailability: 5, total: 100 },
          priority: 'p0', matchedQuestions: approved.questions, fulltextAvailability: { status: 'resolvable' },
          diversityTags: [], decisionReasons: ['Synthetic ranked candidate.'] }],
        queues: { p0: [record.workVersion.workVersionId], p1: [], p2: [], excluded: [] } },
    }
    const second: AcademicQueryWorkflowObservation = { ...structuredClone(first), sequence: 1,
      observedAt: '2026-10-09T00:00:01.000Z',
      coverage: { schemaVersion: 1, researchBriefId: approved.researchBriefId, researchBriefVersion: 1,
        assessedAt: '2026-10-09T00:00:01.000Z', questions: approved.questions.map(question => ({
          question, status: 'uncovered', supportingWorkIds: [], evidenceIds: [], gaps: ['Evidence is pending.'],
        })), evidenceRequirementsMet: false, allQuestionsCovered: false },
      decisions: [{ retrievalRunId: observed.retrievalRunId, batchIndex: 1, action: 'schedule_batch',
        workVersionIds: [record.workVersion.workVersionId], searchQuestions: [], reason: null }],
      settlements: [{ retrievalRunId: observed.retrievalRunId, batchIndex: 1, admittedEvidence: 0,
        completedAt: '2026-10-09T00:00:01.000Z' }],
    }
    const changed: AcademicQueryWorkflowObservation = { ...structuredClone(second), sequence: 2,
      works: second.works.map(work => ({ ...work, title: 'Changed candidate title' })) }
    const result: Awaited<ReturnType<RunAcademicResearchDraft>> = {
      synthesis: { status: 'not_run', reasons: [] }, status: 'completed', sessionId: fixture.sessionId,
      retrievalRun: observed, queryWorkflow: changed, papers: [], failures: [], analysis: null, report: null,
    }
    const completion = Promise.withResolvers<Awaited<ReturnType<RunAcademicResearchDraft>>>()
    let notify: ((observation: AcademicQueryWorkflowObservation) => void) | undefined
    runAcademicResearchDraft.mockImplementation((request) => {
      notify = request.adapters.onQueryWorkflow
      request.adapters.onProgress?.(progressSnapshot(observed.retrievalRunId, 0))
      notify?.(first)
      return completion.promise
    })
    try {
      const started = await fixture.controller.startBackgroundRun({ sessionId: fixture.sessionId,
        researchBriefId: approved.researchBriefId, synthetic: false }, fixture.signal)
      await vi.waitFor(() => { expect(notify).toBeTypeOf('function') })
      const completeBefore = fixture.sessionEvents.filter(([type]) => type === 'academic/background-run-state').length
      notify?.(second)
      expect(fixture.sessionEvents.filter(([type]) => type === 'academic/background-run-state')).toHaveLength(completeBefore)
      const updates = fixture.sessionEvents.filter(([type]) => type === 'academic/background-run-q6-update')
      expect(updates).toHaveLength(1)
      expect(updates[0]?.[1]).toMatchObject({ sessionId: fixture.sessionId, backgroundRunId: started.backgroundRunId,
        researchBriefId: approved.researchBriefId, retrievalRunId: observed.retrievalRunId,
        q6: { sequence: 1, coverage: { state: 'available', value: second.coverage },
          batches: { state: 'available', value: { decisions: second.decisions, settlements: second.settlements } } } })
      expect(updates[0]?.[1]).not.toHaveProperty('q6.candidates')
      expect(updates[0]?.[1]).not.toHaveProperty('result')
      expect((await fixture.controller.getBackgroundRun(started)).q6).toMatchObject({
        sequence: 1, candidates: { state: 'available', value: { items: [{ work: record.academicWork }] } },
      })
      notify?.(changed)
      const complete = fixture.sessionEvents.filter(([type]) => type === 'academic/background-run-state')
      expect(complete).toHaveLength(completeBefore + 1)
      expect(complete.at(-1)?.[1]).toMatchObject({ q6: { sequence: 2,
        candidates: { state: 'available', value: { items: [{ work: { title: 'Changed candidate title' } }] } } } })
      expect(fixture.sessionEvents.filter(([type]) => type === 'academic/background-run-q6-update')).toHaveLength(1)
      completion.resolve(result)
      await vi.waitFor(async () => {
        expect((await fixture.controller.getBackgroundRun(started)).state).toBe('completed')
      })
      expect(runAcademicResearchDraft).toHaveBeenCalledOnce()
    } finally { completion.resolve(result) }
  })

  it('aborts background work only through an explicit cancellation request', async () => {
    const fixture = await harness()
    const observed = retrievalRun('cancelled')
    runAcademicResearchDraft.mockImplementation(request => new Promise((resolve) => {
      request.signal?.addEventListener('abort', () => { resolve({
        synthesis: { status: 'not_run', reasons: [] }, status: 'cancelled', sessionId: fixture.sessionId,
        retrievalRun: observed, papers: [], failures: [], analysis: null, report: null,
      } as never) }, { once: true })
    }))
    const started = await fixture.controller.startBackgroundRun({ sessionId: fixture.sessionId,
      researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false }, fixture.signal)
    await vi.waitFor(() => { expect(runAcademicResearchDraft).toHaveBeenCalledOnce() })
    await expect(fixture.controller.cancelBackgroundRun({ sessionId: fixture.sessionId,
      backgroundRunId: started.backgroundRunId, reason: 'user_requested' })).resolves.toMatchObject({
      state: 'running', cancelReason: 'user_requested',
    })
    await vi.waitFor(async () => { expect((await fixture.controller.getBackgroundRun(started)).state).toBe('cancelled') })
    expect(await fixture.controller.getBackgroundRun(started)).toMatchObject({
      state: 'cancelled', cancelReason: 'user_requested',
    })
  })

  it('streams ordered progress snapshots and one final result from one workflow invocation', async () => {
    const fixture = await harness()
    const observed = retrievalRun()
    runAcademicResearchDraft.mockImplementation(async (request) => {
      request.adapters.onProgress?.(progressSnapshot(observed.retrievalRunId, 0))
      request.adapters.onQueryWorkflow?.(queryWorkflowObservation(observed.retrievalRunId))
      request.adapters.onProgress?.(progressSnapshot(observed.retrievalRunId, 1, 'success'))
      return { synthesis: { status: 'not_run', reasons: [] }, status: 'completed', sessionId: fixture.sessionId,
        retrievalRun: observed, queryWorkflow: queryWorkflowObservation(observed.retrievalRunId),
        papers: [], failures: [], analysis: null, report: null }
    })

    const stream = fixture.controller.runStream({ sessionId: fixture.sessionId,
      researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false }, fixture.signal)
    expect(stream[Symbol.asyncIterator]()).toBe(stream)
    const frames = []
    for await (const frame of stream) frames.push(frame)

    expect(runAcademicResearchDraft).toHaveBeenCalledOnce()
    expect(frames.map(frame => frame.type)).toEqual(['progress', 'q6', 'progress', 'result'])
    expect(frames[0]).toMatchObject({ type: 'progress', progress: {
      sessionId: fixture.sessionId, retrievalRunId: observed.retrievalRunId, sequence: 0,
    } })
    expect(frames[1]).toMatchObject({ type: 'q6', projection: {
      sessionId: fixture.sessionId, retrievalRunId: observed.retrievalRunId, sequence: 0,
    } })
    expect(frames[2]).toMatchObject({ type: 'progress', progress: { sequence: 1 } })
    expect(frames[3]).toMatchObject({ type: 'result', retrievalRunId: observed.retrievalRunId,
      value: { sessionId: fixture.sessionId, retrievalRun: observed,
        q6: { retrievalRunId: observed.retrievalRunId } } })
  })

  it('cancels the sole workflow invocation when its stream caller disconnects', async () => {
    const fixture = await harness()
    const abort = new AbortController()
    const observed = retrievalRun('cancelled')
    let operationSignal: AbortSignal | undefined
    runAcademicResearchDraft.mockImplementation(request => new Promise((resolve) => {
      const signal = request.signal
      if (signal === undefined) throw new Error('missing workflow cancellation signal')
      operationSignal = signal
      request.adapters.onProgress?.(progressSnapshot(observed.retrievalRunId, 0))
      signal.addEventListener('abort', () => { resolve({
        synthesis: { status: 'not_run', reasons: ['Cancelled'] }, status: 'cancelled', sessionId: fixture.sessionId,
        retrievalRun: observed, papers: [], failures: [], analysis: null, report: null,
      }) }, { once: true })
    }))
    const iterator = fixture.controller.runStream({ sessionId: fixture.sessionId,
      researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false }, abort.signal)[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toMatchObject({ done: false, value: { type: 'progress' } })
    abort.abort(new Error('caller disconnected'))
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    expect(operationSignal?.aborted).toBe(true)
    expect(runAcademicResearchDraft).toHaveBeenCalledOnce()
  })

  it('surfaces workflow admission failures through the stream without a result frame', async () => {
    const fixture = await harness({ busy: true })
    const iterator = fixture.controller.runStream({ sessionId: fixture.sessionId,
      researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never,
      synthetic: false }, fixture.signal)[Symbol.asyncIterator]()

    await expect(iterator.next()).rejects.toMatchObject({ code: 'session/agent-busy' })
    expect(runAcademicResearchDraft).not.toHaveBeenCalled()
  })

  it('uses the Agent fallback selection before the Session has a request header', async () => {
    const fixture = await harness({ header: false })
    runAcademicResearchDraft.mockResolvedValue({ synthesis: { status: 'not_run', reasons: [] }, status: 'cancelled', sessionId: fixture.sessionId,
      retrievalRun: retrievalRun('cancelled'),
      papers: [], failures: [], analysis: null, report: null } as never)
    await fixture.controller.run({ sessionId: fixture.sessionId, researchBriefId: 'academic-session:approved-plan:approved-brief-call' as never, synthetic: true },
      new AbortController().signal)
    expect(runAcademicResearchDraft.mock.calls[0]?.[0].model).toEqual({ provider: 'fixture', model: 'fallback', maxTokens: 4000 })
    expect(runAcademicResearchDraft.mock.calls[0]?.[0].synthesisModel).toEqual({ provider: 'fixture', model: 'fallback', maxTokens: 4000 })
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
      { query: 'Transformer long-range dependencies', channels: ['academic'], maxResults: 5 },
      { query: 'BERT bidirectional pre-training', channels: ['academic'], maxResults: 5 },
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
    expect(runAcademicResearchDraft.mock.calls[0]?.[0].synthesisModel).toEqual({
      provider: 'fixture', model: 'selected', reasoningEffort: 'low', maxTokens: 32_768,
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
      { type: 'tool/ptc-dispatch', seq: 1, time: 1, data: { name: 'other', isError: false, meta: { approved: true } } },
      { type: 'tool/ptc-dispatch', seq: 2, time: 2, data: { name: 'exit_plan_mode', isError: true, meta: { approved: true } } },
      { type: 'tool/ptc-dispatch', seq: 3, time: 3, data: { name: 'exit_plan_mode', isError: false, arguments: null, meta: { approved: true } } },
      { type: 'tool/ptc-dispatch', seq: 4, time: Date.parse('2026-09-16T01:02:03Z'), data: {
        rootCallId: 'root', parentCallId: 'root', subCallId: 'root:code:1', name: 'exit_plan_mode',
        arguments: { plan: briefPlan(payload) }, isError: false, content: [], meta: { approved: true },
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
    ['schema version', { ...briefPayload(), schemaVersion: 6 }, 'schemaVersion must be 1, 2, 3, 4, or 5'],
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

  it('requires and validates the distinct inclusion target in version 4 plans', () => {
    const base = briefPayload()
    const current = { ...base, schemaVersion: 4, searchPlan: [{ query: 'retrieval', purpose: '检索',
      questions: base.questions, retrieval: { channels: ['academic'], academicProviders: ['openalex'],
        verificationProviders: [], maximumWebDiscoveryResults: 0, maximumReferenceVerifications: 0 } }] }
    expect(() => researchBriefFromApprovedPlan('session-1', nativePlanEvents(briefPlan(current))))
      .toThrow('missing: targetIncludedWorks')
    expect(() => researchBriefFromApprovedPlan('session-1', nativePlanEvents(briefPlan({ ...current,
      evidenceRequirements: { ...current.evidenceRequirements, targetIncludedWorks: 0 } }))))
      .toThrow('targetIncludedWorks must be a positive integer')
    expect(() => researchBriefFromApprovedPlan('session-1', nativePlanEvents(briefPlan({ ...current,
      evidenceRequirements: { ...current.evidenceRequirements, targetIncludedWorks: 3,
        minimumIncludedWorks: 4 } }))))
      .toThrow('minimumIncludedWorks must not exceed targetIncludedWorks')
    expect(() => researchBriefFromApprovedPlan('session-1', nativePlanEvents(briefPlan({ ...current,
      evidenceRequirements: { ...current.evidenceRequirements, targetIncludedWorks: 3 },
      stopConditions: { ...current.stopConditions, maximumIncludedWorks: 2 } }))))
      .toThrow('targetIncludedWorks must not exceed stopConditions.maximumIncludedWorks')
    expect(() => researchBriefFromApprovedPlan('session-1', nativePlanEvents(briefPlan({ ...current,
      evidenceRequirements: { ...current.evidenceRequirements, targetIncludedWorks: 3 },
      stopConditions: { ...current.stopConditions, maximumCandidateWorks: 2, maximumIncludedWorks: 4 } }))))
      .toThrow('targetIncludedWorks must not exceed stopConditions.maximumCandidateWorks')
    expect(researchBriefFromApprovedPlan('session-1', nativePlanEvents(briefPlan({ ...current,
      evidenceRequirements: { ...current.evidenceRequirements, targetIncludedWorks: 2 } })))
      .evidenceRequirements.targetIncludedWorks).toBe(2)
  })

  it('migrates version 1 to 3 plans by preserving the former maximum-as-target behavior', () => {
    expect(researchBriefFromApprovedPlan('session-1', nativePlanEvents(briefPlan()))
      .evidenceRequirements.targetIncludedWorks).toBe(briefPayload().stopConditions.maximumIncludedWorks)
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
