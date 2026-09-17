/** CVF Open Access conference-page parsing. */
import { academicCatalogHtmlText, type AcademicCatalogRecord } from '@deepseek-ai/dsh-academic-source'

const ENTRY = /<dt\b[^>]*class=["'][^"']*\bptitle\b[^"']*["'][^>]*>([\s\S]*?)<\/dt>([\s\S]*?)(?=<dt\b|$)/giu
const LINK = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/iu
const DETAIL = /<dd\b[^>]*>([\s\S]*?)<\/dd>/giu

/**
 * Parse one CVF conference catalog page.
 * @param html - official CVF conference-page HTML.
 * @param catalogUrl - final catalog URL used to resolve relative paper links.
 * @returns distilled published-paper records.
 */
export function parseCvfCatalog(html: string, catalogUrl: URL): readonly AcademicCatalogRecord[] {
  const records: AcademicCatalogRecord[] = []
  for (const entry of html.matchAll(ENTRY)) {
    const link = (entry[1] as string).match(LINK)
    if (link === null) continue
    const details = [...(entry[2] as string).matchAll(DETAIL)].map(match => academicCatalogHtmlText(match[1] as string))
    const title = academicCatalogHtmlText(link[2] as string)
    if (title.length === 0) continue
    const venue = details[1] ?? null
    records.push({
      recordId: new URL(link[1] as string, catalogUrl).href,
      title,
      authors: (details[0] ?? '').split(',').map(author => author.trim()).filter(Boolean),
      year: venue?.match(/\b(?:19|20)\d{2}\b/u)?.[0] ?? null,
      venue,
      doi: null,
    })
  }
  return records
}
