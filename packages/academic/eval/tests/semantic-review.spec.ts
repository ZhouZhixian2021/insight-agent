import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ClaimAssessment } from '@deepseek-ai/dsh-academic-model'
import { evaluateClaims } from '../src/index.ts'
import { generateReport } from '@deepseek-ai/dsh-academic-report'
import { benchmark, reviewFixture } from '../../report/tests/benchmark.ts'

const fixture = JSON.parse(readFileSync(new URL('./semantic-cases.json', import.meta.url), 'utf8')) as {
  synthetic: true
  cases: {
    name: string
    evidence: [string, string]
    claim: string
    scope: string
    expectedReview: ClaimAssessment['status']
    reason: string
  }[]
}

describe('citation existence versus semantic support', () => {
  it.each(fixture.cases)('requires independent review for $name and respects a negative fixed review', (test) => {
    const { input } = benchmark()
    const evidence = input.evidence.map((record, index) => ({ ...record,
      verbatimExcerpt: { status: 'available' as const, value: test.evidence[index]! }, sourcedStatement: test.evidence[index]!,
      contentHash: { status: 'available' as const, value: `sha256:${createHash('sha256').update(test.evidence[index]!).digest('hex')}` } }))
    const request = { ...input, evidence,
      claims: input.claims.map(claim => ({ ...claim, text: test.claim, scope: test.scope,
        evidenceSnapshot: { ...claim.evidenceSnapshot, evidenceItems: claim.evidenceSnapshot.evidenceItems.map(item => ({ ...item,
          contentHash: evidence.find(record => record.evidenceId === item.evidenceId)!.contentHash.value })) } })),
      versions: input.versions.map(version => ({ ...version,
        contentHash: evidence.find(record => record.workVersionId === version.workVersionId)!.contentHash })),
      sourceLocators: input.sourceLocators.map(locator => ({ ...locator,
        contentHash: evidence.find(record => record.sourceLocatorId === locator.sourceLocatorId)!.contentHash.value })),
    }
    const unchecked = evaluateClaims(request)
    expect(unchecked.status).toBe('needs_review')
    expect(unchecked.issues.some(issue => issue.code === 'semantic_review_required')).toBe(true)
    const reviews = reviewFixture(request).map(review => ({ ...review, status: test.expectedReview,
      reason: test.reason, method: 'human-authored-synthetic-oracle' }))
    const result = evaluateClaims({ ...request, reviews })
    expect(result.status).toBe('blocked')
    expect(result.assessments.every(review => review.status === test.expectedReview)).toBe(true)
    expect(result.assessments[0]!.reason).toBe(test.reason)
    expect(() => generateReport({ ...request, reviews, mode: 'final', synthetic: false })).toThrow('Final report requires')
  })
  it('does not treat duplicates in a review as a complete one-to-one evidence review', () => {
    const { input } = benchmark()
    const reviews = reviewFixture(input).map(review => ({ ...review,
      assessedEvidenceIds: [...review.assessedEvidenceIds, review.assessedEvidenceIds[0]!] }))
    expect(evaluateClaims({ ...input, reviews }).status).toBe('needs_review')
  })
  it('does not let global paper coverage conceal single-work support for one Claim', () => {
    const { input } = benchmark()
    const firstClaim = input.claims[0]!
    const links = input.links.map((link, index) => index === 1 ? { ...link, relation: 'background' as const } : link)
    const result = evaluateClaims({ ...input, links, reviews: reviewFixture(input) })
    expect(result.status).toBe('blocked')
    expect(result.issues).toContainEqual(expect.objectContaining({ claimId: firstClaim.claimId,
      code: 'insufficient_independent_support' }))
    expect(result.issues.some(issue => issue.code === 'insufficient_coverage')).toBe(false)
  })
  it('rejects repeated evidence links even when they have different link IDs', () => {
    const { input } = benchmark()
    const duplicate = { ...input.links[0]!, claimEvidenceLinkId: 'duplicate-link' as (typeof input.links)[number]['claimEvidenceLinkId'] }
    const result = evaluateClaims({ ...input, links: [...input.links, duplicate], reviews: reviewFixture(input) })
    expect(result.status).toBe('blocked')
    expect(result.issues.some(issue => issue.code === 'duplicate_claim_evidence')).toBe(true)
  })
})
