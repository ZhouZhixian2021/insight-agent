import { describe, expect, it } from 'vitest'
import { generateReport, type ReportInput } from '../src/index.ts'
import { benchmark, reviewFixture } from './benchmark.ts'

function reviewedInput(): ReportInput {
  const { input } = benchmark()
  // Test the caller-controlled delivery flags; this fixture is never exported as real research.
  return { ...input, mode: 'final', synthetic: false, reviews: reviewFixture(input) }
}

describe('final delivery policy', () => {
  it('allows explicitly reviewed evidence while retaining scope and references', () => {
    const input = reviewedInput()
    const report = generateReport({ ...input, claims: input.claims.map(claim => ({ ...claim, uncertainty: null })) })
    expect(report.mode).toBe('final')
    expect(report.markdown).toContain('已完成当前证据与语义审核')
    expect(report.markdown).not.toContain('合成基准样例：')
  })
  it.each([
    { language: 'en' }, { citationStyle: 'author_year' as const }, { includeResearchGaps: true }, { requiredSections: ['unimplemented'] },
  ])('rejects a final template that cannot honor %j', (requirements) => {
    const input = reviewedInput()
    expect(() => generateReport({ ...input, brief: { ...input.brief,
      reportRequirements: { ...input.brief.reportRequirements, ...requirements } } })).toThrow('different renderer')
  })
  it.each([
    { unit: 'words', minimum: 1, maximum: null },
    { unit: 'characters', minimum: 999999, maximum: null },
    { unit: 'characters', minimum: null, maximum: 1 },
  ])('rejects unmet length requirements %j', (targetLength) => {
    const input = reviewedInput()
    expect(() => generateReport({ ...input, brief: { ...input.brief,
      reportRequirements: { ...input.brief.reportRequirements, targetLength } } })).toThrow()
  })
  it('accepts a character range containing the generated report', () => {
    const input = reviewedInput()
    expect(generateReport({ ...input, brief: { ...input.brief, reportRequirements: {
      ...input.brief.reportRequirements, targetLength: { unit: 'characters', minimum: 1, maximum: 999999 },
    } } }).mode).toBe('final')
  })
  it('rejects duplicate bibliography and discloses missing evidence in drafts', () => {
    const { input } = benchmark()
    expect(() => generateReport({ ...input, works: [...input.works, ...input.works] })).toThrow('Duplicate')
    expect(generateReport({ ...input, evidence: [] }).markdown).toContain('缺失来源')
  })
  it.each(['javascript:alert(1)', 'not a URL', 'http://example.invalid/paper'])('does not activate an unsafe source URL: %s', (sourceUrl) => {
    const { input } = benchmark()
    const report = generateReport({ ...input, evidence: input.evidence.map(record => ({ ...record, sourceUrl,
      verbatimExcerpt: { status: 'unknown', reason: 'not available' } })) })
    expect(report.markdown).toContain('原文不可用')
    expect(report.markdown).not.toContain('<javascript:')
    if (sourceUrl.startsWith('http:')) expect(report.markdown).toContain('<http://example.invalid/paper>')
    else expect(report.markdown).toContain('来源 URL 不可用')
  })
})
