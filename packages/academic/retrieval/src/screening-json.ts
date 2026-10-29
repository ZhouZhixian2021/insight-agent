/** JSON field readers shared by the two candidate screening parsers. */
import type { CandidateMetadataQuote } from '@deepseek-ai/dsh-academic-model'

/** One parser's diagnostic label bound to the shared readers. */
export interface ScreeningJsonReaders {
  /** Accept only an object whose fields are all named. */
  readonly object: (value: unknown, keys: readonly string[]) => Record<string, unknown>
  readonly array: (value: unknown) => unknown[]
  readonly nonempty: (value: unknown) => string
  /** Accept a title or abstract passage with non-empty text. */
  readonly quote: (value: unknown) => CandidateMetadataQuote
  readonly invalid: (message: string) => never
}

/**
 * Bind the readers to one parser's diagnostic label so both parsers report their own name.
 * @param label Prefix of every diagnostic this parser raises.
 * @returns Readers that throw `RangeError` with the supplied label.
 */
export function screeningJsonReaders(label: string): ScreeningJsonReaders {
  function invalid(message: string): never { throw new RangeError(`${label}: ${message}`) }
  function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid('expected object')
    if (Object.keys(value).some(key => !keys.includes(key))) invalid('unexpected field')
    return value as Record<string, unknown>
  }
  function array(value: unknown): unknown[] {
    if (!Array.isArray(value)) invalid('expected array')
    return value
  }
  function nonempty(value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '') invalid('expected non-empty string')
    return value
  }
  function quote(value: unknown): CandidateMetadataQuote {
    const item = object(value, ['source', 'text'])
    if (item.source !== 'title' && item.source !== 'abstract') invalid('quote source must be title or abstract')
    return { source: item.source, text: nonempty(item.text) }
  }
  return { object, array, nonempty, quote, invalid }
}
