/** Slot lifecycle: registration waits for its owner and unwinds on plugin disposal. */
import { Context } from '@deepseek-ai/cordis'
import { describe, it, expect, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import type { ResearchEntryInjected } from '../src/client/ResearchEntry.tsx'
import { sampleRun } from './run-sample.ts'
import { apply as hostApply } from '../src/index.ts'

describe('academic sidebar registration', () => {
  it('waits for the sidebar declaration and removes its entry on disposal', async () => {
    expect(hostApply).not.toThrow()
    const ctx = new Context()
    try {
      await ctx.plugin(SlotRegistry).await()
      const remoteRun = vi.fn().mockResolvedValue({ ok: true, value: sampleRun() })
      const remotePlan = vi.fn().mockResolvedValue({ ok: true, value: { topic: 'RAG' } })
      ctx.provide('remote', { academicResearch: { run: remoteRun, plan: remotePlan } })
      ctx.provide('remote.academicResearch', { run: remoteRun, plan: remotePlan })
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
      await expect(face.run(request, signal)).resolves.toEqual(sampleRun())
      expect(remoteRun).toHaveBeenCalledWith(request, signal)
      await expect(face.plan(request.sessionId)).resolves.toEqual({ topic: 'RAG' })
      expect(remotePlan).toHaveBeenCalledWith(request.sessionId)
      const failure = new Error('server denied')
      remotePlan.mockResolvedValueOnce({ ok: false, error: failure })
      await expect(face.plan(request.sessionId)).rejects.toBe(failure)
      remoteRun.mockResolvedValueOnce({ ok: false, error: failure })
      await expect(face.run(request, signal)).rejects.toBe(failure)
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
