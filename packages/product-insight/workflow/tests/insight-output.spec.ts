import { describe, expect, it, vi } from 'vitest'
import { createProductEvidenceId } from '@deepseek-ai/dsh-product-insight-model'
import type { ProductSynthesisInput } from '../src/report.ts'
import { insightRequest, inspectInsight, insightRepairIssues, repairInsight } from '../src/insight-output.ts'
import { synthesisAliases, type SynthesisResponse } from '../src/synthesis-output.ts'

const evidenceId = createProductEvidenceId()
const input: ProductSynthesisInput = { scope: '能力与适用范围', questions: ['功能', '条件', '价格', '风险'].map(question => ({
  questionId: question, question, evidence: [{ evidenceId, sourcedStatement: '支持本地部署。', verbatimExcerpt: 'Local deployment.' }],
})) }
const section = { kind: 'section', sectionId: 'S1', title: '部署方式决定适用范围', status: 'answered',
  text: '支持本地部署。[[cite:E1]]\n\n实际部署条件仍需核对。' }
const coverage = input.questions.map(q => ({ kind: 'coverage', questionId: q.questionId,
  status: 'partial', sectionIds: ['S1'], gap: '尚缺具体条件。' }))
const response = (entries: unknown[]): SynthesisResponse => ({ text: JSON.stringify(entries), error: null })

describe('material-led insight output', () => {
  it('uses one evidence pool and allows a section to cover multiple questions', () => {
    const request = insightRequest(input, synthesisAliases(input))
    expect(request.match(/Local deployment/g)).toHaveLength(1)
    const result = inspectInsight(response([section, ...coverage]).text, input)
    expect(result.issues).toEqual([])
    expect(result.sections).toHaveLength(1)
    expect(result.coverage).toHaveLength(4)
    expect(result.sections[0]?.text).toContain(`[[cite:${evidenceId}]]\n\n`)
  })

  it('repairs only a rejected section and retains every accepted sibling', async () => {
    const broken = { ...section, sectionId: 'S2', title: '价格边界', text: '价格未知。[[cite:bad]]' }
    const invoke = vi.fn(async (_user: string, ordinal: number) => ordinal === 1
      ? response([section, broken, ...coverage])
      : response([{ ...broken, status: 'insufficient', text: '尚无价格材料，不能判断成本。' }, { ...section, text: '恶意改写。' }]))
    const result = await repairInsight(input, invoke)
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke.mock.calls[1]?.[0]).toContain('"unit":"section","id":"S2"')
    expect(result.sections.map(s => s.sectionId)).toEqual(['S1', 'S2'])
    expect(result.sections[0]?.text).toContain('支持本地部署')
    expect(result.sections[0]?.text).not.toContain('恶意改写')
  })

  it('repairs coverage without requiring sibling coverage or rewriting prose', async () => {
    const invoke = vi.fn(async (_user: string, ordinal: number) => ordinal === 1
      ? response([section, ...coverage.slice(1)]) : response([coverage[0]]))
    const result = await repairInsight(input, invoke)
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(result.coverage).toHaveLength(4)
    const target = { kind: 'coverage' as const, id: '功能', reasons: [], drafts: [] }
    expect(insightRepairIssues(inspectInsight(response([coverage[0]]).text, input, synthesisAliases(input), ['S1']), target))
      .toEqual([])
    const missing = { ...target, kind: 'section' as const, id: 'S2' }
    expect(insightRepairIssues(inspectInsight('[]', input, synthesisAliases(input), ['S1', 'S2']), missing)).toHaveLength(1)
  })

  it('preserves complete sections before truncation and records failed coverage as generation gaps', async () => {
    const invoke = vi.fn(async (_user: string, ordinal: number): Promise<SynthesisResponse> => ordinal === 1
      ? { text: `[${JSON.stringify(section)}, {"kind":`, error: 'output_limit' }
      : { text: '', error: 'request_failed' })
    const result = await repairInsight(input, invoke)
    expect(result.sections).toHaveLength(1)
    expect(result.coverage.every(item => item.gap.includes('不能据此判断原始材料'))).toBe(true)
  })

  it('rejects copied question headings and fabricated citations independently', () => {
    const result = inspectInsight(response([{ ...section, title: '功能' },
      { ...section, sectionId: 'S2', text: '支持。[[cite:fake]]' }, ...coverage]).text, input)
    expect(result.issues.filter(item => item.kind === 'section')).toHaveLength(2)
  })

  it('retries a missing structure once instead of generating question-wise answers', async () => {
    const invoke = vi.fn(async () => response([]))
    const result = await repairInsight(input, invoke)
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(result.sections).toEqual([])
    expect(result.notices.join('')).toContain('连贯正文尚未生成')
  })

  it('stops local repairs on cancellation', async () => {
    const controller = new AbortController()
    const invoke = vi.fn(async () => { controller.abort(); return response([section]) })
    await expect(repairInsight(input, invoke, controller.signal)).rejects.toThrow()
    expect(invoke).toHaveBeenCalledOnce()
  })
})
