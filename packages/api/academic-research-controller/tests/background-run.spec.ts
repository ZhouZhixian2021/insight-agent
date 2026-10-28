import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createResearchBriefId, createRetrievalRunId } from '@deepseek-ai/dsh-academic-model'
import type { AcademicWork, CandidateAssessment, HybridSearchPlan, WorkVersion } from '@deepseek-ai/dsh-academic-model'
import type { AcademicQueryWorkflowObservation } from '@deepseek-ai/dsh-academic-workflow'
import {
  AcademicBackgroundRuns, applyBackgroundRunProgress, applyBackgroundRunQ6Update, createBackgroundRunPersistence,
  replayBackgroundRun, replayBackgroundRuns,
} from '../src/background-run.ts'
import type { AcademicBackgroundRunProgress, AcademicBackgroundRunQ6Update } from '../src/background-run.ts'
import { academicQ6Projection } from '../src/q6-projection.ts'
import type {
  AcademicBackgroundRunView, AcademicQ6Projection, AcademicResearchProgressView, AcademicResearchRunValue,
} from '../src/types.ts'

const sessionId = SessionId('research-session')
const researchBriefId = createResearchBriefId()

function outcome(status: 'completed' | 'cancelled'): AcademicResearchRunValue {
  const retrievalRunId = createRetrievalRunId()
  return { sessionId, status, synthesis: { status: 'not_run', reasons: [] }, q6: null,
    stages: { search: 'not_run', fulltext: 'not_run', extraction: 'not_run' },
    retrievalRun: { schemaVersion: 1, retrievalRunId, researchBriefId, researchBriefVersion: 1,
      stage: status, status: 'success', startedAt: '2026-10-12T00:00:00Z', completedAt: '2026-10-12T00:01:00Z',
      queries: [], providers: [], academicWorkIds: [], coverageSummary: { schemaVersion: 1,
        discoveredRecords: 0, deduplicatedWorks: 0, includedWorks: 0, availableFulltextWorks: 0,
        abstractOnlyWorks: 0, metadataOnlyWorks: 0, failedOperations: 0, truncated: false,
        limitations: [], providerBreakdown: null }, failures: [] },
    papers: [], failures: [], report: null }
}

interface Q6Fixture {
  readonly plan: HybridSearchPlan
  readonly assessments: readonly CandidateAssessment[]
  readonly rankingResult: AcademicQueryWorkflowObservation['ranking']
}

const q6Fixture = JSON.parse(readFileSync(new URL(
  '../../../../z-team_docs/interface-samples/academic-model-v1/academic-query-workflow-v1.sample.json',
  import.meta.url,
), 'utf8')) as Q6Fixture
const progressFixture = JSON.parse(readFileSync(new URL(
  '../../../../z-team_docs/interface-samples/academic-model-v1/academic-research-progress-v1.sample.json',
  import.meta.url,
), 'utf8')) as { readonly frames: readonly { readonly type: string; readonly progress?: AcademicResearchProgressView }[] }

function progressView(retrievalRunId: NonNullable<AcademicBackgroundRunView['retrievalRunId']>, sequence: number): AcademicResearchProgressView {
  const sample = progressFixture.frames.find(frame => frame.type === 'progress')?.progress
  if (sample === undefined) throw new Error('academic progress sample is missing')
  return { ...sample, sessionId, retrievalRunId, sequence,
    updatedAt: new Date(Date.parse(sample.startedAt) + sequence * 1000).toISOString() }
}

function largeQ6(retrievalRunId: NonNullable<AcademicBackgroundRunView['retrievalRunId']>): AcademicQ6Projection {
  const works: readonly AcademicWork[] = q6Fixture.rankingResult.evaluations.map(evaluation => ({
    schemaVersion: 1, academicWorkId: evaluation.academicWorkId, title: `Work ${evaluation.academicWorkId}`,
    authors: [], externalIdentifiers: [], workVersionIds: [evaluation.workVersionId],
    canonicalVersionId: evaluation.workVersionId,
    firstPublicDate: { status: 'unknown', reason: 'fixture' },
    publicationStatus: { status: 'unknown', reason: 'fixture' }, venue: { status: 'unknown', reason: 'fixture' },
  }))
  const versions: readonly WorkVersion[] = q6Fixture.rankingResult.evaluations.map(evaluation => ({
    schemaVersion: 1, workVersionId: evaluation.workVersionId, academicWorkId: evaluation.academicWorkId,
    versionType: 'unknown', versionLabel: { status: 'unknown', reason: 'fixture' },
    releaseDate: { status: 'unknown', reason: 'fixture' }, externalIdentifiers: [], sourceRecords: [],
    contentHash: { status: 'not_extracted' }, supersedesWorkVersionId: null, status: 'active',
  }))
  return academicQ6Projection(sessionId, {
    schemaVersion: 1, retrievalRunId, sequence: 1, observedAt: '2026-10-12T00:00:00Z', status: 'running',
    plan: { ...q6Fixture.plan, researchBriefId }, works, versions,
    assessments: q6Fixture.assessments.map(assessment => ({ ...assessment, reasons: ['candidate fact '.repeat(8192)] })),
    ranking: { ...q6Fixture.rankingResult, researchBriefId }, rounds: [], decisions: [], settlements: [],
    coverage: null, stopDecision: null, limitations: [],
  })
}

function runningView(retrievalRunId = createRetrievalRunId(), q6: AcademicQ6Projection | null = null): AcademicBackgroundRunView {
  return { schemaVersion: 1, sessionId, backgroundRunId: 'background-progress', researchBriefId,
    state: 'running', startedAt: '2026-10-12T00:00:00Z', updatedAt: '2026-10-12T00:00:00Z',
    retrievalRunId, progress: progressView(retrievalRunId, 0), q6, result: null, error: null, cancelReason: null }
}

function progressEvent(view: AcademicBackgroundRunView, sequence: number): AcademicBackgroundRunProgress {
  if (view.retrievalRunId === null) throw new Error('progress fixture requires a retrieval run')
  const progress = progressView(view.retrievalRunId, sequence)
  return { schemaVersion: 1, sessionId: view.sessionId, backgroundRunId: view.backgroundRunId,
    researchBriefId: view.researchBriefId, retrievalRunId: view.retrievalRunId,
    updatedAt: progress.updatedAt, progress }
}

function q6Event(view: AcademicBackgroundRunView, q6: AcademicQ6Projection): AcademicBackgroundRunQ6Update {
  const { candidates: _candidates, ...metadata } = q6
  return { ...progressEvent(view, q6.sequence), q6: metadata }
}

function changedCandidate(q6: AcademicQ6Projection): AcademicQ6Projection {
  if (q6.candidates.state !== 'available') throw new Error('candidate fixture is not available')
  const [first, ...remaining] = q6.candidates.value.items
  if (first === undefined) throw new Error('candidate fixture is empty')
  return { ...q6, sequence: q6.sequence + 1, candidates: { state: 'available', value: {
    ...q6.candidates.value,
    items: [{ ...first, work: { ...first.work, title: 'Changed candidate fact' } }, ...remaining],
  } } }
}

function resultFor(retrievalRunId: NonNullable<AcademicBackgroundRunView['retrievalRunId']>): AcademicResearchRunValue {
  const value = outcome('completed')
  return { ...value, retrievalRun: { ...value.retrievalRun, retrievalRunId } }
}

async function pausedBackgroundRun() {
  const runs = new AcademicBackgroundRuns()
  const session = Session.create(sessionId)
  const events: SessionEvent[] = []
  const ready = Promise.withResolvers<undefined>()
  const completed = Promise.withResolvers<undefined>()
  const work = Promise.withResolvers<AcademicResearchRunValue>()
  const retrievalRunId = createRetrievalRunId()
  let publish: Parameters<Parameters<AcademicBackgroundRuns['start']>[2]>[1] | undefined
  let producerSignal: AbortSignal | undefined
  const persist = createBackgroundRunPersistence(
    (view) => { events.push(session.append('academic/background-run-state', view)) },
    (progress) => { events.push(session.append('academic/background-run-progress', progress)) },
    (update) => { events.push(session.append('academic/background-run-q6-update', update)) },
  )
  const started = runs.start({ sessionId, researchBriefId, startedAt: '2026-10-12T00:00:00Z' }, (view) => {
    persist(view)
    if (view.state !== 'running') completed.resolve(undefined)
  }, async (signal, update) => {
    publish = update
    producerSignal = signal
    ready.resolve(undefined)
    return await work.promise
  })
  await ready.promise
  if (publish === undefined || producerSignal === undefined) throw new Error('background fixture did not start')
  return { runs, events, session, started, publish, producerSignal, retrievalRunId,
    completed: completed.promise,
    finish: () => { work.resolve(resultFor(retrievalRunId)) },
  }
}

describe('Academic background run lifecycle', () => {
  it('continues after a subscriber disconnects and replays the persisted terminal result', async () => {
    const runs = new AcademicBackgroundRuns()
    const saved: AcademicBackgroundRunView[] = []
    let settle: ((result: AcademicResearchRunValue) => void) | undefined
    const started = runs.start({ sessionId, researchBriefId, startedAt: '2026-10-12T00:00:00Z' },
      (view) => { saved.push(view) }, () => new Promise((resolve) => { settle = resolve }))
    const subscriber = new AbortController()
    const watch = runs.watch(sessionId, started.backgroundRunId, subscriber.signal)[Symbol.asyncIterator]()
    await expect(watch.next()).resolves.toMatchObject({ value: { state: 'running' } })
    subscriber.abort()
    await expect(watch.next()).resolves.toEqual({ done: true, value: undefined })
    await Promise.resolve()
    settle?.(outcome('completed'))
    await expect.poll(() => saved.at(-1)?.state).toBe('completed')
    expect(replayBackgroundRun(sessionId, started.backgroundRunId,
      saved.map(data => ({ type: 'academic/background-run-state', data })))).toMatchObject({
      state: 'completed', result: { status: 'completed' },
    })
    expect(replayBackgroundRun(SessionId('other-session'), started.backgroundRunId,
      saved.map(data => ({ type: 'academic/background-run-state', data })))).toBeUndefined()
  })

  it('uses explicit cancel only and marks an unclosed persisted run interrupted after host restart', async () => {
    const runs = new AcademicBackgroundRuns()
    const saved: AcademicBackgroundRunView[] = []
    const started = runs.start({ sessionId, researchBriefId, startedAt: '2026-10-12T00:00:00Z' },
      (view) => { saved.push(view) }, signal => new Promise((resolve) => {
        signal.addEventListener('abort', () => { resolve(outcome('cancelled')) }, { once: true })
      }))
    expect(replayBackgroundRun(sessionId, started.backgroundRunId,
      saved.map(data => ({ type: 'academic/background-run-state', data })))).toMatchObject({
      state: 'interrupted', cancelReason: null,
    })
    await Promise.resolve()
    expect(runs.cancel(sessionId, started.backgroundRunId, (view) => { saved.push(view) })).toMatchObject({
      state: 'running', cancelReason: 'user_requested',
    })
    await expect.poll(() => saved.at(-1)?.state).toBe('cancelled')
    expect(saved.at(-1)).toMatchObject({ state: 'cancelled', cancelReason: 'user_requested' })
  })

  it('writes the initial and terminal views as lossless Session events', async () => {
    const runs = new AcademicBackgroundRuns()
    const session = Session.create(sessionId)
    const started = runs.start({ sessionId, researchBriefId, startedAt: '2026-10-12T00:00:00Z' },
      (view) => { session.append('academic/background-run-state', view) }, async () => outcome('completed'))
    await expect.poll(() => session.snapshotEvents().filter(event => event.type === 'academic/background-run-state').length).toBe(2)
    expect(replayBackgroundRun(sessionId, started.backgroundRunId, session.snapshotEvents())).toMatchObject({
      state: 'completed', result: { status: 'completed' },
    })
  })

  it('records service disposal separately from a user cancellation and waits for quiescence', async () => {
    const runs = new AcademicBackgroundRuns()
    const saved: AcademicBackgroundRunView[] = []
    const started = runs.start({ sessionId, researchBriefId, startedAt: '2026-10-12T00:00:00Z' },
      (view) => { saved.push(view) }, signal => new Promise((resolve) => {
        signal.addEventListener('abort', () => { resolve(outcome('cancelled')) }, { once: true })
      }))
    await Promise.resolve()
    await runs.dispose()
    expect(saved.at(-1)).toMatchObject({ backgroundRunId: started.backgroundRunId,
      state: 'interrupted', cancelReason: 'service_stopped' })
    expect(runs.hasActiveSession(sessionId)).toBe(false)
  })
})

describe('Academic background run persistence', () => {
  it('stores large candidate facts once while every progress update remains recoverable from real Session events', () => {
    const session = Session.create(sessionId)
    const events: SessionEvent[] = []
    const persist = createBackgroundRunPersistence(
      (view) => { events.push(session.append('academic/background-run-state', view)) },
      (progress) => { events.push(session.append('academic/background-run-progress', progress)) },
      (update) => { events.push(session.append('academic/background-run-q6-update', update)) },
    )
    const retrievalRunId = createRetrievalRunId()
    let view = runningView(retrievalRunId, largeQ6(retrievalRunId))
    persist(view)
    const updates = 100
    let completeViewBytes = Buffer.byteLength(JSON.stringify(view))
    for (let sequence = 1; sequence <= updates; sequence++) {
      const event = progressEvent(view, sequence)
      view = { ...view, progress: event.progress, updatedAt: event.updatedAt }
      completeViewBytes += Buffer.byteLength(JSON.stringify(view))
      persist(view)
      expect(replayBackgroundRun(sessionId, view.backgroundRunId, events)).toMatchObject({
        progress: view.progress, updatedAt: view.updatedAt, q6: view.q6,
      })
    }
    expect(session.seq).toBe(updates + 1)
    expect(events.filter(event => event.type === 'academic/background-run-state')).toHaveLength(1)
    const deltas = events.filter(event => event.type === 'academic/background-run-progress')
    expect(deltas).toHaveLength(updates)
    expect(deltas.map(event => event.data.progress?.sequence)).toEqual(Array.from({ length: updates }, (_, index) => index + 1))
    for (const event of deltas) {
      expect(Object.keys(event.data).sort()).toEqual([
        'backgroundRunId', 'progress', 'researchBriefId', 'retrievalRunId', 'schemaVersion', 'sessionId', 'updatedAt',
      ])
      expect(event.data).not.toHaveProperty('q6')
      expect(event.data).not.toHaveProperty('result')
      expect(Buffer.byteLength(JSON.stringify(event))).toBeLessThan(16 * 1024)
    }
    const persistedBytes = events.reduce((sum, event) => sum + Buffer.byteLength(JSON.stringify(event)), 0)
    expect(persistedBytes).toBeLessThan(completeViewBytes / 4)
  })

  it('writes new retrieval bindings, candidate revisions, cancellation, and terminal results as complete checkpoints', () => {
    const events: { type: string; data: AcademicBackgroundRunView | AcademicBackgroundRunProgress }[] = []
    const persist = createBackgroundRunPersistence(
      (data) => { events.push({ type: 'academic/background-run-state', data }) },
      (data) => { events.push({ type: 'academic/background-run-progress', data }) },
      (data) => { events.push({ type: 'academic/background-run-q6-update', data }) },
    )
    const retrievalRunId = createRetrievalRunId()
    const initial: AcademicBackgroundRunView = { ...runningView(retrievalRunId), retrievalRunId: null, progress: null }
    persist(initial)
    const bound = { ...initial, retrievalRunId }
    persist(bound)
    const q6 = largeQ6(retrievalRunId)
    const observed = { ...bound, q6 }
    persist(observed)
    const update = progressEvent(observed, 1)
    const advanced = { ...observed, progress: update.progress, updatedAt: update.updatedAt }
    persist(advanced)
    const revised = { ...advanced, q6: changedCandidate(q6) }
    persist(revised)
    const cancelling: AcademicBackgroundRunView = { ...revised, cancelReason: 'user_requested' }
    persist(cancelling)
    const result = outcome('cancelled')
    const terminal: AcademicBackgroundRunView = { ...cancelling, state: 'cancelled', result: {
      ...result, q6: revised.q6, retrievalRun: { ...result.retrievalRun, retrievalRunId },
    } }
    persist(terminal)
    expect(events.map(event => event.type)).toEqual([
      'academic/background-run-state', 'academic/background-run-state', 'academic/background-run-state',
      'academic/background-run-progress', 'academic/background-run-state', 'academic/background-run-state',
      'academic/background-run-state',
    ])
    expect(replayBackgroundRun(sessionId, initial.backgroundRunId, events)).toEqual(terminal)
  })

  it('folds legacy full states and progress in first-start order without replacing Q6 or mapping identities', () => {
    const retrievalRunId = createRetrievalRunId()
    const first = runningView(retrievalRunId, largeQ6(retrievalRunId))
    const second = { ...runningView(), backgroundRunId: 'background-second' }
    const update = progressEvent(first, 1)
    const legacy = { ...first, progress: progressView(retrievalRunId, 2), updatedAt: 'legacy checkpoint' }
    const latest = progressEvent(legacy, 3)
    const events = [
      { type: 'academic/background-run-state', data: first },
      { type: 'academic/background-run-state', data: second },
      { type: 'academic/background-run-progress', data: update },
      { type: 'academic/background-run-state', data: legacy },
      { type: 'academic/background-run-progress', data: latest },
    ]
    const restored = replayBackgroundRuns(sessionId, events)
    expect(restored.map(view => view.backgroundRunId)).toEqual([first.backgroundRunId, second.backgroundRunId])
    expect(restored[0]).toMatchObject({ state: 'interrupted', progress: latest.progress, updatedAt: latest.updatedAt, q6: first.q6 })
    expect(replayBackgroundRun(sessionId, first.backgroundRunId, events)).toEqual(restored[0])
    expect(replayBackgroundRun(SessionId('other-session'), first.backgroundRunId, events)).toBeUndefined()
    expect(() => replayBackgroundRun(sessionId, first.backgroundRunId, [events[2]!])).toThrow('checkpoint')
    expect(() => replayBackgroundRuns(sessionId, [events[2]!])).toThrow('checkpoint')
  })

  it('rejects progress without its exact running checkpoint and producer identities', () => {
    const view = runningView()
    const event = progressEvent(view, 1)
    const invalid: readonly [string, AcademicBackgroundRunView | undefined, AcademicBackgroundRunProgress][] = [
      ['checkpoint', undefined, event],
      ['Session', view, { ...event, sessionId: SessionId('other-session') }],
      ['background run', view, { ...event, backgroundRunId: 'other-background' }],
      ['Brief', view, { ...event, researchBriefId: createResearchBriefId() }],
      ['retrieval run', view, { ...event, retrievalRunId: createRetrievalRunId() }],
      ['lifecycle', { ...view, state: 'completed' }, event],
      ['progress Session', view, { ...event, progress: { ...progressView(view.retrievalRunId!, 1), sessionId: SessionId('other-session') } }],
      ['progress retrieval', view, { ...event, progress: progressView(createRetrievalRunId(), 1) }],
    ]
    for (const [label, checkpoint, progress] of invalid) {
      expect(() => applyBackgroundRunProgress(checkpoint, progress), label).toThrow()
    }
    const restored = applyBackgroundRunProgress(view, event)
    expect(restored).toEqual({ ...view, progress: event.progress, updatedAt: event.updatedAt })
    expect(restored.q6).toBe(view.q6)
    expect(restored.result).toBe(view.result)
  })

  it('keeps every changed non-progress fact in a complete checkpoint', () => {
    const view = runningView()
    const changed: readonly AcademicBackgroundRunView[] = [
      { ...view, sessionId: SessionId('other-session') },
      { ...view, backgroundRunId: 'other-background' },
      { ...view, researchBriefId: createResearchBriefId() },
      { ...view, startedAt: 'different start' },
      { ...view, error: 'different error' },
      { ...view, cancelReason: 'service_stopped' },
      { ...view, state: 'failed' },
      { ...view, result: outcome('completed') },
    ]
    for (const next of changed) {
      const states: AcademicBackgroundRunView[] = []
      const progress: AcademicBackgroundRunProgress[] = []
      const q6Updates: AcademicBackgroundRunQ6Update[] = []
      const persist = createBackgroundRunPersistence(
        (state) => { states.push(state) },
        (event) => { progress.push(event) },
        (event) => { q6Updates.push(event) },
      )
      persist(view)
      persist(next)
      expect(states).toEqual([view, next])
      expect(progress).toEqual([])
      expect(q6Updates).toEqual([])
    }
  })

  it('remembers a new Q6 checkpoint only after its durable writer succeeds', () => {
    const view = runningView()
    const next = { ...view, q6: largeQ6(view.retrievalRunId!) }
    const states: AcademicBackgroundRunView[] = []
    const progress: AcademicBackgroundRunProgress[] = []
    const q6Updates: AcademicBackgroundRunQ6Update[] = []
    let rejectCheckpoint = true
    const persist = createBackgroundRunPersistence((state) => {
      if (state.q6 !== null && rejectCheckpoint) {
        rejectCheckpoint = false
        throw new Error('checkpoint write failed')
      }
      states.push(state)
    }, (event) => { progress.push(event) }, (event) => { q6Updates.push(event) })
    persist(view)
    expect(() => { persist(next) }).toThrow('checkpoint write failed')
    persist({ ...next, updatedAt: 'next observation' })
    expect(states).toHaveLength(2)
    expect(states[1]?.q6).toBe(next.q6)
    expect(progress).toEqual([])
    expect(q6Updates).toEqual([])
  })

  it('stores equal candidate content from new Q6 objects as required metadata updates', () => {
    const session = Session.create(sessionId)
    const events: SessionEvent[] = []
    const persist = createBackgroundRunPersistence(
      (view) => { events.push(session.append('academic/background-run-state', view)) },
      (progress) => { events.push(session.append('academic/background-run-progress', progress)) },
      (update) => { events.push(session.append('academic/background-run-q6-update', update)) },
    )
    const retrievalRunId = createRetrievalRunId()
    const q6 = largeQ6(retrievalRunId)
    const view = runningView(retrievalRunId, q6)
    persist(view)
    const revised = { ...structuredClone(q6), sequence: q6.sequence + 1,
      updatedAt: 'new Q6 metadata', limitations: ['updated metadata'] }
    expect(revised.candidates).not.toBe(q6.candidates)
    const after = { ...view, q6: revised, updatedAt: revised.updatedAt }
    persist(after)
    const nextProgress = progressEvent(after, 3)
    persist({ ...after, progress: nextProgress.progress, updatedAt: nextProgress.updatedAt })
    expect(events.map(event => event.type)).toEqual([
      'academic/background-run-state', 'academic/background-run-q6-update', 'academic/background-run-progress',
    ])
    const checkpoint = events[0]
    const update = events[1]
    if (checkpoint?.type !== 'academic/background-run-state' || update?.type !== 'academic/background-run-q6-update') {
      throw new Error('expected complete checkpoint and Q6 metadata event')
    }
    expect(update.data.q6).not.toHaveProperty('candidates')
    expect(Object.keys(update.data.q6).sort()).toEqual(Object.keys(q6).filter(key => key !== 'candidates').sort())
    expect(Buffer.byteLength(JSON.stringify(update))).toBeLessThan(Buffer.byteLength(JSON.stringify(q6)) / 4)
    const restored = applyBackgroundRunQ6Update(checkpoint.data, update.data)
    expect(restored.q6).toEqual(revised)
    expect(restored.q6?.candidates).toBe(checkpoint.data.q6?.candidates)
    expect(replayBackgroundRun(sessionId, view.backgroundRunId, events)).toMatchObject({
      q6: revised, progress: nextProgress.progress, updatedAt: nextProgress.updatedAt,
    })
    expect(replayBackgroundRuns(sessionId, events)[0]?.q6).toEqual(revised)
  })

  it('keeps Q6 identity, Brief-version, and backwards-sequence changes in complete states', () => {
    const retrievalRunId = createRetrievalRunId()
    const q6 = largeQ6(retrievalRunId)
    const view = runningView(retrievalRunId, q6)
    const changed = [
      { ...q6, sessionId: SessionId('other-session') },
      { ...q6, retrievalRunId: createRetrievalRunId() },
      { ...q6, researchBriefId: createResearchBriefId() },
      { ...q6, researchBriefVersion: q6.researchBriefVersion + 1 },
      { ...q6, plan: { ...q6.plan, researchBriefVersion: q6.plan.researchBriefVersion + 1 } },
      { ...q6, sequence: q6.sequence - 1 },
    ]
    for (const next of changed) {
      const states: AcademicBackgroundRunView[] = []
      const progress: AcademicBackgroundRunProgress[] = []
      const metadata: AcademicBackgroundRunQ6Update[] = []
      const persist = createBackgroundRunPersistence(
        (state) => { states.push(state) },
        (event) => { progress.push(event) },
        (event) => { metadata.push(event) },
      )
      persist(view)
      const revised = { ...view, q6: next }
      persist(revised)
      expect(states).toEqual([view, revised])
      expect(progress).toEqual([])
      expect(metadata).toEqual([])
    }
  })

  it('preserves complete states when equal new Q6 objects do not belong to their outer run', () => {
    const retrievalRunId = createRetrievalRunId()
    const q6 = largeQ6(retrievalRunId)
    const foreignBrief = createResearchBriefId()
    const foreign: readonly AcademicQ6Projection[] = [
      { ...q6, sessionId: SessionId('other-session') },
      { ...q6, retrievalRunId: createRetrievalRunId() },
      { ...q6, researchBriefId: foreignBrief, plan: { ...q6.plan, researchBriefId: foreignBrief } },
      { ...q6, plan: { ...q6.plan, researchBriefId: foreignBrief } },
      { ...q6, plan: { ...q6.plan, researchBriefVersion: q6.researchBriefVersion + 1 } },
    ]
    for (const candidate of foreign) {
      const states: AcademicBackgroundRunView[] = []
      const progress: AcademicBackgroundRunProgress[] = []
      const metadata: AcademicBackgroundRunQ6Update[] = []
      const persist = createBackgroundRunPersistence(
        (view) => { states.push(view) },
        (event) => { progress.push(event) },
        (event) => { metadata.push(event) },
      )
      const initial = runningView(retrievalRunId, candidate)
      const next = { ...initial, q6: structuredClone(candidate) }
      persist(initial)
      persist(next)
      expect(states).toEqual([initial, next])
      expect(progress).toEqual([])
      expect(metadata).toEqual([])
      expect(() => applyBackgroundRunQ6Update(initial, q6Event(next, next.q6))).toThrow()
    }
  })

  it('rejects Q6 metadata without the exact candidate checkpoint, identities, version, and sequence', () => {
    const retrievalRunId = createRetrievalRunId()
    const q6 = largeQ6(retrievalRunId)
    const view = runningView(retrievalRunId, q6)
    const event = q6Event(view, { ...q6, sequence: q6.sequence + 1 })
    const invalid: readonly [AcademicBackgroundRunView | undefined, AcademicBackgroundRunQ6Update][] = [
      [undefined, event],
      [{ ...view, q6: null }, event],
      [view, { ...event, sessionId: SessionId('other-session') }],
      [view, { ...event, backgroundRunId: 'other-background' }],
      [view, { ...event, researchBriefId: createResearchBriefId() }],
      [view, { ...event, retrievalRunId: createRetrievalRunId() }],
      [view, { ...event, q6: { ...event.q6, sessionId: SessionId('other-session') } }],
      [view, { ...event, q6: { ...event.q6, retrievalRunId: createRetrievalRunId() } }],
      [view, { ...event, q6: { ...event.q6, researchBriefId: createResearchBriefId() } }],
      [view, { ...event, q6: { ...event.q6, researchBriefVersion: q6.researchBriefVersion + 1 } }],
      [view, { ...event, q6: { ...event.q6, plan: { ...q6.plan, researchBriefId: createResearchBriefId() } } }],
      [view, { ...event, q6: { ...event.q6, plan: { ...q6.plan, researchBriefVersion: q6.researchBriefVersion + 1 } } }],
      [view, { ...event, q6: { ...event.q6, sequence: q6.sequence - 1 } }],
      [{ ...view, state: 'completed' }, event],
    ]
    for (const [checkpoint, update] of invalid) expect(() => applyBackgroundRunQ6Update(checkpoint, update)).toThrow()
    expect(() => replayBackgroundRuns(sessionId, [{ type: 'academic/background-run-q6-update', data: event }])).toThrow('checkpoint')
  })

  it('rejects malformed durable progress and Q6 records without treating them as parsed domain values', () => {
    const retrievalRunId = createRetrievalRunId()
    const q6 = largeQ6(retrievalRunId)
    const view = runningView(retrievalRunId, q6)
    const progress = progressEvent(view, 1)
    const update = q6Event(view, { ...q6, sequence: q6.sequence + 1 })
    const withoutCoverage: Record<string, unknown> = { ...update.q6 }
    delete withoutCoverage.coverage
    const records: readonly { type: string; data: unknown }[] = [
      { type: 'academic/background-run-progress', data: null },
      { type: 'academic/background-run-progress', data: { ...progress, schemaVersion: 2 } },
      { type: 'academic/background-run-progress', data: { ...progress, sessionId: 42 } },
      { type: 'academic/background-run-progress', data: { ...progress, updatedAt: 42 } },
      { type: 'academic/background-run-progress', data: { ...progress, progress: {} } },
      { type: 'academic/background-run-progress', data: { ...progress, progress: { ...progress.progress, schemaVersion: 2 } } },
      { type: 'academic/background-run-progress', data: { ...progress, q6: update.q6 } },
      { type: 'academic/background-run-q6-update', data: progress },
      { type: 'academic/background-run-q6-update', data: { ...update, q6: withoutCoverage } },
      { type: 'academic/background-run-q6-update', data: { ...update, q6: { ...update.q6, candidates: q6.candidates } } },
      { type: 'academic/background-run-q6-update', data: { ...update, q6: { ...update.q6, sequence: -1 } } },
      { type: 'academic/background-run-q6-update', data: { ...update, q6: { ...update.q6, plan: null } } },
    ]
    for (const record of records) {
      const events = [{ type: 'academic/background-run-state', data: view }, record]
      expect(() => replayBackgroundRun(sessionId, view.backgroundRunId, events)).toThrow('durable')
      expect(() => replayBackgroundRuns(sessionId, events)).toThrow('durable')
    }
  })
})

describe('Academic background latest-view subscribers', () => {
  it('coalesces 100 paused updates while preserving every durable transition and the terminal view', async () => {
    const fixture = await pausedBackgroundRun()
    const viewer = new AbortController()
    const watch = fixture.runs.watch(sessionId, fixture.started.backgroundRunId, viewer.signal)[Symbol.asyncIterator]()
    try {
      await expect(watch.next()).resolves.toMatchObject({ value: { state: 'running', progress: null } })
      for (let sequence = 1; sequence <= 100; sequence++) {
        fixture.publish({ retrievalRunId: fixture.retrievalRunId, progress: progressView(fixture.retrievalRunId, sequence) })
      }
      await expect(watch.next()).resolves.toMatchObject({ value: { state: 'running', progress: { sequence: 100 } } })
      fixture.publish({ progress: progressView(fixture.retrievalRunId, 101) })
      fixture.finish()
      await fixture.completed
      await expect(watch.next()).resolves.toMatchObject({ value: { state: 'completed', progress: { sequence: 101 } } })
      await expect(watch.next()).resolves.toEqual({ done: true, value: undefined })
      expect(fixture.session.seq).toBe(103)
      const durableProgress = fixture.events.flatMap((event) => {
        if (event.type === 'academic/background-run-progress') return [event.data.progress?.sequence]
        if (event.type === 'academic/background-run-state' && event.data.state === 'running' && event.data.progress !== null) {
          return [event.data.progress.sequence]
        }
        return []
      })
      expect(durableProgress).toEqual(Array.from({ length: 101 }, (_, index) => index + 1))
      expect(replayBackgroundRun(sessionId, fixture.started.backgroundRunId, fixture.events)).toMatchObject({
        state: 'completed', progress: { sequence: 101 },
      })
    } finally {
      viewer.abort()
      fixture.finish()
      await watch.return?.()
      await fixture.runs.dispose()
    }
  })

  it('unsubscribes synchronously when a paused viewer aborts and leaves producer work alive', async () => {
    const fixture = await pausedBackgroundRun()
    const viewer = new AbortController()
    const removed = vi.spyOn(viewer.signal, 'removeEventListener')
    const watch = fixture.runs.watch(sessionId, fixture.started.backgroundRunId, viewer.signal)[Symbol.asyncIterator]()
    try {
      await expect(watch.next()).resolves.toMatchObject({ value: { state: 'running' } })
      for (let sequence = 1; sequence <= 100; sequence++) {
        fixture.publish({ retrievalRunId: fixture.retrievalRunId, progress: progressView(fixture.retrievalRunId, sequence) })
      }
      viewer.abort()
      expect(removed).toHaveBeenCalledExactlyOnceWith('abort', expect.any(Function))
      expect(fixture.producerSignal.aborted).toBe(false)
      fixture.publish({ progress: progressView(fixture.retrievalRunId, 101) })
      expect(fixture.runs.get(sessionId, fixture.started.backgroundRunId)?.progress?.sequence).toBe(101)
      await expect(watch.next()).resolves.toEqual({ done: true, value: undefined })
      expect(removed).toHaveBeenCalledTimes(1)
    } finally {
      viewer.abort()
      fixture.finish()
      await watch.return?.()
      await fixture.runs.dispose()
      removed.mockRestore()
    }
  })
})
