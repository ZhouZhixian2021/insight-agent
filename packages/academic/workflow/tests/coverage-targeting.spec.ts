import { describe, expect, it, vi } from 'vitest'
import { createRetrievalRunId, type ResearchAspectId } from '@deepseek-ai/dsh-academic-model'
import type { EvidenceExtractionInput } from '@deepseek-ai/dsh-academic-evidence'
import { CoverageRepairRuntime, selectCoverageWindows, coverageWindowSegments, runResearchDraft,
  extractPaperEvidence, parseFocusedEvidence, parseCoverageReview, type CoverageRepairPolicy, type CoverageTargetingPolicy,
  type CoverageReviewInput,
  type DraftPipelineAdapters } from '../src/index.ts'
import { draftFixture } from './pipeline-fixture.ts'

const method = 'q1.method' as ResearchAspectId, bdi = 'q1.bdi' as ResearchAspectId
const targeting: CoverageTargetingPolicy = { maximumWindowsPerPaper: 2, maximumWindowCharacters: 1500,
  maximumSourceOptions: 20, maximumPreviewCharacters: 360,
  maximumTotalCharacters: 6000, contextCharacters: 240, maximumCandidateReads: 1, maximumModelTokens: 45000,
  maximumModelCalls: 6, maximumElapsedMs: 220000, repairMaxTokens: 4096, deltaReviewMaxTokens: 8192,
  candidateMaxTokens: 4096, finalReviewReserveTokens: 10000 }
const policy: CoverageRepairPolicy = { minimumSupportingWorks: 1, maximumReviews: 2, maximumRepairRounds: 1,
  maximumRepairPapers: 2, maximumNewCandidateWorks: 4, maximumExcerptCharacters: 1200, maximumRepairCharacters: 4000, targeting }
const requirements = [{ question: 'Compare methods', aspects: [
  { aspectId: method, label: 'Method', evidenceRequirement: 'direct' as const, searchTerms: ['reranking'] },
  { aspectId: bdi, label: 'BDI architecture', evidenceRequirement: 'direct' as const, searchTerms: ['BDI', 'belief'] }] }]

async function inputFixture(): Promise<CoverageReviewInput> {
  const { input, adapters, records } = draftFixture()
  const result = await runResearchDraft(input, adapters)
  return { retrievalRunId: createRetrievalRunId(), brief: { ...input.brief, coverageRequirements: requirements },
    works: records.map(r => r.academicWork), evidence: result.papers.flatMap(p => p.status === 'extracted' ? p.evidence.evidenceRecords : []),
    questionLinks: result.papers.flatMap(p => p.status === 'extracted' ? p.evidence.questionLinks : []) }
}

describe('gap-driven coverage repair', () => {
  it.each(['unchanged', 'changed', 'removed', 'mislinked'] as const)(
    'retains only unchanged baseline support after an interrupted final review: %s', async (kind) => {
      const input = await inputFixture(), first = input.evidence[0]!, now = () => '2026-10-30T00:00:00Z'
      const persist = vi.fn(async () => {})
      const runtime = new CoverageRepairRuntime(input, policy, undefined, persist, now)
      await runtime.review(input, true, now(), async () => ({ aspects: [
        { aspectId: method, status: 'covered', evidenceIds: [first.evidenceId], reason: 'Direct method.' },
        { aspectId: bdi, status: 'partial', evidenceIds: [first.evidenceId], reason: 'Incomplete architecture.' }] }))
      const changed = { ...input, evidence: [...input.evidence].reverse().flatMap(record =>
        record.evidenceId !== first.evidenceId ? [record] : kind === 'removed' ? []
          : [{ ...record, ...kind === 'changed' ? { sourcedStatement: 'Changed support.' } : {} }]),
      questionLinks: kind === 'mislinked' ? input.questionLinks.filter(link => link.evidenceId !== first.evidenceId) : input.questionLinks }
      await expect(runtime.review(changed, true, now(), async (_request, _signal, budget) => {
        await budget!.reserve(100, 200)
        throw new Error('simulated process exit')
      })).rejects.toThrow('simulated process exit')
      expect(runtime.state).toMatchObject({ pending: 'review', reviewCalls: 2,
        review: { aspects: [{ status: 'covered' }, { status: 'partial' }] } })
      const saved = structuredClone(runtime.state)
      const resumed = new CoverageRepairRuntime(changed, policy, saved, persist, now)
      const reviewer = vi.fn<Parameters<typeof resumed.review>[3]>()
      const before = resumed.coverage(changed, true, now())
      const after = await resumed.review(changed, true, now(), reviewer)
      const statuses = [kind === 'unchanged' ? 'covered' : 'uncertain',
        kind === 'removed' || kind === 'mislinked' ? 'uncertain' : 'partial']
      expect(before.questions[0]?.aspects?.map(a => a.status)).toEqual(statuses)
      expect(after.questions[0]?.aspects?.map(a => a.status)).toEqual(statuses)
      expect(after.allQuestionsCovered).toBe(false)
      expect(reviewer).not.toHaveBeenCalled()
      expect(resumed.state).toMatchObject({ pending: null, failure: 'review_failed', reviewCalls: 2,
        targeting: saved.targeting })
      expect(resumed.state.targeting?.dispatches).toEqual([{ reservedTokens: 300, actualTokens: null }])
      await resumed.review(changed, true, now(), reviewer)
      expect(reviewer).not.toHaveBeenCalled()
    })

  it('quarantines an incorrectly linked aspect while preserving valid judgments, and rejects unknown evidence', async () => {
    const input = await inputFixture(), first = input.evidence[0]!
    const linked = { ...input, questionLinks: input.questionLinks.filter(l => l.evidenceId !== first.evidenceId) }
    const aspects = [{ aspectId: method, status: 'covered', evidenceIds: [first.evidenceId], reason: 'Mislinked.' },
      { aspectId: bdi, status: 'missing', evidenceIds: [], reason: 'No BDI evidence.' }]
    expect(parseCoverageReview(JSON.stringify({ aspects }), linked).aspects.map(a => a.status)).toEqual(['uncertain', 'missing'])
    expect(() => parseCoverageReview(JSON.stringify({ aspects: [{ ...aspects[0], evidenceIds: ['invented'] }, aspects[1]] }), linked)).toThrow()
  })

  it('accepts only source windows supplied in the logged routing preview', async () => {
    const input = await inputFixture(), first = input.evidence[0]!
    const routed = { ...input, repairSources: [{ workVersionId: first.workVersionId, title: 'Relevant source',
      windows: [{ segmentIndex: 0, start: 0, end: 100, aspectIds: [bdi], preview: 'BDI beliefs and intentions.' }] }] }
    const aspects = requirements[0]!.aspects.map(a => ({ aspectId: a.aspectId, status: 'missing', evidenceIds: [], reason: 'Missing.' }))
    const route = { question: input.brief.questions[0], workVersionId: first.workVersionId, windowIndexes: [0] }
    expect(parseCoverageReview(JSON.stringify({ aspects, preferredRepairs: [route] }), routed).preferredRepairs).toEqual([route])
    expect(() => parseCoverageReview(JSON.stringify({ aspects, preferredRepairs: [{ ...route, windowIndexes: [1] }] }), routed)).toThrow()
    expect(() => parseCoverageReview(JSON.stringify({ aspects, preferredRepairs: [{ ...route, workVersionId: 'unseen' }] }), routed)).toThrow()
  })
  it('selects relevant body windows across original question-link gaps and skips reference pages', () => {
    const { records } = draftFixture(), version = records[0]!.workVersion
    const source: EvidenceExtractionInput = { academicWorkId: version.academicWorkId, workVersionId: version.workVersionId,
      contentHash: 'sha256:test', sourceProvider: 'fixture', sourceUrl: 'https://example.org', retrievedAt: 'now',
      extractionMethod: { method: 'fixture', methodVersion: '1' }, segments: [
        { text: 'General planning and tool use.', locator: { kind: 'page_section', pdfPage: 1, sectionTitle: 'PDF page 1' } },
        { text: 'BDI agents maintain beliefs and intentions.', locator: { kind: 'page_section', pdfPage: 5, sectionTitle: 'PDF page 5' } },
        { text: '\nReferences\nBDI reranking.', locator: { kind: 'page_section', pdfPage: 8, sectionTitle: 'PDF page 8' } },
        { text: 'BDI reranking belief. Author et al.', locator: { kind: 'page_section', pdfPage: 9, sectionTitle: 'PDF page 9' } },
      ] }
    const windows = selectCoverageWindows(source, requirements, undefined, targeting, 100)
    expect(windows.some(w => w.segmentIndex === 1)).toBe(true)
    expect(windows.every(w => w.segmentIndex < 2)).toBe(true)
    expect(coverageWindowSegments(source, windows)[0]?.text).toContain('BDI agents')
    expect(windows.reduce((n, w) => n + w.end - w.start, 0)).toBeLessThanOrEqual(100)
    expect(source.segments[1]?.text).toBe('BDI agents maintain beliefs and intentions.')
  })

  it('favors substantive historical architecture over incidental symbolic-query and memory-history matches', () => {
    const { records } = draftFixture(), version = records[0]!.workVersion
    const base: EvidenceExtractionInput = { academicWorkId: version.academicWorkId, workVersionId: version.workVersionId,
      contentHash: 'sha256:test', sourceProvider: 'fixture', sourceUrl: 'https://example.org', retrievedAt: 'now',
      extractionMethod: { method: 'fixture', methodVersion: '1' }, segments: [] }
    const gap = [{ question: 'Historical inheritance', aspects: [{ aspectId: method, label: '历史架构与承继关系',
      evidenceRequirement: 'direct' as const, searchTerms: ['symbolic', 'history', 'reinforcement learning'] }] }]
    const segment = (text: string) => ({ text, locator: { kind: 'paragraph' as const, paragraphNumber: 1 } })
    const history = selectCoverageWindows({ ...base, segments: [segment(
      'Classical deliberative agents used symbolic planners; reactive agents and hybrid agents provided traditional architectures.')] },
    gap, undefined, targeting, 1500)
    const incidental = selectCoverageWindows({ ...base, segments: [segment(
      'Memory history is retrieved with symbolic queries; policies use reinforcement learning.')] }, gap, undefined, targeting, 1500)
    expect(history[0]!.score).toBeGreaterThan(incidental[0]!.score)
  })

  it('retains an expired wall-time budget across recovery without dispatching more work', async () => {
    const input = await inputFixture()
    let now = '2026-10-30T00:00:00Z'
    const runtime = new CoverageRepairRuntime(input, policy, undefined, async () => {}, () => now)
    await runtime.runBounded(async () => {})
    now = '2026-10-30T00:03:41Z'
    const resumed = new CoverageRepairRuntime(input, policy, runtime.state, async () => {}, () => now)
    const operation = vi.fn(async () => {})
    await expect(resumed.runBounded(operation)).rejects.toMatchObject({ code: 'ACADEMIC_COVERAGE_TIME_BUDGET' })
    expect(operation).not.toHaveBeenCalled()
    expect(resumed.state.targeting?.exhausted).toBe('time')
  })

  it('only rechecks changed aspects while retaining unchanged evidence-backed judgments', async () => {
    const input = await inputFixture(), now = () => '2026-10-30T00:00:00Z'
    const runtime = new CoverageRepairRuntime(input, policy, undefined, async () => {}, now)
    const first = input.evidence[0]!
    await runtime.review(input, true, now(), async () => ({ aspects: [
      { aspectId: method, status: 'covered', evidenceIds: [first.evidenceId], reason: 'Direct method.' },
      { aspectId: bdi, status: 'missing', evidenceIds: [], reason: 'No BDI evidence.' }] }))
    const changed = { ...input, evidence: [...input.evidence].reverse() }
    const reviewed = await runtime.review(changed, true, now(), async (request) => {
      expect(request.delta?.aspectIds).toEqual([bdi])
      expect(request.delta?.newEvidenceIds).toEqual([])
      return { aspects: [{ aspectId: bdi, status: 'partial', evidenceIds: [first.evidenceId], reason: 'Still missing BDI.' }],
        invalidatedAspectIds: [] }
    })
    expect(reviewed.questions[0]?.aspects?.find(a => a.aspectId === method)?.status).toBe('covered')
    expect(reviewed.allQuestionsCovered).toBe(false)
  })

  it('keeps interrupted token reservations and the reserved final-review allowance across recovery', async () => {
    const input = await inputFixture(), now = () => '2026-10-30T00:00:00Z'
    const bounded = { ...policy, targeting: { ...targeting, maximumModelTokens: 1000, finalReviewReserveTokens: 300 } }
    const runtime = new CoverageRepairRuntime(input, bounded, undefined, async () => {}, now)
    await runtime.modelBudget().reserve(100, 400)
    const resumed = new CoverageRepairRuntime(input, bounded, runtime.state, async () => {}, now)
    await expect(resumed.modelBudget().reserve(100, 200)).rejects.toMatchObject({ code: 'ACADEMIC_COVERAGE_TOKEN_BUDGET' })
    expect(await resumed.modelBudget(true).reserve(100, 200)).toBe(1)
    expect(resumed.state.targeting?.dispatches[0]?.actualTokens).toBeNull()
  })

  it('returns unused output reservation after a settled dispatch, and counts failed calls', async () => {
    const input = await inputFixture(), now = () => '2026-10-30T00:00:00Z'
    const runtime = new CoverageRepairRuntime(input, { ...policy, targeting: { ...targeting,
      maximumModelCalls: 1 } }, undefined, async () => {}, now)
    const id = await runtime.modelBudget().reserve(100, 400)
    await runtime.modelBudget().settle(id, 200)
    expect(runtime.state.targeting?.dispatches).toEqual([{ reservedTokens: 500, actualTokens: 200 }])
    await expect(runtime.modelBudget().reserve(1, 1)).rejects.toMatchObject({ code: 'ACADEMIC_COVERAGE_TOKEN_BUDGET' })
  })

  it('retains a single candidate read and a shared character allowance', async () => {
    const input = await inputFixture(), now = () => '2026-10-30T00:00:00Z'
    const runtime = new CoverageRepairRuntime(input, policy, undefined, async () => {}, now)
    expect(await runtime.reserveCharacters(4500)).toBe(true)
    expect(await runtime.reserveCharacters(1500)).toBe(true)
    expect(await runtime.reserveCharacters(1)).toBe(false)
    expect(await runtime.reserveCandidateRead(input.evidence[0]!.workVersionId)).toBe(true)
    expect(await runtime.reserveCandidateRead(input.evidence[1]!.workVersionId)).toBe(false)
  })

  it('can read an eligible BDI candidate outside the initial selected pool before the final delta review', async () => {
    const { input, adapters, records } = draftFixture(3)
    records[2] = { ...records[2]!, academicWork: { ...records[2]!.academicWork, title: 'NatBDI agent architecture' } }
    input.brief = { ...input.brief, coverageRequirements: requirements,
      stopConditions: { ...input.brief.stopConditions, stopWhenEvidenceRequirementsMet: true } }
    input.coverageRepairPolicy = { ...policy, maximumRepairPapers: 0 }
    const select = adapters.selectPapers
    adapters.selectPapers = async (...args) => {
      const selected = await select(...args)
      return { ...selected, papers: selected.papers.slice(0, 2) }
    }
    adapters.resolveCoverageCandidate = vi.fn<NonNullable<DraftPipelineAdapters['resolveCoverageCandidate']>>(version => ({
      workVersionId: version.workVersionId, urls: ['https://example.org/bdi'],
      sourceProvider: 'fixture', extractionMethod: { method: 'fixture', methodVersion: '1' }, hasHistoricalEvidence: false }))
    const fetcher = adapters.fetcher
    adapters.fetcher = async (url, signal) => url.endsWith('/bdi') ? { url, statusCode: 200, truncated: false,
      body: { kind: 'html', content: '<article><h2>Methods</h2><p>BDI agents maintain beliefs.</p></article>' } } : fetcher(url, signal)
    adapters.extractCoverageCandidate = async (version, source, scope, _requirements, _budget, signal) => extractPaperEvidence(
      version, source, false, async () => ({ scope: { status: 'included', reason: 'Studies BDI architecture.' },
        evidence: parseFocusedEvidence(JSON.stringify({ evidence: [{ segmentIndex: 0, questionIndexes: [0],
          sourcedStatement: 'BDI agents maintain beliefs.', verbatimExcerpt: 'BDI agents maintain beliefs.', section: 'findings' }] })) }), scope, signal)
    adapters.reviewCoverage = vi.fn<NonNullable<DraftPipelineAdapters['reviewCoverage']>>(async (request) => {
      const added = request.evidence.find(e => e.sourcedStatement === 'BDI agents maintain beliefs.')
      return { aspects: [
        ...request.delta === undefined ? [{ aspectId: method, status: 'covered' as const,
          evidenceIds: [request.evidence[0]!.evidenceId], reason: 'Direct method.' }] : [],
        added === undefined ? { aspectId: bdi, status: 'missing', evidenceIds: [], reason: 'No BDI evidence.' }
          : { aspectId: bdi, status: 'covered', evidenceIds: [added.evidenceId], reason: 'Direct BDI evidence.' }],
      ...request.delta === undefined ? {} : { invalidatedAspectIds: [] } }
    })
    const result = await runResearchDraft(input, adapters)
    expect(adapters.resolveCoverageCandidate).toHaveBeenCalledOnce()
    expect(result.coverageRepair?.targeting?.candidateReads).toEqual([records[2].workVersion.workVersionId])
    expect(result.coverageRepair?.reviewCalls, JSON.stringify({ papers: result.papers,
      failures: result.failures, state: result.coverageRepair })).toBe(2)
    expect(result.coverageRepair?.coverage?.allQuestionsCovered).toBe(true)
    expect(result.papers).toHaveLength(3)
  })
})
