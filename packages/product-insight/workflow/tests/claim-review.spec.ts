import { describe, expect, it } from 'vitest'
import { createCandidatePageId, createProductEvidenceId, createProductId, createProductPlanId,
  createProductQuestionId, createSourceSnapshotId } from '@deepseek-ai/dsh-product-insight-model'
import type { ProductEvidence, ProductPlan } from '@deepseek-ai/dsh-product-insight-model'
import { adoptEvidenceQuestions, claimsFromSemanticReview } from '../src/claim-review.ts'

const first = createProductQuestionId()
const second = createProductQuestionId()
const plan: ProductPlan = { schemaVersion: 1, planId: createProductPlanId(), version: 1,
  productId: createProductId(), scope: 'M6', questions: [{ questionId: first, text: 'Specs?' },
    { questionId: second, text: 'Price?' }],
  approval: { status: 'approved', approvedPlanVersion: 1, reviewedBy: 'reviewer',
    reviewedAt: '2026-11-12T00:00:00.000Z', comment: null } }

const evidence: ProductEvidence = { schemaVersion: 1, evidenceId: createProductEvidenceId(),
  candidatePageId: createCandidatePageId(), sourceSnapshotId: createSourceSnapshotId(),
  contentHash: 'sha256:00', questionIds: [first], verbatimExcerpt: 'M6 has 12 cores.',
  sourcedStatement: 'M6 has 12 CPU cores.',
  locator: { kind: 'text_range', start: 0, end: 15 }, extractionMethod: { name: 'passage', version: '1' } }

describe('semantic review admission', () => {
  it('answers the excerpt questions when a supported judgment omits them', () => {
    const claims = claimsFromSemanticReview(plan, [evidence],
      [{ evidenceId: evidence.evidenceId, verdict: 'supported', questionIds: [], rationale: 'Excerpt states it.' }])
    expect(claims).toHaveLength(1)
    expect(claims[0]?.questionIds).toEqual([first])
  })

  it('keeps a narrow question list when the judgment supplies one', () => {
    const claims = claimsFromSemanticReview(plan, [evidence],
      [{ evidenceId: evidence.evidenceId, verdict: 'supported', questionIds: [first], rationale: 'Excerpt states it.' }])
    expect(claims[0]?.questionIds).toEqual([first])
  })

  it('admits nothing for an unsupported judgment that still lists questions', () => {
    const claims = claimsFromSemanticReview(plan, [evidence],
      [{ evidenceId: evidence.evidenceId, verdict: 'unsupported', questionIds: [first], rationale: 'Marketing claim.' }])
    expect(claims).toEqual([])
  })

  it('rejects a judgment that answers only a question the excerpt was not collected for', () => {
    expect(() => claimsFromSemanticReview(plan, [evidence],
      [{ evidenceId: evidence.evidenceId, verdict: 'supported', questionIds: [second], rationale: 'Other question.' }]))
      .toThrow(/invalid judgment/u)
  })

  it('keeps an approved extra question alongside the excerpt question', () => {
    const claims = claimsFromSemanticReview(plan, [evidence],
      [{ evidenceId: evidence.evidenceId, verdict: 'supported', questionIds: [first, second],
        rationale: 'Also answers the price question.' }])
    expect(claims[0]?.questionIds).toEqual([first, second])
  })

  it('records the excerpt questions on the admitted judgment that later checks read', () => {
    const admitted = adoptEvidenceQuestions([evidence],
      [{ evidenceId: evidence.evidenceId, verdict: 'supported', questionIds: [], rationale: 'Excerpt states it.' }])
    expect(admitted[0]?.questionIds).toEqual([first])
    expect(adoptEvidenceQuestions([evidence],
      [{ evidenceId: evidence.evidenceId, verdict: 'uncertain', questionIds: [], rationale: 'Unsure.' }])[0]
      ?.questionIds).toEqual([])
  })
})
