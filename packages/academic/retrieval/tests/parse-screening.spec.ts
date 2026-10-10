import { describe, expect, it } from 'vitest'
import { parseCandidateScreening } from '../src/index.ts'

const title = 'Retrieval faithfulness'
const abstract = { status: 'available' as const, value: 'We evaluate retrieval faithfulness using human annotations.' }
const keywords = { status: 'available' as const, value: ['RAG'] }
const question = '检索如何减少幻觉？'
const valid = {
  schemaVersion: 1,
  signals: [{ kind: 'question', question, quote: { source: 'abstract', text: 'retrieval faithfulness' } }],
  surfaceKeywordHits: [{ term: 'RAG', source: 'keywords', text: 'RAG' }],
  uncertainties: ['Full-text findings remain unverified.'],
  scope: { status: 'potentially_relevant', reason: 'The abstract evaluates retrieval faithfulness.' },
}
const parse = (value: unknown) => parseCandidateScreening(JSON.stringify(value), title, abstract, keywords, [question])

describe('external candidate screening JSON', () => {
  it('accepts grounded review details without inventing scores or identities', () => {
    expect(parse(valid)).toEqual(valid)
  })

  it('traces surface hits independently to their title and abstract sources', () => {
    const review = { ...valid, surfaceKeywordHits: [
      { term: 'Retrieval', source: 'title', text: title },
      { term: 'evaluate', source: 'abstract', text: 'We evaluate retrieval faithfulness' },
    ] }
    expect(parse(review)).toEqual(review)
  })

  it('rejects surface hits when their declared abstract or keywords are unavailable', () => {
    const review = { ...valid, signals: [], surfaceKeywordHits: [
      { term: 'evaluate', source: 'abstract', text: 'evaluate' },
    ] }
    expect(() => parseCandidateScreening(JSON.stringify(review), title,
      { status: 'unknown', reason: 'missing' }, keywords, [question])).toThrow(/declared scholarly metadata source/u)
    expect(() => parseCandidateScreening(JSON.stringify({ ...review, surfaceKeywordHits: valid.surfaceKeywordHits }),
      title, abstract, { status: 'unknown', reason: 'missing' }, [question])).toThrow(/declared scholarly metadata source/u)
  })

  it.each([
    { ...valid, schemaVersion: 2 },
    { ...valid, score: 100 },
    { ...valid, signals: {} },
    { ...valid, uncertainties: [' '] },
    { ...valid, scope: { status: 'included', reason: 'yes' } },
    { ...valid, scope: { status: 'off_topic', reason: 'no' } },
    { ...valid, signals: [{ kind: 'question', question: 'unapproved', quote: { source: 'title', text: title } }] },
    { ...valid, signals: [{ kind: 'method', label: 'retrieval', quote: { source: 'keywords', text: 'RAG' } }] },
    { ...valid, signals: [{ kind: 'other', quote: { source: 'title', text: title } }] },
    { ...valid, signals: [{ kind: 'contribution', classification: 'irrelevant', quote: { source: 'title', text: title } }] },
    { ...valid, signals: [{ kind: 'method', label: '', quote: { source: 'title', text: title } }] },
    { ...valid, signals: [{ kind: 'question', question, label: 'extra', quote: { source: 'title', text: title } }] },
    { ...valid, signals: [{ kind: 'question', question, quote: { source: 'abstract', text: 'fabricated' } }] },
    { ...valid, surfaceKeywordHits: [{ term: 'other', source: 'keywords', text: 'RAG' }] },
    { ...valid, surfaceKeywordHits: [{ term: 'RAG', source: 'web', text: 'RAG' }] },
    { ...valid, surfaceKeywordHits: [{ term: 'RAG', source: 'abstract', text: 'RAG' }] },
    { ...valid, scope: { status: 'off_topic', reason: 'unrelated', quote: { source: 'title', text: title } } },
    null,
  ])('rejects invalid or ungrounded review fields: %j', (value) => {
    expect(() => parse(value)).toThrow(RangeError)
  })

  it('rejects truncated JSON and unavailable abstract quotations', () => {
    expect(() => parseCandidateScreening('{', title, abstract, keywords, [question])).toThrow(/complete JSON/u)
    expect(() => parseCandidateScreening(JSON.stringify(valid), title, { status: 'unknown', reason: 'missing' },
      keywords, [question])).toThrow(/verbatim/u)
  })

  it('accepts explicit unknown scope with no evidence of irrelevance', () => {
    const review = { ...valid, signals: [], surfaceKeywordHits: [],
      scope: { status: 'unknown', reason: 'The title is insufficient.' } }
    expect(parseCandidateScreening(JSON.stringify(review), title, { status: 'unknown', reason: 'missing' },
      { status: 'unknown', reason: 'missing' }, [question])).toEqual(review)
  })
})
