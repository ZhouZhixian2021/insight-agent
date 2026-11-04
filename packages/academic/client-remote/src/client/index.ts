/** Mount Academic methods through the shared Remote transport. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import academicResearchRemote from '@deepseek-ai/dsh-api-academic-research-controller/remote'

export type {} from '@deepseek-ai/dsh-api-academic-research-controller/remote'

/** The transport exists before this business namespace is mounted. */
export const inject = ['remote']

/**
 * Register the generated Academic namespace for this plugin's lifetime.
 * @param ctx - Client context carrying the shared Remote transport.
 * @returns Disposer for the Academic namespace.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  return ctx.remote.$mount(academicResearchRemote)
}
