import { describe, expect, it } from 'vitest'
import { createCandidatePageId, createProductId, createProductPlanId, createProductQuestionId,
  type CandidatePage } from '@deepseek-ai/dsh-product-insight-model'
import { extractionQuestions, extractionReuseKey, inspectExtraction } from '../src/extraction-output.ts'

const questions = [{ questionId: createProductQuestionId(), text: 'What are the deployment conditions?' },
  { questionId: createProductQuestionId(), text: 'What does it cost?' }]
const draft = { verbatimExcerpt: 'Enterprise supports offline use.', sourcedStatement: 'Offline use requires Enterprise.', questionIds: ['Q1'] }
const page: CandidatePage = { schemaVersion: 1, candidatePageId: createCandidatePageId(), planId: createProductPlanId(),
  productId: createProductId(), url: 'https://example.com/a', sourceType: 'official_product_page', discoveredAt: '2026-11-17T00:00:00Z',
  questionIds: questions.map(q => q.questionId), screening: { status: 'selected', reason: 'Fixture', screenedAt: '2026-11-17T00:00:00Z' } }

describe('product extraction output', () => {
  it('restores request-local short IDs and leaves full excerpts and statements untouched', () => {
    expect(extractionQuestions(questions)).toEqual([{ questionId: 'Q1', text: questions[0]!.text }, { questionId: 'Q2', text: questions[1]!.text }])
    const result = inspectExtraction(JSON.stringify([{ ...draft, questionIds: ['Q2', 'Q1'] }]), questions)
    expect(result).toEqual({ drafts: [{ ...draft, questionIds: [questions[1]!.questionId, questions[0]!.questionId] }], issues: [] })
    expect(inspectExtraction(JSON.stringify([draft]), questions.slice(1)).drafts[0]?.questionIds).toEqual([questions[1]!.questionId])
  })

  it('unwraps a complete JSON fence and retains valid siblings of malformed drafts', () => {
    const result = inspectExtraction('```json\n' + JSON.stringify([draft, { ...draft, sourcedStatement: null },
      { ...draft, questionIds: ['Q99'] }, { ...draft, startHint: -1 }, null]) + '\n```', questions)
    expect(result.drafts).toHaveLength(1)
    expect(result.issues.map(({ index, reason }) => ({ index, reason }))).toEqual([
      { index: 1, reason: 'missing_statement' }, { index: 2, reason: 'unknown_or_missing_question' },
      { index: 3, reason: 'invalid_start_hint' }, { index: 4, reason: 'draft_must_be_object' },
    ])
  })

  it('accepts only requested repair slots, rejects duplicates, and records omitted slots', () => {
    const pending = [{ index: 2, reason: 'missing_statement', value: {} }, { index: 4, reason: 'missing_excerpt', value: {} }]
    const result = inspectExtraction(JSON.stringify([
      { ...draft, repairIndex: 2 }, { ...draft, repairIndex: 2 }, { ...draft, repairIndex: 0 },
    ]), questions, pending)
    expect(result.drafts).toHaveLength(1)
    expect(result.issues.map(x => x.reason)).toEqual(['unknown_or_duplicate_repair_index', 'unknown_or_duplicate_repair_index', 'repair_missing'])
    expect(inspectExtraction('[]', questions).issues).toEqual([])
    expect(() => inspectExtraction('{"drafts":[]}', questions)).toThrow(/array/u)
    expect(() => inspectExtraction('[{', questions)).toThrow(SyntaxError)
  })

  it('reuses identical same-site text without merging source identities or differing questions', () => {
    const config = { model: 'fixture' }
    const key = extractionReuseKey(page, 'Same full text.', questions, config)
    expect(extractionReuseKey({ ...page, candidatePageId: createCandidatePageId(), url: 'https://example.com/duplicate' }, 'Same full text.', questions, config)).toBe(key)
    for (const other of [{ ...page, url: 'https://another.test/a' }, { ...page, planId: createProductPlanId() }, { ...page, publisher: 'Other' }]) {
      expect(extractionReuseKey(other, 'Same full text.', questions, config)).not.toBe(key)
    }
    expect(extractionReuseKey(page, 'Same full text. Price differs.', questions, config)).not.toBe(key)
    expect(extractionReuseKey(page, '同一主题的中文正文。', questions, config)).not.toBe(key)
    expect(extractionReuseKey(page, 'Same full text.', questions.slice(1), config)).not.toBe(key)
    expect(extractionReuseKey(page, 'Same full text.', questions, { model: 'another' })).not.toBe(key)
  })
})
