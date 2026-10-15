import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSynthesisDraft, prepareSynthesisInput, synthesisAnalysis, type AcademicSynthesisInput } from '@deepseek-ai/dsh-academic-analysis'
import { generateReport } from '../src/index.ts'

const samples = new URL('../../../../z-team_docs/interface-samples/academic-model-v1/', import.meta.url)
function fixture() {
  const value = JSON.parse(readFileSync(new URL('synthesis-input.sample.json', samples), 'utf8')) as AcademicSynthesisInput
  const record = value.analysisInput.evidenceRecords[0]!
  const input = { ...value, brief: { ...value.brief, evidenceRequirements: { ...value.brief.evidenceRequirements,
    insufficientEvidencePolicy: 'continue_with_warning' as const } }, analysisInput: { ...value.analysisInput,
    evidenceRecords: [record], questionLinks: [{ evidenceId: record.evidenceId, question: value.brief.questions[0]! }],
    evidenceCards: value.analysisInput.evidenceCards.map(card => ({ ...card, researchQuestions: [], methods: [],
      datasets: [], metrics: [], findings: [], limitations: [] })),
  } }
  const admitted = prepareSynthesisInput(input)
  if (admitted.status === 'blocked') throw new Error('fixture blocked')
  const synthesis = parseSynthesisDraft(readFileSync(new URL('synthesis-output.sample.json', samples), 'utf8'), admitted.input)
  const analysis = synthesisAnalysis(admitted.input, synthesis, '2026-10-15T00:00:00Z')
  return { brief: input.brief, claims: analysis.claims, links: analysis.links, synthesis,
    questionLinks: input.analysisInput.questionLinks, evidence: input.analysisInput.evidenceRecords,
    versions: input.analysisInput.workVersions, works: input.analysisInput.academicWorks,
    sourceLocators: input.analysisInput.sourceLocators, reviews: [], assessedAt: '2026-10-15T00:00:00Z',
    limitations: admitted.limitations, coverage: { ...input.coverageSummary, includedWorks: 1 },
    synthetic: true, mode: 'draft' as const }
}

describe('minimal-evidence report delivery', () => {
  it('retains the supported source statement, marks other questions missing and denies final delivery', async () => {
    const input = fixture(), before = JSON.stringify(input), report = generateReport(input)
    expect(report.evidence).toHaveLength(1)
    expect(report.claims).toEqual([])
    expect(report.markdown).toContain('证据有限的研究草稿')
    expect(report.markdown).toContain('无本题关联的支持证据')
    expect(report.markdown).toContain('未回答')
    expect(report.markdown).toContain('证据卡部分分区未抽取')
    expect(report.markdown).toContain(input.evidence[0]!.evidenceId)
    expect(report.evaluation.status).not.toBe('ready')
    expect(() => generateReport({ ...input, mode: 'final', synthetic: false })).toThrow()
    expect(JSON.stringify(input)).toBe(before)
    await expect(report.markdown).toMatchFileSnapshot('./expected/minimal-report.md')
  })

  it('does not invent question associations for a legacy caller or elevate abstract evidence', () => {
    const { questionLinks: _links, ...input } = fixture()
    const report = generateReport(input)
    expect(report.markdown).toContain('未提供抽取关联')
    expect(report.limitations.join(' ')).toContain('不能把模型填写的问题索引视为已核实的覆盖')
    const abstract = input.evidence.map(record => ({ ...record, level: 'abstract' as const }))
    const assessed = generateReport({ ...input, evidence: abstract })
    expect(assessed.evaluation.status).toBe('blocked')
    expect(assessed.evaluation.issues.some(issue => issue.code === 'fulltext_required')).toBe(true)
  })

  it('refuses to manufacture a report without cited evidence', () => {
    expect(() => generateReport({ ...fixture(), evidence: [] })).toThrow('No cited evidence')
  })
})
