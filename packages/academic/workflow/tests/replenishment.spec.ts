import { describe, expect, it, vi } from 'vitest'
import { createAcademicWorkId, createWorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { runResearchDraft, selectResearchPapers } from '../src/index.ts'
import { draftFixture } from './pipeline-fixture.ts'

function fixture() {
  const f = draftFixture(), base = f.records[0]!
  f.records.splice(0, f.records.length, ...Array.from({ length: 5 }, (_, index) => {
    const academicWorkId = createAcademicWorkId(), workVersionId = createWorkVersionId()
    return { academicWork: { ...base.academicWork, academicWorkId, canonicalVersionId: workVersionId,
      workVersionIds: [workVersionId], title: `Candidate ${index}` },
    workVersion: { ...base.workVersion, academicWorkId, workVersionId,
      sourceRecords: [{ provider: 'fixture', recordId: String(index) }] } }
  }))
  f.input.brief = { ...f.input.brief, stopConditions: { ...f.input.brief.stopConditions,
    maximumCandidateWorks: 5, maximumIncludedWorks: 2, stopWhenEvidenceRequirementsMet: true } }
  f.adapters.selectPapers = (ingested, brief) => selectResearchPapers(ingested, brief, (_work, version) => ({
    urls: [`https://example.org/${version.sourceRecords[0]!.recordId}`], sourceProvider: 'fixture',
    extractionMethod: { method: 'fixture', methodVersion: '1' }, hasHistoricalEvidence: false,
  }))
  return f
}

describe('bounded candidate replenishment', () => {
  it.each(['excluded', 'empty', 'failed', 'all_rejected', 'unlinked'] as const)('continues past %s papers and stops on usable evidence', async (kind) => {
    const { input, adapters } = fixture()
    const generated = vi.mocked(adapters.generator)
    for (let index = 0; index < 2; index++) {
      if (kind === 'failed') generated.mockRejectedValueOnce(new Error('model failed'))
      else generated.mockResolvedValueOnce({ scope: { status: kind === 'excluded' ? 'excluded' : 'included', reason: 'Synthetic scope.' },
        evidence: kind === 'all_rejected' || kind === 'unlinked'
          ? [{ segmentIndex: 0, sourcedStatement: 'Uses reranking.',
            verbatimExcerpt: kind === 'unlinked' ? 'Uses reranking.' : 'Missing excerpt.', cardItems: [] }] : [] })
    }
    const result = await runResearchDraft(input, adapters)
    expect(adapters.search).toHaveBeenCalledTimes(1)
    expect(adapters.fetcher).toHaveBeenCalledTimes(4)
    expect(adapters.generator).toHaveBeenCalledTimes(4)
    expect(result.retrievalRun.coverageSummary).toMatchObject({ includedWorks: 2, availableFulltextWorks: 4 })
    expect(result.retrievalRun.coverageSummary.limitations.join('\n')).toContain('证据已达到计划数量要求')
    expect(result.synthesis.status).toBe('completed')
    expect(result.report).not.toBeNull()
  })

  it('replenishes after full-text failure without revisiting the failed candidate', async () => {
    const { input, adapters } = fixture()
    vi.mocked(adapters.fetcher).mockRejectedValueOnce(new Error('HTTP failed'))
    const result = await runResearchDraft(input, adapters)
    expect(adapters.fetcher).toHaveBeenCalledTimes(3)
    expect(new Set(vi.mocked(adapters.fetcher).mock.calls.map(call => call[0])).size).toBe(3)
    expect(result.failures).toHaveLength(1)
    expect(result.synthesis.status).toBe('completed')
  })

  it('stops at the successful inclusion cap when the plan minimum is unattainable', async () => {
    const { input, adapters } = fixture()
    input.brief = { ...input.brief, evidenceRequirements: { ...input.brief.evidenceRequirements, minimumIncludedWorks: 3 } }
    const result = await runResearchDraft(input, adapters)
    expect(adapters.generator).toHaveBeenCalledTimes(2)
    expect(result.synthesis.status).toBe('partial_success')
    expect(result.report?.evaluation.status).toBe('blocked')
    expect(result.report?.markdown).toContain('证据有限的研究草稿')
    expect(result.retrievalRun.coverageSummary.limitations.join('\n')).toContain('达到成功纳入上限 2 篇')
  })

  it('continues to the included cap when early stopping is disabled', async () => {
    const { input, adapters } = fixture()
    input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions,
      maximumIncludedWorks: 3, stopWhenEvidenceRequirementsMet: false } }
    const result = await runResearchDraft(input, adapters)
    expect(adapters.generator).toHaveBeenCalledTimes(3)
    expect(result.retrievalRun.coverageSummary.includedWorks).toBe(3)
  })

  it('exhausts the bounded pool once, preserves outcomes and reports unmet requirements', async () => {
    const { input, adapters } = fixture()
    vi.mocked(adapters.generator).mockResolvedValue({ scope: { status: 'excluded', reason: 'Out of scope.' }, evidence: [] })
    const result = await runResearchDraft(input, adapters)
    expect(adapters.generator).toHaveBeenCalledTimes(5)
    expect(result.papers).toHaveLength(5)
    expect(result.retrievalRun.coverageSummary.includedWorks).toBe(0)
    expect(result.retrievalRun.coverageSummary.limitations.join('\n')).toContain('可处理候选已用完（5 篇）')
    expect(adapters.synthesize).not.toHaveBeenCalled()
  })

  it('does not replenish outside a smaller request candidate bound', async () => {
    const { input, adapters } = fixture()
    vi.mocked(adapters.generator).mockResolvedValue({ scope: { status: 'excluded', reason: 'Out of scope.' }, evidence: [] })
    const result = await runResearchDraft({ ...input, searches: [{ query: 'bounded', maxResults: 2 }] }, adapters)
    expect(adapters.generator).toHaveBeenCalledTimes(2)
    expect(result.report).toBeNull()
  })

  it('forwards the plan deadline and preserves finished papers when it expires', async () => {
    const { input, adapters } = fixture(), deadline = new AbortController()
    input.brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions, maximumElapsedMinutes: 1 } }
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
    const fetch = adapters.fetcher
    let calls = 0
    adapters.fetcher = vi.fn<typeof adapters.fetcher>(async (...args) => {
      if (++calls === 2) {
        deadline.abort(new DOMException('Deadline', 'TimeoutError'))
        throw deadline.signal.reason
      }
      return fetch(...args)
    })
    try {
      const result = await runResearchDraft(input, adapters)
      expect(timeout).toHaveBeenCalledWith(60_000)
      expect(adapters.fetcher).toHaveBeenCalledTimes(2)
      expect(result.papers).toHaveLength(1)
      expect(result.status).toBe('cancelled')
      expect(result.synthesis.reasons.join('\n')).toContain('计划时间上限')
      expect(adapters.synthesize).not.toHaveBeenCalled()
    } finally { timeout.mockRestore() }
  })
})


it.each(['continue_with_warning', 'stop_for_review'] as const)('exhausts remaining candidates before applying %s', async (policy) => {
  const { input, adapters } = fixture()
  input.brief = { ...input.brief, evidenceRequirements: { ...input.brief.evidenceRequirements,
    minimumIncludedWorks: 6, minimumFulltextWorks: 3, insufficientEvidencePolicy: policy },
  stopConditions: { ...input.brief.stopConditions, maximumIncludedWorks: 10 } }
  const generator = adapters.generator
  let count = 0
  adapters.generator = vi.fn<typeof adapters.generator>(async (...args) => ++count <= 3 ? generator(...args)
    : { scope: { status: 'excluded' as const, reason: 'Outside scope.' }, evidence: [] })
  const result = await runResearchDraft(input, adapters)
  expect(adapters.generator).toHaveBeenCalledTimes(5)
  expect(result.retrievalRun.coverageSummary.includedWorks).toBe(3)
  expect(result.retrievalRun.coverageSummary.limitations.join(' ')).toContain('可处理候选已用完（5 篇）')
  expect(result.synthesis.status).toBe(policy === 'continue_with_warning' ? 'partial_success' : 'blocked')
  if (policy === 'continue_with_warning') {
    expect(adapters.synthesize).toHaveBeenCalledOnce()
    expect(result.report?.markdown).toContain('Plan 至少要求 6 篇')
    expect(result.report?.evaluation.status).toBe('blocked')
  } else {
    expect(adapters.synthesize).not.toHaveBeenCalled()
    expect(result.report).toBeNull()
  }
})
