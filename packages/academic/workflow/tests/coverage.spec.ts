import { describe, expect, it, vi } from 'vitest'
import { createRetrievalRunId, type ResearchAspectId } from '@deepseek-ai/dsh-academic-model'
import { EvidenceError } from '@deepseek-ai/dsh-academic-evidence'
import { parseCoverageReview, reviewedCoverage, runResearchDraft, WorkflowLogError, type DraftPipelineAdapters } from '../src/index.ts'
import { CoverageRepairRuntime } from '../src/coverage-runtime.ts'
import type { CoverageRepairPolicy, CoverageReviewInput } from '../src/coverage-types.ts'
import { draftFixture } from './pipeline-fixture.ts'

const policy: CoverageRepairPolicy = { minimumSupportingWorks: 1, maximumReviews: 2, maximumRepairRounds: 1,
  maximumRepairPapers: 2, maximumNewCandidateWorks: 4, maximumExcerptCharacters: 1200, maximumRepairCharacters: 4000 }
const aspectId = 'q1.a1' as ResearchAspectId

async function evidenceFixture(): Promise<CoverageReviewInput> {
  const { input, adapters, records } = draftFixture()
  const result = await runResearchDraft(input, adapters)
  return { retrievalRunId: createRetrievalRunId(), brief: { ...input.brief,
    coverageRequirements: [{ question: input.brief.questions[0]!, aspects: [{ aspectId,
      label: 'Compare method results', evidenceRequirement: 'direct', searchTerms: ['reranking'] }] }] },
  works: records.map(record => record.academicWork), evidence: result.papers.flatMap(p => p.status === 'extracted' || p.status === 'partially_extracted'
    ? p.evidence.evidenceRecords : []), questionLinks: result.papers.flatMap(p => p.status === 'extracted'
    || p.status === 'partially_extracted' ? p.evidence.questionLinks : []) }
}

function response(input: CoverageReviewInput) {
  return { aspects: [{ aspectId, status: 'covered' as const, evidenceIds: [input.evidence[0]!.evidenceId], reason: 'Direct support.' }] }
}

describe('aspect coverage and bounded repair', () => {
  it('settles cancellation during coverage review while retaining the consumed reservation and original evidence', async () => {
    const { input, adapters } = draftFixture(3)
    const controller = new AbortController(), question = input.brief.questions[0]!
    input.brief = { ...input.brief, coverageRequirements: [{ question, aspects: [{ aspectId,
      label: 'Compare methods', evidenceRequirement: 'direct', searchTerms: ['reranking'] }] }],
    stopConditions: { ...input.brief.stopConditions, stopWhenEvidenceRequirementsMet: true } }
    input.coverageRepairPolicy = policy
    adapters.reviewCoverage = async () => {
      controller.abort(new DOMException('Cancelled', 'AbortError'))
      throw controller.signal.reason
    }
    const result = await runResearchDraft(input, adapters, controller.signal)
    expect(result.status).toBe('cancelled')
    expect(result.coverageRepair?.reviewCalls).toBe(1)
    expect(result.papers).toHaveLength(2)
    expect(adapters.synthesize).not.toHaveBeenCalled()
  })

  it.each([false, true])('checks coverage at the inclusion target before scheduling more papers: covered=%s', async (covered) => {
    const { input, adapters } = draftFixture(3)
    const question = input.brief.questions[0]!
    input.brief = { ...input.brief, coverageRequirements: [{ question, aspects: [{ aspectId,
      label: 'Compare methods and results', evidenceRequirement: 'direct', searchTerms: ['reranking'] }] }],
    stopConditions: { ...input.brief.stopConditions, stopWhenEvidenceRequirementsMet: true } }
    input.coverageRepairPolicy = { ...policy, maximumNewCandidateWorks: 0, maximumRepairPapers: 0 }
    adapters.assessQuestionCoverage = vi.fn<NonNullable<DraftPipelineAdapters['assessQuestionCoverage']>>(async () => {
      throw new Error('Aspect review must not dispatch a second question assessment.')
    })
    adapters.reviewCoverage = vi.fn<NonNullable<DraftPipelineAdapters['reviewCoverage']>>(async request => ({ aspects: [{ aspectId,
      status: covered ? 'covered' : 'partial', evidenceIds: [request.evidence[0]!.evidenceId],
      reason: covered ? 'The approved comparison is supported.' : 'Only methods, no results.' }] }))
    const result = await runResearchDraft(input, adapters)
    expect(adapters.generator).toHaveBeenCalledTimes(2)
    expect(adapters.reviewCoverage).toHaveBeenCalledOnce()
    expect(adapters.assessQuestionCoverage).not.toHaveBeenCalled()
    expect(result.coverageRepair?.coverage?.allQuestionsCovered).toBe(covered)
    if (!covered) expect(result.retrievalRun.coverageSummary.limitations.join(' ')).toContain('有限补强')
  })

  it('keeps papers and evidence counts without promoting an unreviewed question to covered', async () => {
    const input = await evidenceFixture()
    const coverage = reviewedCoverage(input, null, true, 1, 'now')
    expect(coverage.questions[0]?.supportingWorkIds).toHaveLength(2)
    expect(coverage.questions[0]?.status).toBe('partial')
    expect(coverage.allQuestionsCovered).toBe(false)
  })

  it('requires all approved aspects, not just one directly associated excerpt', async () => {
    const input = await evidenceFixture()
    const second = 'q1.a2' as ResearchAspectId
    const requirement = input.brief.coverageRequirements![0]!
    const updated = { ...input, brief: { ...input.brief, coverageRequirements: [{ ...requirement,
      aspects: [...requirement.aspects, { ...requirement.aspects[0]!, aspectId: second, label: 'Unanswered history' }] }] } }
    expect(() => parseCoverageReview(JSON.stringify(response(input)), updated)).toThrow(EvidenceError)
    const review = parseCoverageReview(JSON.stringify({ aspects: [...response(input).aspects,
      { aspectId: second, status: 'missing', evidenceIds: [], reason: 'No historical evidence.' }] }), updated)
    expect(reviewedCoverage(updated, review, true, 1, 'now').allQuestionsCovered).toBe(false)
  })

  it.each(['unknown', 'duplicate', 'unlinked', 'missing_with_ids', 'covered_without_ids', 'empty_reason'])(
    'rejects invalid review references: %s', async (scenario) => {
      const input = await evidenceFixture(), value = response(input)
      const item = value.aspects[0]!
      let text: string
      if (scenario === 'unknown') text = JSON.stringify({ aspects: [{ ...item, aspectId: 'invented' }] })
      else if (scenario === 'duplicate') text = JSON.stringify({ aspects: [item, item] })
      else if (scenario === 'unlinked') text = JSON.stringify({ aspects: [{ ...item, evidenceIds: ['unadmitted'] }] })
      else if (scenario === 'missing_with_ids') text = JSON.stringify({ aspects: [{ ...item, status: 'missing' }] })
      else if (scenario === 'covered_without_ids') text = JSON.stringify({ aspects: [{ ...item, evidenceIds: [] }] })
      else text = JSON.stringify({ aspects: [{ ...item, reason: ' ' }] })
      expect(() => parseCoverageReview(text, input)).toThrow(EvidenceError)
    })

  it('reserves before dispatch and caches the exact evidence snapshot', async () => {
    const input = await evidenceFixture(), states: number[] = []
    const runtime = new CoverageRepairRuntime(input, policy, undefined, async (state) => { states.push(state.reviewCalls) })
    const reviewer = vi.fn(async () => { expect(states).toEqual([1]); return response(input) })
    expect((await runtime.review(input, true, 'now', reviewer)).allQuestionsCovered).toBe(true)
    await runtime.review(input, true, 'later', reviewer)
    expect(reviewer).toHaveBeenCalledOnce()
    expect(await runtime.beginRepair()).toBe(true)
    expect(await runtime.beginRepair()).toBe(false)
    expect(await runtime.reservePaper(input.evidence[0]!.workVersionId)).toBe(true)
    expect(await runtime.reservePaper(input.evidence[0]!.workVersionId)).toBe(false)
  })

  it('counts a failed dispatch and never turns failure into coverage', async () => {
    const input = await evidenceFixture()
    const runtime = new CoverageRepairRuntime(input, { ...policy, maximumReviews: 1 }, undefined, async () => {})
    const reviewer = vi.fn(async () => { throw new EvidenceError('Bad review', 'ACADEMIC_COVERAGE_INVALID_REVIEW') })
    expect((await runtime.review(input, true, 'now', reviewer)).allQuestionsCovered).toBe(false)
    await runtime.review(input, true, 'later', reviewer)
    expect(reviewer).toHaveBeenCalledOnce()
    expect(runtime.state).toMatchObject({ reviewCalls: 1, failure: 'review_failed' })
    const resumed = new CoverageRepairRuntime(input, policy, runtime.state, async () => {})
    await resumed.review(input, true, 'resume', reviewer)
    expect(reviewer).toHaveBeenCalledOnce()
  })

  it('propagates cancellation and durability failures without reusing their reserved call', async () => {
    const input = await evidenceFixture()
    for (const failure of [new DOMException('Cancelled', 'AbortError'), new WorkflowLogError(new Error('disk'))]) {
      const runtime = new CoverageRepairRuntime(input, policy, undefined, async () => {})
      await expect(runtime.review(input, true, 'now', async () => { throw failure })).rejects.toBe(failure)
      expect(runtime.state.reviewCalls).toBe(1)
    }
  })

  it('invalidates coverage after new evidence and preserves the two-review ceiling', async () => {
    const input = await evidenceFixture()
    const runtime = new CoverageRepairRuntime(input, policy, undefined, async () => {})
    const reviewer = vi.fn(async () => response(input))
    await runtime.review(input, true, 'now', reviewer)
    const changed = { ...input, evidence: [...input.evidence, { ...input.evidence[0]!, sourcedStatement: 'Additional result.' }] }
    expect(runtime.coverage(changed, true, 'now').allQuestionsCovered).toBe(false)
    await runtime.review(changed, true, 'now', reviewer)
    const changedAgain = { ...changed, questionLinks: [] }
    expect((await runtime.review(changedAgain, true, 'now', reviewer)).allQuestionsCovered).toBe(false)
    expect(reviewer).toHaveBeenCalledTimes(2)
  })
})
