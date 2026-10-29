import { describe, expect, it } from 'vitest'
import { parseCandidateSemanticReview } from '../src/index.ts'

const title = 'Retrieval-Augmented Generation for Faithful Question Answering'
const abstract = { status: 'available' as const,
  value: 'We study whether retrieved passages improve factual faithfulness in question answering.' }
const question = '检索增强生成如何影响回答的事实忠实性？'
const related = {
  schemaVersion: 1,
  scope: { status: 'potentially_relevant', reason: '直接研究检索对问答事实忠实性的影响' },
  matchedQuestions: [{ question, quote: { source: 'abstract',
    text: 'retrieved passages improve factual faithfulness in question answering' } }],
}
const parse = (value: unknown) => parseCandidateSemanticReview(JSON.stringify(value), title, abstract, [question])

describe('candidate semantic review JSON', () => {
  it('accepts a related judgment grounded in an approved question and abstract quote', () => {
    expect(parse(related)).toEqual(related)
  })

  it('accepts explicit off-topic and unknown judgments with empty question lists', () => {
    const offTopic = { schemaVersion: 1,
      scope: { status: 'off_topic', reason: '研究图像生成',
        quote: { source: 'title', text: 'Question Answering' } },
      matchedQuestions: [] }
    expect(parse(offTopic)).toEqual(offTopic)
    const unknown = { schemaVersion: 1,
      scope: { status: 'unknown', reason: '只有标题且不足以判断研究问题' }, matchedQuestions: [] }
    expect(parseCandidateSemanticReview(JSON.stringify(unknown), title,
      { status: 'not_extracted', reason: 'provider did not return an abstract' }, [question])).toEqual(unknown)
  })

  it('rejects unapproved, duplicate, and structurally invalid matched questions', () => {
    const grounded = { source: 'title', text: 'Retrieval-Augmented Generation' }
    expect(() => parse({ ...related, matchedQuestions: [
      { question: 'unapproved', quote: grounded }] })).toThrow(/approved Brief question/u)
    expect(() => parse({ ...related, matchedQuestions: [
      { question, quote: grounded }, { question, quote: grounded }] })).toThrow(/distinct/u)
    expect(() => parse({ ...related, matchedQuestions: [] })).toThrow(/match at least one/u)
    expect(() => parse({ ...related, matchedQuestions: [{ question }] })).toThrow(RangeError)
  })

  it('rejects fabricated, extra, and unavailable-source fields', () => {
    expect(() => parse({ ...related, matchedQuestions: [
      { question, quote: { source: 'abstract', text: 'fabricated passage' } }] })).toThrow(/verbatim/u)
    expect(() => parse({ ...related, matchedQuestions: [
      { question, quote: { source: 'web', text: 'retrieved passages' } }] })).toThrow(/title or abstract/u)
    expect(() => parse({ ...related, score: 100 })).toThrow(/unexpected field/u)
    expect(() => parseCandidateSemanticReview(JSON.stringify(related), title,
      { status: 'unknown', reason: 'missing' }, [question])).toThrow(/verbatim/u)
  })

  it('rejects contradictory scope conclusions', () => {
    const grounded = { source: 'title', text: 'Retrieval-Augmented Generation' }
    expect(() => parse({ ...related, scope: { status: 'off_topic', reason: 'unrelated',
      quote: grounded } })).toThrow(/cannot claim matched questions/u)
    expect(() => parse({ schemaVersion: 1,
      scope: { status: 'unknown', reason: 'unclear' },
      matchedQuestions: [{ question, quote: grounded }] })).toThrow(/cannot claim matched questions/u)
    expect(() => parse({ schemaVersion: 1,
      scope: { status: 'off_topic', reason: 'unrelated' }, matchedQuestions: [] })).toThrow(RangeError)
  })

  it('rejects truncated JSON, unsupported versions, and unknown scope statuses', () => {
    expect(() => parseCandidateSemanticReview('{', title, abstract, [question])).toThrow(/complete JSON/u)
    expect(() => parse({ ...related, schemaVersion: 3 })).toThrow(/schemaVersion/u)
    expect(() => parse({ ...related, scope: { status: 'included', reason: 'yes' } })).toThrow(/invalid scope status/u)
    expect(() => parse({ ...related, scope: { status: 'unknown', reason: ' ' } })).toThrow(RangeError)
  })
})

describe('version 2 quote tiering', () => {
  const tiered = { schemaVersion: 2,
    scope: { status: 'potentially_relevant', reason: '直接研究检索对问答事实忠实性的影响' },
    matchedQuestions: [{ question }] }

  it('accepts a relevance match without a passage', () => {
    expect(parse(tiered)).toEqual(tiered)
  })

  it('still rejects a supplied passage that does not occur verbatim', () => {
    expect(() => parse({ ...tiered, matchedQuestions: [{ question,
      quote: { source: 'abstract', text: 'fabricated passage' } }] })).toThrow(/verbatim/u)
  })

  it('turns an exclusion whose passage is missing or unverifiable into an undecided review', () => {
    const withoutQuote = { schemaVersion: 2, scope: { status: 'off_topic', reason: '研究图像生成' },
      matchedQuestions: [] }
    const downgraded = parse(withoutQuote)
    expect(downgraded).toMatchObject({ schemaVersion: 2, scope: { status: 'unknown' }, matchedQuestions: [],
      downgraded: 'unverifiable_exclusion_quote' })
    expect(downgraded.scope.reason).toMatch(/verbatim/u)
    const fabricated = { schemaVersion: 2, scope: { status: 'off_topic', reason: '研究图像生成',
      quote: { source: 'title', text: 'image generation' } }, matchedQuestions: [] }
    expect(parse(fabricated)).toMatchObject({ scope: { status: 'unknown' },
      downgraded: 'unverifiable_exclusion_quote' })
  })

  it('keeps an exclusion whose passage occurs verbatim', () => {
    const verified = { schemaVersion: 2, scope: { status: 'off_topic', reason: '研究图像生成',
      quote: { source: 'title', text: 'Question Answering' } }, matchedQuestions: [] }
    expect(parse(verified)).toStrictEqual(verified)
  })
})
