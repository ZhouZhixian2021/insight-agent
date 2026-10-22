/** ACL Anthology volume-page parsing. */
import { academicCatalogHtmlText, type AcademicCatalogRecord } from '@deepseek-ai/dsh-academic-source'

// oxlint-disable-next-line @stylistic/max-len -- splitting this URL-and-id regex obscures its capture groups.
const PAPER_LINK = /<a\b[^>]*href=(?:["']?)(?:https?:\/\/aclanthology\.org)?\/((?:\d{4}\.[a-z0-9]+-[a-z0-9]+(?:\.[a-z0-9-]+)+|[A-Z]\d{2}-\d{4}(?:v\d+)?))\/?(?:["']?)(?=[\s>])[^>]*>([\s\S]*?)<\/a>/giu

/**
 * Parse paper-title links from one official ACL Anthology volume page.
 * @param html - official ACL Anthology HTML.
 * @returns distilled published-paper records.
 */
export function parseAclCatalog(html: string): readonly AcademicCatalogRecord[] {
  const records: AcademicCatalogRecord[] = []
  for (const match of html.matchAll(PAPER_LINK)) {
    const recordId = match[1] as string
    const title = academicCatalogHtmlText(match[2] as string)
    if (title.length === 0) continue
    const year = recordId.match(/^\d{4}/u)?.[0] ?? null
    const venueId = recordId.match(/^\d{4}\.([a-z0-9]+)-/u)?.[1]
    records.push({
      recordId,
      title,
      authors: [],
      year,
      venue: venueId === undefined ? 'ACL Anthology' : venueId.toUpperCase(),
      doi: `10.18653/v1/${recordId}`,
    })
  }
  return records
}
