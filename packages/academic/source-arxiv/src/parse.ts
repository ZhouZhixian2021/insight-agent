/**
 * Parses the arXiv Atom search feed into distilled entries and the upstream match
 * count. The wire shape is provider-private; this module turns the
 * single-object-or-array and attribute shapes the parser emits into a uniform
 * entry list and a safe-integer `totalResults`.
 * @module @deepseek-ai/dsh-academic-source-arxiv/parse
 */

import { XMLParser } from 'fast-xml-parser'

import type { ArxivFeedResult, ArxivRawWork } from './types.ts'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
})

/** Parsed Atom shapes consumed by {@link parseArxivFeed}. */
interface ParsedAuthor {
  readonly name?: string
}

/** One parsed arXiv Atom entry after namespace removal. */
interface ParsedEntry {
  readonly id?: string
  readonly title?: string | { readonly '#text'?: string }
  readonly published?: string
  readonly updated?: string
  readonly author?: ParsedAuthor | ParsedAuthor[]
  readonly doi?: string | { readonly '#text'?: string }
}

/** `<opensearch:totalResults>` after namespace removal: scalar, or an object when it carries attributes. */
type ParsedTotalResults = number | string | { readonly '#text'?: number | string }

/** Top-level Atom feed envelope. */
interface ParsedFeed {
  readonly feed?: {
    readonly totalResults?: ParsedTotalResults
    readonly entry?: ParsedEntry | ParsedEntry[]
  }
}

/**
 * Parses an arXiv Atom search response into distilled entries and the feed's
 * `<opensearch:totalResults>` match count, normalizing the single-object-or-array
 * entry/author shapes.
 *
 * @param xml - the Atom feed body returned by the arXiv API.
 * @returns the distilled entries and the upstream match count.
 */
export function parseArxivFeed(xml: string): ArxivFeedResult {
  const parsed = parser.parse(xml) as ParsedFeed
  const raw = parsed.feed?.entry
  const entries = (raw === undefined ? [] : Array.isArray(raw) ? raw : [raw])
    .map(mapEntry)
    .filter((entry): entry is ArxivRawWork => entry.id.length > 0)
  return { entries, totalResults: totalResultsOf(parsed.feed?.totalResults) }
}

/** Maps one parsed entry to its distilled form. */
function mapEntry(entry: ParsedEntry): ArxivRawWork {
  const authors = entry.author === undefined
    ? []
    : Array.isArray(entry.author) ? entry.author : [entry.author]
  return {
    id: entry.id ?? '',
    title: textOf(entry.title) ?? '',
    authors: authors.map(author => author.name).filter((name): name is string => (name ?? '').trim().length > 0),
    published: entry.published ?? null,
    updated: entry.updated ?? null,
    doi: textOf(entry.doi),
  }
}

/** Read `<opensearch:totalResults>` as a safe non-negative integer; absent or malformed input yields null. */
function totalResultsOf(value: ParsedTotalResults | undefined): number | null {
  const raw = typeof value === 'object' ? value['#text'] : value
  const count = typeof raw === 'number' ? raw
    : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN
  return Number.isSafeInteger(count) && count >= 0 ? count : null
}

/** Extracts the text of a scalar-or-object element value. */
function textOf(value: string | { readonly '#text'?: string } | undefined): string | null {
  if (typeof value === 'string') return value
  if (value === undefined) return null
  return value['#text'] ?? null
}
