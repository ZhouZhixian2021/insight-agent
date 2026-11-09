import { describe, expect, it } from 'vitest'
import { createProductEvidenceId } from '@deepseek-ai/dsh-product-insight-model'
import { parseProductSynthesis } from '../src/session-tool.ts'
import type { ProductSynthesisInput } from '../src/report.ts'
import { PRODUCT_READING_INSTRUCTION, PRODUCT_WRITING_INSTRUCTION } from '../src/writing.ts'

const ids = [createProductEvidenceId(), createProductEvidenceId()]
const input: ProductSynthesisInput = { scope: '企业版离线部署', questions: [{ questionId: 'deployment',
  question: '部署条件是什么？', evidence: ids.map(evidenceId => ({ evidenceId,
    sourcedStatement: '企业版支持离线部署。', verbatimExcerpt: 'Enterprise edition supports offline deployment.' })) }] }
const output = (text: string, evidenceIds: readonly string[] = ids) => JSON.stringify([
  { questionId: 'deployment', text, evidenceIds },
])

describe('product evidence-led writing', () => {
  it('preserves technical paragraphs beyond the old brevity limit within the overall output budget', () => {
    const text = `${'企业版支持离线部署，但不代表社区版具有相同能力。'.repeat(30)}\n\n当前资料未说明硬件需求。`
    expect(text.length).toBeGreaterThan(500)
    expect(parseProductSynthesis(output(text), input).get('deployment')).toBe(text)
  })

  it('rejects forged, repeated or missing references and incomplete or oversized responses', () => {
    for (const references of [['invented', String(ids[1])], [String(ids[0]), String(ids[0])], []]) {
      expect(() => parseProductSynthesis(output('有条件支持。', references), input)).toThrow()
    }
    expect(() => parseProductSynthesis('[]', input)).toThrow()
    expect(() => parseProductSynthesis(output('字'.repeat(7000)), input)).toThrow()
  })

  it('pins the product reading and writing instructions', () => {
    expect({ reading: PRODUCT_READING_INSTRUCTION, writing: PRODUCT_WRITING_INSTRUCTION }).toMatchSnapshot()
  })
})
