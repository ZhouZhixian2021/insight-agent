/** Academic research viewer registered through the Session header action row. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { ResearchEntry, type ResearchEntryInjected } from './ResearchEntry.tsx'
import { projectEnhancement } from './enhancement-history.ts'
import { zh, en, type RunKey } from './run-locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Academic research run viewer controls and status labels. */
    academicRun: RunKey
  }
}

/** Services owned by existing client infrastructure. */
export const inject = ['slots', 'locale', 'remote', 'remote.academicResearch', 'remote.session']

/**
 * Register localized viewer controls once the Session header has declared its action slot.
 * @param ctx Client plugin context; effects are removed with the plugin fiber.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('academicRun', { zh, en }), 'academicRun: locale')
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: 'academic-research', order: 100, locale: 'academicRun',
    inject: (): ResearchEntryInjected => ({
      enhanceEvidence: async (request, signal) => {
        const result = await ctx.remote.academicResearch.enhanceEvidence(request, signal)
        if (!result.ok) throw result.error
        return result.value
      },
      enhancementHistory: async (key, signal) => {
        const lifetime = new AbortController()
        const reading = AbortSignal.any([signal, lifetime.signal])
        const address = { kind: 'session' as const, sessionId: key.sessionId }
        try {
          for await (const frame of ctx.remote.session.follow({ address }, reading)) {
            if (frame.type !== 'snapshot') continue
            if (frame.header.id !== key.sessionId) throw new Error('Enhancement Session mismatch')
            const entries = [...frame.records]
            let hasMore = frame.hasMore
            while (hasMore) {
              const beforeSeq = entries[0]?.event.seq
              if (beforeSeq === undefined) throw new Error('Incomplete enhancement journal')
              const page = await ctx.remote.session.page({ address, throughSeq: frame.cursor, beforeSeq }, reading)
              if (!page.ok) throw page.error
              if (page.value.records.length === 0 || (page.value.records[0]?.event.seq ?? beforeSeq) >= beforeSeq) {
                throw new Error('Enhancement history did not advance')
              }
              entries.unshift(...page.value.records); hasMore = page.value.hasMore
            }
            return projectEnhancement(entries, key)
          }
          throw new Error('Enhancement journal snapshot unavailable')
        } finally { lifetime.abort() }
      },
      plan: async (sessionId) => {
        const result = await ctx.remote.academicResearch.plan(sessionId)
        if (!result.ok) throw result.error
        return result.value
      },
      startBackgroundRun: async (request, signal) => {
        const result = await ctx.remote.academicResearch.startBackgroundRun(request, signal)
        if (!result.ok) throw result.error
        return result.value
      },
      listBackgroundRuns: async (sessionId) => {
        const result = await ctx.remote.academicResearch.listBackgroundRuns(sessionId)
        if (!result.ok) throw result.error
        return result.value
      },
      getBackgroundRun: async (key) => {
        const result = await ctx.remote.academicResearch.getBackgroundRun(key)
        if (!result.ok) throw result.error
        return result.value
      },
      watchBackgroundRun: (key, signal) => ctx.remote.academicResearch.watchBackgroundRun(key, signal),
      cancelBackgroundRun: async (request) => {
        const result = await ctx.remote.academicResearch.cancelBackgroundRun(request)
        if (!result.ok) throw result.error
        return result.value
      },
    }),
  }, ResearchEntry))
}
