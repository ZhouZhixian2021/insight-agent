import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createProductEvidenceId } from '@deepseek-ai/dsh-product-insight-model'
import { renderProductSynthesis, type ProductSynthesisInput } from '../src/report.ts'
import { insightRequest, inspectInsight, insightRepairIssues, repairInsight } from '../src/insight-output.ts'
import { synthesisAliases, type SynthesisResponse } from '../src/synthesis-output.ts'
import { readProductWritingReference } from '../src/writing-reference.ts'

const evidenceId = createProductEvidenceId()
const input: ProductSynthesisInput = { scope: '能力与适用范围', questions: ['功能', '条件', '价格', '风险'].map(question => ({
  questionId: question, question, evidence: [{ evidenceId, sourcedStatement: '支持本地部署。', verbatimExcerpt: 'Local deployment.' }],
})) }
const section = { kind: 'section', sectionId: 'S1', title: '部署方式决定适用范围', status: 'answered',
  text: '支持本地部署。[[cite:E1]]\n\n实际部署条件仍需核对。' }
const coverage = input.questions.map(q => ({ kind: 'coverage', questionId: q.questionId,
  status: 'partial', sectionIds: ['S1'], gap: '尚缺具体条件。' }))
const response = (entries: unknown[]): SynthesisResponse => ({ text: JSON.stringify(entries), error: null })
const visual = { ...input, images: [{ id: 'I1', pageUrl: 'https://example.com/a', imageUrl: 'https://example.com/i',
  caption: 'Latency', context: 'Three runs', summary: 'Summary', facts: ['42 ms'], dataUrl: 'data:image/png;base64,AAAA' }] }
const sourceRecords = { evidence: [], discovery: { searches: [], cancelled: false,
  candidates: { schemaVersion: 1, status: 'success', items: [], failures: [] } } } as const

describe('material-led insight output', () => {
  it.each(['summaries', 'excerpts'] as const)('keeps the entire example outside citable %s during writing and repair', async (mode) => {
    const html = await readFile(new URL('../references/m6-report.html', import.meta.url), 'utf8')
    const styleReference = await readProductWritingReference()
    expect(styleReference).toEqual({ fileName: 'm6-report.html', format: 'html', content: html })
    expect(html).toContain('id="sources-title"')
    const current: ProductSynthesisInput = mode === 'summaries'
      ? { scope: input.scope, questions: input.questions.map(q => ({ ...q, evidence: [] })),
        pageSummaries: [{ source: { sourceId: 'P1', title: '本轮产品文档', url: 'https://example.com/docs',
          observedAt: '2026-11-23', sourceType: 'official_documentation' }, summary: '支持本地部署。' }] } : input
    const material = { ...current, styleReference }
    const accepted = mode === 'summaries' ? { ...section, text: '支持本地部署。[[cite:P1]]' } : section
    const invoke = vi.fn(async (_user: string, ordinal: number) => ordinal === 1
      ? response([{ ...section, text: '样稿中的结论。[[cite:m6-report.html]]' }, ...coverage])
      : response([accepted]))
    const result = await repairInsight(material, invoke)
    expect(invoke).toHaveBeenCalledTimes(2)
    for (const [user] of invoke.mock.calls) {
      const { styleReference: reference, ...investigation } = JSON.parse(user) as {
        styleReference: typeof styleReference
        pageSummaries?: unknown
        evidence?: { evidenceId: string }[]
      }
      expect(reference).toEqual(styleReference)
      if (mode === 'summaries') {
        expect(investigation.pageSummaries).toEqual(current.pageSummaries)
        expect(investigation.evidence).toBeUndefined()
      } else expect(investigation.evidence?.map(item => item.evidenceId)).toEqual(['E1'])
    }
    expect(result.sections[0]?.text).toContain(`[[cite:${mode === 'summaries' ? 'P1' : evidenceId}]]`)
    expect(renderProductSynthesis(sourceRecords, current, result)).not.toContain('m6-report.html')
  })

  it('allows visual citations without a displayed figure and sends no binary data in writing requests', () => {
    const text = '42 ms[[cite:I1]].\n\n[[figure:I1]]'
    const check = inspectInsight(response([{ ...section, text, imageUse: { mode: 'cite_only' } }, ...coverage]).text, visual)
    expect(check.issues).toEqual([])
    const md = renderProductSynthesis(sourceRecords, visual, check)
    expect(md).toContain('[\\[1\\]](<https://example.com/a>)')
    expect(md).not.toContain('data:image')
    expect(md).not.toContain('[[figure:')
    const prompt = insightRequest(visual, synthesisAliases(visual))
    expect(prompt).toContain('42 ms')
    expect(prompt).not.toContain('base64')
  })

  it('places selected originals after numbered prose paragraphs, retaining cited tables and escaped cell content', () => {
    const text = '第一段。[[cite:I1]]\n\n| 条件 | 延迟 |\n| :--- | ---: |\n| A\\|B <tag> | 42 ms[[cite:I1]] |\n\n第二段。\n\n第三段。'
    const display = { mode: 'display', placements: [{ imageId: 'I1', afterParagraph: 2 }] }
    const check = inspectInsight(response([{ ...section, text, imageUse: display }, ...coverage]).text, visual)
    expect(check.issues).toEqual([])
    const md = renderProductSynthesis(sourceRecords, visual, check)
    expect(md).toContain('| 条件 | 延迟 |\n| --- | --- |\n| A\\|B &lt;tag&gt; | 42 ms[\\[1\\]](<https://example.com/a>) |')
    const encoded = { ...visual, images: [{ ...visual.images[0]!, pageUrl: 'https://example.com/%E8%8A%AF_(M6)|test.pdf#page=7' }] }
    expect(renderProductSynthesis(sourceRecords, encoded, check)).toContain(
      '42 ms[\\[1\\]](<https://example.com/%E8%8A%AF_%28M6%29%7Ctest.pdf#page=7>) |')
    expect(md).toContain('第二段。\n\n![I1](data:image/png;base64,AAAA)\n\nLatency')
    expect(md.indexOf('[图片来源]')).toBeLessThan(md.indexOf('第三段。'))
  })

  it.each([undefined, { mode: 'display', placements: [{ imageId: 'X', afterParagraph: 1 }] },
    { mode: 'display', placements: [{ imageId: 'I1', afterParagraph: 3 }] }])('repairs only an invalid illustration decision', async (imageUse) => {
    const fix = { mode: 'display', placements: [{ imageId: 'I1', afterParagraph: 1 }] }
    const invoke = vi.fn(async (_user: string, ordinal: number) => ordinal === 1
      ? response([{ ...section, imageUse }, ...coverage])
      : response([{ kind: 'imageUse', sectionId: 'S1', imageUse: fix, text: 'discard this rewrite' }]))
    const out = await repairInsight(visual, invoke)
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(JSON.parse(invoke.mock.calls[1]![0])).toMatchObject({ correction: { unit: 'imageUse', id: 'S1' } })
    expect(out.sections[0]?.imageUse).toEqual(fix)
    expect(out.sections[0]?.text).toContain('支持本地部署')
    expect(out.coverage).toHaveLength(4)
  })

  it('keeps accepted prose and source citations after an unsuccessful placement-only repair', async () => {
    const first = response([{ ...section, text: '仅引用。[[cite:I1]]' }, ...coverage])
    const out = await repairInsight(visual, async (_user, ordinal) => ordinal === 1 ? first : response([]))
    expect(out.sections[0]?.imageUse).toEqual({ mode: 'cite_only' })
    const markdown = renderProductSynthesis(sourceRecords, visual, out)
    expect(markdown).toContain('仅引用[\\[1\\]](<https://example.com/a>)。')
    expect(markdown).not.toContain('data:image')
  })

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
