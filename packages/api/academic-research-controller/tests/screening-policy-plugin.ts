/** Synthetic current-policy flow sharing the hybrid fixture services. */
import type { Context } from '@deepseek-ai/cordis'
import { applyHybridFixture } from './hybrid-search-plugin.ts'

export const name = 'academic-screening-policy-fixture'
export const inject = ['tools', 'academicSource', 'web']

/** Register the fixture that reports the current priority thresholds.
 * @param ctx Loader-owned fixture context.
 */
export function apply(ctx: Context): void {
  applyHybridFixture(ctx, true)
}
