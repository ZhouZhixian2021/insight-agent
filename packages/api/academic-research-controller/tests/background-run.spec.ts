import { describe, expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createResearchBriefId, createRetrievalRunId } from '@deepseek-ai/dsh-academic-model'
import { AcademicBackgroundRuns, replayBackgroundRun } from '../src/background-run.ts'
import type { AcademicBackgroundRunView, AcademicResearchRunValue } from '../src/types.ts'

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
