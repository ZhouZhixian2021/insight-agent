import { describe, expect, it, vi } from 'vitest'
import type { EvidenceContentSegment, EvidenceGenerationRequest } from '@deepseek-ai/dsh-academic-evidence'
import { reviewPaperScopeInFragments, screeningConditions } from '../src/index.ts'
import type { PaperScopeDecision, ScopeScreeningRecord } from '../src/index.ts'

function paragraph(text: string, sectionTitle: string): EvidenceContentSegment {
  return { text, locator: { kind: 'paragraph', sectionTitle, paragraphNumber: 1 } }
}

function request(segments: readonly EvidenceContentSegment[]): EvidenceGenerationRequest {
  return { instruction: 'Review this paper.', focusQuestions: ['Does it answer the question?'], segments }
}

const policy = { maximumDispatches: 3, maximumFragments: 2, fragmentCharacters: 1_500, leadCharacters: 0 }

describe('screeningConditions', () => {
  it('derives one condition per approved rule with its reviewed terms', () => {
    const conditions = screeningConditions({ inclusionRules: ['Evaluation of retrieval augmented generation'],
      exclusionRules: ['Survey papers'] })
    expect(conditions.map(condition => condition.conditionId)).toStrictEqual(['inclusion-1', 'exclusion-1'])
    expect(conditions[0]?.terms).toContain('retrieval')
    expect(conditions[1]?.terms).toContain('survey')
  })
})

describe('reviewPaperScopeInFragments', () => {
  it('reads the windows that serve the condition instead of the paper opening', async () => {
    const segments = [paragraph('Introduction without the reviewed term.', 'Introduction'),
      paragraph('Our results reduce hallucination.', 'Results')]
    const seen: string[] = []
    await reviewPaperScopeInFragments(request(segments),
      [{ conditionId: 'c1', terms: ['hallucination'] }], policy,
      async (scopeRequest) => { seen.push(...scopeRequest.segments.map(segment => segment.text))
        return { status: 'included', reason: 'The result answers the question.' } })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toContain('hallucination')
    expect(seen[0]).not.toContain('Introduction')
  })

  it('stops as soon as one dispatch settles the paper', async () => {
    const review = vi.fn(async (): Promise<PaperScopeDecision> => ({ status: 'included', reason: 'Decided.' }))
    const outcome = await reviewPaperScopeInFragments(request([paragraph('alpha content', 'Methods')]),
      [{ conditionId: 'c1', terms: ['alpha'] }], policy, review)
    expect(outcome.decision.status).toBe('included')
    expect(outcome.record.dispatches).toHaveLength(1)
    expect(outcome.record.remainingDispatches).toBe(2)
    expect(outcome.record.stopReason).toBe('decided')
    expect(review).toHaveBeenCalledTimes(1)
  })

  it('spends the dispatch budget once per read and stops unresolved', async () => {
    const segments = [paragraph('alpha one', 'One'), paragraph('alpha two', 'Two'),
      paragraph('alpha three', 'Three'), paragraph('alpha four', 'Four')]
    const review = vi.fn(async (_request: EvidenceGenerationRequest, _complete: boolean,
      _record: ScopeScreeningRecord): Promise<PaperScopeDecision> =>
      ({ status: 'needs_more_context', reason: 'An unseen section could change the decision.' }))
    const outcome = await reviewPaperScopeInFragments(request(segments),
      [{ conditionId: 'c1', terms: ['alpha'] }], { ...policy, maximumFragments: 1 }, review)
    expect(review).toHaveBeenCalledTimes(3)
    expect(outcome.decision.status).toBe('needs_more_context')
    expect(outcome.record.remainingDispatches).toBe(0)
    expect(outcome.record.stopReason).toBe('budget_exhausted')
    expect(outcome.record.dispatches).toHaveLength(3)
    expect(outcome.record.dispatches[0]?.fragments[0]?.segmentIndex)
      .not.toBe(outcome.record.dispatches[1]?.fragments[0]?.segmentIndex)
  })

  it('reports conditions that no reviewed term reached', async () => {
    const segments = [paragraph('plain text', 'Introduction'), paragraph('more text', 'Methods')]
    const outcome = await reviewPaperScopeInFragments(request(segments),
      [{ conditionId: 'c1', terms: ['absent'] }], policy,
      async () => ({ status: 'needs_more_context', reason: 'Nothing establishes the term.' }))
    expect(outcome.record.dispatches[0]?.fragments).toHaveLength(2)
    expect(outcome.record.stopReason).toBe('budget_exhausted')
    expect(outcome.record.remainingDispatches).toBeGreaterThan(0)
  })

  it('rejects an out-of-range dispatch policy', async () => {
    await expect(reviewPaperScopeInFragments(request([paragraph('alpha', 'Methods')]),
      [{ conditionId: 'c1', terms: ['alpha'] }], { ...policy, maximumDispatches: 0 },
      async () => ({ status: 'included', reason: 'Decided.' }))).rejects.toThrow(RangeError)
  })

  it('rejects a negative context lead', async () => {
    await expect(reviewPaperScopeInFragments(request([paragraph('alpha', 'Methods')]),
      [{ conditionId: 'c1', terms: ['alpha'] }], { ...policy, leadCharacters: -1 },
      async () => ({ status: 'included', reason: 'Decided.' }))).rejects.toThrow(RangeError)
  })
})
