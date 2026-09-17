/** Slot lifecycle: registration waits for its owner and unwinds on plugin disposal. */
import { Context } from '@deepseek-ai/cordis'
import { describe, it, expect } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'

describe('academic sidebar registration', () => {
  it('waits for the sidebar declaration and removes its entry on disposal', async () => {
    expect(hostApply).not.toThrow()
    const ctx = new Context()
    try {
      await ctx.plugin(SlotRegistry).await()
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
