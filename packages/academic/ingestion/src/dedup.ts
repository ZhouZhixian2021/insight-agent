/**
 * Deduplication key derivation. Exact keys come from an external identifier's deduplication
 * key; the fuzzy key folds title, first author, and year for suspected-duplicate detection
 * only — a fuzzy collision is reported, never auto-merged.
 * @module @deepseek-ai/dsh-academic-ingestion/dedup
 */

import { externalIdentifierDedupKey } from '@deepseek-ai/dsh-academic-model'
import type { AcademicWork, Availability, PartialDate } from '@deepseek-ai/dsh-academic-model'

import type { WorkDedupKeys } from './types.ts'

/**
 * Derives the exact and fuzzy deduplication keys for one work.
 *
 * @param work - the provider-normalized work to key.
 * @returns exact external-identifier keys and an optional fuzzy title/author/year key.
 */
export function dedupKeys(work: AcademicWork): WorkDedupKeys {
  const exact = work.externalIdentifiers.map(externalIdentifierDedupKey)
  return { exact, fuzzy: fuzzyKey(work) }
}

/** Build the fuzzy key, or `null` when the work has no title to match on. */
function fuzzyKey(work: AcademicWork): string | null {
  const title = normalizeToken(work.title)
  if (title === '') return null
  const author = normalizeToken(work.authors[0] ?? '')
  return `${title}|${author}|${yearFrom(work.firstPublicDate)}`
}

/** The four-digit year of an available date, else the empty string. */
function yearFrom(date: Availability<PartialDate>): string {
  return date.status === 'available' ? date.value.iso.slice(0, 4) : ''
}

/** Lowercase, drop punctuation, and collapse whitespace for comparison. */
function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}
