/** Academic research cards in the standard Chat transcript. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { ResearchEntryInjected } from './ResearchEntry.tsx'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { academicChatDefinition } from './chat-definition.ts'
import { AcademicChatCard } from './AcademicChatCard.tsx'
import { projectEnhancement } from './enhancement-history.ts'
import { zh, en, type RunKey } from './run-locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Academic research run viewer controls and status labels. */
    academicRun: RunKey
  }
}

/** Existing client services plus the standard Conversation extension point. */
export const inject = ['slots', 'locale', 'remote', 'remote.academicResearch', 'remote.session', 'uiConversation']

/**
 * Install approved-plan research cards directly into the Chat transcript.
 * @param ctx Client context; registrations are disposed with the plugin.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('academicRun', { zh, en }), 'academicRun: locale')
  ctx.effect(() => ctx.uiConversation.events.register(academicChatDefinition), 'academicRun: chat definition')
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node', key: 'academic-research', locale: 'academicRun',
    inject: (): ResearchEntryInjected => researchRemote(ctx),
  }, AcademicChatCard))
}

/** Bind research requests to the existing Remote and observation lifecycle. */
function researchRemote(ctx: Context): ResearchEntryInjected {
  return {
    traceList: async (query, signal) => {
      const result = await ctx.remote.academicResearch.traceList(query, signal)
      if (!result.ok) throw result.error
      return result.value
    },
    traceDetail: async (query, signal) => {
      const result = await ctx.remote.academicResearch.traceDetail(query, signal)
      if (!result.ok) throw result.error
      return result.value
    },
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
    watchBackgroundRun: async function* (key, signal) {
      signal.throwIfAborted()
      const stream = ctx.remote.$stream({
        name: 'Academic research observation',
        open: generation => ctx.remote.academicResearch.watchBackgroundRun(key, AbortSignal.any([signal, generation])),
        // The component owns the localized explanation for an unclosed observation.
        ended: () => new Error(),
      })
      const abort = () => { void stream.dispose() }
      signal.addEventListener('abort', abort, { once: true })
      try {
        for await (const item of stream) {
          yield item.value
          item.accept()
          if (item.value.state !== 'running') return
        }
      } finally {
        signal.removeEventListener('abort', abort)
        await stream.dispose()
      }
    },
    cancelBackgroundRun: async (request) => {
      const result = await ctx.remote.academicResearch.cancelBackgroundRun(request)
      if (!result.ok) throw result.error
      return result.value
    },
  }
}
