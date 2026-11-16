/** Stable focus vocabulary the user confirms before a plan is written. */
import type { ProductFocusCategoryId } from './types.ts'

/**
 * Every focus category a plan may constrain. Ids travel in the plan JSON and
 * in stored plans; the preset owns the user-facing labels and matches this
 * list, so a plan never invents a category the workflow cannot name.
 */
export const PRODUCT_FOCUS_CATEGORY_IDS: readonly ProductFocusCategoryId[] = [
  'performance',
  'comparison',
  'commercial',
  'availability',
  'ecosystem',
  'usage',
  'support',
  'risk',
]

/**
 * Recognize one stored focus id.
 * @param value - Candidate value from a parsed plan block.
 * @returns Whether the value is a known focus category id.
 */
export function isProductFocusCategoryId(value: unknown): value is ProductFocusCategoryId {
  return typeof value === 'string'
    && (PRODUCT_FOCUS_CATEGORY_IDS as readonly string[]).includes(value)
}
