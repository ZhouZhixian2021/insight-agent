import { describe, expect, it } from 'vitest'
import { evaluateClaims } from '../src/index.ts'
import { benchmark, reviewFixture } from '../../report/tests/benchmark.ts'

describe('trusted scholarly evidence admission', () => {
  it('retains existing review requirements even when all evidence was admitted', () => {
    const { input } = benchmark()
    expect(evaluateClaims({ ...input, admittedEvidence: input.evidence }).status).toBe('needs_review')
    expect(evaluateClaims({ ...input, admittedEvidence: input.evidence, reviews: reviewFixture(input) }).status).toBe('ready')
  })
  it('does not count unadmitted evidence towards the approved work coverage', () => {
    const { input } = benchmark()
    const result = evaluateClaims({ ...input, admittedEvidence: [], reviews: reviewFixture(input) })
    expect(result.status).toBe('blocked')
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['evidence_not_admitted', 'insufficient_coverage']))
  })
  it('rejects Web snippets substituted into an otherwise valid evidence identity', () => {
    const { input } = benchmark()
    const result = evaluateClaims({ ...input, admittedEvidence: input.evidence,
      evidence: input.evidence.map(record => ({ ...record, verbatimExcerpt: { status: 'available', value: 'Search engine generated answer' } })),
    })
    expect(result.status).toBe('blocked')
    expect(result.issues.some(issue => issue.code === 'evidence_not_admitted')).toBe(true)
  })
  it('rejects ambiguous admissions and checks attributed single-paper statements too', () => {
    const { input } = benchmark()
    const result = evaluateClaims({ ...input, claims: [], links: [],
      sourceStatements: [{ evidenceLinks: [{ evidenceId: input.evidence[0]!.evidenceId, relation: 'supports' }] }],
      admittedEvidence: [...input.evidence, ...input.evidence],
    })
    expect(result.status).toBe('blocked')
    expect(result.issues.some(issue => issue.code === 'evidence_not_admitted')).toBe(true)
  })
})
