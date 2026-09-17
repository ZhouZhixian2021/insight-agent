/** PMLR volume-page parsing. */
import { academicCatalogHtmlText, type AcademicCatalogRecord } from '@deepseek-ai/dsh-academic-source'

const PAPER = /<div\b[^>]*class=["'][^"']*\bpaper\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/giu
const TITLE = /<p\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/iu
const DETAILS = /<p\b[^>]*class=["'][^"']*\bdetails\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/iu
const ABSTRACT = /<a\b[^>]*href=["']([^"']+\.html)["'][^>]*>\s*abs\s*<\/a>/iu

/**
 * Parse one official PMLR volume page.
 * @param html - official PMLR volume HTML.
 * @param catalogUrl - volume URL used to resolve abstract links.
 * @returns distilled published-paper records.
 */
export function parsePmlrCatalog(html: string, catalogUrl: URL): readonly AcademicCatalogRecord[] {
  const heading = academicCatalogHtmlText(html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/iu)?.[1] ?? '')
  const year = heading.match(/\b(?:19|20)\d{2}\b/u)?.[0] ?? null
  const records: AcademicCatalogRecord[] = []
  for (const match of html.matchAll(PAPER)) {
    const block = match[1] as string
    const title = academicCatalogHtmlText(block.match(TITLE)?.[1] ?? '')
    const href = block.match(ABSTRACT)?.[1]
    if (title.length === 0 || href === undefined) continue
    const details = academicCatalogHtmlText(block.match(DETAILS)?.[1] ?? '')
    const [authorText = '', publicationText = ''] = details.split(';', 2)
    const landing = new URL(href, catalogUrl)
    records.push({
      recordId: landing.pathname.replace(/^\//u, '').replace(/\.html$/u, ''),
      title,
      authors: authorText.split(',').map(author => author.trim()).filter(Boolean),
      year,
      venue: publicationText.split(/,\s*PMLR\b/iu, 1)[0]?.trim() || null,
      doi: null,
    })
  }
  return records
}
