import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { AvailableSourceSnapshot, CandidatePage, CandidatePageId, ProductId, ProductPlanId,
  ProductQuestionId, SourceSnapshotId } from '@deepseek-ai/dsh-product-insight-model'
import { evaluateProductPassageRetrieval, extractProductPassageEvidence,
  indexProductPagePassages, rankProductPagePassages,
  selectProductQuestionPassages } from '../src/index.ts'
import { productLogY600Price } from './fixtures/product-log-y600-price.ts'

const questionId = brandString<ProductQuestionId>('price')
const candidatePageId = brandString<CandidatePageId>('page')
const candidate: CandidatePage = { schemaVersion: 1, candidatePageId,
  planId: brandString<ProductPlanId>('plan'), productId: brandString<ProductId>('product'),
  url: 'https://example.com/price', sourceType: 'official_product_page',
  discoveredAt: '2026-11-10T00:00:00Z', questionIds: [questionId],
  screening: { status: 'selected', reason: 'official', screenedAt: '2026-11-10T00:00:00Z' } }

function snapshot(text: string): AvailableSourceSnapshot {
  return { schemaVersion: 1, sourceSnapshotId: brandString<SourceSnapshotId>('snapshot'),
    candidatePageId, observedAt: '2026-11-10T00:00:00Z', status: 'available', contentRef: 'saved',
    contentHash: `sha256:${createHash('sha256').update(text).digest('hex')}` }
}

describe('product page passage index', () => {
  it('replays one fixed saved-log price sample with model variant and scope', async () => {
    const sample = productLogY600Price
    const passages = indexProductPagePassages(sample.text)
    const offered = selectProductQuestionPassages(passages, sample.question, 6)
    expect(sample.required.every(value => offered.some(item => item.text === value))).toBe(true)
    const selected = sample.required.map(value => offered.find(item => item.text === value)!.id)
    const result = extractProductPassageEvidence({ ...candidate, url: sample.sourceUrl },
      snapshot(sample.text), sample.text, offered,
      [{ passageIds: selected, sourcedStatement: sample.statement, questionIds: [questionId] }],
      { name: 'product-passage', version: '2' })
    expect(result.rejected).toEqual([])
    expect(result.evidence).toMatchObject([{ schemaVersion: 2,
      verbatimExcerpt: sample.required[0],
      supportingExcerpts: [{ verbatimExcerpt: sample.required[1] },
        { verbatimExcerpt: sample.required[2] }] }])
    const coverage = await evaluateProductPassageRetrieval([{ text: sample.text,
      question: sample.question, relevantRanges: sample.required.map(value => ({
        start: sample.text.indexOf(value), end: sample.text.indexOf(value) + value.length })) }])
    expect(coverage).toEqual({ cases: 1, relevantRanges: 3, retrievedRanges: 3, recall: 1 })
  })

  it('resolves an identifier truncated to its start offset only when that offset is unique', () => {
    const text = 'Example costs $20.\nExample ships in May.\nExample offers support.'
    const offered = indexProductPagePassages(text)
    const firstRange = offered[0]!
    const truncated = String(firstRange.id).split(':')[0]!
    const result = extractProductPassageEvidence(candidate, snapshot(text), text, offered,
      [{ passageIds: [truncated], sourcedStatement: 'Example costs $20.', questionIds: [questionId] },
        { passageIds: ['9999'], sourcedStatement: 'Unknown range.', questionIds: [questionId] }],
      { name: 'product-passage', version: '2' })
    expect(result.evidence).toMatchObject([{ verbatimExcerpt: firstRange.text }])
    expect(result.rejected).toEqual([{ selectionIndex: 1, reason: 'unknown_passage' }])
  })

  it('keeps repeated text at separate exact offsets and carries nearby conditions', () => {
    const text = 'Example costs $20 per month.\nOnly in the US with annual billing.\nExample costs $20 per month.'
    const passages = indexProductPagePassages(text)
    expect(passages.map(item => item.text)).toEqual([
      'Example costs $20 per month.', 'Only in the US with annual billing.', 'Example costs $20 per month.',
    ])
    expect(passages[0]?.id).not.toBe(passages[2]?.id)
    expect(passages.every(item => text.slice(item.start, item.end) === item.text)).toBe(true)
    expect(text.slice(passages[0]!.contextStart, passages[0]!.contextEnd))
      .toContain('Only in the US with annual billing.')
  })

  it('reads further passages when the first batch already shown is excluded', () => {
    const text = Array.from({ length: 12 }, (_, index) => `Sentence ${index} mentions price ${index}.`).join('\n')
    const passages = indexProductPagePassages(text)
    const first = selectProductQuestionPassages(passages, 'price', 6)
    const second = selectProductQuestionPassages(passages, 'price', 6, new Set(first.map(item => item.id)))
    expect(first.length).toBe(5)
    expect(second.length).toBeGreaterThan(0)
    expect(second.some(item => first.some(shown => shown.id === item.id))).toBe(false)
  })

  it('never joins a PDF page or splits a surrogate pair', () => {
    const text = `\f${'a'.repeat(1_499)}😀\fSecond page. Conditions apply.`
    const passages = indexProductPagePassages(text)
    expect(passages.map(item => item.pdfPage)).toEqual([1, 1, 2, 2])
    expect(passages.every(item => !item.text.includes('\f') && item.text === text.slice(item.start, item.end))).toBe(true)
    expect(passages.every(item => text.slice(item.contextStart, item.contextEnd).indexOf('\f') < 0)).toBe(true)
    expect(passages[1]?.text).toBe('😀')
  })

  it('ranks Chinese question terms and source-specific words ahead of unrelated text', () => {
    const passages = indexProductPagePassages('部署要求。\n产品价格为每月十元。\n功能清单。')
    const result = rankProductPagePassages(passages, '产品价格是多少？')
    expect(result[0]?.text).toBe('产品价格为每月十元。')
    expect(result).toHaveLength(passages.length)
    expect(selectProductQuestionPassages(passages, '产品价格是多少？', 2).map(item => item.text))
      .toContain('产品价格为每月十元。')
  })

  it('derives two exact source excerpts from selected IDs and rejects unknown positions', () => {
    const text = 'Enterprise costs $20 per month.\nOther product details.\nOnly in the US with annual billing.'
    const passages = indexProductPagePassages(text)
    const result = extractProductPassageEvidence(candidate, snapshot(text), text, passages, [
      { passageIds: [passages[0]!.id, passages[2]!.id],
        sourcedStatement: 'Enterprise costs $20 monthly in the US with annual billing.', questionIds: [questionId] },
      { passageIds: ['invented'], sourcedStatement: 'Invented.', questionIds: [questionId] },
    ], { name: 'product-passage', version: '2' })
    expect(result.evidence).toMatchObject([{ schemaVersion: 2,
      verbatimExcerpt: 'Enterprise costs $20 per month.',
      supportingExcerpts: [{ verbatimExcerpt: 'Only in the US with annual billing.' }] }])
    expect(result.evidence[0]?.locator).toEqual({ kind: 'text_range', start: 0, end: 31 })
    expect(result.rejected).toEqual([{ selectionIndex: 1, reason: 'unknown_passage' }])
    expect(() => extractProductPassageEvidence(candidate, snapshot(text), `${text}!`, passages, [],
      { name: 'product-passage', version: '2' })).toThrow(/saved snapshot/u)
  })

  it('rejects unrelated questions and spans that cross physical PDF pages', () => {
    const text = '\fPrice is $20.\fOnly for enterprise customers.'
    const passages = indexProductPagePassages(text)
    const result = extractProductPassageEvidence(candidate, snapshot(text), text, passages, [
      { passageIds: [passages[0]!.id, passages[1]!.id], sourcedStatement: 'Enterprise price is $20.',
        questionIds: [questionId] },
      { passageIds: [passages[0]!.id], sourcedStatement: 'Price is $20.',
        questionIds: [brandString<ProductQuestionId>('other')] },
    ], { name: 'product-passage', version: '2' })
    expect(result.evidence).toHaveLength(0)
    expect(result.rejected.map(item => item.reason)).toEqual(['crosses_pdf_page', 'unknown_question'])
  })

  it('reports retrieval coverage only for labeled ranges', async () => {
    expect(await evaluateProductPassageRetrieval([])).toEqual({ cases: 0, relevantRanges: 0,
      retrievedRanges: 0, recall: null })
    const text = 'Unrelated feature.\nMonthly price is $20.\nUS customers only.'
    const start = text.indexOf('Monthly price')
    const result = await evaluateProductPassageRetrieval([{ text, question: 'What is the monthly price?',
      relevantRanges: [{ start, end: start + 'Monthly price is $20.'.length }] }])
    expect(result).toEqual({ cases: 1, relevantRanges: 1, retrievedRanges: 1, recall: 1 })
  })
})
