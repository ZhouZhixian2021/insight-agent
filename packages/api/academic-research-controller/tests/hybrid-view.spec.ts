/** Exercise the wire projection from executor and ingestion facts, not precomputed counters. */
import { createBatchResult } from '@deepseek-ai/dsh-academic-model'
import { identifyAcademicReferences, type AcademicSourceWork } from '@deepseek-ai/dsh-academic-source'
import { executeHybridSearch, runResearchDraft, type HybridRetrievalPolicy, type HybridSearchAdapters,
  type DraftSearchResult } from '@deepseek-ai/dsh-academic-workflow'
import { describe, expect, it, vi } from 'vitest'
import { draftFixture as baseFixture } from '../../../academic/workflow/tests/pipeline-fixture.ts'
import { hybridRetrievalView } from '../src/hybrid-view.ts'

const policy: HybridRetrievalPolicy = { channels: ['academic', 'web_discovery'], academicProviders: ['arxiv'],
  verificationProviders: ['openalex', 'arxiv', 'acl', 'pmlr', 'cvf'], maximumWebDiscoveryResults: 8,
  maximumReferenceVerifications: 5 }
const arxiv = 'https://arxiv.org/abs/1706.03762'
function draftFixture(count: number) {
  const fixture = baseFixture(count)
  fixture.records.forEach((record, index) => {
    fixture.records[index] = { ...record, academicWork: { ...record.academicWork,
      externalIdentifiers: [{ kind: 'doi', normalizedValue: `10.1000/fixture${index}`,
        originalValue: `10.1000/fixture${index}`, sourceProvider: 'fixture' }] } }
  })
  return fixture
}
function batch(works: readonly AcademicSourceWork[]) {
  return { works, batch: createBatchResult(works, []), providers: ['arxiv'], discoveredRecords: works.length,
    truncated: false, limitations: [] }
}
function upstream(works: readonly AcademicSourceWork[], urls: readonly string[]): HybridSearchAdapters {
  return { searchAcademic: async () => batch(works), searchWeb: async () => ({ candidates: urls.map(url => ({ url,
    title: 'Candidate title', snippet: 'private snippet' })), truncated: false }), identifyReferences: identifyAcademicReferences,
  verifyReference: async (reference, verificationProvider) => ({ status: 'verified', value: { reference,
    verificationProvider, work: works[0]!, fullText: null } }) }
}
async function search(query: string, configured: HybridSearchAdapters, maxResults = 10,
  selectedPolicy = policy): Promise<DraftSearchResult> {
  const result = await executeHybridSearch({ query, maxResults }, selectedPolicy, configured)
  return { ...result.search, hybridObservation: result.observation }
}

describe('hybrid terminal projection', () => {
  it('separates five reference kinds, duplicate links, verification failures and actual merged works', async () => {
    const fixture = draftFixture(3)
    const [a, b, c] = fixture.records
    const configured = upstream([a!, b!], ['https://doi.org/10.1000/example', arxiv,
      'https://arxiv.org/pdf/1706.03762', 'https://aclanthology.org/2024.acl-long.1/',
      'https://proceedings.mlr.press/v235/example24a.html',
      'https://openaccess.thecvf.com/content/CVPR2025/html/Example_CVPR_2025_paper.html', 'https://example.org/blog'])
    const verify: HybridSearchAdapters['verifyReference'] = async (reference, verificationProvider) => verificationProvider === 'pmlr'
      ? { status: 'failed', failure: { reference, verificationProvider, category: 'not_found',
        message: 'raw diagnostic stays internal', retryable: false, retryAfter: null } }
      : { status: 'verified', value: { reference, verificationProvider,
        work: verificationProvider === 'acl' ? b! : verificationProvider === 'cvf' ? c! : a!, fullText: null } }
    fixture.adapters.search = async request => search(request.query, { ...configured, verifyReference: verify })
    const result = await runResearchDraft(fixture.input, fixture.adapters)
    const view = hybridRetrievalView(result.hybridSearch!)
    expect(view.counts).toEqual({ academicDiscoveredRecords: 2, webDiscoveredUrls: 7, identifiedReferences: 6,
      attemptedVerifications: 5, verifiedReferences: 4, failedVerifications: 1, discardedWebCandidates: 1,
      mergedDuplicates: 3, deduplicatedWorks: 3 })
    expect(view.references.map(reference => reference.kind)).toEqual(['doi', 'arxiv', 'arxiv', 'acl', 'pmlr', 'cvf'])
    expect(view.references.map(reference => reference.status)).toEqual([
      'merged_duplicate', 'merged_duplicate', 'identified', 'merged_duplicate', 'verification_failed', 'verified',
    ])
    expect(view.references[2]?.verificationProvider).toBeNull()
    expect(view.references[2]?.message).toContain('Repeated')
    expect(view.stages).toMatchObject({ referenceIdentification: 'partial_success', referenceVerification: 'partial_success' })
    expect(result.retrievalRun.failures[0]?.operation).toBe('verify_reference')
    expect(JSON.parse(JSON.stringify(view))).toEqual(view)
    expect(JSON.stringify(view)).not.toMatch(/private snippet|raw diagnostic/)
    expect(result.retrievalRun.coverageSummary.deduplicatedWorks).toBe(view.counts.deduplicatedWorks)
  })

  it('does not count truncated records as merged duplicates and retains pre-cap distinct works', async () => {
    const fixture = draftFixture(3)
    const first = upstream([fixture.records[0]!], [arxiv])
    const resultA = await search('one', first, 1)
    const resultB = await search('two', upstream([fixture.records[1]!], []), 1)
    fixture.adapters.search = vi.fn().mockResolvedValueOnce(resultA).mockResolvedValueOnce(resultB)
    const result = await runResearchDraft({ ...fixture.input,
      brief: { ...fixture.input.brief, stopConditions: { ...fixture.input.brief.stopConditions, maximumSearchRounds: 2 } },
      searches: [{ query: 'one', maxResults: 1 }, { query: 'two', maxResults: 1 }] }, fixture.adapters)
    const view = hybridRetrievalView(result.hybridSearch!)
    expect(view.counts).toMatchObject({ academicDiscoveredRecords: 2, verifiedReferences: 1, mergedDuplicates: 0,
      deduplicatedWorks: 2 })
    expect(result.retrievalRun.academicWorkIds).toHaveLength(1)
    expect(view.references[0]?.status).toBe('verified')
    expect(view.references[0]?.message).toContain('omitted')
    expect(view.references[0]?.query).toBe('one')
    expect(result.retrievalRun.coverageSummary.limitations.join(' ')).toContain('retained 1 of 2')
  })

  it('retains earlier queries on cancellation without inventing failure or success for the interrupted query', async () => {
    const fixture = draftFixture(1)
    const completed = await search('one', upstream(fixture.records, [arxiv]))
    const cancellation = new AbortController()
    fixture.adapters.search = vi.fn().mockResolvedValueOnce(completed).mockImplementationOnce(async () => {
      cancellation.abort(new Error('cancelled'))
      throw cancellation.signal.reason
    })
    const result = await runResearchDraft({ ...fixture.input,
      brief: { ...fixture.input.brief, stopConditions: { ...fixture.input.brief.stopConditions, maximumSearchRounds: 2 } },
      searches: [{ query: 'one' }, { query: 'two' }] }, fixture.adapters, cancellation.signal)
    expect(result.status).toBe('cancelled')
    expect(result.retrievalRun.queries).toEqual(['one', 'two'])
    expect(result.hybridSearch?.queries.map(query => query.query)).toEqual(['one'])
    expect(result.retrievalRun.failures).toHaveLength(0)
    expect(result.retrievalRun.coverageSummary.limitations.join(' ')).toContain('interrupted')
    expect(hybridRetrievalView(result.hybridSearch!).counts.attemptedVerifications).toBe(1)
    expect(result.report).toBeNull()
  })

  it('reports unapproved providers and verification limits as unattempted references', async () => {
    const fixture = draftFixture(1)
    const configured = upstream(fixture.records, ['https://doi.org/10.1000/example', arxiv,
      'https://arxiv.org/abs/1810.04805'])
    fixture.adapters.search = async request => search(request.query, configured, 10,
      { ...policy, verificationProviders: ['arxiv'], maximumReferenceVerifications: 1 })
    const result = await runResearchDraft(fixture.input, fixture.adapters)
    const view = hybridRetrievalView(result.hybridSearch!)
    expect(view.counts).toMatchObject({ identifiedReferences: 3, attemptedVerifications: 1, failedVerifications: 0 })
    expect(view.references.map(reference => reference.verificationProvider)).toEqual([null, 'arxiv', null])
    expect(view.references[0]?.message).toContain('not approved')
    expect(view.references[2]?.message).toContain('limit')
    expect(result.retrievalRun.coverageSummary.limitations.join(' ')).toContain('unapproved')
  })

  it('omits unsafe URL data and retains identification reasons without copying Web text', async () => {
    const fixture = draftFixture(1)
    const configured = upstream(fixture.records, ['https://user:secret@example.org/path?token=secret#secret',
      'javascript:alert(1)', 'not-a-url'])
    fixture.adapters.search = async request => search(request.query, configured)
    const result = await runResearchDraft(fixture.input, fixture.adapters)
    const view = hybridRetrievalView(result.hybridSearch!)
    expect(view.webCandidates.map(candidate => candidate.url)).toEqual(['https://example.org/path', '', ''])
    expect(view.webCandidates.every(candidate => candidate.message?.includes('Reference identification'))).toBe(true)
    expect(view.stages.referenceVerification).toBe('not_run')
    expect(JSON.stringify(view)).not.toMatch(/secret|private snippet|javascript/)
  })

  it('keeps legacy runs without a hybrid projection', async () => {
    const fixture = draftFixture(1)
    expect((await runResearchDraft(fixture.input, fixture.adapters)).hybridSearch).toBeUndefined()
  })

  it('combines settled query stages while keeping disabled and empty downstream work not_run', async () => {
    const fixture = draftFixture(1)
    const failing: HybridSearchAdapters = { ...upstream([], []),
      searchAcademic: async () => { throw new Error('offline') },
      searchWeb: async () => { throw new Error('offline') } }
    const failed = await search('one', failing)
    fixture.adapters.search = async () => failed
    const failure = await runResearchDraft(fixture.input, fixture.adapters)
    expect(hybridRetrievalView(failure.hybridSearch!).stages).toEqual({ academicSearch: 'failed', webDiscovery: 'failed',
      referenceIdentification: 'not_run', referenceVerification: 'not_run', deduplication: 'not_run' })
    const academicOnly = await search('two', upstream(fixture.records, []), 10, { ...policy,
      channels: ['academic'], verificationProviders: [], maximumWebDiscoveryResults: 0, maximumReferenceVerifications: 0 })
    fixture.adapters.search = vi.fn().mockResolvedValueOnce(failed).mockResolvedValueOnce(academicOnly)
    const mixed = await runResearchDraft({ ...fixture.input,
      brief: { ...fixture.input.brief, stopConditions: { ...fixture.input.brief.stopConditions, maximumSearchRounds: 2 } },
      searches: [{ query: 'one' }, { query: 'two' }] }, fixture.adapters)
    expect(hybridRetrievalView(mixed.hybridSearch!).stages).toEqual({ academicSearch: 'partial_success', webDiscovery: 'failed',
      referenceIdentification: 'not_run', referenceVerification: 'not_run', deduplication: 'success' })
  })

  it('does not merge title-similar works without a shared scholarly identifier', async () => {
    const fixture = baseFixture(2)
    fixture.records[1] = { ...fixture.records[1]!, academicWork: { ...fixture.records[1]!.academicWork,
      title: fixture.records[0]!.academicWork.title } }
    fixture.adapters.search = async request => search(request.query, upstream(fixture.records, []))
    const result = await runResearchDraft(fixture.input, fixture.adapters)
    expect(hybridRetrievalView(result.hybridSearch!).counts).toMatchObject({ mergedDuplicates: 0, deduplicatedWorks: 2 })
  })
})
