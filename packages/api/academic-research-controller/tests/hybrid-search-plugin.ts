/** Keyless Loader replay of the Controller's real source adapter with scripted upstreams. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { normalizeAcademicCatalogRecord } from '@deepseek-ai/dsh-academic-source'
import type {} from '@deepseek-ai/dsh-web'
import type { ResearchBrief } from '@deepseek-ai/dsh-academic-model'
import { runResearchDraft } from '@deepseek-ai/dsh-academic-workflow'
import { approvedSearchAdapter } from '../src/search.ts'
import { hybridRetrievalView } from '../src/hybrid-view.ts'

export const name = 'academic-hybrid-search-fixture'
export const inject = ['tools', 'academicSource', 'web']

export function apply(ctx: Context): void {
  const calls: string[] = []
  const work = normalizeAcademicCatalogRecord('acl', { recordId: '2024.acl-long.1', title: 'Verified fixture paper',
    authors: ['Fixture author'], year: '2024', venue: 'ACL', doi: null })
  ctx.effect(() => ctx.academicSource.registerSearchProvider({ id: 'arxiv', available: () => true,
    search: async () => { calls.push('academic:arxiv'); return { works: [], truncated: false } }, fullTextUrls: () => [] }))
  ctx.effect(() => ctx.academicSource.registerSearchProvider({ id: 'openalex', available: () => true,
    search: async () => { throw new Error('Unapproved discovery provider called') }, fullTextUrls: () => [] }))
  ctx.effect(() => ctx.academicSource.registerSearchProvider({ id: 'acl', available: () => false,
    search: async () => { throw new Error('Verification-only provider searched') },
    verifyReference: async (reference) => {
      assert.equal(reference.kind, 'provider_record')
      calls.push('verify:acl')
      return work
    }, fullTextUrls: () => ['https://aclanthology.org/2024.acl-long.1.pdf'] }))
  ctx.effect(() => ctx.web.registerSearchProvider({ id: 'academic-hybrid-fixture', available: () => true,
    search: async (request) => {
      calls.push('web')
      assert.equal(request.maxResults, 2)
      return { content: 'Unverified generated answer', sources: [{ url: 'https://aclanthology.org/2024.acl-long.1/' },
        { url: 'https://example.org/blog', title: 'A blog is not a paper' }], truncated: false }
    } }))
  ctx.effect(() => ctx.tools.register(defineTool({ name: 'run_hybrid_fixture',
    description: 'Run a synthetic approved hybrid search without network access.', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async (_args, { signal }) => {
      const search = approvedSearchAdapter([{ query: 'synthetic', purpose: '核验合成论文', questions: ['论文是否可核验？'],
        retrieval: { channels: ['academic', 'web_discovery'], academicProviders: ['arxiv'], verificationProviders: ['acl'],
          maximumWebDiscoveryResults: 2, maximumReferenceVerifications: 1 } }], ctx.academicSource, ctx.web)
      const sample = JSON.parse(readFileSync(new URL(
        '../../../../z-team_docs/interface-samples/academic-model-v1/synthesis-input.sample.json', import.meta.url,
      ), 'utf8')) as { brief: ResearchBrief }
      const pipeline = await runResearchDraft({ brief: sample.brief, synthetic: true,
        searches: [{ query: 'synthetic', maxResults: 3 }] }, {
        search, selectPapers: () => ({ papers: [], truncated: false }),
        fetcher: async () => { throw new Error('No paper was selected for this projection fixture') },
        generator: async () => { throw new Error('No evidence request was expected') },
        synthesize: async () => { throw new Error('No synthesis request was expected') },
        now: () => '2026-09-24T00:00:00Z',
      }, signal)
      assert.deepEqual(calls, ['academic:arxiv', 'web', 'verify:acl'])
      assert.ok(pipeline.hybridSearch)
      const view = hybridRetrievalView(pipeline.hybridSearch)
      assert.equal(view.counts.deduplicatedWorks, 1)
      assert.equal(view.counts.discardedWebCandidates, 1)
      assert.deepEqual(pipeline.retrievalRun.providers, ['arxiv'])
      assert.equal(JSON.stringify(view).includes('Unverified generated answer'), false)
      return JSON.stringify({ calls, titles: pipeline.hybridSearch.returnedRecords.map(item => item.academicWork.title),
        directProviders: pipeline.retrievalRun.providers, hybridRetrieval: view })
    },
  })))
}
