import { describe, expect, it } from 'vitest'
import { evaluateClaims } from '../src/index.ts'
import { benchmark, reviewFixture } from '../../report/tests/benchmark.ts'
import { paper } from '../../analysis/tests/fixtures.ts'

describe('evidence review eligibility', () => {
  it('flags a link to a claim that is not in the input', () => {
    const { input } = benchmark()
    expect(evaluateClaims({ ...input, claims: input.claims.slice(1) }).issues.some(i => i.code === 'orphan_link')).toBe(true)
  })
  it('enforces preprint, fulltext, excerpt, confidence and locator-depth policies', () => {
    const { input } = benchmark()
    const result = evaluateClaims({ ...input,
      brief: { ...input.brief, evidenceRequirements: { ...input.brief.evidenceRequirements, allowPreprints: false, minimumEvidenceLevel: 'fulltext' } },
      evidence: input.evidence.map(record => ({ ...record, level: 'metadata', verbatimExcerpt: { status: 'not_extracted' } })),
      claims: input.claims.map(claim => ({ ...claim, confidence: 'insufficient' })),
    })
    expect(result.status).toBe('blocked')
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'preprint_disallowed', 'fulltext_required', 'metadata_only', 'excerpt_unavailable', 'invalid_locator_level', 'insufficient_confidence',
    ]))
    const record = input.evidence[0]!
    const providerLocator = { schemaVersion: 1 as const, sourceLocatorId: record.sourceLocatorId, workVersionId: record.workVersionId,
      contentHash: null, kind: 'provider_record' as const, provider: 'fixture', recordId: 'fixture', url: record.sourceUrl }
    expect(evaluateClaims({ ...input, sourceLocators: [providerLocator, ...input.sourceLocators.slice(1)] }).status).toBe('blocked')
    expect(evaluateClaims({ ...input, versions: [paper('unrelated').version] }).status).toBe('blocked')
  })
  it('does not silently resolve duplicate evidence identities', () => {
    const { input } = benchmark()
    const result = evaluateClaims({ ...input, evidence: [...input.evidence, ...input.evidence] })
    expect(result.status).toBe('blocked')
    expect(result.issues.some(issue => issue.code === 'duplicate_identity')).toBe(true)
  })
  it('rejects snapshot/link set mismatch even when every referenced record exists', () => {
    const { input } = benchmark()
    const result = evaluateClaims({ ...input, links: input.links.slice(1), reviews: reviewFixture(input) })
    expect(result.status).toBe('blocked')
    expect(result.issues.some(issue => issue.code === 'snapshot_links_mismatch')).toBe(true)
  })
  it('honors coverage requirements and negative semantic assessments', () => {
    const { input } = benchmark()
    const brief = { ...input.brief, evidenceRequirements: { ...input.brief.evidenceRequirements, minimumFulltextWorks: 2 } }
    expect(evaluateClaims({ ...input, brief, reviews: reviewFixture(input) }).status).toBe('blocked')
    expect(evaluateClaims({ ...input, reviews: reviewFixture(input).map(review => ({ ...review, status: 'unsupported' })) }).status).toBe('blocked')
  })
})
