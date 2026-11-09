import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, it } from 'vitest'
import {
  checkProductClaimFreshness, createProductBatchResult, isExecutableProductPlan,
  type CandidatePageId, type ProductClaim, type ProductClaimId, type ProductEvidence, type ProductEvidenceId,
  type ProductFailure, type ProductFailureId, type ProductPlan, type ProductPlanId,
  type ProductQuestionId, type ProductId, type SourceSnapshot, type SourceSnapshotId,
} from '../src/index.ts'

const productId = brandString<ProductId>('product-1')
const planId = brandString<ProductPlanId>('plan-1')
const questionId = brandString<ProductQuestionId>('question-1')
const pageId = brandString<CandidatePageId>('page-1')
const snapshotId = brandString<SourceSnapshotId>('snapshot-1')
const evidenceId = brandString<ProductEvidenceId>('evidence-1')

const plan: ProductPlan = {
  schemaVersion: 1, planId, version: 2, productId,
  questions: [{ questionId, text: 'Does the product support batch export?' }],
  scope: 'Current software capabilities',
  approval: { status: 'approved', approvedPlanVersion: 2, reviewedBy: 'user', reviewedAt: '2026-11-04T00:00:00Z', comment: null },
}

const evidence: ProductEvidence = {
  schemaVersion: 1, evidenceId, candidatePageId: pageId, sourceSnapshotId: snapshotId,
  contentHash: 'sha256:original', questionIds: [questionId],
  verbatimExcerpt: 'Batch export is available on the enterprise plan.',
  sourcedStatement: 'Enterprise users can export in batches.',
  locator: { kind: 'heading', heading: 'Export', occurrence: 1 },
  extractionMethod: { name: 'fixed-example', version: '1' },
}

const snapshot: SourceSnapshot = {
  schemaVersion: 1, sourceSnapshotId: snapshotId, candidatePageId: pageId,
  observedAt: '2026-11-04T00:00:00Z', status: 'available',
  contentRef: 'content:page-1', contentHash: 'sha256:original',
}

const claim: ProductClaim = {
  schemaVersion: 1, claimId: brandString<ProductClaimId>('claim-1'), text: 'Batch export is available on the enterprise plan.',
  scope: 'Enterprise plan', questionIds: [questionId], confidence: 'high',
  confidenceReasons: ['The official documentation states the plan condition.'],
  evidenceLinks: [{ evidenceId, relation: 'supports', rationale: 'Direct feature statement.' }],
  evidenceSnapshot: { planId, planVersion: 2, evidenceItems: [{ evidenceId, candidatePageId: pageId, contentHash: 'sha256:original' }] },
  validity: 'current',
}

describe('product plan approval', () => {
  it('authorizes only the exact approved version', () => {
    expect(isExecutableProductPlan(plan)).toBe(true)
    expect(isExecutableProductPlan({ ...plan, version: 3 })).toBe(false)
    expect(isExecutableProductPlan({ ...plan, approval: { status: 'pending' } })).toBe(false)
  })
})

describe('partial processing results', () => {
  it('retains successful records and failures without treating an empty success as failure', () => {
    const failure: ProductFailure = {
      schemaVersion: 1, failureId: brandString<ProductFailureId>('failure-1'), stage: 'fetch',
      category: 'timeout', message: 'Timed out', retryable: true, occurredAt: '2026-11-04T00:00:00Z',
    }
    expect(createProductBatchResult([], []).status).toBe('success')
    expect(createProductBatchResult([], [failure]).status).toBe('failed')
    const items = [evidence]
    const failures = [failure]
    const result = createProductBatchResult(items, failures)
    expect(result.status).toBe('partial_success')
    expect(result.items).toEqual(items)
    expect(result.failures).toEqual(failures)
    expect(result.items).not.toBe(items)
    expect(result.failures).not.toBe(failures)
  })
})

describe('product claim freshness', () => {
  const currentEvidence = new Map([[evidenceId, evidence]])
  const currentPages = new Map([[pageId, snapshot]])

  it('distinguishes unchanged, changed, and unverifiable page content', () => {
    expect(checkProductClaimFreshness(claim, plan, currentEvidence, currentPages).status).toBe('current')
    const changed: SourceSnapshot = { ...snapshot, contentHash: 'sha256:changed' }
    expect(checkProductClaimFreshness(claim, plan, currentEvidence, new Map([[pageId, changed]])).status).toBe('stale')
    const failed: SourceSnapshot = {
      schemaVersion: 1, sourceSnapshotId: brandString<SourceSnapshotId>('snapshot-2'),
      candidatePageId: pageId, observedAt: '2026-11-05T00:00:00Z', status: 'failed',
      failureId: brandString<ProductFailureId>('failure-2'),
    }
    expect(checkProductClaimFreshness(claim, plan, currentEvidence, new Map([[pageId, failed]])).status).toBe('unverifiable')
  })

  it('treats a changed plan as stale and missing evidence as unverifiable', () => {
    expect(checkProductClaimFreshness(claim, { ...plan, version: 3 }, currentEvidence, currentPages).status).toBe('stale')
    expect(checkProductClaimFreshness(claim, plan, new Map(), currentPages).status).toBe('unverifiable')
  })
})
