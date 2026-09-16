import { describe, expect, it, vi } from 'vitest'
import { createWorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { EvidenceError } from '@deepseek-ai/dsh-academic-evidence'
import { runResearchDraft, WorkflowLogError } from '../src/index.ts'
import { draftFixture as fixture } from './pipeline-fixture.ts'
describe('single-pass research draft', () => {
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
    expect(result.report?.limitations.join(' ')).toContain('input_too_large')
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
    await expect(runResearchDraft({ ...input, search: { query: 'x', maxResults: 0 } }, adapters)).rejects.toThrow('positive integer')
    expect(adapters.search).not.toHaveBeenCalled()
  })
  it.each(['resolve', 'reject'] as const)('handles cancellation when search adapters %s', async (outcome) => {
    const { input, adapters, records } = fixture()
    const controller = new AbortController()
    adapters.search = async () => {
      controller.abort()
      if (outcome === 'reject') throw new Error('cancelled')
      return { works: records, truncated: false }
    }
    const result = await runResearchDraft(input, adapters, controller.signal)
    expect(result.status).toBe('cancelled')
    expect(adapters.selectPapers).not.toHaveBeenCalled()
  })
  it.each([true, false])('does not start papers or a report after selection cancellation (empty=%s)', async (empty) => {
    const { input, adapters } = fixture()
    const controller = new AbortController(), select = adapters.selectPapers
    adapters.selectPapers = (a, b) => { controller.abort(); return empty ? [] : select(a, b) }
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
    expect(result.report?.limitations.join(' ')).toContain('does not satisfy the approved population rule')
  })
  it('pauses a hash conflict while preserving successful papers and the report limitation', async () => {
    const { input, adapters, records } = fixture()
    records[0] = { ...records[0]!, workVersion: { ...records[0]!.workVersion, contentHash: { status: 'available', value: 'old' } } }
    const result = await runResearchDraft(input, adapters)
    expect(result.papers.map(paper => paper.status)).toEqual(['paused', 'extracted'])
    expect(adapters.generator).toHaveBeenCalledOnce()
    expect(result.report?.limitations.join(' ')).toContain('hash_conflict')
  })
  it.each(['fulltext', 'extraction'] as const)('isolates %s failure and continues', async (stage) => {
    const { input, adapters } = fixture()
    if (stage === 'fulltext') vi.mocked(adapters.fetcher).mockRejectedValueOnce(new Error('fetch failed'))
    else vi.mocked(adapters.generator).mockRejectedValueOnce(new Error('model failed'))
    const result = await runResearchDraft(input, adapters)
    expect(result.failures[0]?.stage).toBe(stage)
    expect(result.papers).toHaveLength(1)
    expect(result.report?.limitations.join(' ')).toContain(stage)
  })
  it('bounds candidates and discloses truncation without inventing a second search', async () => {
    const { input, adapters } = fixture()
    const result = await runResearchDraft({ ...input, search: { ...input.search, maxResults: 1 } }, adapters)
    expect(adapters.search).toHaveBeenCalledWith({ query: input.search.query, maxResults: 1 }, undefined)
    expect(result.papers).toHaveLength(1)
    expect(result.report?.limitations.join(' ')).toContain('truncated')
  })
  it('produces an explicitly blocked empty draft after a successful empty search', async () => {
    const { input, adapters } = fixture()
    vi.mocked(adapters.search).mockResolvedValueOnce({ works: [], truncated: false })
    const result = await runResearchDraft(input, adapters)
    expect(adapters.fetcher).not.toHaveBeenCalled()
    expect(result.report?.evaluation.status).toBe('blocked')
  })
  it('rejects an unapproved brief before calling search', async () => {
    const { input, adapters } = fixture()
    input.brief = { ...input.brief, approval: { status: 'pending' } }
    await expect(runResearchDraft(input, adapters)).rejects.toThrow('approval')
    expect(adapters.search).not.toHaveBeenCalled()
  })
  it.each(['unknown', 'duplicate', 'too_many', 'preprint', 'retracted'] as const)('rejects %s selection before fetching', async (kind) => {
    const { input, adapters, records } = fixture()
    if (kind === 'preprint') input.brief = { ...input.brief, evidenceRequirements: { ...input.brief.evidenceRequirements, allowPreprints: false } }
    if (kind === 'retracted') records[0] = { ...records[0]!, workVersion: { ...records[0]!.workVersion, status: 'retracted' } }
    if (kind === 'too_many') input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions, maximumIncludedWorks: 1 } }
    const select = adapters.selectPapers
    if (kind === 'unknown' || kind === 'duplicate') adapters.selectPapers = (a, b) => {
      const papers = select(a, b)
      return kind === 'unknown' ? [{ ...papers[0]!, workVersionId: createWorkVersionId() }] : [papers[0]!, papers[0]!]
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
