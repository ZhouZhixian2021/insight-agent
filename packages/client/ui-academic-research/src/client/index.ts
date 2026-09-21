/** Academic research viewer registered through the sidebar extension point. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { ResearchEntry, type ResearchEntryInjected } from './ResearchEntry.tsx'
import { zh, en, type RunKey } from './run-locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Academic research run viewer controls and status labels. */
    academicRun: RunKey
  }
}

/** Services owned by existing client infrastructure. */
export const inject = ['slots', 'locale', 'remote', 'remote.academicResearch']

/**
 * Register localized viewer controls once the sidebar has declared its action slot.
 * @param ctx Client plugin context; effects are removed with the plugin fiber.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('academicRun', { zh, en }), 'academicRun: locale')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'academic-research', order: 100, locale: 'academicRun',
    inject: (): ResearchEntryInjected => ({ plan: async (sessionId) => {
      const result = await ctx.remote.academicResearch.plan(sessionId)
      if (!result.ok) throw result.error
      return result.value
    }, run: async (request, signal) => {
      const result = await ctx.remote.academicResearch.run(request, signal)
      if (!result.ok) throw result.error
      return result.value
    } }),
  }, ResearchEntry))
}
