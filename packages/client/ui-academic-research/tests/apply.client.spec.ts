/** Slot lifecycle: registration waits for its owner and unwinds on plugin disposal. */
import { Context } from '@deepseek-ai/cordis'
import { describe, it, expect, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { RemoteStream } from '@deepseek-ai/dsh-api-gateway/client'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import { apply, inject } from '../src/client/index.ts'
import type { ResearchEntryInjected } from '../src/client/ResearchEntry.tsx'
import { sampleRun } from './run-sample.ts'
import { initialTask } from './background.fixture.client.ts'
import { apply as hostApply } from '../src/index.ts'

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of stream) values.push(value)
  return values
}

describe('academic sidebar registration', () => {
  it('waits for the sidebar declaration and removes its entry on disposal', async () => {
    expect(hostApply).not.toThrow()
    const ctx = new Context()
    try {
      await ctx.plugin(SlotRegistry).await()
      const completed = { ...initialTask(), state: 'completed' as const, result: sampleRun() }
      const remoteRun = vi.fn(async function* () { yield completed })
      const unary = vi.fn().mockResolvedValue({ ok: true, value: initialTask() })
      const remote = { traceList: unary, traceDetail: unary, enhanceEvidence: unary, startBackgroundRun: unary, listBackgroundRuns: unary, getBackgroundRun: unary, cancelBackgroundRun: unary, watchBackgroundRun: remoteRun, plan: vi.fn().mockResolvedValue({ ok: true, value: { topic: 'RAG' } }) }
      const remotePlan = remote.plan
      const sessionRemote = { follow: vi.fn().mockImplementation(async function* () { yield { type: 'snapshot', header: { id: sampleRun().sessionId }, cursor: 0, records: [], hasMore: false } }), page: unary }
      const $stream: ClientRemote['$stream'] = options => new RemoteStream({ generation: {
        getSnapshot: () => ({}), subscribe: () => () => {},
      } } as never, options)
      ctx.provide('remote', { academicResearch: remote, session: sessionRemote, $stream })
      ctx.provide('remote.session', sessionRemote)
      ctx.provide('remote.academicResearch', remote)
      ctx.provide('locale', new LocaleRuntime(ctx))
      const slots = ctx.get('slots') as SlotRegistry
      const fiber = ctx.plugin({ inject, apply })
      await fiber.await()
      expect(slots.entries('sidebar.footer.action')).toHaveLength(0)
      const disposeOwner = slots.register({ name: 'root', children: {
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
      } } as never, () => null)
      expect(slots.entries('sidebar.footer.action')).toHaveLength(1)
      expect(slots.entries('sidebar.footer.action')[0]!.children).toEqual({
        'academic.research.entry': { kind: 'single', scope: 'session-maybe' },
      })
      expect(slots.entries('academic.research.entry')).toHaveLength(1)
      expect(slots.entries('academic.research.entry')[0]!.locale).toBe('academicRun')
      const face = slots.entries('academic.research.entry')[0]!.inject!() as Readonly<ResearchEntryInjected>
      const request = { sessionId: sampleRun().sessionId, researchBriefId: sampleRun().retrievalRun.researchBriefId, synthetic: false }
      const signal = new AbortController().signal
      const key = { sessionId: request.sessionId, backgroundRunId: initialTask().backgroundRunId }
      await expect(face.enhanceEvidence({ sessionId: request.sessionId, retrievalRunId: sampleRun().retrievalRun.retrievalRunId, workVersionId: 'v' as never },
        signal)).resolves.toEqual(initialTask())
      const enhancementKey = { sessionId: request.sessionId, retrievalRunId: sampleRun().retrievalRun.retrievalRunId }
      await expect(face.enhancementHistory(enhancementKey, signal)).resolves.toBeNull()
      sessionRemote.follow.mockImplementationOnce(async function* () {
        yield { type: 'snapshot', header: { id: request.sessionId }, cursor: 10, hasMore: true,
          records: [{ type: 'event', event: { type: 'unrelated', seq: 10, data: {} } }] }
      })
      unary.mockResolvedValueOnce({ ok: true, value: { hasMore: false, records: [{ type: 'event', event: {
        type: 'academic/evidence-enhancement-selection', seq: 1, data: { ...enhancementKey,
          workVersionId: 'v', selectedAt: 'now', schemaVersion: 1 },
      } }] } })
      await expect(face.enhancementHistory(enhancementKey, signal)).resolves.toMatchObject({ status: 'unsettled' })
      expect(sessionRemote.page).toHaveBeenCalledWith({ address: { kind: 'session', sessionId: request.sessionId },
        throughSeq: 10, beforeSeq: 10 }, expect.any(AbortSignal))
      const traceQuery = { sessionId: request.sessionId, researchRunId: sampleRun().retrievalRun.retrievalRunId }
      await expect(face.traceList(traceQuery, signal)).resolves.toEqual(initialTask())
      expect(remote.traceList).toHaveBeenCalledWith(traceQuery, signal)
      await expect(face.traceDetail(traceQuery, signal)).resolves.toEqual(initialTask())
      expect(remote.traceDetail).toHaveBeenCalledWith(traceQuery, signal)
      expect(await collect(face.watchBackgroundRun(key, signal))).toEqual([completed])
      expect(remoteRun).toHaveBeenCalledWith(key, expect.any(AbortSignal))
      await expect(face.startBackgroundRun(request, signal)).resolves.toEqual(initialTask())
      await expect(face.listBackgroundRuns(request.sessionId)).resolves.toEqual(initialTask())
      await expect(face.getBackgroundRun(key)).resolves.toEqual(initialTask())
      await expect(face.cancelBackgroundRun({ ...key, reason: 'user_requested' })).resolves.toEqual(initialTask())
      for (const call of [() => face.startBackgroundRun(request, signal), () => face.listBackgroundRuns(request.sessionId),
        () => face.getBackgroundRun(key), () => face.cancelBackgroundRun({ ...key, reason: 'user_requested' })]) {
        const failure = new Error('denied'); unary.mockResolvedValueOnce({ ok: false, error: failure })
        await expect(call()).rejects.toBe(failure)
      }
      await expect(face.plan(request.sessionId)).resolves.toEqual({ topic: 'RAG' })
      expect(remotePlan).toHaveBeenCalledWith(request.sessionId)
      const failure = new Error('server denied')
      remotePlan.mockResolvedValueOnce({ ok: false, error: failure })
      await expect(face.plan(request.sessionId)).rejects.toBe(failure)
      remoteRun.mockImplementationOnce(async function* () { throw failure })
      await expect(collect(face.watchBackgroundRun(key, signal))).rejects.toThrow(failure.message)
      disposeOwner()
      expect(slots.entries('sidebar.footer.action')).toHaveLength(0)
      expect(slots.entries('academic.research.entry')).toHaveLength(0)
      slots.register({ name: 'root', children: {
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
      } } as never, () => null)
      expect(slots.entries('sidebar.footer.action')).toHaveLength(1)
      await fiber.dispose()
      expect(slots.entries('sidebar.footer.action')).toHaveLength(0)
      expect(slots.entries('academic.research.entry')).toHaveLength(0)
    } finally { await ctx.fiber.dispose() }
  })
})
