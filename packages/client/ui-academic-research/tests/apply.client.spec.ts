/** Slot lifecycle: registration waits for its owner and unwinds on plugin disposal. */
import { Context } from '@deepseek-ai/cordis'
import { describe, it, expect, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import type { ResearchEntryInjected } from '../src/client/ResearchEntry.tsx'
import { sampleRun } from './run-sample.ts'
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
      const remoteRun = vi.fn(async function* () { yield { type: 'result' as const, retrievalRunId: sampleRun().retrievalRun.retrievalRunId, value: sampleRun() } })
      const remotePlan = vi.fn().mockResolvedValue({ ok: true, value: { topic: 'RAG' } })
      ctx.provide('remote', { academicResearch: { runStream: remoteRun, plan: remotePlan } })
      ctx.provide('remote.academicResearch', { runStream: remoteRun, plan: remotePlan })
      ctx.provide('locale', new LocaleRuntime(ctx))
      const slots = ctx.get('slots') as SlotRegistry
      const fiber = ctx.plugin({ inject, apply })
      await fiber.await()
      expect(slots.entries('sidebar.footer.action')).toHaveLength(0)
      const disposeOwner = slots.register({ name: 'root', children: {
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
      } } as never, () => null)
      expect(slots.entries('sidebar.footer.action')).toHaveLength(1)
      expect(slots.entries('sidebar.footer.action')[0]!.locale).toBe('academicRun')
      const face = (slots.entries('sidebar.footer.action')[0]!.inject as unknown as () => ResearchEntryInjected)()
      const request = { sessionId: sampleRun().sessionId, researchBriefId: sampleRun().retrievalRun.researchBriefId, synthetic: false }
      const signal = new AbortController().signal
      expect(await collect(face.runStream(request, signal))).toEqual([{ type: 'result', retrievalRunId: sampleRun().retrievalRun.retrievalRunId, value: sampleRun() }])
      expect(remoteRun).toHaveBeenCalledWith(request, signal)
      await expect(face.plan(request.sessionId)).resolves.toEqual({ topic: 'RAG' })
      expect(remotePlan).toHaveBeenCalledWith(request.sessionId)
      const failure = new Error('server denied')
      remotePlan.mockResolvedValueOnce({ ok: false, error: failure })
      await expect(face.plan(request.sessionId)).rejects.toBe(failure)
      remoteRun.mockImplementationOnce(async function* () { throw failure })
      await expect(collect(face.runStream(request, signal))).rejects.toBe(failure)
      disposeOwner()
      expect(slots.entries('sidebar.footer.action')).toHaveLength(0)
      slots.register({ name: 'root', children: {
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
      } } as never, () => null)
      expect(slots.entries('sidebar.footer.action')).toHaveLength(1)
      await fiber.dispose()
      expect(slots.entries('sidebar.footer.action')).toHaveLength(0)
    } finally { await ctx.fiber.dispose() }
  })
})
