/** Validate structured Academic plans at native and PTC tool dispatch before review. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import { validateAcademicPlan } from './research-brief-plan.ts'

/** Controller-owned plan review guard. */
export const name = 'academic-plan-validation'
/** The guard observes the shared tool dispatcher. */
export const inject = ['tools']

/**
 * Reject unsupported structured plans without modifying their content or approval state.
 * @param ctx Controller child scope, disposed with its owner.
 */
export function apply(ctx: Context): void {
  ctx.on('tools/execute', async (exec, next) => {
    if (exec.name === 'exit_plan_mode') {
      const args = exec.arguments as { readonly plan?: unknown } | null
      if (typeof args?.plan === 'string' && args.plan.includes('academic-research-brief-json')) {
        validateAcademicPlan(args.plan)
      }
    }
    return next()
  })
}
