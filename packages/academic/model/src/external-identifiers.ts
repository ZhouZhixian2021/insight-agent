import { brandString } from '@deepseek-ai/dsh-brand'

import type { ExternalIdentifier, ExternalIdentifierDedupKey } from './types.ts'

/**
 * Creates the exact deduplication key for a normalized external identifier.
 *
 * The caller owns normalization. This helper does not fold case, remove URL
 * prefixes, or otherwise reinterpret provider data.
 *
 * @param identifier - External identifier with an admitted normalized value.
 * @returns A collision-safe key over `kind` and `normalizedValue`.
 */
export function externalIdentifierDedupKey(
  identifier: Pick<ExternalIdentifier, 'kind' | 'normalizedValue'>,
): ExternalIdentifierDedupKey {
  return brandString<ExternalIdentifierDedupKey>(
    JSON.stringify([identifier.kind, identifier.normalizedValue]),
  )
}
