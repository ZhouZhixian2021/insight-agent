import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AcademicSourceRuntime from '@deepseek-ai/dsh-academic-source'
import { fetchAcademicFullText } from '@deepseek-ai/dsh-academic-evidence'
import { HttpFetchProvider } from '@deepseek-ai/dsh-web-fetch-http'
import { OpenAlexProvider } from '../src/provider.ts'

const live = process.env.ACADEMIC_OPENALEX_LIVE === '1'
const fixedQueries = [
  'Transformer self-attention long-range dependencies recurrent neural networks',
  'BERT bidirectional Transformer pre-training contextual representations',
]

it.skipIf(!live)('records fixed-query discovery separately from title-directed full-text controls', { timeout: 360_000, retry: 0 }, async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(AcademicSourceRuntime, { searchProviders: ['openalex'], searchTimeoutMs: 25_000 })
    ctx.academicSource.registerSearchProvider(new OpenAlexProvider({ baseURL: 'https://api.openalex.org',
      apiKey: process.env.OPENALEX_API_KEY, searchMode: 'keyword', publicationYears: '2017-2020',
      timeoutMs: 20_000, maxAttempts: 1, retryDelayMs: 0, maxResults: 5, maxCachedRecords: 50 }))
    for (const query of fixedQueries) {
      const start = Date.now()
      const result = await ctx.academicSource.searchAll({ query, maxResults: 5 })
      console.log(JSON.stringify({ phase: 'fixed-query', query, elapsedMs: Date.now() - start,
        providers: result.providers, status: result.batch.status, failures: result.batch.failures,
        discoveredRecords: result.discoveredRecords, truncated: result.truncated, limitations: result.limitations,
        works: result.works.map(work => ({ title: work.academicWork.title, id: work.workVersion.sourceRecords[0]?.recordId })) }))
      expect(result.providers).toEqual(['openalex'])
      expect(result.works.length).toBeLessThanOrEqual(5)
    }

    // These explicit control queries are not a production query planner or proof of fixed-query recall.
    const fetcher = new HttpFetchProvider({ timeoutMs: 120_000, maxResponseBytes: 5_000_000,
      maxBodyChars: 1_000_000, maxRedirects: 5, userAgent: 'deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)' })
    for (const query of ['BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding']) {
      const result = await ctx.academicSource.searchAll({ query, maxResults: 5 })
      const selected = result.works.find(work => work.academicWork.title.toLowerCase() === query.toLowerCase())
      expect(selected, JSON.stringify(result.batch.failures)).toBeDefined()
      const fulltext = ctx.academicSource.resolveFullText(selected!.workVersion)
      console.log(JSON.stringify({ phase: 'title-control', query, bibliography: selected, fulltext }))
      expect(fulltext).not.toBeNull()
      const start = Date.now()
      const prepared = await fetchAcademicFullText({ academicWorkId: selected!.academicWork.academicWorkId,
        workVersionId: selected!.workVersion.workVersionId, sourceProvider: 'openalex', urls: fulltext!.urls,
        retrievedAt: new Date().toISOString(), extractionMethod: { method: 'fulltext-preparation-control', methodVersion: '1' } }, (url, signal) => fetcher.fetch({ url }, signal))
      console.log(JSON.stringify({ phase: 'fulltext-control', query, elapsedMs: Date.now() - start,
        sourceUrl: prepared.sourceUrl, segments: prepared.segments.length,
        characters: prepared.segments.reduce((sum, segment) => sum + segment.text.length, 0) }))
      expect(prepared.segments.length).toBeGreaterThan(0)
      expect(prepared.segments.some(segment => /attention|bidirectional/iu.test(segment.text))).toBe(true)
    }
  } finally { await ctx.fiber.dispose() }
})
