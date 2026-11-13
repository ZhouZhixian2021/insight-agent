import { describe, expect, it } from 'vitest'
import { createCandidatePageId, createProductId, createProductPlanId, createProductQuestionId,
  createSourceSnapshotId } from '@deepseek-ai/dsh-product-insight-model'
import type { AvailableSourceSnapshot, CandidatePage, Product, ProductPlan } from '@deepseek-ai/dsh-product-insight-model'
import { assessProductSource } from '../src/claim-verification.ts'

const product: Product = { schemaVersion: 1, productId: createProductId(), name: 'Apple M6',
  developer: 'Apple', officialUrl: 'https://www.apple.com/mac-mini/' }
const plan: ProductPlan = { schemaVersion: 1, planId: createProductPlanId(), version: 1,
  productId: product.productId, scope: 'M6 Mac mini', questions: [{ questionId: createProductQuestionId(), text: 'Specs?' }],
  sourcePublishers: [{ name: 'MacRumors', domain: 'macrumors.com' }],
  approval: { status: 'approved', approvedPlanVersion: 1, reviewedBy: 'reviewer',
    reviewedAt: '2026-11-12T00:00:00.000Z', comment: null } }

function pageFor(url: string, sourceType: CandidatePage['sourceType']): CandidatePage {
  return { schemaVersion: 1, candidatePageId: createCandidatePageId(), planId: plan.planId,
    productId: product.productId, url, sourceType, discoveredAt: '2026-11-12T00:00:00.000Z',
    questionIds: [plan.questions[0]!.questionId],
    screening: { status: 'selected', reason: 'screened', screenedAt: '2026-11-12T00:00:00.000Z' } }
}

function snapshotFor(page: CandidatePage): AvailableSourceSnapshot {
  return { schemaVersion: 1, sourceSnapshotId: createSourceSnapshotId(), candidatePageId: page.candidatePageId,
    observedAt: '2026-11-12T00:00:00.000Z', status: 'available',
    contentRef: `${page.candidatePageId}:text`, contentHash: 'sha256:00' }
}

describe('source eligibility', () => {
  it('accepts a country site that discovery recorded as the official product page', () => {
    const page = pageFor('https://www.apple.com.cn/mac-mini/specs/', 'official_product_page')
    const source = assessProductSource(product, plan, page, snapshotFor(page))
    expect(source).toMatchObject({ eligible: true, publisher: 'Apple', reasons: [] })
  })

  it('accepts an approved external publisher and reports its reviewed name', () => {
    const page = pageFor('https://www.macrumors.com/2026/08/25/apple-reveals-m6/', 'other')
    const source = assessProductSource(product, plan, { ...page, publisher: 'MacRumors' }, snapshotFor(page))
    expect(source).toMatchObject({ eligible: true, publisher: 'MacRumors', reasons: [] })
  })

  it('rejects a host no record approved', () => {
    const page = pageFor('https://example.test/m6/', 'other')
    const source = assessProductSource(product, plan, page, snapshotFor(page))
    expect(source).toMatchObject({ eligible: false, publisher: null })
    expect(source.reasons).toEqual(['External publisher domain was not approved in the plan.'])
  })
})
