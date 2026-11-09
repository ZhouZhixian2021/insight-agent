/** Partial processing preserves successful records alongside observed failures. */
import type { ProductBatchResult, ProductFailure } from './types.ts'

/**
 * Classify one settled operation from its actual items and failures.
 * @param items - Successful records, possibly empty after a valid empty search.
 * @param failures - Failures observed during the same operation.
 * @returns A result with copied collections and no inferred items or failures.
 */
export function createProductBatchResult<T>(
  items: readonly T[], failures: readonly ProductFailure[],
): ProductBatchResult<T> {
  return {
    schemaVersion: 1,
    status: failures.length === 0 ? 'success' : items.length === 0 ? 'failed' : 'partial_success',
    items: [...items],
    failures: [...failures],
  }
}
