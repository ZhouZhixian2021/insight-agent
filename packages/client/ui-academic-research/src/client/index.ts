/** Academic fixed-data viewer registered through the sidebar extension point. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { ResearchEntry } from './ResearchEntry.tsx'
import { zh, en, type RunKey } from './run-locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Fixed-data research run viewer controls and status labels. */
    academicRun: RunKey
  }
}

/** Services owned by existing client infrastructure. */
export const inject = ['slots', 'locale']

/**
 * Register localized viewer controls once the sidebar has declared its action slot.
 * @param ctx Client plugin context; effects are removed with the plugin fiber.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('academicRun', { zh, en }), 'academicRun: locale')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'academic-research', order: 100, locale: 'academicRun',
  }, ResearchEntry))
}
