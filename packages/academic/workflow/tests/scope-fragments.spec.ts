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

  it('adds approved English topic terms to every condition', () => {
    const conditions = screeningConditions({ inclusionRules: ['论文主题直接涉及操作系统内核'],
      exclusionRules: ['产品宣传'] }, ['operating systems', 'kernel design', 'operating systems'])
    expect(conditions[0]?.terms).toContain('operating systems')
    expect(conditions[1]?.terms).toContain('kernel design')
    expect(conditions[0]?.terms.filter(term => term === 'operating systems')).toHaveLength(1)
  })

  it('drops a year that only locates citation lists', () => {
    const conditions = screeningConditions({ inclusionRules: ['所选版本的发表日期不早于 2024 年 1 月 1 日'],
      exclusionRules: [] })
    expect(conditions.flatMap(condition => condition.terms)).not.toContain('2024')
    expect(conditions.map(condition => condition.conditionId)).toStrictEqual(['inclusion-1'])
  })

  it('ignores approved terms without a letter', () => {
    const conditions = screeningConditions({ inclusionRules: ['论文主题'], exclusionRules: [] }, ['2024', '1'])
    expect(conditions.flatMap(condition => condition.terms)).toStrictEqual(['论文主题'])
  })
})

describe('reviewPaperScopeInFragments', () => {
  it('dispatches the matching window together with the paper opening', async () => {
    const segments = [paragraph('Introduction without the reviewed term.', 'Introduction'),
      paragraph('Our results reduce hallucination.', 'Results')]
    const seen: string[] = []
    await reviewPaperScopeInFragments(request(segments),
      [{ conditionId: 'c1', terms: ['hallucination'] }], policy,
      async (scopeRequest) => { seen.push(...scopeRequest.segments.map(segment => segment.text))
        return { status: 'included', reason: 'The result answers the question.' } })
    expect(seen).toHaveLength(2)
    expect(seen[0]).toContain('hallucination')
    expect(seen[1]).toContain('Introduction')
  })

  it('reads a second segment before re-reading the one it already read', async () => {
    const repeated = '2024 '.repeat(600)
    const segments = [paragraph('A title and abstract about kernels.', 'PDF page 1'),
      paragraph(repeated, 'PDF page 13')]
    const seen: (readonly number[])[] = []
    await reviewPaperScopeInFragments(request(segments), [{ conditionId: 'c1', terms: ['2024'] }],
      { ...policy, maximumDispatches: 2, maximumFragments: 1 },
      async (_scopeRequest, _complete, record) => {
        seen.push(record.dispatches.at(-1)?.fragments.map(fragment => fragment.segmentIndex) ?? [])
        return { status: 'needs_more_context', reason: 'Still undecided.' } })
    expect(seen[0]).toStrictEqual([1])
    expect(seen[1]).toStrictEqual([0])
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
