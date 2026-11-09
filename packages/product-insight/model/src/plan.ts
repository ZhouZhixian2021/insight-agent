/** Only the approval of the exact current version authorizes execution. */
import type { ExecutableProductPlan, ProductPlan } from './types.ts'

/**
 * Check whether an investigation plan's current version has explicit approval.
 * @param plan - Plan version about to be executed.
 * @returns Whether the stored approval names this exact version.
 */
export function isExecutableProductPlan(plan: ProductPlan): plan is ExecutableProductPlan {
  return plan.approval.status === 'approved' && plan.approval.approvedPlanVersion === plan.version
}
