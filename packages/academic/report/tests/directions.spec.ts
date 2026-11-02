import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSynthesisDraft, synthesisAnalysis, type AcademicSynthesisInput } from '@deepseek-ai/dsh-academic-analysis'
import { generateReport } from '../src/index.ts'
import { scholarlyLink } from '../src/bibliography.ts'

const root = new URL('../../../../z-team_docs/interface-samples/academic-model-v1/', import.meta.url)
function fixture() {
  const input = JSON.parse(readFileSync(new URL('synthesis-input.sample.json', root), 'utf8')) as AcademicSynthesisInput
  const synthesis = parseSynthesisDraft(readFileSync(new URL('synthesis-partial-output.sample.json', root), 'utf8'), input)
  const analysis = synthesisAnalysis(input, synthesis, '2026-10-12T00:00:00Z')
  return { brief: input.brief, claims: analysis.claims, links: analysis.links, evidence: input.analysisInput.evidenceRecords,
    versions: input.analysisInput.workVersions, works: input.analysisInput.academicWorks,
    sourceLocators: input.analysisInput.sourceLocators,
    reviews: [], assessedAt: '2026-10-12T00:00:00Z', limitations: synthesis.limitations, synthesis,
    coverage: input.coverageSummary, synthetic: true, mode: 'draft' as const }
}

describe('direction report-format hierarchy', () => {
  it('renders opening metadata, directions and references from unchanged inputs', async () => {
    const input = fixture(), before = JSON.stringify(input), report = generateReport(input)
    for (const label of ['报告信息与研究范围', '发表时间窗口', '报告日期：2026-10-12', '执行洞察', '方向地图',
      '方向 1', '方向 2', '方向概览', '当前关注主题', '代表论文', '核心机制', '方向判断',
      '跨方向综合', '逐题研究结论', '方法补充：方向覆盖限制', '参考文献', '证据附录']) {
      expect(report.markdown).toContain(label)
    }
    expect(report.markdown).toContain('仅支持一个关注主题')
    expect(report.markdown).toContain('没有提供经检查的实验结果')
    expect(report.markdown).toContain('没有支持工程应用收益的证据')
    expect(report.markdown).toContain('场所：未提供')
    expect(report.markdown).toContain('https://example.invalid/academic/synthetic/1')
    const answers = report.markdown.split('## 逐题研究结论\n')[1]!.split('## 方法补充')[0]!
    expect(answers).toContain('见[分析段落 1](#academic-paragraph-1)')
    const themes = report.markdown.split('### 当前关注主题\n')[1]!.split('### 代表论文')[0]!
    expect(themes).toContain('见[分析段落 1](#academic-paragraph-1)')
    for (const item of input.synthesis.statements) {
      expect(report.markdown.split(item.text).length - 1).toBe(1)
    }
    for (const match of report.markdown.matchAll(/\]\(#academic-paragraph-(\d+)\)/gu)) {
      expect(report.markdown).toContain(`<a id="academic-paragraph-${match[1]}"></a>`)
    }
    expect(report.evaluation.status).toBe('blocked')
    expect(JSON.stringify(input)).toBe(before)
    await expect(report.markdown).toMatchFileSnapshot('./expected/direction-report.md')
  })
  it('delivers without independent reviews while keeping partial answers as content notices', () => {
    const input = fixture()
    const synthesis = { ...input.synthesis, questionAnswers: input.synthesis.questionAnswers.map(answer => ({ ...answer,
      status: 'partial' as const, reason: '缺少 CLOCK 同条件性能比较。' })) }
    const report = generateReport({ ...input, synthesis, mode: 'auto', synthetic: false })
    expect(report.mode).toBe('final')
    expect(report.evaluation.status).toBe('ready')
    expect(report.evaluation.issues.filter(issue => issue.category === 'delivery')).toEqual([])
    expect(report.evaluation.issues.some(issue => issue.category === 'content' && issue.message.includes('缺少 CLOCK'))).toBe(true)
    expect(report.markdown).toContain('## 逐题内容缺口')
    expect(report.markdown).toContain('交付检查通过不代表独立语义审核通过')
    expect(report.markdown).not.toContain('已完成当前证据与语义审核')
  })
  it.each([{ unit: 'characters', minimum: 999999, maximum: null },
    { unit: 'characters', minimum: null, maximum: 1 }])('does not gate automatic delivery on length %j', (targetLength) => {
    const input = fixture()
    const report = generateReport({ ...input, mode: 'auto', synthetic: false,
      brief: { ...input.brief, reportRequirements: { ...input.brief.reportRequirements, targetLength } } })
    expect(report.mode).toBe('final')
    expect(report.evaluation.issues.some(issue => issue.message.includes('篇幅'))).toBe(false)
  })
  it.each(['coverage', 'version', 'synthetic'] as const)('keeps %s failures as delivery blockers', (fault) => {
    const input = fixture()
    const report = generateReport({ ...input, mode: 'auto', synthetic: fault === 'synthetic',
      brief: { ...input.brief, evidenceRequirements: { ...input.brief.evidenceRequirements,
        minimumIncludedWorks: fault === 'coverage' ? 99 : input.brief.evidenceRequirements.minimumIncludedWorks },
      reportRequirements: input.brief.reportRequirements },
      versions: input.versions.map(version => fault === 'version' ? { ...version, status: 'retracted' as const } : version),
    })
    expect(report.mode).toBe('draft')
    expect(report.evaluation.status).toBe('blocked')
    expect(report.evaluation.issues.some(issue => issue.category === 'delivery')).toBe(true)
    expect(report.markdown).toContain('## 交付未达标原因')
  })
  it('groups appendix by paper title independently of evidence and bibliography input order', () => {
    const input = fixture()
    const works = input.works.map((work, index) => ({ ...work, title: index === 0 ? 'Z paper' : 'A paper' }))
    const changed = { ...input, works, evidence: [...input.evidence].reverse() }
    const before = JSON.stringify(changed)
    const report = generateReport(changed)
    const appendix = report.markdown.split('## 证据附录\n')[1]!
    expect(appendix.indexOf('A paper')).toBeLessThan(appendix.indexOf('Z paper'))
    for (const work of works) {
      const group = appendix.split(work.title)[1]!.split('\n### [')[0]!
      for (const record of input.evidence.filter(record => record.academicWorkId === work.academicWorkId)) {
        expect(group).toContain(`#### 版本 ${record.workVersionId}`)
        expect(group).toContain(`##### ${record.evidenceId}`)
        expect(group).toContain(record.sourceLocatorId)
      }
    }
    expect(JSON.stringify(changed)).toBe(before)
  })
  it('preserves citation status, partial dates and safe DOI or arXiv links', () => {
    const input = fixture(), a = input.works[0]!
    const doi = { kind: 'doi' as const, normalizedValue: '10.1234/a>b', originalValue: '10.1234/a>b', sourceProvider: 'fixture' }
    expect(scholarlyLink({ ...a, externalIdentifiers: [doi] }, [], input.evidence)).toBe('<https://doi.org/10.1234/a%3Eb>')
    const arxiv = { ...doi, kind: 'arxiv' as const, normalizedValue: '2401.12345v2' }
    expect(scholarlyLink({ ...a, externalIdentifiers: [arxiv] }, [], input.evidence)).toContain('arxiv.org/abs/2401.12345v2')
    expect(scholarlyLink({ ...a, externalIdentifiers: [] }, [], input.evidence.map(record => ({ ...record,
      sourceUrl: 'https://user:secret@example.invalid/' })))).toBe('稳定链接未提供')
    expect(generateReport({ ...input, evidence: input.evidence.map(record => ({ ...record,
      sourceUrl: 'https://user:secret@example.invalid/' })) }).markdown).not.toContain('user:secret')
    expect(generateReport(input).markdown).toContain('首次公开：2017')
    expect(generateReport(input).markdown).not.toContain('2017-01-01')
  })
  it('renders declared full-text results with conditions without ranking unlike datasets', () => {
    const input = fixture()
    const synthesis = { ...input.synthesis, directions: input.synthesis.directions!.map((direction, index) => index === 0
      ? { ...direction, keyResults: { statementIndexes: [0], missingReason: null, quantitative: true } } : direction) }
    const report = generateReport({ ...input, synthesis })
    expect(report.markdown).toContain('| 结果描述 | 适用条件 | 全文依据 | 不确定性 |')
    expect(report.markdown).toContain('不据此对不同数据集或指标建立统一排名')
    expect(generateReport({ ...input, mode: 'auto', synthetic: false }).mode).toBe('final')
  })
  it('labels a legacy output as incomplete instead of inventing directions', () => {
    const input = fixture()
    const { directions, ...synthesis } = input.synthesis
    expect(directions).toBeDefined()
    const report = generateReport({ ...input, synthesis })
    expect(report.markdown).toContain('方向布局尚未提供')
    expect(report.evaluation.issues.some(issue => issue.code === 'unmet_plan' && issue.message.includes('方向布局'))).toBe(true)
    expect(report.markdown).not.toContain('## 方向地图')
  })
})
