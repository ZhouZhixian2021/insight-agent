import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSynthesisDraft, synthesisAnalysis, type AcademicSynthesisInput } from '@deepseek-ai/dsh-academic-analysis'
import { generateReport } from '../src/index.ts'

function fixture() {
  const root = new URL('../../../../z-team_docs/interface-samples/academic-model-v1/', import.meta.url)
  const input = JSON.parse(readFileSync(new URL('synthesis-input.sample.json', root), 'utf8')) as AcademicSynthesisInput
  const value = JSON.parse(readFileSync(new URL('synthesis-output.sample.json', root), 'utf8')) as Record<string, unknown>
  const draft = parseSynthesisDraft(JSON.stringify({ ...value, writingStyle: 'evidence_narrative' }), input)
  const analysis = synthesisAnalysis(input, draft, '2026-10-28T00:00:00Z')
  return { source: input, draft, input: { brief: input.brief, claims: analysis.claims, links: analysis.links,
    evidence: input.analysisInput.evidenceRecords, admittedEvidence: input.analysisInput.evidenceRecords,
    versions: input.analysisInput.workVersions, sourceLocators: input.analysisInput.sourceLocators,
    works: input.analysisInput.academicWorks, reviews: [], assessedAt: '2026-10-28T00:00:00Z',
    limitations: draft.limitations, synthesis: draft, coverage: input.coverageSummary, synthetic: true, mode: 'auto' as const } }
}

describe('production evidence-narrative report', () => {
  it('uses B-style section prose once, retains conditions and puts scope and checks after the body', async () => {
    const { input, draft } = fixture(), before = JSON.stringify(input)
    const report = generateReport(input)
    expect(report.markdown).not.toContain('见[分析段落')
    expect(report.markdown).not.toContain('## 方向地图')
    for (const statement of draft.statements) {
      expect(report.markdown.split(statement.text).length - 1).toBe(1)
      expect(report.markdown).toContain(statement.scope)
    }
    expect(report.markdown.indexOf('报告信息与研究范围')).toBeGreaterThan(report.markdown.indexOf(draft.statements[0]?.text ?? ''))
    expect(report.markdown).toContain('## 参考文献')
    expect(report.markdown).toContain('## 证据附录')
    expect(report.mode).toBe('draft')
    expect(report.evaluation.issues.some(issue => issue.code === 'synthetic_data')).toBe(true)
    expect(JSON.stringify(input)).toBe(before)
    await expect(report.markdown).toMatchFileSnapshot('./expected/narrative-report.md')
  })

  it('preserves delivery blockers and rejects an unrecognized writing style', () => {
    const { input, source } = fixture()
    const report = generateReport({ ...input, versions: input.versions.map(version => ({ ...version,
      contentHash: { status: 'available' as const, value: 'mismatched' } })) })
    expect(report.evaluation.issues.some(issue => issue.code === 'version_hash_mismatch')).toBe(true)
    const root = new URL('../../../../z-team_docs/interface-samples/academic-model-v1/synthesis-output.sample.json', import.meta.url)
    const value = JSON.parse(readFileSync(root, 'utf8')) as Record<string, unknown>
    expect(() => parseSynthesisDraft(JSON.stringify({ ...value, writingStyle: 'unknown' }), source)).toThrow()
  })

  it('shows actual result text and conditions in the results table instead of a paragraph jump', () => {
    const { input, draft } = fixture()
    const synthesis = { ...draft, sections: draft.sections.map(section => ({ ...section,
      statementIndexes: section.sectionId === 'key_findings' ? [2] : section.statementIndexes.filter(index => index !== 2),
      missingReason: section.sectionId === 'key_findings' ? null : section.missingReason })) }
    const report = generateReport({ ...input, synthesis })
    expect(report.markdown).toContain('| 已报告结果 | 研究与实验条件 | 来源 | 比较限制 |')
    expect(report.markdown).toContain(`| ${draft.statements[2]?.text} |`)
    expect(report.markdown).not.toContain('见[分析段落')
  })
})
