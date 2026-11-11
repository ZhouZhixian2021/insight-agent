/** Question-targeted, source-offset sentence lookup over saved product text. */
import { productTextRange } from './page-content.ts'
import { createHash } from 'node:crypto'
import { createProductEvidenceId, type AvailableSourceSnapshot, type CandidatePage,
  type ProductEvidence, type ProductEvidenceV2, type ProductQuestionId } from '@deepseek-ai/dsh-product-insight-model'

/** One exact sentence-sized range in the canonical text of a saved page. */
export interface ProductPagePassage {
  readonly id: string
  readonly start: number
  readonly end: number
  readonly text: string
  readonly contextStart: number
  readonly contextEnd: number
  readonly pdfPage?: number
}

/** Model choice among exact positions already supplied for one saved page. */
export interface ProductPassageSelection {
  readonly passageIds: readonly string[]
  readonly sourcedStatement: string
  readonly questionIds: readonly ProductQuestionId[]
}

/** Optional retrieval hook for a future semantic ranker; current runs use lexical ranking. */
export interface ProductPassageRetriever {
  retrieve(passages: readonly ProductPagePassage[], question: string, maximum: number,
    signal?: AbortSignal): Promise<readonly ProductPagePassage[]>
}

/** Default retrieval implementation; callers may later supply a semantic retriever. */
export const keywordProductPassageRetriever: ProductPassageRetriever = {
  retrieve: (passages, question, maximum) =>
    Promise.resolve(selectProductQuestionPassages(passages, question, maximum)),
}

/** An invalid selection is retained for diagnostics without discarding valid siblings. */
export interface RejectedProductPassageSelection {
  readonly selectionIndex: number
  readonly reason: 'missing_passage' | 'unknown_passage' | 'repeated_passage' | 'invalid_passage'
    | 'missing_question' | 'unknown_question' | 'empty_statement' | 'crosses_pdf_page'
}

const MAXIMUM_PASSAGE_CHARACTERS = 1_500
const MAXIMUM_CONTEXT_CHARACTERS = 3_000
const words = new Intl.Segmenter(undefined, { granularity: 'word' })

/**
 * Index saved text without changing its characters, offsets, or PDF page boundaries.
 * @param text - Complete canonical source text retained under a snapshot hash.
 * @returns Ordered ranges that can be checked against the same saved text.
 */
export function indexProductPagePassages(text: string): readonly ProductPagePassage[] {
  const ranges: { start: number; end: number }[] = []
  for (const line of text.matchAll(/[^\n\f]+/gu)) {
    const lineStart = line.index
    const content = line[0]
    let start = 0
    for (let index = 0; index < content.length; index++) {
      const character = content[index] ?? ''
      const next = content[index + 1]
      if (character === '.' && /\d/u.test(content[index - 1] ?? '') && /\d/u.test(next ?? '')) continue
      if (!/[.!?。！？;；]/u.test(character) || next !== undefined && !/\s/u.test(next)
        && !/[。！？；]/u.test(character)) continue
      pushBoundedRange(text, lineStart + start, lineStart + index + 1, ranges)
      start = index + 1
    }
    pushBoundedRange(text, lineStart + start, lineStart + content.length, ranges)
  }
  return ranges.flatMap(({ start, end }, index) => {
    const locator = productTextRange(text, start, end)
    if (locator === undefined) return []
    let contextStart = start
    let contextEnd = end
    for (let before = index - 1; before >= Math.max(0, index - 2); before--) {
      const previous = ranges[before]
      if (previous === undefined || end - previous.start > MAXIMUM_CONTEXT_CHARACTERS
        || productTextRange(text, previous.start, end) === undefined) break
      contextStart = previous.start
    }
    for (let after = index + 1; after < Math.min(ranges.length, index + 3); after++) {
      const next = ranges[after]
      if (next === undefined || next.end - contextStart > MAXIMUM_CONTEXT_CHARACTERS
        || productTextRange(text, contextStart, next.end) === undefined) break
      contextEnd = next.end
    }
    return [{ id: `${start}:${end}`, start, end, text: text.slice(start, end),
      contextStart, contextEnd, ...locator.pdfPage === undefined ? {} : { pdfPage: locator.pdfPage } }]
  })
}

function pushBoundedRange(text: string, start: number, end: number, ranges: { start: number; end: number }[]): void {
  while (start < end && /\s/u.test(text[start] ?? '')) start++
  while (end > start && /\s/u.test(text[end - 1] ?? '')) end--
  while (start < end) {
    let stop = Math.min(start + MAXIMUM_PASSAGE_CHARACTERS, end)
    if (stop < end) {
      const space = text.lastIndexOf(' ', stop)
      if (space > start + MAXIMUM_PASSAGE_CHARACTERS / 2) stop = space
      if (text.charCodeAt(stop - 1) >= 0xd800 && text.charCodeAt(stop - 1) <= 0xdbff) stop--
    }
    ranges.push({ start, end: stop })
    start = stop
    while (start < end && /\s/u.test(text[start] ?? '')) start++
  }
}

function terms(value: string): ReadonlySet<string> {
  const lower = value.toLocaleLowerCase()
  const result = new Set([...words.segment(lower)].filter(item => item.isWordLike && /^[a-z0-9]+$/u.test(item.segment))
    .map(item => item.segment))
  for (const match of lower.matchAll(/[\p{Script=Han}]+/gu)) {
    const han = match[0]
    if (han.length === 1) result.add(han)
    else for (let index = 0; index < han.length - 1; index++) result.add(han.slice(index, index + 2))
  }
  return result
}

/**
 * Rank every saved passage for one question with lexical term coverage and document-frequency damping.
 * @param passages - Offset-bearing passages from one or more saved pages.
 * @param question - Exact approved question text.
 * @returns Passages in descending relevance, with source order for ties and unmatched passages.
 */
export function rankProductPagePassages(passages: readonly ProductPagePassage[], question: string):
readonly ProductPagePassage[] {
  const query = terms(question)
  if (query.size === 0) return passages
  const indexed = passages.map(passage => ({ passage, terms: terms(passage.text) }))
  const frequency = new Map<string, number>()
  for (const { terms: present } of indexed) for (const term of query) {
    if (present.has(term)) frequency.set(term, (frequency.get(term) ?? 0) + 1)
  }
  return indexed.map(({ passage, terms: present }, index) => ({ passage, index,
    score: [...query].reduce((sum, term) => sum + (present.has(term)
      ? Math.log(1 + (passages.length + 1) / ((frequency.get(term) ?? 0) + 1)) : 0), 0) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ passage }) => passage)
}

/**
 * Keep the strongest sentences and their nearby qualifiers within one explicit request allowance.
 * @param passages - Ordered passages from one saved page.
 * @param question - Approved investigation question.
 * @param maximum - Maximum distinct passages visible to the model.
 * @returns Selected exact passages in source order.
 */
export function selectProductQuestionPassages(passages: readonly ProductPagePassage[], question: string,
  maximum: number): readonly ProductPagePassage[] {
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new RangeError('Passage allowance must be positive')
  const ranked = rankProductPagePassages(passages, question)
  const selected = new Set<ProductPagePassage>(ranked.slice(0, Math.min(3, maximum)))
  for (const center of ranked.slice(0, Math.min(3, maximum))) {
    const index = passages.indexOf(center)
    for (const distance of [1, 2]) for (const neighbor of [passages[index - distance], passages[index + distance]]) {
      if (selected.size >= maximum) break
      if (neighbor !== undefined && neighbor.pdfPage === center.pdfPage) selected.add(neighbor)
    }
  }
  return passages.filter(passage => selected.has(passage))
}

/**
 * Resolve model-selected IDs to exact ranges in the saved page, without copying model-written quotations.
 * @param candidate - Approved page and its linked questions.
 * @param snapshot - Available capture of that page.
 * @param text - Complete canonical text saved under the snapshot hash.
 * @param offered - Only passages shown to the model in the request.
 * @param selections - Untrusted model choices and proposed source statements.
 * @param extractionMethod - Method identity recorded on accepted evidence.
 * @returns Version 2 evidence and per-selection rejection reasons.
 */
export function extractProductPassageEvidence(candidate: CandidatePage, snapshot: AvailableSourceSnapshot,
  text: string, offered: readonly ProductPagePassage[], selections: readonly ProductPassageSelection[],
  extractionMethod: ProductEvidence['extractionMethod']): {
  readonly evidence: readonly ProductEvidenceV2[]
  readonly rejected: readonly RejectedProductPassageSelection[]
} {
  if (candidate.candidatePageId !== snapshot.candidatePageId) throw new RangeError('Snapshot belongs to another page')
  const contentHash = `sha256:${createHash('sha256').update(text).digest('hex')}`
  if (contentHash !== snapshot.contentHash) throw new RangeError('Page content does not match the saved snapshot')
  const byId = new Map(offered.map(passage => [passage.id, passage]))
  if (byId.size !== offered.length || offered.some(passage => passage.id !== `${passage.start}:${passage.end}`
    || text.slice(passage.start, passage.end) !== passage.text
    || passage.text.trim().length === 0 || passage.text.length > MAXIMUM_PASSAGE_CHARACTERS
    || productTextRange(text, passage.start, passage.end) === undefined)) {
    throw new RangeError('Offered passages do not match the saved page')
  }
  const allowedQuestions = new Set(candidate.questionIds)
  const evidence: ProductEvidenceV2[] = []
  const rejected: RejectedProductPassageSelection[] = []
  for (const [selectionIndex, selection] of selections.entries()) {
    let reason: RejectedProductPassageSelection['reason'] | undefined
    if (selection.passageIds.length === 0 || selection.passageIds.length > 3) reason = 'missing_passage'
    else if (new Set(selection.passageIds).size !== selection.passageIds.length) reason = 'repeated_passage'
    else if (selection.passageIds.some(id => !byId.has(id))) reason = 'unknown_passage'
    else if (selection.questionIds.length === 0) reason = 'missing_question'
    else if (selection.questionIds.some(id => !allowedQuestions.has(id))) reason = 'unknown_question'
    else if (selection.sourcedStatement.trim().length === 0) reason = 'empty_statement'
    if (reason !== undefined) { rejected.push({ selectionIndex, reason }); continue }
    const ranges = selection.passageIds.map(id => byId.get(id))
      .filter((passage): passage is ProductPagePassage => passage !== undefined)
      .toSorted((left, right) => left.start - right.start)
    const citations = ranges.map(passage => ({ verbatimExcerpt: passage.text,
      locator: productTextRange(text, passage.start, passage.end) }))
    if (citations.some(item => item.locator === undefined)) {
      rejected.push({ selectionIndex, reason: 'invalid_passage' }); continue
    }
    const primary = citations[0]
    if (primary?.locator === undefined) { rejected.push({ selectionIndex, reason: 'invalid_passage' }); continue }
    if (citations.some(item => item.locator?.pdfPage !== primary.locator?.pdfPage)) {
      rejected.push({ selectionIndex, reason: 'crosses_pdf_page' }); continue
    }
    evidence.push({ schemaVersion: 2, evidenceId: createProductEvidenceId(),
      candidatePageId: candidate.candidatePageId, sourceSnapshotId: snapshot.sourceSnapshotId,
      contentHash: snapshot.contentHash, questionIds: [...new Set(selection.questionIds)],
      verbatimExcerpt: primary.verbatimExcerpt, locator: primary.locator,
      supportingExcerpts: citations.slice(1).flatMap(item => item.locator === undefined ? []
        : [{ verbatimExcerpt: item.verbatimExcerpt, locator: item.locator }]),
      sourcedStatement: selection.sourcedStatement.trim(), extractionMethod })
  }
  return { evidence, rejected }
}
