import { describe, expect, it } from 'vitest'
import { benchmark } from './benchmark.ts'
import { parseWritingDraft, quarantineWritingUnits, renderWritingExperiment } from '../src/writing-experiment.ts'
import { writingExperimentPrompt } from '../../analysis/src/writing-experiment.ts'
import { readFileSync } from 'node:fs'
import type { AcademicSynthesisInput } from '@deepseek-ai/dsh-academic-analysis'

function fixture() {
  const { input } = benchmark()
  const first = input.evidence[0]
  if (first === undefined) throw new Error('Benchmark evidence is required.')
  const draft = parseWritingDraft(JSON.stringify({ strategy: 'task_template', title: '比较实验',
    sections: [{ title: '直接回答', paragraphs: [{ text: ['分项记录评测信息。'], evidenceIds: [first.evidenceId], qualification: '仅限给定材料。' }],
      table: { headers: ['实验条件', '结果'], rows: [{ text: ['合成材料', '分别记录指标'], evidenceIds: [first.evidenceId], qualification: null }] } }],
    limitations: ['没有提供数值，不生成性能排名。'] }))
  return { input, draft }
}

describe('fixed-material writing experiments', () => {
  it('retains qualifications, actual table cells and original evidence without changing inputs or approving delivery', () => {
    const { input, draft } = fixture(), before = JSON.stringify(input)
    const report = renderWritingExperiment(input, draft)
    expect(report.mode).toBe('draft')
    expect(report.markdown).toContain('仅限给定材料。')
    expect(report.markdown).toContain('| 合成材料 | 分别记录指标')
    expect(report.markdown).not.toContain('见[分析段落')
    expect(report.evidence[0]).toBe(input.evidence[0])
    expect(JSON.stringify(input)).toBe(before)
  })

  it('rejects unknown evidence references and malformed comparison columns', () => {
    const { input, draft } = fixture()
    const altered = JSON.parse(JSON.stringify(draft)) as { sections: { paragraphs: { evidenceIds: string[] }[] }[] }
    const paragraph = altered.sections[0]?.paragraphs[0]
    if (paragraph === undefined) throw new Error('Writing paragraph required.')
    paragraph.evidenceIds = ['not-an-admitted-evidence-id']
    expect(() => renderWritingExperiment(input, parseWritingDraft(JSON.stringify(altered)))).toThrow('admitted evidence')
    expect(() => renderWritingExperiment(input, { ...draft, sections: draft.sections.map(section => ({ ...section,
      table: section.table === null ? null : { ...section.table, headers: ['only one column'] } })) })).toThrow('columns')
    expect(() => parseWritingDraft('{"strategy":"invented"}')).toThrow('strategy')
  })

  it('quarantines a model-typo reference without correcting or changing the raw draft', () => {
    const { input, draft } = fixture()
    const raw = parseWritingDraft(JSON.stringify({ ...draft, sections: draft.sections.map(section => ({ ...section,
      paragraphs: [...section.paragraphs, { text: ['无效引用的模型原句。'], evidenceIds: ['mistyped-id'], qualification: null }] })) }))
    const before = JSON.stringify(raw), checked = quarantineWritingUnits(input, raw)
    expect(checked.rejected).toEqual([{ sectionIndex: 0, kind: 'paragraph', unitIndex: 1, unknownIds: ['mistyped-id'] }])
    expect(JSON.stringify(raw)).toBe(before)
    const report = renderWritingExperiment(input, checked.draft)
    expect(report.markdown).not.toContain('无效引用的模型原句')
    expect(report.markdown).toContain('因引用无效或缺失未展示')
  })

  it('prepares distinct task and open-source-inspired prompts with exactly the same original source input', () => {
    const input = JSON.parse(readFileSync('z-team_docs/interface-samples/academic-model-v1/synthesis-input.sample.json', 'utf8')) as AcademicSynthesisInput
    const a = writingExperimentPrompt(input, 'task_template', 'comparison')
    const b = writingExperimentPrompt(input, 'open_source_inspired', 'comparison')
    expect(a.split('INPUT_JSON\n')[1]).toBe(JSON.stringify(input))
    expect(b.split('INPUT_JSON\n')[1]).toBe(JSON.stringify(input))
    expect(a).toContain('核心结论 → 方法比较')
    expect(b).toContain('PaperQA')
    expect(writingExperimentPrompt(input, 'task_template', 'review')).toContain('方向地图 → 各方向分析')
  })
})
