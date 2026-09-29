/** Keyless Loader replay of the Controller's real source adapter with scripted upstreams. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { normalizeAcademicCatalogRecord } from '@deepseek-ai/dsh-academic-source'
import type {} from '@deepseek-ai/dsh-web'
import { createBatchResult, type ResearchBrief } from '@deepseek-ai/dsh-academic-model'
import { runResearchDraft, selectResearchPapers } from '@deepseek-ai/dsh-academic-workflow'
import { approvedPaperAdapters } from '../src/search.ts'
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
    }, fullTextUrls: () => [] }))
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
      const adapters = approvedPaperAdapters([{ query: 'synthetic', purpose: '核验合成论文', questions: ['论文是否可核验？'],
        retrieval: { channels: ['academic', 'web_discovery'], academicProviders: ['arxiv'], verificationProviders: ['acl'],
          maximumWebDiscoveryResults: 2, maximumReferenceVerifications: 1 } }], ctx.academicSource, ctx.web)
      const sample = JSON.parse(readFileSync(new URL(
        '../../../../z-team_docs/interface-samples/academic-model-v1/synthesis-input.sample.json', import.meta.url,
      ), 'utf8')) as { brief: ResearchBrief }
      const pipeline = await runResearchDraft({
        brief: { ...sample.brief, publicationWindow: { ...sample.brief.publicationWindow, start: null, end: null } },
        synthetic: true, searches: [{ query: 'synthetic', maxResults: 3,
          channels: ['academic', 'web_discovery'] }],
      }, {
        ...adapters,
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
      assert.equal(view.counts.failedVerifications, 0)
      assert.equal(pipeline.retrievalRun.failures[0]?.operation, 'resolve_fulltext')
      assert.ok(view.references[0]?.message?.includes('fulltext_unavailable'))
      assert.deepEqual(pipeline.retrievalRun.providers, ['arxiv'])
      assert.equal(JSON.stringify(view).includes('Unverified generated answer'), false)
      const screening = await screeningFixture(sample.brief, signal)
      return JSON.stringify({ calls, titles: pipeline.hybridSearch.returnedRecords.map(item => item.academicWork.title),
        directProviders: pipeline.retrievalRun.providers, hybridRetrieval: view, screening })
    },
  })))
}

async function screeningFixture(brief: ResearchBrief, signal?: AbortSignal) {
  const works = ['2010', '2024'].map(year => normalizeAcademicCatalogRecord('acl', {
    recordId: `${year}.acl-long.1`, title: `Synthetic ${year}`, authors: ['Fixture author'], year, venue: 'ACL', doi: null,
  }))
  const fetched: string[] = []
  let searches = 0
  const result = await runResearchDraft({ synthetic: true, brief: { ...brief,
    publicationWindow: { start: { iso: '2020', precision: 'year' }, end: null, dateBasis: 'first_public_release' },
    includedWorkTypes: ['version_of_record'], stopConditions: { ...brief.stopConditions,
      maximumSearchRounds: 2, maximumCandidateWorks: 1 } }, searches: [
    { query: 'old', channels: ['academic'] }, { query: 'recent', channels: ['academic'] }] }, {
    search: async (request) => {
      assert.equal(request.maxResults, 1)
      const batch = createBatchResult([works[searches++]!], [])
      return { works: batch.items, batch, providers: ['acl'], discoveredRecords: 1, truncated: false, limitations: [] }
    },
    selectPapers: (ingested, scope) => selectResearchPapers(ingested, scope, (_work, version) => ({
      urls: [`https://aclanthology.org/${version.sourceRecords[0]!.recordId}.pdf`], sourceProvider: 'acl',
      extractionMethod: { method: 'fixture', methodVersion: '1' }, hasHistoricalEvidence: false,
    })),
    fetcher: async (url) => {
      fetched.push(url)
      return { url, statusCode: 200, truncated: false, body: { kind: 'html', content: '<article><p>Synthetic source.</p></article>' } }
    },
    generator: async () => ({ scope: { status: 'included', reason: 'Synthetic scope.' }, evidence: [] }),
    synthesize: async () => { throw new Error('Empty evidence must not start synthesis') },
    now: () => '2026-09-24T00:00:00Z',
  }, signal)
  assert.equal(searches, 2)
  assert.deepEqual(fetched, ['https://aclanthology.org/2024.acl-long.1.pdf'])
  assert.equal(result.retrievalRun.academicWorkIds.length, 1)
  assert.equal(result.retrievalRun.coverageSummary.deduplicatedWorks, 2)
  return { deduplicatedWorks: 2, selectedWorks: result.retrievalRun.academicWorkIds.length, fetched }
}
