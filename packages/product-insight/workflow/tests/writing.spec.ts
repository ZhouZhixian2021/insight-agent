import { describe, expect, it } from 'vitest'
import { createProductEvidenceId, createProductQuestionId } from '@deepseek-ai/dsh-product-insight-model'
import { parseProductSynthesis } from '../src/session-tool.ts'
import type { ProductSynthesisInput } from '../src/report.ts'
import { PRODUCT_READING_INSTRUCTION, PRODUCT_REVIEW_INSTRUCTION, productSynthesisInstruction } from '../src/writing.ts'
import { inspectExtraction } from '../src/extraction-output.ts'

const ids = [createProductEvidenceId(), createProductEvidenceId()]
const input: ProductSynthesisInput = { scope: '企业版离线部署', questions: [{ questionId: 'deployment',
  question: '部署条件是什么？', evidence: ids.map(evidenceId => ({ evidenceId,
    sourcedStatement: '企业版支持离线部署。', verbatimExcerpt: 'Enterprise edition supports offline deployment.' })) }] }
const cite = (text: string) => `${text}[[cite:${ids[0]}]][[cite:${ids[1]}]]`
const output = (text: string, evidenceIds: readonly string[] = ids) => JSON.stringify([
  { questionId: 'deployment', text, evidenceIds },
])

describe('product evidence-led writing', () => {
  it('drops ungrounded attribution and conditions without dropping the reviewed material', () => {
    const excerpt = 'We measured latency at 32 GB.'
    const entry = { verbatimExcerpt: excerpt, sourcedStatement: '测量了延迟。', questionIds: ['Q1'],
      readingContext: { origin: 'author_measurement', originQuote: 'an independent laboratory', conditionQuotes: ['32 GB', '16 GB'] } }
    const result = inspectExtraction(JSON.stringify([entry]), [{ questionId: createProductQuestionId(), text: '条件' }])
    expect(result.drafts[0]?.readingContext).toEqual({ origin: 'unknown', conditionQuotes: ['32 GB'] })
  })
  it('permits an explicit unanswered question without fabricating references to available background', () => {
    expect(parseProductSynthesis(output('现有材料不足以形成有依据的回答。', []), input).get('deployment'))
      .toBe('现有材料不足以形成有依据的回答。')
    expect(() => parseProductSynthesis(output('支持全部部署模式。', []), input)).toThrow()
  })
  it('preserves technical paragraphs beyond the old brevity limit within the overall output budget', () => {
    const text = `${'企业版支持离线部署，但不代表社区版具有相同能力。'.repeat(30)}\n\n当前资料未说明硬件需求。`
    expect(text.length).toBeGreaterThan(500)
    expect(parseProductSynthesis(output(cite(text)), input).get('deployment')).toBe(cite(text))
  })

  it('rejects forged, repeated or missing references and incomplete or oversized responses', () => {
    for (const references of [['invented', String(ids[1])], [String(ids[0]), String(ids[0])], []]) {
      expect(() => parseProductSynthesis(output('有条件支持。', references), input)).toThrow()
    }
    expect(() => parseProductSynthesis('[]', input)).toThrow()
    expect(parseProductSynthesis(output(cite('字'.repeat(7000))), input).get('deployment')).toHaveLength(cite('字'.repeat(7000)).length)
  })


  it('accepts actual sentence references and rejects missing or forged inline markers', () => {
    const text = `支持离线部署。[[cite:${ids[0]}]]社区版能力未知。`
    expect(parseProductSynthesis(output(text, [ids[0]!]), input).get('deployment')).toBe(text)
    expect(() => parseProductSynthesis(output('支持离线部署。', [ids[0]!]), input)).toThrow()
    expect(() => parseProductSynthesis(output('支持。[[cite:invented]]', [ids[0]!]), input)).toThrow()
  })

  it('pins the product reading and writing instructions', () => {
    expect({ reading: PRODUCT_READING_INSTRUCTION, review: PRODUCT_REVIEW_INSTRUCTION,
      writing: productSynthesisInstruction() }).toMatchSnapshot()
  })
})
