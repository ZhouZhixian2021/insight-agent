/** Pure comparison context for SDK runtime text that embeds a JSON-quoted cwd. */

import type { NormalizeContext } from './normalize.ts'

/**
 * Add the known cwd's single JSON-encoded spelling without changing run inputs.
 * The SDK adapter owns scenario, profile, and replay selection. Other path
 * spellings and additional JSON layers remain outside this alias.
 * @param context - Captured volatile values and any known filesystem aliases.
 * @returns The comparison context with at most one additional encoded alias.
 */
export function withSdkJsonCwdAlias(context: NormalizeContext): NormalizeContext {
  const encoded = JSON.stringify(context.cwd).slice(1, -1)
  if (encoded === context.cwd || context.cwdAliases?.includes(encoded)) return context
  return { ...context, cwdAliases: [...context.cwdAliases ?? [], encoded] }
}
