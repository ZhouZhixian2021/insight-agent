import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, it } from 'vitest'
import type { Product, ProductId, ProductPlan, ProductPlanId, ProductQuestionId } from '@deepseek-ai/dsh-product-insight-model'
import { discoverCandidatePages } from '../src/index.ts'

const productId = brandString<ProductId>('product')
const planId = brandString<ProductPlanId>('plan')
const first = brandString<ProductQuestionId>('first')
const second = brandString<ProductQuestionId>('second')
const product: Product = { schemaVersion: 1, productId, name: 'Example', developer: 'Example Inc',
  officialUrl: 'https://example.com/' }
const plan: ProductPlan = { schemaVersion: 1, planId, productId, version: 1, scope: 'Current functions',
  questions: [{ questionId: first, text: 'Features?' }, { questionId: second, text: 'Price?' }],
  approval: { status: 'approved', approvedPlanVersion: 1, reviewedBy: 'user', reviewedAt: '2026-11-05T00:00:00Z', comment: null } }
const now = () => '2026-11-05T00:00:00Z'

describe('product page discovery', () => {
  it('rejects a plan whose current version is not approved', async () => {
    let called = false
    await expect(discoverCandidatePages({ product, plan: { ...plan, version: 2 }, maxResultsPerQuery: 5 },
      { now, web: { search: async () => { called = true; return { sources: [], truncated: false } } } }))
      .rejects.toThrow(/approval/u)
    expect(called).toBe(false)
  })

  it('merges repeated pages across questions without inventing a missing title', async () => {
    const result = await discoverCandidatePages({ product, plan, maxResultsPerQuery: 5 }, {
      now, web: { search: async () => ({ sources: [{ url: 'https://example.com/features?utm_source=x' },
        { url: 'https://example.com/features' }], truncated: false }) },
    })
    expect(result.candidates.status).toBe('success')
    expect(result.candidates.items).toHaveLength(1)
    expect(result.candidates.items[0]).toMatchObject({ questionIds: [first, second],
      screening: { status: 'selected' } })
    expect(result.candidates.items[0]).not.toHaveProperty('title')
    expect(result.searches.map(item => item.recordedCount)).toEqual([1, 0])
  })

  it('keeps successful candidates when another query fails', async () => {
    let calls = 0
    const result = await discoverCandidatePages({ product, plan, maxResultsPerQuery: 5 }, {
      now, web: { search: async () => {
        if (++calls === 2) throw new Error('Search unavailable')
        return { sources: [{ url: 'https://example.com/features', title: 'Example features' }], truncated: false }
      } },
    })
    expect(result.candidates.status).toBe('partial_success')
    expect(result.candidates.items).toHaveLength(1)
    expect(result.candidates.failures).toMatchObject([{ stage: 'discovery', message: 'Search unavailable' }])
    expect(result.searches.map(item => item.status)).toEqual(['success', 'failed'])
  })

  it('selects a named external page for checking while retaining unknown publishers as unreviewed', async () => {
    const result = await discoverCandidatePages({ product, plan, maxResultsPerQuery: 5 }, {
      now, web: { search: async () => ({ sources: [
        { url: 'https://review.test/example', title: 'Example review' },
        { url: 'https://unknown.test/article', title: 'Unrelated article' }], truncated: false }) },
    })
    expect(result.candidates.items[0]).toMatchObject({ sourceType: 'other',
      screening: { status: 'selected' } })
    expect(result.candidates.items[0]?.screening.reason).toContain('unverified')
    expect(result.candidates.items[1]).toMatchObject({ sourceType: 'other',
      screening: { status: 'needs_review' } })
    const approved = await discoverCandidatePages({ product,
      plan: { ...plan, sourcePublishers: [{ name: 'Review Test', domain: 'review.test' }] },
      maxResultsPerQuery: 5 }, { now, web: { search: async () => ({ sources: [
      { url: 'https://review.test/example', title: 'Example review' }], truncated: false }) } })
    expect(approved.candidates.items[0]).toMatchObject({ publisher: 'Review Test',
      screening: { status: 'selected' } })
  })

  it('records empty searches and merges duplicates even when the candidate limit is full', async () => {
    const empty = await discoverCandidatePages({ product, plan, maxResultsPerQuery: 5 },
      { now, web: { search: async () => ({ sources: [], truncated: false }) } })
    expect(empty.candidates.status).toBe('success')
    expect(empty.searches.map(item => item.returnedCount)).toEqual([0, 0])
    const bounded = await discoverCandidatePages({ product,
      plan: { ...plan, limits: { maximumCandidatePages: 1 } }, maxResultsPerQuery: 5 },
    { now, web: { search: async () => ({ sources: [{ url: 'https://example.com/features' }], truncated: false }) } })
    expect(bounded.candidates.items[0]?.questionIds).toEqual([first, second])
    expect(bounded.searches).toMatchObject([
      { status: 'success', recordedCount: 1, truncated: false },
      { status: 'success', recordedCount: 0, truncated: false },
    ])
  })

  it('allocates candidate slots by question before lower-ranked results', async () => {
    const features = 'https://example.com/features'
    const price = 'https://example.com/price'
    const result = await discoverCandidatePages({ product,
      plan: { ...plan, limits: { maximumCandidatePages: 2 } }, maxResultsPerQuery: 5 }, {
      now, web: { search: async ({ query, maxResults }) => {
        expect(maxResults).toBe(2)
        return { sources: (query.includes('Features?') ? [features, `${features}/more`] : [price, `${features}#details`])
          .map(url => ({ url })), truncated: false }
      } },
    })
    expect(result.candidates.items).toMatchObject([
      { url: features, questionIds: [first, second] },
      { url: price, questionIds: [second] },
    ])
    expect(result.searches).toMatchObject([
      { questionId: first, status: 'success', returnedCount: 2, recordedCount: 1, truncated: true },
      { questionId: second, status: 'success', returnedCount: 2, recordedCount: 1, truncated: false },
    ])
  })

  it('screens before allocating the approved candidate slots', async () => {
    const result = await discoverCandidatePages({ product,
      plan: { ...plan, limits: { maximumCandidatePages: 2 } }, maxResultsPerQuery: 5 }, {
      now, web: { search: async ({ query }) => ({ sources: (query.includes('Features?')
        ? ['https://unrelated.test/article', 'https://example.com/features']
        : ['ftp://example.com/file', 'https://example.com/price']).map(url => ({ url })), truncated: false }) },
    })
    expect(result.candidates.items.map(item => [item.url, item.screening.status])).toEqual([
      ['https://example.com/features', 'selected'], ['https://example.com/price', 'selected'],
    ])
    expect(result.searches).toMatchObject([{ recordedCount: 1, truncated: true }, { recordedCount: 1, truncated: true }])
  })

  it('uses a full review-only pool for follow-up without exceeding the approved candidate limit', async () => {
    const apple: Product = { ...product, name: 'Apple fall lineup (phone, tablet, desktop)', developer: 'Apple',
      officialUrl: 'https://www.apple.com/' }
    const scoped: ProductPlan = { ...plan, limits: { maximumCandidatePages: 2, maximumGapSearches: 1 } }
    const regional = 'https://www.apple.com.cn/newsroom/phone'
    const official = 'https://www.apple.com/newsroom/phone'
    const queries: string[] = []
    const web = { search: async ({ query }: { query: string }) => {
      queries.push(query)
      return { sources: query.includes('site:')
        ? [{ url: regional, title: apple.name }, { url: official, title: 'New devices arrive this fall' }]
        : [{ url: regional }, { url: 'https://unrelated.test/article' }], truncated: false }
    } }
    const initial = await discoverCandidatePages({ product: apple, plan: scoped, maxResultsPerQuery: 2 }, { web, now })
    expect(initial.candidates.items.map(item => item.screening.status)).toEqual(['needs_review', 'needs_review'])
    const updated = await discoverCandidatePages({ product: apple, plan: scoped, maxResultsPerQuery: 2,
      existing: initial, gapQuestionIds: [first] }, { web, now })
    expect(queries).toHaveLength(3)
    expect(queries[2]).toContain('site:www.apple.com')
    expect(updated.candidates.items).toMatchObject([
      { url: regional, screening: { status: 'needs_review' } },
      { url: official, publisher: 'Apple', sourceType: 'official_product_page', screening: { status: 'selected' } },
    ])
    expect(updated.searches[2]).toMatchObject({ reason: 'evidence_gap', status: 'success', recordedCount: 1 })
  })

  it('tries the official host after a failed acquisition and rotates equally uncovered approved hosts', async () => {
    const scoped: ProductPlan = { ...plan, limits: { maximumCandidatePages: 3, maximumGapSearches: 2 },
      sourcePublishers: [{ name: 'Review Test', domain: 'review.test' }] }
    const queries: string[] = []
    const web = { search: async ({ query }: { query: string }) => {
      queries.push(query)
      return { sources: query.includes('site:') ? [] : [{ url: 'https://example.com/oversized' }], truncated: false }
    } }
    const initial = await discoverCandidatePages({ product, plan: scoped, maxResultsPerQuery: 3 }, { web, now })
    const unavailablePages = new Set(initial.candidates.items.map(page => page.candidatePageId))
    const updated = await discoverCandidatePages({ product, plan: scoped, maxResultsPerQuery: 3,
      existing: initial, gapQuestionIds: [first, second], unavailablePages }, { web, now })
    expect(queries.slice(2).map(query => query.split('site:')[1])).toEqual(['example.com', 'review.test'])
    expect(updated.searches.slice(2).map(item => item.reason)).toEqual(['evidence_gap', 'evidence_gap'])
  })

  it('bounds gap searches to approved questions and keeps duplicate pages at their original scope', async () => {
    const scoped = { ...plan,
      limits: { maximumCandidatePages: 3, maximumGapSearches: 1 },
      sourceCriteria: { productVersion: 'v2', region: 'EU' },
      sourcePublishers: [{ name: 'Review Test', domain: 'review.test' }] }
    const queries: string[] = []
    const web = { search: async (request: { readonly query: string }) => {
      queries.push(request.query)
      return { sources: queries.length === 2 ? []
        : [{ url: 'https://example.com/features', title: 'Example features' }], truncated: false }
    } }
    const initial = await discoverCandidatePages({ product, plan: scoped, maxResultsPerQuery: 5 }, { now, web })
    const extended = await discoverCandidatePages({ product, plan: scoped, maxResultsPerQuery: 5,
      existing: initial, gapQuestionIds: [second] }, { now, web })
    expect(queries).toHaveLength(3)
    expect(queries[2]).toBe('Example price v2 EU site:review.test')
    expect(extended.searches[2]).toMatchObject({ questionId: second,
      reason: 'evidence_gap', status: 'success', recordedCount: 0 })
    expect(extended.candidates.items).toHaveLength(1)
    expect(extended.candidates.items[0]?.questionIds).toEqual([first])
    await expect(discoverCandidatePages({ product, plan: scoped, maxResultsPerQuery: 5,
      existing: extended, gapQuestionIds: [first] }, { now, web }))
      .rejects.toThrow(/search allowance/u)
  })
})
