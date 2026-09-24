/** Real source/Web services; only upstream provider behavior is scripted. */
import { Context } from '@deepseek-ai/cordis'
import { AcademicSourceRuntime, AcademicSourceError, normalizeAcademicCatalogRecord } from '@deepseek-ai/dsh-academic-source'
import { WebRuntime } from '@deepseek-ai/dsh-web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { approvedSearchAdapter } from '../src/search.ts'
import type { AcademicPlannedRetrieval } from '../src/types.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })
const policy: AcademicPlannedRetrieval = { channels: ['academic', 'web_discovery'], academicProviders: ['arxiv'],
  verificationProviders: ['acl'], maximumWebDiscoveryResults: 2, maximumReferenceVerifications: 1 }

async function fixture() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(AcademicSourceRuntime, { searchProviders: ['openalex'] })
  await ctx.plugin(WebRuntime, { searchProvider: 'fixture' })
  const work = normalizeAcademicCatalogRecord('acl', { recordId: '2024.acl-long.1', title: 'Verified paper',
    authors: ['Author'], year: '2024', venue: 'ACL', doi: null })
  const direct = vi.fn(async () => ({ works: [work], truncated: false }))
  const unapproved = vi.fn(async () => ({ works: [], truncated: false }))
  const verify = vi.fn(async () => work)
  const webSearch = vi.fn(async () => ({ sources: [{ url: 'https://aclanthology.org/2024.acl-long.1/' },
    { url: 'https://aclanthology.org/2024.acl-long.2/' }, { url: 'https://aclanthology.org/2024.acl-long.3/' }],
  content: 'Do not ingest this answer', truncated: false }))
  ctx.academicSource.registerSearchProvider({ id: 'arxiv', available: () => true, search: direct, fullTextUrls: () => [] })
  ctx.academicSource.registerSearchProvider({ id: 'openalex', available: () => true, search: unapproved, fullTextUrls: () => [] })
  ctx.academicSource.registerSearchProvider({ id: 'acl', available: () => false, search: unapproved,
    verifyReference: verify, fullTextUrls: () => ['https://aclanthology.org/2024.acl-long.1.pdf'] })
  ctx.web.registerSearchProvider({ id: 'fixture', available: () => true, search: webSearch })
  const search = (retrieval: AcademicPlannedRetrieval | undefined) => approvedSearchAdapter([
    { query: 'reviewed', purpose: '检索', questions: ['问题'], ...retrieval === undefined ? {} : { retrieval } },
  ], ctx.academicSource, ctx.web)
  return { search, direct, unapproved, verify, webSearch }
}

describe('approved source adapters', () => {
  it('uses request providers instead of deployment defaults and enforces both Web budgets', async () => {
    const f = await fixture()
    const signal = new AbortController().signal
    const result = await f.search(policy)({ query: 'reviewed', maxResults: 1 }, signal)
    expect(f.direct).toHaveBeenCalledExactlyOnceWith({ query: 'reviewed', maxResults: 1 }, signal)
    expect(f.unapproved).not.toHaveBeenCalled()
    expect(f.webSearch).toHaveBeenCalledExactlyOnceWith({ query: 'reviewed', maxResults: 2 }, signal)
    expect(f.verify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ provider: 'acl', recordId: '2024.acl-long.1' }), signal)
    expect(result).toMatchObject({ providers: ['arxiv'], truncated: true, discoveredRecords: 2 })
    expect(result.works).toHaveLength(1)
    expect(result.works[0]?.academicWork.title).toBe('Verified paper')
  })

  it.each(['academic', 'web'] as const)('keeps the other channel when %s fails', async (channel) => {
    const f = await fixture()
    if (channel === 'academic') f.direct.mockRejectedValue(new AcademicSourceError('offline', 'ACADEMIC_SOURCE_NETWORK_ERROR'))
    else f.webSearch.mockRejectedValue(new Error('offline'))
    const result = await f.search(policy)({ query: 'reviewed' })
    expect(result.works).toHaveLength(1)
    expect(result.batch.status).toBe('partial_success')
    expect(result.batch.failures[0]?.operation).toBe(channel === 'academic' ? 'search' : 'web_search')
  })

  it('honors Academic-only, Web-only and legacy selection without starting disabled channels', async () => {
    const f = await fixture()
    await f.search({ ...policy, channels: ['academic'], verificationProviders: [],
      maximumWebDiscoveryResults: 0, maximumReferenceVerifications: 0 })({ query: 'reviewed' })
    expect(f.webSearch).not.toHaveBeenCalled()
    await f.search({ ...policy, channels: ['web_discovery'], academicProviders: [] })({ query: 'reviewed' })
    expect(f.direct).toHaveBeenCalledTimes(1)
    expect(f.verify).toHaveBeenCalledTimes(1)
    await f.search(undefined)({ query: 'reviewed' })
    expect(f.unapproved).toHaveBeenCalledTimes(1)
    expect(f.webSearch).toHaveBeenCalledTimes(1)
  })

  it('preserves classified reference failures and does not start work after cancellation', async () => {
    const f = await fixture()
    f.verify.mockRejectedValue(new AcademicSourceError('bad metadata', 'ACADEMIC_SOURCE_PARSE_ERROR'))
    const result = await f.search(policy)({ query: 'reviewed' })
    expect(result.batch.failures).toEqual([expect.objectContaining({ provider: 'acl',
      operation: 'verify_reference', category: 'parse_failed' })])
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(f.search(policy)({ query: 'reviewed' }, controller.signal)).rejects.toThrow('cancelled')
    expect(f.direct).toHaveBeenCalledTimes(1)
    expect(f.webSearch).toHaveBeenCalledTimes(1)
  })
})
