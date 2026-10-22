import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionLogOffset, SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import { createResearchBriefId, createRetrievalRunId, createSearchQueryId, createWorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { reconstructAcademicResearchRecoveryState } from '@deepseek-ai/dsh-academic-workflow'
import type { AcademicBackgroundRunView } from '../src/types.ts'
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
})
