import { describe, expect, it } from 'vitest'
import { analyzeEvidence } from '@deepseek-ai/dsh-academic-analysis'
import { evaluateClaims } from '@deepseek-ai/dsh-academic-eval'
import { generateReport } from '../src/index.ts'
import { benchmark, reviewFixture } from './benchmark.ts'
import { batch, paper } from '../../analysis/tests/fixtures.ts'

describe('fixed evidence to reviewed report', () => {
  it('produces method and finding summaries with complete multi-evidence provenance', () => {
    const { input, analysis } = benchmark()
    expect(analysis.claims).toHaveLength(2)
    for (const claim of analysis.claims) {
      expect(claim.category).toBe('comparison')
      expect(claim.confidence).toBe('low')
      expect(claim.evidenceSnapshot.evidenceItems).toHaveLength(2)
      expect(input.links.filter(link => link.claimId === claim.claimId)).toHaveLength(2)
    }
    const report = generateReport(input)
    expect(report.evaluation.status).toBe('needs_review')
    expect(report.markdown).toContain('合成基准样例')
    expect(report.markdown).toContain('## 参考文献')
    expect(report.markdown).toContain('本合成研究分别记录')
    expect(report.markdown).not.toContain('性能最好')
  })

  it('does not generate cross-paper conclusions from a single work', () => {
    const { input } = benchmark()
    const result = analyzeEvidence(batch(paper('one')), input.brief, input.assessedAt)
    expect(result.claims).toEqual([])
    expect(result.limitations.join(' ')).toContain('Insufficient independent works')
  })

  it('requires brief approval and honors preprint and evidence-depth restrictions', () => {
    const { input } = benchmark()
    const source = batch(paper('a'), paper('b'))
    expect(() => analyzeEvidence(source, { ...input.brief, approval: { status: 'pending' } }, input.assessedAt)).toThrow('approval')
    const noPreprints = { ...input.brief, evidenceRequirements: { ...input.brief.evidenceRequirements, allowPreprints: false } }
    expect(analyzeEvidence(source, noPreprints, input.assessedAt).claims).toHaveLength(0)
  })

  it('blocks final reports without review and never publishes synthetic data as final', () => {
    const { input } = benchmark()
    expect(() => generateReport({ ...input, mode: 'final' })).toThrow('Final report requires')
    expect(evaluateClaims({ ...input, reviews: reviewFixture(input) }).status).toBe('ready')
    expect(() => generateReport({ ...input, reviews: reviewFixture(input), mode: 'final' })).toThrow('non-synthetic')
  })

  it.each(['missing', 'changed', 'retracted', 'background', 'unapproved', 'locator', 'wrong-review'] as const)('does not approve %s evidence', (fault) => {
    const { input } = benchmark()
    const evidence = input.evidence.map((record, index) => index === 0 && fault === 'changed'
      ? { ...record, contentHash: { status: 'available' as const, value: 'changed' } } : record)
    const result = evaluateClaims({ ...input,
      evidence: fault === 'missing' ? evidence.slice(1) : evidence,
      versions: fault === 'retracted' ? input.versions.map(v => ({ ...v, status: 'retracted' as const })) : input.versions,
      links: fault === 'background' ? input.links.map(link => ({ ...link, relation: 'background' as const })) : input.links,
      brief: fault === 'unapproved' ? { ...input.brief, approval: { status: 'pending' } } : input.brief,
      sourceLocators: fault === 'locator' ? [] : input.sourceLocators,
      reviews: fault === 'wrong-review' ? reviewFixture(input).map(r => ({ ...r, assessedEvidenceIds: [] })) : reviewFixture(input),
    })
    expect(result.status).not.toBe('ready')
  })

  it('reports insufficient input instead of inventing a conclusion', () => {
    const { input } = benchmark()
    const report = generateReport({ ...input, claims: [], links: [] })
    expect(report.evaluation.status).toBe('blocked')
    expect(report.markdown).toContain('证据不足')
  })

  it('retains explicit opposing links and refuses to hide conflict', () => {
    const { input } = benchmark()
    const links = input.links.map((link, index) => index === 0 ? { ...link, relation: 'contradicts' as const } : link)
    const report = generateReport({ ...input, links })
    expect(report.markdown).toContain('contradicts')
    expect(evaluateClaims({ ...input, links, reviews: reviewFixture(input),
      claims: input.claims.map(claim => ({ ...claim, uncertainty: null })) }).status).toBe('blocked')
  })

  it('escapes Markdown content and rejects missing bibliography', () => {
    const { input } = benchmark()
    expect(generateReport({ ...input, brief: { ...input.brief, topic: '<script>alert(1)</script>' } }).markdown).toContain('\\<script\\>')
    expect(() => generateReport({ ...input, works: [] })).toThrow('bibliography')
  })
})
