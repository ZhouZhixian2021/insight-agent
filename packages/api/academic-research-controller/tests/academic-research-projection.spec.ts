import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionLogOffset, SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import { ACADEMIC_CANDIDATE_RANKING_POLICY_V1, createResearchBriefId, createRetrievalRunId,
  createSearchQueryId, createWorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { reconstructAcademicResearchRecoveryState } from '@deepseek-ai/dsh-academic-workflow'
import type { AcademicBackgroundRunProgress, AcademicBackgroundRunQ6Update } from '../src/background-run.ts'
import type { AcademicBackgroundRunView, AcademicResearchProgressView, AcademicResearchRunValue } from '../src/types.ts'
import {
  academicResearchProjectionDefinition,
  recoveryEventsOf,
  type AcademicResearchProjectionState,
} from '../src/academic-research-projection.ts'

function initial(): AcademicResearchProjectionState {
  return academicResearchProjectionDefinition.init({ id: SessionId('projection') } as never, SessionLogOffset(0))
}

function fold(state: AcademicResearchProjectionState, event: SessionEvent): AcademicResearchProjectionState {
  return academicResearchProjectionDefinition.apply(state, event)
}

function backgroundView(backgroundRunId = 'background-1'): AcademicBackgroundRunView {
  const sessionId = SessionId('projection')
  const researchBriefId = createResearchBriefId()
  const retrievalRunId = createRetrievalRunId()
  return {
    schemaVersion: 1, sessionId, backgroundRunId, researchBriefId, retrievalRunId,
    state: 'running', startedAt: '2026-10-22T00:00:00Z', updatedAt: '2026-10-22T00:00:01Z',
    progress: null, result: null, error: null, cancelReason: null,
    q6: {
      schemaVersion: 1, sessionId, retrievalRunId, researchBriefId, researchBriefVersion: 1,
      sequence: 1, updatedAt: '2026-10-22T00:00:01Z', status: 'running',
      plan: {
        schemaVersion: 1, researchBriefId, researchBriefVersion: 1,
        constraints: { publicationWindow: { start: null, end: null, dateBasis: 'first_public_release' },
          includedWorkTypes: [], inclusionRules: [], exclusionRules: [], requiredTerms: [], excludedTerms: [] },
        inclusionTargets: { minimum: 1, target: 1, maximum: 1 },
        rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
        maximumSearchRounds: 1, queries: [], citationExpansionSeeds: [],
      },
      candidates: { state: 'pending' }, rounds: { state: 'pending' }, batches: { state: 'pending' },
      coverage: { state: 'pending' }, stopDecision: { state: 'pending' }, limitations: ['retained Q6 fact'],
    },
  }
}

function backgroundProgress(view: AcademicBackgroundRunView, sequence: number): AcademicBackgroundRunProgress {
  if (view.retrievalRunId === null) throw new Error('the progress fixture needs a retrieval run')
  const pending = { status: 'pending' as const, startedAt: null, completedAt: null,
    completedItems: 0, totalItems: null, unit: null }
  const updatedAt = `2026-10-22T00:00:0${sequence + 1}Z`
  const progress: AcademicResearchProgressView = {
    schemaVersion: 1, sessionId: view.sessionId, retrievalRunId: view.retrievalRunId,
    sequence, startedAt: view.startedAt, updatedAt, elapsedMs: sequence * 1000,
    primaryStage: 'retrieval', activeStages: ['retrieval'],
    stages: { retrieval: { ...pending, status: 'running', startedAt: view.startedAt, unit: 'queries' },
      screening: pending, fulltext: pending, extraction: pending, analysis: pending, report: pending },
    counts: { completedQueries: sequence, totalQueries: 3, discoveredRecords: sequence,
      deduplicatedWorks: sequence, mergedWorkIdentities: 0, mergedVersionRecords: 0,
      retainedWorkVersions: sequence, suspectedDuplicateRecords: 0, candidateWorks: sequence,
      completedPapers: 0, totalPapers: null, includedPapers: 0, availableFulltextPapers: 0,
      validatedEvidenceRecords: 0, rejectedEvidenceDrafts: 0, completedQuestions: 0, totalQuestions: 1 },
    activities: [], latestEvent: { code: 'stage_updated', occurredAt: updatedAt, stage: 'retrieval',
      academicWorkId: null, workVersionId: null, providerId: null, failureCode: null },
  }
  return { schemaVersion: 1, sessionId: view.sessionId, backgroundRunId: view.backgroundRunId,
    researchBriefId: view.researchBriefId, retrievalRunId: view.retrievalRunId, updatedAt, progress }
}

function completedResult(view: AcademicBackgroundRunView): AcademicResearchRunValue {
  if (view.retrievalRunId === null) throw new Error('the result fixture needs a retrieval run')
  return { sessionId: view.sessionId, status: 'completed', synthesis: { status: 'not_run', reasons: [] }, q6: view.q6,
    stages: { search: 'not_run', fulltext: 'not_run', extraction: 'not_run' },
    retrievalRun: { schemaVersion: 1, retrievalRunId: view.retrievalRunId,
      researchBriefId: view.researchBriefId, researchBriefVersion: 1, stage: 'completed', status: 'success',
      startedAt: view.startedAt, completedAt: '2026-10-22T00:00:04Z', queries: [], providers: [], academicWorkIds: [],
      coverageSummary: { schemaVersion: 1, discoveredRecords: 0, deduplicatedWorks: 0, includedWorks: 0,
        availableFulltextWorks: 0, abstractOnlyWorks: 0, metadataOnlyWorks: 0, failedOperations: 0,
        truncated: false, limitations: [], providerBreakdown: null }, failures: [] },
    papers: [], failures: [], report: null }
}

describe('Academic Research Session projection', () => {
  it('registers with SessionProjections and advances as authoritative events commit', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjections)
    ctx.sessionProjections.register(academicResearchProjectionDefinition)
    const session = ctx.sessions.create(SessionId('projection-live'))
    const retrievalRunId = createRetrievalRunId()
    const plan = { schemaVersion: 1 as const, researchBriefId: createResearchBriefId(), researchBriefVersion: 1,
      maximumSearchRounds: 1, queries: [] }
    session.append('academic/search-plan', plan)
    session.append('academic/candidate-batch-decision', { retrievalRunId, batchIndex: null,
      action: 'stop', workVersionIds: [], searchQuestions: [], reason: null })
    const state = ctx.sessionProjections.stateOf(session, 'academicResearch')
    expect(state?.recoveryRuns[String(retrievalRunId)]?.searchPlan).toEqual(plan)
    expect(state?.recoveryRuns[String(retrievalRunId)]?.events).toHaveLength(1)
    const events = session.snapshotEvents()
    const cold = ctx.sessionProjections.restore({}, events, SessionLogOffset(0), session.header,
      session.inheritedEventCount)
    expect(cold.checkpoint.academicResearch?.val).toEqual(state)
    await ctx.fiber.dispose()
  })

  it('keeps only explicit native and PTC approvals and their original identities', () => {
    const callId = ToolCallId('native-call')
    const plan = 'approved plan content'
    let state = initial()
    state = fold(state, { seq: SessionSeq(0), time: 10, type: 'tool/call', data: {
      turn: 1, step: 1, callId, name: 'exit_plan_mode', arguments: JSON.stringify({ plan }),
    } })
    state = fold(state, { seq: SessionSeq(1), time: 11, type: 'tool/result', surfaceOp: 'append', data: {
      turn: 1, step: 1, meta: { approved: false },
      message: createToolResultMessage({ callId, content: [], isError: false }),
    } })
    expect(state.latestApprovedPlan).toBeNull()

    const ptc = { rootCallId: ToolCallId('root'), parentCallId: ToolCallId('parent'),
      subCallId: ToolCallId('parent:ptc:7'), name: 'exit_plan_mode', arguments: { plan },
      isError: false, content: [], meta: { approved: true } }
    state = fold(state, { seq: SessionSeq(2), time: 12, type: 'tool/ptc-dispatch', data: ptc })
    expect(state.latestApprovedPlan).toEqual({ identity: 'parent:ptc:7', markdown: plan,
      reviewedAt: new Date(12).toISOString() })
    state = fold(state, { seq: SessionSeq(3), time: 13, type: 'tool/ptc-dispatch', data: { ...ptc, meta: undefined } as never })
    expect(state.latestApprovedPlan?.identity).toBe('parent:ptc:7')
  })

  it('captures the search plan before each run and appends only that run’s recovery events', () => {
    const retrievalRunId = createRetrievalRunId()
    const plan = { schemaVersion: 1 as const, researchBriefId: createResearchBriefId(), researchBriefVersion: 1,
      maximumSearchRounds: 1, queries: [{ searchQueryId: createSearchQueryId(), kind: 'academic' as const,
        expression: 'retrieval', purpose: 'topic', questions: ['Q'], roundIndex: 0, providers: ['arxiv'],
        maximumResults: null, siteHost: null }] }
    let state = fold(initial(), { seq: SessionSeq(0), time: 1, type: 'academic/search-plan', data: plan })
    const decision = { retrievalRunId, batchIndex: 1, action: 'schedule_batch' as const,
      workVersionIds: [createWorkVersionId()], searchQuestions: [], reason: null }
    state = fold(state, { seq: SessionSeq(1), time: 2, type: 'academic/candidate-batch-decision', data: decision })
    state = fold(state, { seq: SessionSeq(2), time: 3, type: 'academic/candidate-batch-settlement', data: {
      retrievalRunId, batchIndex: 1, admittedEvidence: 1, completedAt: '2026-10-22T00:00:00Z',
    } })
    state = fold(state, { seq: SessionSeq(3), time: 4, type: 'academic/search-plan', data: {
      ...plan, researchBriefId: createResearchBriefId(),
    } })
    const recovered = recoveryEventsOf(state, String(retrievalRunId))
    expect(recovered.map(event => event.type)).toEqual([
      'academic/search-plan', 'academic/candidate-batch-decision', 'academic/candidate-batch-settlement',
    ])
    expect(recovered[0]?.data).toEqual(plan)
    expect(recoveryEventsOf(state, 'missing')).toEqual([])
    const unrelatedRun = { ...decision, retrievalRunId: createRetrievalRunId() }
    const completeLog: SessionEvent[] = [
      { seq: SessionSeq(0), time: 1, type: 'academic/search-plan', data: plan },
      { seq: SessionSeq(1), time: 2, type: 'academic/candidate-batch-decision', data: unrelatedRun },
      ...recovered.slice(1),
      { seq: SessionSeq(3), time: 4, type: 'academic/search-plan', data: state.latestSearchPlan! },
    ]
    expect(reconstructAcademicResearchRecoveryState(recovered, { retrievalRunId,
      researchBriefId: plan.researchBriefId, researchBriefVersion: 1 }))
      .toEqual(reconstructAcademicResearchRecoveryState(completeLog, { retrievalRunId,
        researchBriefId: plan.researchBriefId, researchBriefVersion: 1 }))
  })

  it('tracks enhancement uniqueness and background runs by first-start order and latest state', () => {
    const firstId = 'background-1'
    const secondId = 'background-2'
    const runView = (backgroundRunId: string, updatedAt: string): AcademicBackgroundRunView => ({
      schemaVersion: 1, sessionId: SessionId('projection'), backgroundRunId,
      researchBriefId: createResearchBriefId(), state: 'running', startedAt: '2026-10-22T00:00:00Z', updatedAt,
      retrievalRunId: null, progress: null, q6: null, result: null, error: null, cancelReason: null,
    })
    const enhancedRunId = createRetrievalRunId()
    let state = fold(initial(), { seq: SessionSeq(0), time: 1, type: 'academic/evidence-enhancement-selection', data: {
      schemaVersion: 1, retrievalRunId: enhancedRunId, workVersionId: createWorkVersionId(), selectedAt: 'now',
    } })
    const selected = state.enhancedRunIds
    state = fold(state, { seq: SessionSeq(1), time: 2, type: 'academic/evidence-enhancement-selection', data: {
      schemaVersion: 1, retrievalRunId: enhancedRunId, workVersionId: createWorkVersionId(), selectedAt: 'duplicate',
    } })
    expect(state.enhancedRunIds).toBe(selected)

    state = fold(state, { seq: SessionSeq(2), time: 3, type: 'academic/background-run-state', data: runView(firstId, '1') })
    state = fold(state, { seq: SessionSeq(3), time: 4, type: 'academic/background-run-state', data: runView(secondId, '2') })
    state = fold(state, { seq: SessionSeq(4), time: 5, type: 'academic/background-run-state', data: runView(firstId, '3') })
    const withForeignRun = fold(state, { seq: SessionSeq(5), time: 6, type: 'academic/background-run-state', data: {
      ...runView(firstId, '4'), sessionId: SessionId('other-session'),
    } })
    expect(state.backgroundRunOrder).toEqual([firstId, secondId])
    expect(state.backgroundRuns[firstId]?.updatedAt).toBe('3')
    expect(state.backgroundRuns[secondId]?.updatedAt).toBe('2')
    expect(withForeignRun).toBe(state)
  })

  it('folds historical full checkpoints and lightweight progress into the same state as full events', () => {
    expect(academicResearchProjectionDefinition.stateVersion).toBe(3)
    const first = backgroundView()
    const second = backgroundView('background-2')
    const firstProgress = backgroundProgress(first, 1)
    const secondProgress = backgroundProgress(first, 2)
    const firstUpdated = { ...first, progress: firstProgress.progress, updatedAt: firstProgress.updatedAt }
    const secondUpdated = { ...first, progress: secondProgress.progress, updatedAt: secondProgress.updatedAt }
    const completed: AcademicBackgroundRunView = { ...secondUpdated, state: 'completed',
      updatedAt: '2026-10-22T00:00:04Z', result: completedResult(secondUpdated) }
    const history: SessionEvent[] = [
      { seq: SessionSeq(0), time: 1, type: 'academic/background-run-state', data: first },
      { seq: SessionSeq(1), time: 2, type: 'academic/background-run-state', data: second },
      { seq: SessionSeq(2), time: 3, type: 'academic/background-run-state', data: firstUpdated },
      { seq: SessionSeq(3), time: 4, type: 'academic/background-run-state', data: secondUpdated },
      { seq: SessionSeq(4), time: 5, type: 'academic/background-run-state', data: completed },
    ]
    const mixed: SessionEvent[] = [
      ...history.slice(0, 2),
      { seq: SessionSeq(2), time: 3, type: 'academic/background-run-progress', data: firstProgress },
      { seq: SessionSeq(3), time: 4, type: 'academic/background-run-progress', data: secondProgress },
      history[4]!,
    ]
    const checkpoints = mixed.slice(0, 2).reduce(fold, initial())
    const progressed = mixed.slice(2, 4).reduce(fold, checkpoints)
    expect(progressed.backgroundRunOrder).toBe(checkpoints.backgroundRunOrder)
    expect(progressed.backgroundRunOrder).toEqual([first.backgroundRunId, second.backgroundRunId])
    expect(progressed.backgroundRuns[first.backgroundRunId]?.q6).toBe(first.q6)
    expect(progressed.backgroundRuns[first.backgroundRunId]?.result).toBe(first.result)
    expect(progressed.backgroundRuns[first.backgroundRunId]?.progress).toBe(secondProgress.progress)
    expect(firstProgress).not.toHaveProperty('q6')
    expect(firstProgress).not.toHaveProperty('result')
    expect(history[0]?.type).toBe('academic/background-run-state')
    expect(checkpoints.backgroundRuns[first.backgroundRunId]).toBe(first)
    const actual = mixed.reduce(fold, initial())
    expect(actual).toEqual(history.reduce(fold, initial()))
    expect(actual.backgroundRuns[first.backgroundRunId]).toBe(completed)
    expect(actual.backgroundRuns[first.backgroundRunId]?.result).toBe(completed.result)
  })

  it('requires an existing checkpoint with the same run, Session, Brief and retrieval identities', () => {
    const view = backgroundView()
    const progress = backgroundProgress(view, 1)
    const event = (data: AcademicBackgroundRunProgress): SessionEvent<'academic/background-run-progress'> => ({
      seq: SessionSeq(1), time: 2, type: 'academic/background-run-progress', data,
    })
    expect(() => fold(initial(), event(progress))).toThrow('requires a complete checkpoint')
    const state = fold(initial(), { seq: SessionSeq(0), time: 1, type: 'academic/background-run-state', data: view })
    const mismatches: readonly AcademicBackgroundRunProgress[] = [
      { ...progress, backgroundRunId: 'unmapped-run' },
      { ...progress, sessionId: SessionId('other-session') },
      { ...progress, researchBriefId: createResearchBriefId() },
      { ...progress, retrievalRunId: createRetrievalRunId() },
      { ...progress, retrievalRunId: null },
    ]
    for (const mismatch of mismatches) expect(() => fold(state, event(mismatch))).toThrow()
    expect(state.backgroundRunOrder).toEqual([view.backgroundRunId])
    expect(state.backgroundRuns[view.backgroundRunId]).toBe(view)
    expect(state.backgroundRuns['unmapped-run']).toBeUndefined()
    const completed = fold(state, { seq: SessionSeq(2), time: 3, type: 'academic/background-run-state', data: {
      ...view, state: 'completed', result: completedResult(view),
    } })
    expect(() => fold(completed, event(progress))).toThrow('requires a running checkpoint')
  })

  it('restores Q6 metadata updates through live Session projections and a cold fold without copying candidates', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SessionStore)
      await ctx.plugin(SessionProjections)
      ctx.sessionProjections.register(academicResearchProjectionDefinition)
      const session = ctx.sessions.create(SessionId('projection-q6-update'))
      const base = backgroundView()
      if (base.q6 === null) throw new Error('the projection fixture needs a complete Q6 checkpoint')
      const view = { ...base, sessionId: session.id, q6: { ...base.q6, sessionId: session.id } }
      const { candidates, ...metadata } = view.q6
      const update: AcademicBackgroundRunQ6Update = {
        ...backgroundProgress(view, 1),
        q6: { ...metadata, sequence: metadata.sequence + 1, updatedAt: '2026-10-22T00:00:02Z',
          coverage: { state: 'available', value: { schemaVersion: 1,
            researchBriefId: view.researchBriefId, researchBriefVersion: metadata.researchBriefVersion,
            assessedAt: '2026-10-22T00:00:02Z', questions: [],
            evidenceRequirementsMet: false, allQuestionsCovered: false } },
          batches: { state: 'available', value: { decisions: [], settlements: [] } } },
      }
      session.append('academic/background-run-state', view)
      const before = ctx.sessionProjections.stateOf(session, 'academicResearch')
      session.append('academic/background-run-q6-update', update)
      const state = ctx.sessionProjections.stateOf(session, 'academicResearch')
      expect(state?.backgroundRunOrder).toBe(before?.backgroundRunOrder)
      expect(state?.backgroundRunOrder).toEqual([view.backgroundRunId])
      expect(state?.backgroundRuns[view.backgroundRunId]?.q6).toEqual({ ...update.q6, candidates })
      expect(state?.backgroundRuns[view.backgroundRunId]?.q6?.candidates)
        .toBe(before?.backgroundRuns[view.backgroundRunId]?.q6?.candidates)
      expect(state?.backgroundRuns[view.backgroundRunId]?.progress).toEqual(update.progress)
      expect(update.q6).not.toHaveProperty('candidates')
      const events = session.snapshotEvents()
      const cold = ctx.sessionProjections.restore({}, events, SessionLogOffset(0),
        session.header, session.inheritedEventCount)
      expect(cold.checkpoint.academicResearch?.val).toEqual(state)
      expect(cold.checkpoint.academicResearch?.ver).toBe(3)
      const last = events.at(-1)
      if (last === undefined) throw new Error('the projection fixture needs its committed update')
      const upgraded = ctx.sessionProjections.restore({ academicResearch: {
        ver: 2, seq: last.seq, val: before,
      } }, events, SessionLogOffset(0), session.header, session.inheritedEventCount)
      expect(upgraded.checkpoint.academicResearch?.val).toEqual(state)
    } finally { await ctx.fiber.dispose() }
  })

  it('rejects Q6 metadata from another producer, Brief version or missing candidate checkpoint', () => {
    const view = backgroundView()
    if (view.q6 === null) throw new Error('the projection fixture needs a complete Q6 checkpoint')
    const { candidates, ...metadata } = view.q6
    const update: AcademicBackgroundRunQ6Update = { ...backgroundProgress(view, 1),
      q6: { ...metadata, sequence: metadata.sequence + 1 } }
    const event = (data: AcademicBackgroundRunQ6Update): SessionEvent<'academic/background-run-q6-update'> => ({
      seq: SessionSeq(1), time: 2, type: 'academic/background-run-q6-update', data,
    })
    const state = fold(initial(), { seq: SessionSeq(0), time: 1, type: 'academic/background-run-state', data: view })
    const mismatches: readonly AcademicBackgroundRunQ6Update[] = [
      { ...update, backgroundRunId: 'unmapped-q6-run' },
      { ...update, q6: { ...update.q6, sessionId: SessionId('other-session') } },
      { ...update, q6: { ...update.q6, retrievalRunId: createRetrievalRunId() } },
      { ...update, q6: { ...update.q6, researchBriefId: createResearchBriefId() } },
      { ...update, q6: { ...update.q6, researchBriefVersion: metadata.researchBriefVersion + 1 } },
      { ...update, q6: { ...update.q6, plan: { ...metadata.plan,
        researchBriefVersion: metadata.plan.researchBriefVersion + 1 } } },
      { ...update, q6: { ...update.q6, sequence: metadata.sequence - 1 } },
    ]
    for (const mismatch of mismatches) expect(() => fold(state, event(mismatch))).toThrow()
    const withoutQ6 = fold(initial(), { seq: SessionSeq(0), time: 1,
      type: 'academic/background-run-state', data: { ...view, q6: null } })
    expect(() => fold(withoutQ6, event(update))).toThrow()
    expect(state.backgroundRuns[view.backgroundRunId]?.q6?.candidates).toBe(candidates)
    expect(state.backgroundRuns['unmapped-q6-run']).toBeUndefined()
  })
})
