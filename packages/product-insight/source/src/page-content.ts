/** Product-page content preparation and exact, source-bound evidence extraction. */
import { createHash } from 'node:crypto'
import { addAbortListener } from 'node:events'

import { createProductEvidenceId, type AvailableSourceSnapshot, type CandidatePage,
  type ProductEvidence, type ProductQuestionId, type ProductSourceLocator } from '@deepseek-ai/dsh-product-insight-model'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { defaultTreeAdapter, parse, type DefaultTreeAdapterTypes } from 'parse5'

/** Maximum canonical text sent in one product evidence model request. */
export const PRODUCT_PAGE_FRAGMENT_CHARACTERS = 12_000
/** Repeated context sufficient to contain an excerpt of at most 1,500 characters across a window edge. */
export const PRODUCT_PAGE_FRAGMENT_OVERLAP_CHARACTERS = 1_499

/** A contiguous source window with UTF-16 offsets in the complete saved page. */
export interface ProductPageFragment {
  readonly start: number
  readonly end: number
  readonly text: string
}

/**
 * Partition saved text into ordered model windows without splitting a surrogate pair.
 * @param text - Complete canonical page text retained under its source hash.
 * @param overlapCharacters - Repeated characters at each window edge; absent means legacy contiguous windows.
 * @returns Bounded fragments whose ranges cover the original text.
 */
export function splitProductPageText(text: string, overlapCharacters = 0): readonly ProductPageFragment[] {
  if (!Number.isSafeInteger(overlapCharacters) || overlapCharacters < 0
    || overlapCharacters > PRODUCT_PAGE_FRAGMENT_OVERLAP_CHARACTERS) {
    throw new RangeError('Product page fragment overlap must be between 0 and 1499 characters')
  }
  return splitText(text, PRODUCT_PAGE_FRAGMENT_CHARACTERS, overlapCharacters)
}

const questionWords = new Intl.Segmenter(undefined, { granularity: 'word' })
const commonQuestionWord = /^(a|an|and|are|can|do|does|for|how|in|is|it|of|on|the|to|what|when|where|which|的|了|是|有|吗|什么|如何|多少|是否)$/u

/** Select the terms of an approved question used to locate text or refine a follow-up search. */
export function productQuestionTerms(question: string): ReadonlySet<string> {
  return new Set([...questionWords.segment(question.toLowerCase())]
    .filter(word => word.isWordLike && !commonQuestionWord.test(word.segment)).map(word => word.segment))
}

function fragmentScore(text: string, terms: ReadonlySet<string>): number {
  const lower = text.toLowerCase()
  const words = new Set(lower.match(/[a-z0-9]+/gu))
  let score = 0
  for (const term of terms) {
    const matches = /^[a-z0-9]+$/u.test(term)
      ? words.has(term) || words.has(`${term}s`) || words.has(`${term}es`) : lower.includes(term)
    if (matches) score += term.length
  }
  return score
}

/**
 * Rotate through approved questions, dispatching the strongest unread match for each in turn.
 * @param fragments - Complete page windows in source order.
 * @param questions - Approved questions in dispatch priority order.
 * @returns The original windows in dispatch order, with source-order ties and unmatched windows last.
 */
export function rankProductPageFragments(fragments: readonly ProductPageFragment[], questions: readonly string[]):
readonly ProductPageFragment[] {
  if (fragments.length <= 1 || questions.length === 0) return fragments
  const matches = questions.map(productQuestionTerms).filter(terms => terms.size > 0).map(terms => fragments
    .map(fragment => ({ fragment, score: fragmentScore(fragment.text, terms) }))
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.fragment.start - right.fragment.start))
  const selected = new Set<ProductPageFragment>()
  for (let round = 0; round < fragments.length; round++) {
    const before = selected.size
    for (const candidates of matches) {
      const match = candidates.find(({ fragment }) => !selected.has(fragment))
      if (match !== undefined) selected.add(match.fragment)
    }
    if (selected.size === before || selected.size === fragments.length) break
  }
  return [...selected, ...fragments.filter(fragment => !selected.has(fragment))]
}

/**
 * Rank saved page fragments by distinct approved question terms. Matches only locate text for review.
 * @param text Complete canonical source text.
 * @param question Exact approved question.
 * @returns The strongest matching fragment and its lexical score, or undefined when none matches.
 */
export function selectProductGapFragment(text: string, question: string):
{ readonly fragment: ProductPageFragment; readonly score: number } | undefined {
  const terms = productQuestionTerms(question)
  if (terms.size === 0) return undefined
  let best: { fragment: ProductPageFragment; score: number } | undefined
  for (const fragment of splitText(text, 3_000, PRODUCT_PAGE_FRAGMENT_OVERLAP_CHARACTERS)) {
    const score = fragmentScore(fragment.text, terms)
    if (score > (best?.score ?? 0)) best = { fragment, score }
  }
  return best
}

function splitText(text: string, maximumCharacters: number, overlapCharacters: number): readonly ProductPageFragment[] {
  const fragments: ProductPageFragment[] = []
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + maximumCharacters, text.length)
    const previous = text.charCodeAt(end - 1)
    const next = text.charCodeAt(end)
    if (end < text.length && previous >= 0xd800 && previous <= 0xdbff
      && next >= 0xdc00 && next <= 0xdfff) end -= 1
    fragments.push({ start, end, text: text.slice(start, end) })
    if (end === text.length) break
    start = end - overlapCharacters
    if (start > 0 && text.charCodeAt(start) >= 0xdc00 && text.charCodeAt(start) <= 0xdfff
      && text.charCodeAt(start - 1) >= 0xd800 && text.charCodeAt(start - 1) <= 0xdbff) start -= 1
  }
  return fragments
}

/**
 * Split one failed model window into two smaller windows with enough shared text for a 1,500-unit excerpt.
 * @param fragment - A complete contiguous range in the saved page text.
 * @returns Two bounded child windows, or null when splitting would not reduce a short input.
 */
export function splitFailedProductFragment(fragment: ProductPageFragment):
readonly [ProductPageFragment, ProductPageFragment] | null {
  if (!Number.isSafeInteger(fragment.start) || fragment.start < 0 || !Number.isSafeInteger(fragment.end)
    || fragment.end - fragment.start !== fragment.text.length
    || fragment.text.length > PRODUCT_PAGE_FRAGMENT_CHARACTERS) {
    throw new RangeError('Failed product fragment has invalid source offsets or size')
  }
  if (fragment.text.length < 3_000) return null
  const text = fragment.text
  let middle = Math.floor(text.length / 2)
  if (text.charCodeAt(middle) >= 0xdc00 && text.charCodeAt(middle) <= 0xdfff) middle -= 1
  let leftEnd = middle + 750
  if (text.charCodeAt(leftEnd) >= 0xdc00 && text.charCodeAt(leftEnd) <= 0xdfff) leftEnd += 1
  let rightStart = middle - 749
  if (text.charCodeAt(rightStart) >= 0xdc00 && text.charCodeAt(rightStart) <= 0xdfff) rightStart -= 1
  return [
    { start: fragment.start, end: fragment.start + leftEnd, text: text.slice(0, leftEnd) },
    { start: fragment.start + rightStart, end: fragment.end, text: text.slice(rightStart) },
  ]
}

/** The canonical text saved by the caller. Offsets in evidence refer to this exact string. */
export interface PreparedProductPage {
  readonly url: string
  readonly text: string
  readonly contentHash: string
  readonly sourcePublishedAt?: string
  readonly sourceUpdatedAt?: string
  readonly productVersionLabel?: string
  readonly sourceRegionLabel?: string
  readonly declaredPublisher?: string
}

/** A complete page still exceeds the approved text bound after cleanup. */
export class ProductPageTextLimitError extends RangeError {
  constructor() { super('Product page exceeds the approved text limit') }
}

/**
 * Prepare complete HTML or plain text for source evidence.
 * @param fetched - Completed Web response, including body and truncation status.
 * @param maximumCharacters - Approved bound after optional HTML or Markdown cleanup.
 * @returns Canonical text, its hash, and available HTML scope declarations.
 * @throws {RangeError} If the response is incomplete, unreadable, or still exceeds the bound after preparation.
 */
export function prepareProductPage(fetched: WebFetchResult, maximumCharacters?: number): PreparedProductPage {
  if (fetched.statusCode < 200 || fetched.statusCode >= 300) {
    throw new RangeError(`Product page fetch returned HTTP ${fetched.statusCode}`)
  }
  if (fetched.truncated) throw new RangeError('Product page fetch was truncated')
  let text: string
  let metadata: Omit<PreparedProductPage, 'url' | 'text' | 'contentHash'> = {}
  switch (fetched.body.kind) {
    case 'html':
      metadata = pageMetadata(fetched.body.content)
      text = htmlText(fetched.body.content)
      // Keep the canonical string of pages that already fit, including sources cited by saved evidence.
      if (maximumCharacters !== undefined && text.length > maximumCharacters) {
        text = readableArticleText(fetched.body.content) || text
      }
      break
    case 'text':
      text = fetched.body.content.trim()
      if (maximumCharacters !== undefined && text.length > maximumCharacters && text.includes('](')) {
        text = stripMarkdownDestinations(text)
      }
      break
    case 'pdf': throw new RangeError('Product page PDF extraction requires asynchronous preparation')
    default: return assertNever(fetched.body)
  }
  if (text.length === 0) throw new RangeError('Product page has no readable text')
  if (maximumCharacters !== undefined && text.length > maximumCharacters) {
    throw new ProductPageTextLimitError()
  }
  return { url: fetched.url, text, contentHash: pageTextHash(text), ...metadata }
}

function pageTextHash(text: string): string {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`
}

/** Extract complete PDF text with one form feed per physical page, including empty pages. */
export async function prepareProductPdf(fetched: WebFetchResult, maximumCharacters = 48_000,
  signal?: AbortSignal): Promise<PreparedProductPage> {
  if (fetched.statusCode < 200 || fetched.statusCode >= 300 || fetched.truncated || fetched.body.kind !== 'pdf') {
    throw new RangeError('Product PDF requires a complete successful PDF response')
  }
  if (fetched.body.content.byteLength > 16 * 1024 * 1024) throw new RangeError('Product PDF exceeds the byte limit')
  const { getDocument, VerbosityLevel } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  signal?.throwIfAborted()
  const loading = getDocument({ data: new Uint8Array(fetched.body.content), stopAtErrors: true, verbosity: VerbosityLevel.ERRORS })
  let closing: Promise<void> | undefined
  const close = () => closing ??= loading.destroy()
  const listener = signal === undefined ? undefined : addAbortListener(signal, () => { void close().catch(() => {}) })
  try {
    const document = await loading.promise
    if (document.numPages > 200) throw new RangeError('Product PDF exceeds the page limit')
    const pages: string[] = []
    let length = 0
    for (let number = 1; number <= document.numPages; number++) {
      signal?.throwIfAborted()
      const page = await document.getPage(number)
      const { items } = await page.getTextContent()
      const text = items.flatMap(item => 'str' in item ? [item.str] : []).join(' ').replace(/\s+/gu, ' ').trim()
      length += text.length + 1
      if (length > maximumCharacters) throw new RangeError('Product page exceeds the approved text limit')
      pages.push(text)
    }
    if (!pages.some(Boolean)) throw new RangeError('Product PDF has no readable text')
    const declarations = await document.getMetadata().catch(() => undefined)
    signal?.throwIfAborted()
    const info: { Custom?: ReadonlyMap<string, unknown> } | undefined = declarations?.info
    const xmp = declarations?.metadata as { get(name: string): unknown } | null | undefined
    const custom = new Map([...(info?.Custom ?? [])].map(([key, value]) => [key.toLowerCase(), value]))
    const values = new Map<string, string>()
    for (const [name, value] of [
      ['publisher', custom.get('publisher') ?? xmp?.get('dc:publisher')],
      ['product:version', custom.get('productversion') ?? xmp?.get('product:version')],
      ['product:region', custom.get('productregion') ?? xmp?.get('product:region')],
      ['datepublished', custom.get('sourcepublishedat') ?? xmp?.get('dcterms:issued')],
      ['datemodified', custom.get('sourceupdatedat') ?? xmp?.get('dcterms:modified')],
    ] as [string, unknown][]) {
      const entry = Array.isArray(value) && value.length === 1 ? value[0] as unknown : value
      if (typeof entry === 'string' && entry.trim() && entry.trim().length <= 200) values.set(name, entry.trim())
    }
    const text = `\f${pages.join('\f')}`
    return { url: fetched.url, text, contentHash: pageTextHash(text), ...scopeMetadata(values) }
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof RangeError) throw error
    throw new RangeError('Product PDF could not be parsed', { cause: error })
  } finally {
    listener?.[Symbol.dispose]()
    await close()
  }
}

/**
 * Derive the locator from saved text, including the physical PDF page when present.
 * @param text - Complete canonical source text.
 * @param start - Inclusive UTF-16 offset of the excerpt.
 * @param end - Exclusive UTF-16 offset of the excerpt.
 * @returns The locator, or undefined for an invalid range or a range crossing a PDF page boundary.
 */
export function productTextRange(text: string, start: number, end: number):
Extract<ProductSourceLocator, { kind: 'text_range' }> | undefined {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > text.length) return undefined
  if (!text.startsWith('\f')) return { kind: 'text_range', start, end }
  const boundary = text.indexOf('\f', start)
  if (boundary >= 0 && boundary < end) return undefined
  return { kind: 'text_range', start, end, pdfPage: text.slice(0, start).split('\f').length - 1 }
}

/** Retain only named, bounded HTML declarations; absent or malformed values stay unknown. */
function pageMetadata(html: string): Omit<PreparedProductPage, 'url' | 'text' | 'contentHash'> {
  const values = new Map<string, string>()
  for (const tag of html.matchAll(/<meta\b[^>]*>/giu)) {
    const attributes = new Map([...tag[0].matchAll(/([a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu)]
      .map(match => [(match[1] ?? '').toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '']))
    const key = (attributes.get('name') ?? attributes.get('property') ?? '').toLowerCase()
    const content = decodeMetadata(attributes.get('content') ?? '').trim()
    if (key && content && content.length <= 200 && !values.has(key)) values.set(key, content)
  }
  return scopeMetadata(values)
}

function scopeMetadata(values: ReadonlyMap<string, string>): Omit<PreparedProductPage, 'url' | 'text' | 'contentHash'> {
  const published = normalizedDate(values.get('article:published_time') ?? values.get('datepublished'))
  const updated = normalizedDate(values.get('article:modified_time') ?? values.get('datemodified'))
  const productVersionLabel = values.get('product:version')
  const sourceRegionLabel = values.get('product:region')
  const declaredPublisher = values.get('publisher') ?? values.get('og:site_name')
  return { ...published === undefined ? {} : { sourcePublishedAt: published },
    ...updated === undefined ? {} : { sourceUpdatedAt: updated },
    ...productVersionLabel === undefined ? {} : { productVersionLabel },
    ...sourceRegionLabel === undefined ? {} : { sourceRegionLabel },
    ...declaredPublisher === undefined ? {} : { declaredPublisher } }
}

function normalizedDate(value: string | undefined): string | undefined {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/u.test(value)) {
    return undefined
  }
  const date = new Date(value)
  const calendarDate = value.slice(0, 10)
  const calendar = new Date(`${calendarDate}T00:00:00.000Z`)
  const validCalendarDate = Number.isFinite(calendar.valueOf())
    && calendar.toISOString().slice(0, 10) === calendarDate
  return validCalendarDate && Number.isFinite(date.valueOf()) ? date.toISOString() : undefined
}

function decodeMetadata(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/giu, entity => ({
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  })[entity.toLowerCase()] ?? entity)
}

function assertNever(value: never): never { throw new TypeError(`Unsupported web body: ${String(value)}`) }

function htmlText(html: string): string {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/iu)?.[1] ?? html
  return article
    .replace(/<(script|style|noscript|template|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, ' ')
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<(br|\/p|\/div|\/section|\/li|\/h[1-6])\b[^>]*>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/giu, entity => ({
      '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
    })[entity.toLowerCase()] ?? entity)
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n+ */gu, '\n')
    .trim()
}

const nonReadingTags = new Set([
  'head', 'script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'svg',
  'nav', 'footer', 'button', 'input', 'select', 'textarea', 'dialog', 'audio', 'video',
])
const readingBlockTags = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'caption', 'dd', 'details', 'div', 'dt', 'fieldset', 'figcaption', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'p', 'pre', 'section', 'summary', 'td', 'th', 'tr',
])

function isNonReadingElement({ tagName, attrs }: DefaultTreeAdapterTypes.Element): boolean {
  return nonReadingTags.has(tagName) || attrs.some(({ name, value }) => name === 'hidden'
    || name === 'aria-hidden' && value.toLowerCase() === 'true'
    || name === 'role' && value === 'navigation'
    || name === 'style' && /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\s*(?:!important\s*)?(?:;|$)/iu.test(value))
}

function findReadingRoot(document: DefaultTreeAdapterTypes.Document): DefaultTreeAdapterTypes.Element | undefined {
  const pending = document.childNodes.toReversed()
  let main: DefaultTreeAdapterTypes.Element | undefined
  while (pending.length > 0) {
    const node = pending.pop()
    if (node === undefined) break
    if (!defaultTreeAdapter.isElementNode(node) || isNonReadingElement(node)) continue
    if (node.tagName === 'article') return node
    if (node.tagName === 'main') main ??= node
    for (const child of node.childNodes.toReversed()) pending.push(child)
  }
  return main
}

/** Keep the full reading region in document order, including lists, tables and captions. */
function readableArticleText(html: string): string {
  const root = findReadingRoot(parse(html))
  if (root === undefined) return ''
  const pending: (DefaultTreeAdapterTypes.ChildNode | '\n')[] = [root]
  const text: string[] = []
  while (pending.length > 0) {
    const node = pending.pop()
    if (node === undefined) break
    if (node === '\n') text.push(node)
    else if (defaultTreeAdapter.isTextNode(node)) text.push(node.value.replace(/\s+/gu, ' '))
    else if (defaultTreeAdapter.isElementNode(node)) {
      if (isNonReadingElement(node)) {
        text.push('\n')
        continue
      }
      if (readingBlockTags.has(node.tagName)) {
        text.push('\n')
        pending.push('\n')
      }
      for (const child of node.childNodes.toReversed()) pending.push(child)
    }
  }
  return text.join('').replace(/ +/gu, ' ').replace(/ *\n[\n ]*/gu, '\n').trim()
}

/** Drop inline link and image destinations while retaining visible text and document order. */
function stripMarkdownDestinations(text: string): string {
  const edits: { start: number; end: number; replacement: string }[] = []
  const pending = [...fromMarkdown(text).children]
  while (pending.length > 0) {
    const node = pending.pop()
    if (node === undefined) break
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if ('children' in node) for (const child of node.children) pending.push(child)
    if (start === undefined || end === undefined) continue
    if (node.type === 'image') edits.push({ start, end, replacement: node.alt ?? '' })
    if (node.type !== 'link' || text[start] !== '[') continue
    const labelStart = node.children[0]?.position?.start.offset
    const labelEnd = node.children.at(-1)?.position?.end.offset
    if (labelStart === undefined || labelEnd === undefined) {
      edits.push({ start, end, replacement: '' })
    } else {
      edits.push({ start, end: labelStart, replacement: '' }, { start: labelEnd, end, replacement: '' })
    }
  }
  const pieces: string[] = []
  let cursor = 0
  for (const edit of edits.sort((left, right) => left.start - right.start)) {
    pieces.push(text.slice(cursor, edit.start), edit.replacement)
    cursor = edit.end
  }
  pieces.push(text.slice(cursor))
  return pieces.join('').trim()
}

/** A proposed excerpt from a model or human reviewer; never treated as evidence until verified. */
export interface ProductEvidenceDraft {
  readonly verbatimExcerpt: string
  readonly sourcedStatement: string
  readonly questionIds: readonly ProductQuestionId[]
  readonly startHint?: number
  readonly qualityNotes?: readonly string[]
}

/** One proposed excerpt rejected without discarding valid siblings. */
export interface RejectedProductEvidenceDraft {
  readonly draftIndex: number
  readonly reason: 'empty_excerpt' | 'missing_question' | 'unknown_question' | 'empty_statement'
    | 'excerpt_not_found' | 'ambiguous_excerpt' | 'invalid_start_hint' | 'crosses_pdf_page'
}

/** Verified excerpts and individually rejected proposals from one page. */
export interface ProductEvidenceExtractionResult {
  readonly evidence: readonly ProductEvidence[]
  readonly rejected: readonly RejectedProductEvidenceDraft[]
}

/**
 * Verify exact excerpts against the saved canonical text, following the academic
 * extractor's per-draft rejection behavior. Repeated text requires an exact start hint.
 * @param candidate - Approved page identity and linked questions.
 * @param snapshot - Available snapshot of that same page.
 * @param text - Complete canonical text saved under the snapshot hash.
 * @param drafts - Untrusted proposed excerpts and statements.
 * @param extractionMethod - Identity recorded on every accepted evidence item.
 * @returns Source-bound evidence and reasons for rejected drafts.
 */
export function extractProductPageEvidence(candidate: CandidatePage, snapshot: AvailableSourceSnapshot,
  text: string, drafts: readonly ProductEvidenceDraft[], extractionMethod: ProductEvidence['extractionMethod']):
ProductEvidenceExtractionResult {
  if (snapshot.candidatePageId !== candidate.candidatePageId) throw new RangeError('Snapshot belongs to another page')
  const hash = pageTextHash(text)
  if (hash !== snapshot.contentHash) throw new RangeError('Page content does not match the saved snapshot')
  const allowedQuestions = new Set(candidate.questionIds)
  const evidence: ProductEvidence[] = []
  const rejected: RejectedProductEvidenceDraft[] = []
  for (const [draftIndex, draft] of drafts.entries()) {
    const excerpt = draft.verbatimExcerpt
    let reason: RejectedProductEvidenceDraft['reason'] | undefined
    if (excerpt.trim().length === 0) reason = 'empty_excerpt'
    else if (draft.questionIds.length === 0) reason = 'missing_question'
    else if (draft.questionIds.some(id => !allowedQuestions.has(id))) reason = 'unknown_question'
    else if (draft.sourcedStatement.trim().length === 0) reason = 'empty_statement'
    let start = -1
    if (reason === undefined) {
      if (draft.startHint !== undefined) {
        if (!Number.isSafeInteger(draft.startHint) || draft.startHint < 0
          || text.slice(draft.startHint, draft.startHint + excerpt.length) !== excerpt) reason = 'invalid_start_hint'
        else start = draft.startHint
      } else {
        start = text.indexOf(excerpt)
        if (start < 0) reason = 'excerpt_not_found'
        else if (text.indexOf(excerpt, start + 1) >= 0) reason = 'ambiguous_excerpt'
      }
    }
    if (reason !== undefined) { rejected.push({ draftIndex, reason }); continue }
    const locator = productTextRange(text, start, start + excerpt.length)
    if (locator === undefined) { rejected.push({ draftIndex, reason: 'crosses_pdf_page' }); continue }
    evidence.push({ schemaVersion: 1, evidenceId: createProductEvidenceId(),
      candidatePageId: candidate.candidatePageId, sourceSnapshotId: snapshot.sourceSnapshotId,
      contentHash: snapshot.contentHash, questionIds: [...new Set(draft.questionIds)],
      verbatimExcerpt: excerpt, sourcedStatement: draft.sourcedStatement.trim(),
      locator,
      extractionMethod, ...(draft.qualityNotes === undefined ? {} : { qualityNotes: draft.qualityNotes }) })
  }
  return { evidence, rejected }
}
