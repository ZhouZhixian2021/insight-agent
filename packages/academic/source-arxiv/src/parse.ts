/**
 * Parses the arXiv Atom search feed into distilled entries. The wire shape is provider-private;
 * this module turns the single-object-or-array and attribute shapes the parser emits into a
 * uniform entry list.
 * @module @deepseek-ai/dsh-academic-source-arxiv/parse
 */

import { XMLParser } from 'fast-xml-parser'

import type { ArxivRawWork } from './types.ts'

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
  readonly author?: ParsedAuthor | ParsedAuthor[]
  readonly doi?: string | { readonly '#text'?: string }
}

/** Top-level Atom feed envelope. */
interface ParsedFeed {
  readonly feed?: {
    readonly entry?: ParsedEntry | ParsedEntry[]
  }
}

/**
 * Parses an arXiv Atom search response into distilled entries, normalizing the
 * single-object-or-array entry/author shapes.
 *
 * @param xml - the Atom feed body returned by the arXiv API.
 * @returns the distilled entries, possibly empty.
 */
export function parseArxivFeed(xml: string): ArxivRawWork[] {
  const parsed = parser.parse(xml) as ParsedFeed
  const raw = parsed.feed?.entry
  const entries = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]
  return entries.map(mapEntry).filter((entry): entry is ArxivRawWork => entry.id.length > 0)
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
    doi: textOf(entry.doi),
  }
}

/** Extracts the text of a scalar-or-object element value. */
function textOf(value: string | { readonly '#text'?: string } | undefined): string | null {
  if (typeof value === 'string') return value
  if (value === undefined) return null
  return value['#text'] ?? null
}
