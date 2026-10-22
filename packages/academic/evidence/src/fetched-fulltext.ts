/**
 * HTML full-text preparation for raw `ctx.web.fetch()` results: validates completeness,
 * derives section-aware paragraphs, and binds the normalized content to one SHA-256.
 * @module @deepseek-ai/dsh-academic-evidence/fetched-fulltext
 */

import { createHash } from 'node:crypto'

import { EvidenceError } from './types.ts'
import type {
  EvidenceContentSegment,
  EvidenceExtractionInput,
  FetchedAcademicFullTextInput,
} from './types.ts'

const ARTICLE = /<article\b[^>]*>([\s\S]*?)<\/article\s*>/iu
const BLOCK = /<(h[1-6]|p)\b([^>]*)>([\s\S]*?)<\/\1\s*>/giu
const NON_CONTENT = /<(script|style|noscript|template|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/giu
const BODY_SECTION = new RegExp(
  '^(?:(?:\\d+(?:\\.\\d+)*|[ivxlcdm]+)[.)]?\\s*)?'
  + '(?:(?:introduction|background|related work|methods?|materials(?: and methods)?|methodology|experiments?'
  + '|evaluation|results?|discussion|conclusions?|limitations?|references)\\b'
  + '|(?:引言|背景|相关工作|方法|材料与方法|实验|评估|结果|讨论|结论|局限|参考文献)(?:$|[\\s:：]))',
  'iu',
)

/**
 * Converts a complete academic HTML fetch into input for `extractEvidenceFromContent()`.
 * Only a 2xx, untruncated HTML response with an `<article>` and at least one populated
 * academic body section is accepted. Text/PDF handling remains a separate path.
 *
 * @param input - paper identity, provenance, extraction settings, and raw fetch result.
 * @returns section-aware paragraph segments, the final URL, and a hash of the fetched article.
 * @throws {EvidenceError} when the response is failed, partial, non-HTML, or not identifiable as full text.
 */
export function prepareFetchedAcademicFullText(input: FetchedAcademicFullTextInput): EvidenceExtractionInput {
  const { fetched } = input
  if (fetched.statusCode < 200 || fetched.statusCode >= 300) {
    invalid(`academic full-text fetch returned HTTP ${fetched.statusCode}`, 'EVIDENCE_FETCH_STATUS')
  }
  if (fetched.truncated) invalid('academic full-text fetch was truncated', 'EVIDENCE_FETCH_TRUNCATED')
  if (fetched.body.kind !== 'html') {
    invalid('academic full-text preparation currently accepts HTML only', 'EVIDENCE_FETCH_BODY_UNSUPPORTED')
  }

  const article = fetched.body.content.match(ARTICLE)?.[1]
  if (article === undefined) unconfirmed()
  const normalizedArticle = article.replace(NON_CONTENT, '')
  const segments: EvidenceContentSegment[] = []
  let sectionTitle: string | null = null
  let paragraphNumber = 0
  let populatedBodySection = false
  let inBodySection = false

  // ponytail: this semantic-tag subset covers HTML papers; use a DOM parser when publisher fixtures require non-semantic layouts.
  for (const match of normalizedArticle.matchAll(BLOCK)) {
    const tag = (match[1] as string).toLowerCase()
    const attributes = match[2] as string
    if (hidden(attributes)) continue
    const text = htmlText(match[3] as string)
    if (text.length === 0) continue
    if (tag !== 'p') {
      sectionTitle = text
      inBodySection = BODY_SECTION.test(text)
      continue
    }
    paragraphNumber += 1
    if (inBodySection) populatedBodySection = true
    segments.push({
      text,
      locator: { kind: 'paragraph', sectionTitle, paragraphNumber },
    })
  }

  if (!populatedBodySection || segments.length === 0) unconfirmed()
  const contentHash = `sha256:${createHash('sha256').update(normalizedArticle).digest('hex')}`
  const { fetched: _, ...provenance } = input
  return {
    ...provenance,
    sourceUrl: fetched.url,
    contentHash,
    segments,
  }
}

function hidden(attributes: string): boolean {
  return /(?:^|\s)hidden(?:\s|=|$)/iu.test(attributes)
    || /\baria-hidden\s*=\s*["']?true(?:["'\s]|$)/iu.test(attributes)
    || /\bstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))/iu.test(attributes)
}

function htmlText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/giu, ' ')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<[^>]+>/gu, '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/\s+/gu, ' ')
    .trim()
}

function unconfirmed(): never {
  return invalid(
    'fetched page does not expose identifiable academic full text',
    'EVIDENCE_FULLTEXT_UNCONFIRMED',
  )
}

function invalid(message: string, code: string): never {
  throw new EvidenceError(message, code)
}
