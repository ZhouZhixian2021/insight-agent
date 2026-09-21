import { describe, expect, it, vi } from 'vitest'
import { createAcademicWorkId, createBatchResult, createFailureId, createWorkVersionId,
  type ProviderFailure } from '@deepseek-ai/dsh-academic-model'
import type { AcademicSourceSearchBatchResult, AcademicSourceWork } from '@deepseek-ai/dsh-academic-source'
import { EvidenceError } from '@deepseek-ai/dsh-academic-evidence'
import { runResearchDraft, WorkflowLogError } from '../src/index.ts'
import { draftFixture as fixture } from './pipeline-fixture.ts'

function searchBatch(
  works: readonly AcademicSourceWork[],
  options: {
    readonly failures?: readonly ProviderFailure[]
    readonly discoveredRecords?: number
    readonly truncated?: boolean
    readonly limitations?: readonly string[]
    readonly providers?: readonly string[]
  } = {},
): AcademicSourceSearchBatchResult {
  const batch = createBatchResult(works, options.failures ?? [])
  return { works: batch.items, batch, providers: options.providers ?? ['fixture'],
    discoveredRecords: options.discoveredRecords ?? works.length, truncated: options.truncated ?? false,
    limitations: options.limitations ?? [] }
}

function distinctRecord(base: AcademicSourceWork, key: string): AcademicSourceWork {
  const academicWorkId = createAcademicWorkId()
  const workVersionId = createWorkVersionId()
  const externalIdentifier = { kind: 'provider_record' as const, normalizedValue: key,
    originalValue: key, sourceProvider: 'fixture' }
  return {
    academicWork: { ...base.academicWork, academicWorkId, title: `Synthetic ${key}`,
      externalIdentifiers: [externalIdentifier], workVersionIds: [workVersionId], canonicalVersionId: workVersionId },
    workVersion: { ...base.workVersion, academicWorkId, workVersionId, externalIdentifiers: [externalIdentifier],
      sourceRecords: [{ provider: 'fixture', recordId: key }] },
  }
}

describe('single-pass research draft', () => {
  it('rejects unsupported report requirements before search or model work', async () => {
    const { input, adapters } = fixture()
    input.brief = { ...input.brief, reportRequirements: { ...input.brief.reportRequirements, language: 'unsupported' } }
    await expect(runResearchDraft(input, adapters)).rejects.toMatchObject({ code: 'SYNTHESIS_UNSUPPORTED_PLAN' })
    expect(adapters.search).not.toHaveBeenCalled()
    expect(adapters.synthesize).not.toHaveBeenCalled()
  })
  it('retains extraction results when cancelled during synthesis and returns no report', async () => {
    const { input, adapters } = fixture(), abort = new AbortController()
    const synthesize = adapters.synthesize
    adapters.synthesize = async (...args) => { const draft = await synthesize(...args); abort.abort(); return draft }
    const result = await runResearchDraft(input, adapters, abort.signal)
    expect(result.status).toBe('cancelled')
    expect(result.papers).toHaveLength(2)
    expect(result.report).toBeNull()
  })
  it('propagates synthesis logging failure instead of disguising it as an ordinary model failure', async () => {
    const { input, adapters } = fixture()
    adapters.synthesize = async () => { throw new WorkflowLogError(new Error('disk failure')) }
    await expect(runResearchDraft(input, adapters)).rejects.toBeInstanceOf(WorkflowLogError)
  })
  it.each(['partial', 'all_rejected'] as const)('preserves accepted evidence and records %s papers without stopping later papers', async (mode) => {
    const { input, adapters } = fixture()
    const original = adapters.generator
    let calls = 0
    adapters.generator = async (...args) => {
      const response = await original(...args)
      if (calls++ > 0) return response
      const rejected = { segmentIndex: 0, sourcedStatement: 'Unsupported statement.', verbatimExcerpt: 'Not in the source.', cardItems: [] }
      return { ...response, evidence: mode === 'partial'
        ? [rejected, ...response.evidence] : [rejected] }
    }
    const result = await runResearchDraft(input, adapters)
    expect(calls).toBe(2)
    expect(result.papers.map(paper => paper.status)).toEqual([mode === 'partial' ? 'partially_extracted' : 'extraction_failed', 'extracted'])
    expect(result.retrievalRun).toMatchObject({ status: 'partial_success', coverageSummary: {
      includedWorks: mode === 'partial' ? 2 : 1, availableFulltextWorks: 2, failedOperations: 1, truncated: true } })
    expect(result.retrievalRun.failures).toHaveLength(1)
    expect(result.retrievalRun.failures[0]).toMatchObject({ operation: 'extract_evidence', category: 'parse_failed', retryable: false })
    expect(result.failures).toHaveLength(mode === 'partial' ? 0 : 1)
    expect(result.retrievalRun.coverageSummary.limitations.join(' ')).toContain('rejected 1 drafts')
    if (mode === 'all_rejected') {
      expect(result.report).not.toBeNull()
      expect(result.synthesis.status).toBe('partial_success')
      expect(adapters.synthesize).toHaveBeenCalledOnce()
    }
    if (mode === 'partial') {
      expect(result.report?.limitations.join(' ')).toContain('rejected 1 drafts')
      expect(result.report?.evidence.some(record => record.sourcedStatement === 'Unsupported statement.')).toBe(false)
      expect(result.report?.evidence).toHaveLength(2)
      expect(result.report?.evaluation.status).not.toBe('ready')
    }
  })

  it('reports failure with no included works when all papers have only rejected drafts', async () => {
    const { input, adapters } = fixture()
    adapters.generator = async () => ({ scope: { status: 'included', reason: 'In scope.' }, evidence: [
      { segmentIndex: 99, sourcedStatement: 'Unsupported.', verbatimExcerpt: 'Not present.', cardItems: [] },
    ] })
    const result = await runResearchDraft(input, adapters)
    expect(result.papers.map(paper => paper.status)).toEqual(['extraction_failed', 'extraction_failed'])
    expect(result.retrievalRun).toMatchObject({ status: 'failed', coverageSummary: { includedWorks: 0, failedOperations: 2 } })
    expect(result.report).toBeNull()
    expect(result.report).toBeNull()
    expect(result.synthesis.status).toBe('blocked')
    expect(adapters.synthesize).not.toHaveBeenCalled()
  })
  it('continues other papers after a model input limit pause', async () => {
    const { input, adapters } = fixture()
    const generate = adapters.generator
    let first = true
    adapters.generator = async (request, source, scope) => {
      if (first) { first = false; throw new EvidenceError('input limit', 'EVIDENCE_INPUT_TOO_LARGE') }
      return generate(request, source, scope)
    }
    const result = await runResearchDraft(input, adapters)
    expect(result.papers.map(paper => paper.status)).toEqual(['paused', 'extracted'])
    expect(result.papers[0]).toMatchObject({ status: 'paused', pause: { reason: 'input_too_large' } })
    expect(result.synthesis.status).toBe('partial_success')
  })
  it('stops the whole pass on log failure before starting another paper', async () => {
    const { input, adapters } = fixture()
    adapters.generator = async () => { throw new WorkflowLogError(new Error('disk failure')) }
    await expect(runResearchDraft(input, adapters)).rejects.toBeInstanceOf(WorkflowLogError)
    expect(adapters.fetcher).toHaveBeenCalledOnce()
  })
  it.each(['maximumSearchRounds', 'maximumCandidateWorks', 'maximumIncludedWorks'] as const)('rejects a zero %s before search', async (key) => {
    const { input, adapters } = fixture()
    input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions, [key]: 0 } }
    await expect(runResearchDraft(input, adapters)).rejects.toThrow('limits')
    expect(adapters.search).not.toHaveBeenCalled()
  })
  it('rejects an invalid explicit search bound before search', async () => {
    const { input, adapters } = fixture()
    await expect(runResearchDraft({ ...input, searches: [{ query: 'x', maxResults: 0 }] }, adapters)).rejects.toThrow('positive integer')
    expect(adapters.search).not.toHaveBeenCalled()
  })
  it.each(['resolve', 'reject'] as const)('handles cancellation when search adapters %s', async (outcome) => {
    const { input, adapters, records } = fixture()
    const controller = new AbortController()
    adapters.search = async () => {
      controller.abort()
      if (outcome === 'reject') throw new Error('cancelled')
      return searchBatch(records)
    }
    const result = await runResearchDraft(input, adapters, controller.signal)
    expect(result.status).toBe('cancelled')
    expect(adapters.selectPapers).not.toHaveBeenCalled()
  })
  it.each([true, false])('does not start papers or a report after selection cancellation (empty=%s)', async (empty) => {
    const { input, adapters } = fixture()
    const controller = new AbortController(), select = adapters.selectPapers
    adapters.selectPapers = (a, b) => { controller.abort(); return empty ? { papers: [], truncated: false } : select(a, b) }
    const result = await runResearchDraft(input, adapters, controller.signal)
    expect(result.status).toBe('cancelled')
    expect(result.report).toBeNull()
    expect(adapters.fetcher).not.toHaveBeenCalled()
  })
  it('does not extract when an HTML fetch finishes concurrently with cancellation', async () => {
    const { input, adapters } = fixture()
    const controller = new AbortController(), fetcher = adapters.fetcher
    adapters.fetcher = async (url, signal) => { const result = await fetcher(url, signal); controller.abort(); return result }
    const result = await runResearchDraft(input, adapters, controller.signal)
    expect(result.status).toBe('cancelled')
    expect(adapters.generator).not.toHaveBeenCalled()
  })
  it('runs real ingestion, parsing, extraction, analysis and evaluated draft in order', async () => {
    const { input, adapters, records, events } = fixture()
    const result = await runResearchDraft(input, adapters)
    expect(events).toEqual(['search', 'select', 'fetch:a', 'extract', 'fetch:b', 'extract'])
    expect(adapters.search).toHaveBeenCalledOnce()
    expect(result.status).toBe('completed')
    expect(result.analysis?.claims).toHaveLength(1)
    expect(result.report?.mode).toBe('draft')
    expect(result.report?.evaluation.status).toBe('needs_review')
    expect(result.report?.markdown).toContain('合成基准样例')
    expect(result.report?.evidence).toHaveLength(2)
    expect(records[0]!.workVersion.contentHash.status).toBe('not_extracted')
    const includedWorkIds = result.papers.flatMap(paper => paper.status === 'extracted' ? [paper.version.academicWorkId] : [])
    expect(result.retrievalRun).toMatchObject({ stage: 'completed', status: 'success', queries: ['synthetic methods'],
      providers: ['fixture'],
      coverageSummary: { discoveredRecords: 2, deduplicatedWorks: 2, includedWorks: 2,
        availableFulltextWorks: 2, failedOperations: 0, truncated: false, providerBreakdown: null } })
    expect(new Set(result.retrievalRun.academicWorkIds)).toEqual(new Set(includedWorkIds))
  })
  it('retains source failures and observed coverage beside successful papers', async () => {
    const { input, adapters, records } = fixture()
    const failure: ProviderFailure = { schemaVersion: 1, failureId: createFailureId(), provider: 'pmlr', operation: 'search',
      category: 'upstream_error', message: 'catalog unavailable', retryable: true, retryAfter: null }
    vi.mocked(adapters.search).mockResolvedValueOnce(searchBatch(records, { failures: [failure], discoveredRecords: 5,
      truncated: true, limitations: ['PMLR searches configured catalog pages only.'], providers: ['arxiv', 'pmlr'] }))

    const result = await runResearchDraft(input, adapters)

    expect(result.retrievalRun).toMatchObject({ stage: 'completed', status: 'partial_success', providers: ['arxiv', 'pmlr'],
      failures: [failure], coverageSummary: { discoveredRecords: 5, deduplicatedWorks: 2, includedWorks: 2,
        availableFulltextWorks: 2, failedOperations: 1, truncated: true } })
    expect(result.retrievalRun.coverageSummary.limitations).toContain('PMLR searches configured catalog pages only.')
    expect(result.retrievalRun.coverageSummary.limitations).toContain('Provider pmlr failed during search.')
  })
  it('executes explicit queries in order and round-robins their candidates under one global bound', async () => {
    const { input, adapters, records, events } = fixture()
    const c = distinctRecord(records[0]!, 'c')
    const d = distinctRecord(records[0]!, 'd')
    input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions,
      maximumSearchRounds: 2, maximumCandidateWorks: 3, maximumIncludedWorks: 3 } }
    input.searches = [{ query: 'transformer' }, { query: 'bert' }]
    vi.mocked(adapters.search)
      .mockResolvedValueOnce(searchBatch([records[0]!, c], { providers: ['arxiv'] }))
      .mockResolvedValueOnce(searchBatch([records[1]!, d], { providers: ['acl'] }))

    const result = await runResearchDraft(input, adapters)

    expect(vi.mocked(adapters.search).mock.calls.map(call => call[0])).toEqual([
      { query: 'transformer', maxResults: 3 },
      { query: 'bert', maxResults: 3 },
    ])
    expect(events).toEqual(['select', 'fetch:a', 'extract', 'fetch:b', 'extract', 'fetch:c', 'extract'])
    expect(result.retrievalRun).toMatchObject({ queries: ['transformer', 'bert'], providers: ['arxiv', 'acl'],
      coverageSummary: { discoveredRecords: 4, deduplicatedWorks: 4, includedWorks: 3, truncated: true } })
    expect(result.retrievalRun.academicWorkIds).toHaveLength(3)
    expect(result.retrievalRun.coverageSummary.limitations.join(' ')).toContain('candidate-work bound')
  })
  it('continues later explicit queries after an earlier source batch failed', async () => {
    const { input, adapters, records } = fixture()
    const failure: ProviderFailure = { schemaVersion: 1, failureId: createFailureId(), provider: 'arxiv', operation: 'search',
      category: 'upstream_error', message: 'network unavailable', retryable: true, retryAfter: null }
    input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions, maximumSearchRounds: 2 } }
    input.searches = [{ query: 'transformer' }, { query: 'bert' }]
    vi.mocked(adapters.search)
      .mockResolvedValueOnce(searchBatch([], { failures: [failure], providers: ['arxiv'] }))
      .mockResolvedValueOnce(searchBatch(records, { providers: ['acl'] }))

    const result = await runResearchDraft(input, adapters)

    expect(adapters.search).toHaveBeenCalledTimes(2)
    expect(result.retrievalRun).toMatchObject({ status: 'partial_success', queries: ['transformer', 'bert'],
      providers: ['arxiv', 'acl'], failures: [failure], coverageSummary: { deduplicatedWorks: 2, includedWorks: 2 } })
  })
  it('deduplicates an exact work identity found by more than one query', async () => {
    const { input, adapters, records } = fixture()
    const first = distinctRecord(records[0]!, 'shared')
    const repeated = distinctRecord(records[0]!, 'shared')
    input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions, maximumSearchRounds: 2 } }
    input.searches = [{ query: 'transformer' }, { query: 'bert' }]
    vi.mocked(adapters.search)
      .mockResolvedValueOnce(searchBatch([first]))
      .mockResolvedValueOnce(searchBatch([repeated, records[1]!]))

    const result = await runResearchDraft(input, adapters)

    expect(result.retrievalRun.coverageSummary).toMatchObject({ discoveredRecords: 3, deduplicatedWorks: 2, includedWorks: 2 })
    expect(result.papers).toHaveLength(2)
  })
  it('records only queries started before cancellation', async () => {
    const { input, adapters, records } = fixture()
    const controller = new AbortController()
    input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions, maximumSearchRounds: 2 } }
    input.searches = [{ query: 'transformer' }, { query: 'bert' }]
    adapters.search = vi.fn(async () => { controller.abort(); return searchBatch(records) })

    const result = await runResearchDraft(input, adapters, controller.signal)

    expect(adapters.search).toHaveBeenCalledOnce()
    expect(result.retrievalRun.queries).toEqual(['transformer'])
    expect(result.status).toBe('cancelled')
  })
  it('rejects query counts above the hard or approved search-round bound before search', async () => {
    const { input, adapters } = fixture()
    input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions, maximumSearchRounds: 3 } }
    input.searches = ['one', 'two', 'three', 'four'].map(query => ({ query }))
    await expect(runResearchDraft(input, adapters)).rejects.toThrow('bound of 3')
    input.searches = [{ query: 'one' }, { query: 'two' }]
    input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions, maximumSearchRounds: 1 } }
    await expect(runResearchDraft(input, adapters)).rejects.toThrow('bound of 1')
    expect(adapters.search).not.toHaveBeenCalled()
  })
  it('marks declared source coverage limits without inventing provider counts', async () => {
    const { input, adapters, records } = fixture()
    vi.mocked(adapters.search).mockResolvedValueOnce(searchBatch(records, {
      limitations: ['PMLR searches configured catalog pages only.'], providers: ['pmlr'],
    }))

    const result = await runResearchDraft(input, adapters)

    expect(result.retrievalRun.coverageSummary).toMatchObject({ truncated: true, providerBreakdown: null })
    expect(result.retrievalRun.coverageSummary.limitations).toContain('PMLR searches configured catalog pages only.')
  })
  it('marks an all-source failure as a failed retrieval without generating an insight report', async () => {
    const { input, adapters } = fixture()
    const failure: ProviderFailure = { schemaVersion: 1, failureId: createFailureId(), provider: 'pmlr', operation: 'search',
      category: 'upstream_error', message: 'catalog unavailable', retryable: true, retryAfter: null }
    vi.mocked(adapters.search).mockResolvedValueOnce(searchBatch([], { failures: [failure], providers: ['pmlr'] }))

    const result = await runResearchDraft(input, adapters)

    expect(result.status).toBe('completed')
    expect(result.report).toBeNull()
    expect(result.synthesis.status).toBe('blocked')
    expect(adapters.synthesize).not.toHaveBeenCalled()
    expect(result.retrievalRun).toMatchObject({ stage: 'failed', status: 'failed', academicWorkIds: [],
      coverageSummary: { discoveredRecords: 0, includedWorks: 0, failedOperations: 1, truncated: true } })
  })
  it('retains a model scope exclusion and omits its evidence from analysis', async () => {
    const { input, adapters } = fixture()
    vi.mocked(adapters.generator).mockResolvedValueOnce({
      scope: { status: 'excluded', reason: 'The paper does not satisfy the approved population rule.' }, evidence: [],
    })
    const result = await runResearchDraft(input, adapters)
    expect(result.papers.map(paper => paper.status)).toEqual(['excluded', 'extracted'])
    const includedPaper = result.papers[1]
    expect(includedPaper?.status === 'extracted' && includedPaper.evidence.evidenceRecords).toHaveLength(1)
    expect(result.papers[0]).toMatchObject({ status: 'excluded', exclusion: { reason: 'The paper does not satisfy the approved population rule.' } })
    expect(result.synthesis.status).toBe('partial_success')
  })
  it('pauses a hash conflict while preserving successful papers and the report limitation', async () => {
    const { input, adapters, records } = fixture()
    records[0] = { ...records[0]!, workVersion: { ...records[0]!.workVersion, contentHash: { status: 'available', value: 'old' } } }
    const result = await runResearchDraft(input, adapters)
    expect(result.papers.map(paper => paper.status)).toEqual(['paused', 'extracted'])
    expect(adapters.generator).toHaveBeenCalledOnce()
    expect(result.papers[0]).toMatchObject({ status: 'paused', pause: { reason: 'hash_conflict' } })
    expect(result.synthesis.status).toBe('partial_success')
  })
  it.each(['fulltext', 'extraction'] as const)('isolates %s failure and continues', async (stage) => {
    const { input, adapters } = fixture()
    if (stage === 'fulltext') vi.mocked(adapters.fetcher).mockRejectedValueOnce(new Error('fetch failed'))
    else vi.mocked(adapters.generator).mockRejectedValueOnce(new Error('model failed'))
    const result = await runResearchDraft(input, adapters)
    expect(result.failures[0]?.stage).toBe(stage)
    expect(result.papers).toHaveLength(1)
    expect(result.report).not.toBeNull()
    expect(result.synthesis.status).toBe('partial_success')
    expect(result.retrievalRun.status).toBe('partial_success')
    expect(result.retrievalRun.failures[0]).toMatchObject({
      operation: stage === 'fulltext' ? 'fetch_fulltext' : 'extract_evidence',
      category: stage === 'fulltext' ? 'fulltext_unavailable' : 'unknown',
      affectedWorkVersionId: result.failures[0]?.workVersionId,
    })
    expect(result.retrievalRun.coverageSummary).toMatchObject({ includedWorks: 1,
      availableFulltextWorks: stage === 'fulltext' ? 1 : 2, failedOperations: 1, truncated: true })
  })
  it('classifies known extraction failures without copying model output', async () => {
    const { input, adapters } = fixture()
    vi.mocked(adapters.generator).mockRejectedValueOnce(
      new EvidenceError('details stay internal', 'EVIDENCE_MODEL_BUDGET_UNKNOWN'),
    )
    const result = await runResearchDraft(input, adapters)
    expect(result.retrievalRun.failures[0]).toMatchObject({
      operation: 'extract_evidence',
      category: 'invalid_request',
      message: 'Evidence extraction model capacity or output limit is unavailable.',
    })
    expect(result.retrievalRun.failures[0]?.message).not.toContain('details stay internal')
  })
  it('classifies source excerpt mismatches as parse failures', async () => {
    const { input, adapters } = fixture()
    vi.mocked(adapters.generator).mockRejectedValueOnce(
      new EvidenceError('model output stays internal', 'EVIDENCE_EXCERPT_NOT_FOUND'),
    )
    const result = await runResearchDraft(input, adapters)
    expect(result.retrievalRun.failures[0]).toMatchObject({
      operation: 'extract_evidence',
      category: 'parse_failed',
      message: 'Evidence extraction excerpt did not exactly match the selected source segment.',
    })
  })
  it('bounds candidates and discloses truncation without inventing a second search', async () => {
    const { input, adapters } = fixture()
    const result = await runResearchDraft({ ...input, searches: [{ ...input.searches[0]!, maxResults: 1 }] }, adapters)
    expect(adapters.search).toHaveBeenCalledWith({ query: input.searches[0]!.query, maxResults: 1 }, undefined)
    expect(result.papers).toHaveLength(1)
    expect(result.report).not.toBeNull()
    expect(result.synthesis.status).toBe('partial_success')
    expect(result.retrievalRun.coverageSummary).toMatchObject({ discoveredRecords: 2, deduplicatedWorks: 1,
      includedWorks: 1, truncated: true })
    expect(result.retrievalRun.academicWorkIds).toHaveLength(1)
  })
  it('discloses an adapter-truncated candidate pool without claiming the included cap was reached', async () => {
    const { input, adapters } = fixture()
    input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions, maximumIncludedWorks: 1 } }
    const select = adapters.selectPapers
    adapters.selectPapers = (ingested, brief) => {
      const result = select(ingested, brief)
      return { papers: result.papers.slice(0, 1), truncated: result.papers.length > 1 }
    }

    const result = await runResearchDraft(input, adapters)

    expect(result.papers).toHaveLength(1)
    expect(result.retrievalRun.coverageSummary).toMatchObject({ deduplicatedWorks: 2, includedWorks: 1, truncated: true })
    expect(result.retrievalRun.coverageSummary.limitations)
      .toContain('候选选择器限制了可处理的论文范围。')
  })
  it('blocks synthesis after a successful empty search', async () => {
    const { input, adapters } = fixture()
    vi.mocked(adapters.search).mockResolvedValueOnce(searchBatch([]))
    const result = await runResearchDraft(input, adapters)
    expect(adapters.fetcher).not.toHaveBeenCalled()
    expect(result.report).toBeNull()
    expect(result.synthesis.status).toBe('blocked')
    expect(adapters.synthesize).not.toHaveBeenCalled()
  })
  it('rejects an unapproved brief before calling search', async () => {
    const { input, adapters } = fixture()
    input.brief = { ...input.brief, approval: { status: 'pending' } }
    await expect(runResearchDraft(input, adapters)).rejects.toThrow('approval')
    expect(adapters.search).not.toHaveBeenCalled()
  })
  it.each(['unknown', 'duplicate', 'too_many', 'preprint', 'retracted', 'version_type'] as const)('rejects %s selection before fetching', async (kind) => {
    const { input, adapters, records } = fixture()
    if (kind === 'preprint') input.brief = { ...input.brief, evidenceRequirements: { ...input.brief.evidenceRequirements, allowPreprints: false } }
    if (kind === 'retracted') records[0] = { ...records[0]!, workVersion: { ...records[0]!.workVersion, status: 'retracted' } }
    if (kind === 'version_type') input.brief = { ...input.brief, includedWorkTypes: ['accepted_manuscript', 'version_of_record'] }
    if (kind === 'too_many') {
      const select = adapters.selectPapers
      adapters.selectPapers = (a, b) => {
        const selection = select(a, b)
        return { ...selection, papers: [...selection.papers, ...selection.papers] }
      }
    }
    const select = adapters.selectPapers
    if (kind === 'unknown' || kind === 'duplicate') adapters.selectPapers = (a, b) => {
      const selection = select(a, b), papers = selection.papers
      return { ...selection, papers: kind === 'unknown'
        ? [{ ...papers[0]!, workVersionId: createWorkVersionId() }]
        : [papers[0]!, papers[0]!] }
    }
    await expect(runResearchDraft(input, adapters)).rejects.toThrow()
    expect(adapters.fetcher).not.toHaveBeenCalled()
  })
  it('propagates search failure without running downstream modules', async () => {
    const { input, adapters } = fixture()
    vi.mocked(adapters.search).mockRejectedValueOnce(new Error('search unavailable'))
    await expect(runResearchDraft(input, adapters)).rejects.toThrow('search unavailable')
    expect(adapters.selectPapers).not.toHaveBeenCalled()
  })
  it('cancels before search without generating a report', async () => {
    const { input, adapters } = fixture()
    const result = await runResearchDraft(input, adapters, AbortSignal.abort())
    expect(result.status).toBe('cancelled')
    expect(result.retrievalRun).toMatchObject({ stage: 'cancelled', status: 'success', queries: [], providers: [],
      coverageSummary: { discoveredRecords: 0, deduplicatedWorks: 0, includedWorks: 0, failedOperations: 0 } })
    expect(result.report).toBeNull()
    expect(adapters.search).not.toHaveBeenCalled()
  })
  it('retains completed papers when cancelled during the next fetch', async () => {
    const { input, adapters } = fixture()
    const controller = new AbortController(), fetcher = adapters.fetcher
    adapters.fetcher = async (url, signal) => {
      if (url.endsWith('/b')) { controller.abort(); throw new Error('cancelled') }
      return fetcher(url, signal)
    }
    const result = await runResearchDraft(input, adapters, controller.signal)
    expect(result.status).toBe('cancelled')
    expect(result.papers).toHaveLength(1)
    expect(result.report).toBeNull()
  })
})
