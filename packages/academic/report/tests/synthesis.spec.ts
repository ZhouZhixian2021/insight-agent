import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSynthesisDraft, prepareSynthesisInput, synthesisAnalysis, type AcademicSynthesisInput } from '@deepseek-ai/dsh-academic-analysis'
import { generateReport } from '../src/index.ts'

function fixture() {
  const samples = new URL('../../../../z-team_docs/interface-samples/academic-model-v1/', import.meta.url)
  const input: AcademicSynthesisInput = JSON.parse(readFileSync(new URL('synthesis-input.sample.json', samples), 'utf8')) as AcademicSynthesisInput
  const admission = prepareSynthesisInput(input)
  if (admission.status !== 'ready') throw new Error('fixture rejected')
  const synthesis = parseSynthesisDraft(readFileSync(new URL('synthesis-output.sample.json', samples), 'utf8'), admission.input)
  const analysis = synthesisAnalysis(admission.input, synthesis, '2026-09-20T00:00:00Z')
  return { brief: input.brief, claims: analysis.claims, links: analysis.links,
    evidence: input.analysisInput.evidenceRecords, versions: input.analysisInput.workVersions,
    works: input.analysisInput.academicWorks, sourceLocators: input.analysisInput.sourceLocators,
    reviews: [], assessedAt: '2026-09-20T00:00:00Z', limitations: synthesis.limitations,
    synthesis, coverage: input.coverageSummary, synthetic: true, mode: 'draft' as const }
}
describe('question-driven report', () => {
  it('counts source-specific answers without inventing cross-paper Claims or granting review', () => {
    const input = fixture()
    const report = generateReport({ ...input, claims: [], links: [], synthesis: { ...input.synthesis,
      statements: input.synthesis.statements.slice(0, 2),
      sections: input.synthesis.sections.map(section => ({ ...section,
        statementIndexes: section.statementIndexes.filter(index => index < 2),
        missingReason: section.sectionId === 'cross_paper_analysis' ? '没有足够证据形成跨论文综合。' : section.missingReason,
      })),
    } })
    expect(report.claims).toEqual([])
    expect(report.evidence).toHaveLength(2)
    expect(report.evaluation.status).toBe('needs_review')
    expect(report.evaluation.issues.some(issue => issue.code === 'no_claims' || issue.code === 'insufficient_coverage')).toBe(false)
    expect(report.evaluation.issues.some(issue => issue.code === 'source_statement_review_required')).toBe(true)
  })
  it('blocks a source-specific answer when its current evidence hash disagrees', () => {
    const input = fixture()
    const report = generateReport({ ...input, versions: input.versions.map(version => ({ ...version,
      contentHash: { status: 'available', value: 'changed' } })), claims: [], links: [] })
    expect(report.evaluation.status).toBe('blocked')
    expect(report.evaluation.issues.some(issue => issue.code === 'version_hash_mismatch')).toBe(true)
  })
  it('renders individual answers and cross-paper analysis with real input references and visible gaps', () => {
    const input = fixture(), report = generateReport(input)
    expect(report.markdown).toContain('逐题研究结论')
    for (const question of input.brief.questions) expect(report.markdown).toContain(question)
    for (const statement of input.synthesis.statements) expect(report.markdown).toContain(statement.text)
    expect(report.markdown).toContain('部分回答')
    expect(report.evidence).toHaveLength(2)
    expect(report.claims).toHaveLength(1)
    expect(report.evaluation.status).toBe('needs_review')
    expect(report.evaluation.issues.some(issue => issue.code === 'unmet_plan')).toBe(true)
    expect(report.markdown).toContain('不能替代真实全文验收')
  })
  it('does not use large quotations or repeated paragraphs to satisfy the approved body length', () => {
    const input = fixture()
    const report = generateReport({ ...input, brief: { ...input.brief,
      reportRequirements: { ...input.brief.reportRequirements, targetLength: { unit: 'characters', minimum: 2000, maximum: 8000 } } } })
    expect(report.limitations.join(' ')).toContain('未满足批准的篇幅范围 2000—8000')
    expect(() => generateReport({ ...input, mode: 'final' })).toThrow()
  })
})


it('discloses count gaps in a downloadable draft while denying final delivery', () => {
  const value = fixture()
  const brief = { ...value.brief, evidenceRequirements: { ...value.brief.evidenceRequirements, minimumIncludedWorks: 6 } }
  const report = generateReport({ ...value, brief, coverage: { ...value.coverage, includedWorks: 3 } })
  expect(report.markdown).toContain('证据有限的研究草稿')
  expect(report.markdown).toContain('本轮纳入分析 3 篇论文；正文引用 2 篇')
  expect(report.markdown).toContain('Plan 至少要求 6 篇')
  expect(report.markdown).toContain('部分回答')
  expect(report.evaluation.status).toBe('blocked')
  expect(report.evaluation.issues.some(issue => issue.code === 'unmet_plan' && issue.message.includes('至少要求 6 篇'))).toBe(true)
  expect(() => generateReport({ ...value, brief, mode: 'final', synthetic: false })).toThrow()
})
