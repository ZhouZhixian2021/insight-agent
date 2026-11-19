import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, it } from 'vitest'
import type { Product, ProductId, ProductPlan, ProductPlanId, ProductQuestionId } from '@deepseek-ai/dsh-product-insight-model'
import { discoverCandidatePages, productSearchQuery } from '../src/index.ts'

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

describe('product search query', () => {
  it('stays under the engine limit and drops the scope prose', () => {
    const query = productSearchQuery({ ...product, name: '苹果自研 M6 芯片（首代 2nm Apple silicon）' },
      '苹果官方公布的 M6 规格是什么——制程、CPU/GPU/神经引擎核心数、内存带宽与能效表述，官方用哪些数据支撑相较上一代的大幅提升？')
    expect(query.length).toBeLessThanOrEqual(60)
    expect(query).not.toContain('Apple silicon')
    expect(query).not.toContain('？')
    expect(query).toContain('M6')
  })

  it('ranks ASCII product terms ahead of prose words', () => {
    expect(productSearchQuery(product, 'How do CPU and GPU compare for gaming?'))
      .toMatch(/^Example cpu gpu/u)
  })

  it('strips a trailing name annotation and terms the name already contains', () => {
    expect(productSearchQuery({ ...product, name: 'Example (2026 edition)' }, 'Example features?'))
      .toBe('Example features')
  })
})

describe('product page discovery', () => {
  it('attributes each search result to the engine that returned it', async () => {
    const result = await discoverCandidatePages({ product, plan, maxResultsPerQuery: 5 }, {
      now, web: { search: async () => ({ sources: [
        { url: 'https://review.test/specs', engine: 'yahoo' },
        { url: 'https://example.com/specs' },
      ], truncated: false }) },
    })
    expect(result.candidates.items.map(page => page.discoveryChannel)).toEqual(['web', 'web:yahoo'])
  })

  it('records product posts from the official feed and drops the vendor\'s other news', async () => {
    const result = await discoverCandidatePages({
      product: { ...product, name: 'Example M6', officialUrl: 'https://example.com/product' },
      plan, maxResultsPerQuery: 5,
    }, {
      now,
      web: { search: async () => ({ sources: [], truncated: false }) },
      officialFeed: async () => ({ notes: [], links: [
        { url: 'https://example.com/newsroom/2026/11/example-introduces-m6/', title: 'Example introduces M6' },
        { url: 'https://example.com/newsroom/2026/11/formula-1-this-weekend/', title: 'Formula 1 streams this weekend' },
      ] }),
    })
    expect(result.candidates.items.map(page => [page.url, page.discoveryChannel])).toEqual([
      ['https://example.com/product', 'web'],
      ['https://example.com/newsroom/2026/11/example-introduces-m6/', 'official-feed'],
    ])
  })

  it('keeps searching when the official feed fails and reports the failure', async () => {
    const result = await discoverCandidatePages({ product, plan, maxResultsPerQuery: 5 }, {
      now,
      web: { search: async () => ({ sources: [{ url: 'https://review.test/specs' }], truncated: false }) },
      officialFeed: async () => { throw new Error('feed blocked') },
    })
    expect(result.candidates.items.map(page => page.url)).toContain('https://review.test/specs')
    expect(result.candidates.failures.some(failure => failure.message.includes('feed blocked'))).toBe(true)
  })

  it('records product posts from the news feed and drops unrelated stories', async () => {
    const result = await discoverCandidatePages({
      product: { ...product, name: 'Example M6', officialUrl: 'https://example.com/product' },
      plan: { ...plan, focus: { categories: ['performance'] } }, maxResultsPerQuery: 5,
    }, {
      now,
      web: { search: async () => ({ sources: [], truncated: false }) },
      newsFeed: async (_query, accept) => [
        { url: 'https://review.test/example-m6-review', title: 'Example M6 review' },
        { url: 'https://news.test/currency', title: 'MYR to USD' },
      ].filter(accept),
    })
    expect(result.candidates.items.map(page => [page.url, page.discoveryChannel])).toEqual([
      ['https://example.com/product', 'web'],
      ['https://review.test/example-m6-review', 'news-feed'],
    ])
  })

  it('keeps searching when the news feed fails and reports the failure', async () => {
    const result = await discoverCandidatePages({ product, plan, maxResultsPerQuery: 5 }, {
      now,
      web: { search: async () => ({ sources: [{ url: 'https://review.test/specs' }], truncated: false }) },
      newsFeed: async () => { throw new Error('news feed blocked') },
    })
    expect(result.candidates.items.map(page => page.url)).toContain('https://review.test/specs')
    expect(result.candidates.failures.some(failure => failure.message.includes('news feed blocked'))).toBe(true)
  })

  it('ignores planned links that only lead into site navigation', async () => {
    const result = await discoverCandidatePages({
      product, plan, maxResultsPerQuery: 5,
      initialSources: [{ url: 'https://support.google.com/chrome' }, { url: 'https://example.com/' },
        { url: 'https://example.com/sg/' }, { url: 'https://example.com/m6-specs' }],
    }, { now, web: { search: async () => ({ sources: [], truncated: false }) } })
    expect(result.candidates.items.map(page => page.url)).toEqual(['https://example.com/m6-specs'])
  })

  it('merges planning links and the concrete official page with new results within the shared cap', async () => {
    const result = await discoverCandidatePages({
      product: { ...product, officialUrl: 'https://example.com/release' },
      plan: { ...plan, focus: { categories: ['performance'] }, limits: { maximumCandidatePages: 3 } },
      maxResultsPerQuery: 5,
      initialSources: [{ url: 'https://example.com/release?utm_source=planning#part' },
        { url: 'https://review.test/article', title: 'Preliminary result' }, { url: 'javascript:alert(1)' }],
    }, { now, web: { search: async () => ({ sources: [
      { url: 'https://review.test/article#section' }, { url: 'https://example.com/specs' },
      { url: 'https://example.com/extra' },
    ], truncated: false }) } })
    expect(result.candidates.items.map(page => page.url)).toEqual([
      'https://example.com/release', 'https://review.test/article', 'https://example.com/specs',
    ])
    expect(result.candidates.items.every(page => page.screening.status === 'selected')).toBe(true)
    expect(result.candidates.items[0]?.questionIds).toEqual([first, second])
    expect(result.searches).toHaveLength(2)
    expect(result.searches.every(search => search.truncated)).toBe(true)
  })

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

  it('excludes unapproved hosts before reading even when their titles name the product', async () => {
    const result = await discoverCandidatePages({ product, plan, maxResultsPerQuery: 5 }, {
      now, web: { search: async () => ({ sources: [
        { url: 'https://review.test/example', title: 'Example review' },
        { url: 'https://unknown.test/article', title: 'Unrelated article' }], truncated: false }) },
    })
    expect(result.candidates.items[0]).toMatchObject({ sourceType: 'other',
      screening: { status: 'excluded' } })
    expect(result.candidates.items[0]?.screening.reason).toContain('not an approved')
    expect(result.candidates.items[1]).toMatchObject({ sourceType: 'other',
      screening: { status: 'excluded' } })
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
        expect(maxResults).toBe(5)
        return { sources: (query.includes('features') ? [features, `${features}/more`] : [price, `${features}#details`])
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
      now, web: { search: async ({ query }) => ({ sources: (query.includes('features')
        ? ['https://unrelated.test/article', 'https://example.com/features']
        : ['ftp://example.com/file', 'https://example.com/price']).map(url => ({ url })), truncated: false }) },
    })
    expect(result.candidates.items.map(item => [item.url, item.screening.status])).toEqual([
      ['https://example.com/features', 'selected'], ['https://example.com/price', 'selected'],
    ])
    expect(result.searches).toMatchObject([{ recordedCount: 1, truncated: true }, { recordedCount: 1, truncated: true }])
  })

  it('admits approved publishers without product-name matches within the candidate limit', async () => {
    const scoped: ProductPlan = { ...plan, limits: { maximumCandidatePages: 2 },
      sourcePublishers: [{ name: 'Review', domain: 'review.test' }] }
    const result = await discoverCandidatePages({ product, plan: scoped, maxResultsPerQuery: 5 }, {
      now, web: { search: async () => ({ sources: [1, 2, 3].map(id =>
        ({ url: `https://review.test/article-${id}`, title: 'Unmatched title' })), truncated: false }) },
    })
    expect(result.candidates.items).toHaveLength(2)
    expect(result.candidates.items.every(page => page.screening.status === 'selected')).toBe(true)
    expect(result.searches.every(search => search.truncated)).toBe(true)
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

describe('focus-directed discovery', () => {
  const focusPlan: ProductPlan = { ...plan, focus: { categories: ['performance', 'commercial'] } }

  it('excludes an external page whose metadata names neither the product nor the question', async () => {
    const result = await discoverCandidatePages({ product, plan: focusPlan, maxResultsPerQuery: 5 }, {
      now, web: { search: async () => ({ sources: [
        { url: 'https://review.test/example', title: 'Example review' },
        { url: 'https://unknown.test/article', title: 'Unrelated article' }], truncated: false }) },
    })
    expect(result.candidates.items).toMatchObject([
      { url: 'https://review.test/example', sourceType: 'other', screening: { status: 'selected' } },
      { url: 'https://unknown.test/article', screening: { status: 'excluded' } },
    ])
    expect(result.candidates.items[0]?.screening.reason).toContain('names the product')
    expect(result.candidates.items[1]?.screening.reason).toContain('neither the product nor')
  })

  it('reads a site the user named without requiring a product-name match', async () => {
    const result = await discoverCandidatePages({ product,
      plan: { ...focusPlan, additionalSites: [{ name: 'Vendor docs', domain: 'docs.review.test' }] },
      maxResultsPerQuery: 5 }, { now, web: { search: async () => ({ sources: [
      { url: 'https://docs.review.test/spec', title: 'Specifications' }], truncated: false }) } })
    expect(result.candidates.items[0]).toMatchObject({ publisher: 'Vendor docs',
      screening: { status: 'selected' } })
  })

  it('searches an unanswered question across the open web instead of a reviewed host', async () => {
    const scoped: ProductPlan = { ...focusPlan, limits: { maximumCandidatePages: 3, maximumGapSearches: 1 } }
    const queries: string[] = []
    const web = { search: async ({ query }: { query: string }) => {
      queries.push(query)
      return { sources: queries.length === 2
        ? [{ url: 'https://review.test/price', title: 'Example price review' }]
        : [{ url: 'https://example.com/features' }], truncated: false }
    } }
    const initial = await discoverCandidatePages({ product, plan: scoped, maxResultsPerQuery: 4 }, { web, now })
    const updated = await discoverCandidatePages({ product, plan: scoped, maxResultsPerQuery: 4,
      existing: initial, gapQuestionIds: [second] }, { web, now })
    expect(queries[2]).not.toContain('site:')
    expect(updated.candidates.items.find(page => page.url === 'https://review.test/price'))
      .toMatchObject({ questionIds: [second], screening: { status: 'selected' } })
  })
})


it('requests sixty links before screening, keeping unapproved domains out of page reading', async () => {
  const result = await discoverCandidatePages({ product,
    plan: { ...plan, limits: { maximumCandidatePages: 30 } }, maxResultsPerQuery: 60 },
  { now, web: { search: async (request) => {
    expect(request.maxResults).toBe(60)
    return { sources: [{ url: 'https://unapproved.test/example', title: 'Example features' },
      { url: 'https://example.com/features' }], truncated: false }
  } } })
  expect(result.candidates.items.find(page => page.url.includes('unapproved'))?.screening.status).toBe('excluded')
  expect(result.candidates.items.find(page => page.url === 'https://example.com/features')?.screening.status).toBe('selected')
})

describe('site navigation filtering', () => {
  const focusPlan: ProductPlan = { ...plan, focus: { categories: ['performance'] } }
  const discover = (urls: readonly string[]) => discoverCandidatePages({ product, plan: focusPlan, maxResultsPerQuery: 5 },
    { now, web: { search: async () => ({ sources: urls.map(url => ({ url })), truncated: false }) } })
  const statuses = (items: readonly { url: string; screening: { status: string } }[]) =>
    Object.fromEntries(items.map(page => [page.url, page.screening.status]))

  it('excludes account, cart and search pages whatever host serves them', async () => {
    const result = await discover(['https://account.example.com/', 'https://example.com/cart',
      'https://example.com/search?q=example', 'https://example.com/features'])
    expect(statuses(result.candidates.items)).toEqual({
      'https://account.example.com/': 'excluded',
      'https://example.com/cart': 'excluded',
      'https://example.com/search?q=example': 'excluded',
      'https://example.com/features': 'selected',
    })
  })

  it('keeps a site root that is the only page read from its host', async () => {
    const result = await discover(['https://example.com/'])
    expect(statuses(result.candidates.items)).toEqual({ 'https://example.com/': 'selected' })
  })

  it('drops a site root or locale root that duplicates a deeper page on the same host', async () => {
    const result = await discover(['https://example.com/', 'https://example.com/zh/',
      'https://example.com/features'])
    expect(statuses(result.candidates.items)).toEqual({
      'https://example.com/': 'excluded',
      'https://example.com/zh/': 'excluded',
      'https://example.com/features': 'selected',
    })
  })

  it('drops a store index but keeps a store path describing one configuration', async () => {
    const result = await discover(['https://example.com/store',
      'https://example.com/shop/buy-mac/m6-chip-12-core'])
    expect(statuses(result.candidates.items)).toEqual({
      'https://example.com/store': 'excluded',
      'https://example.com/shop/buy-mac/m6-chip-12-core': 'selected',
    })
  })

  it('keeps a support article that search results reach below the support host', async () => {
    const result = await discover(['https://support.example.com/en-us/148300'])
    expect(statuses(result.candidates.items)).toEqual({ 'https://support.example.com/en-us/148300': 'selected' })
  })

  it('gives the candidate slots to content pages before site entry points', async () => {
    const result = await discoverCandidatePages({ product,
      plan: { ...focusPlan, limits: { maximumCandidatePages: 2 } }, maxResultsPerQuery: 5 },
    { now, web: { search: async () => ({ sources: [{ url: 'https://example.com/' },
      { url: 'https://example.com/features' }, { url: 'https://example.com/price' }], truncated: false }) } })
    expect(result.candidates.items.map(page => page.url))
      .toEqual(['https://example.com/features', 'https://example.com/price'])
  })
})
