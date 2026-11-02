import { describe, expect, it } from 'vitest'
import { rankRangesByQuestion, SCORING_UNIT_CHARACTERS } from '../src/retrieval.ts'
import type { EvidenceContentSegment } from '../src/types.ts'
import type { EvidenceFragmentRange } from '../src/fragment-types.ts'

function segment(text: string): EvidenceContentSegment {
  return { text, locator: { kind: 'page_section', sectionTitle: 'Body', pdfPage: 1 } }
}

function range(index: number, segmentIndex = index, characterStart = 0, characterEnd = 10 ** 9): EvidenceFragmentRange {
  return { fragmentIndex: index + 1, segmentIndex, characterStart, characterEnd }
}

function order(ranges: readonly EvidenceFragmentRange[]): number[] {
  return ranges.map(item => item.fragmentIndex)
}

describe('rankRangesByQuestion', () => {
  it('returns every range exactly once', () => {
    const segments = [segment('alpha beta gamma'), segment('delta epsilon'), segment('zeta eta')]
    const ranges = [range(0), range(1), range(2)]
    const ranked = rankRangesByQuestion(ranges, segments, [['alpha', 'zeta']], 2)
    expect(ranked).toHaveLength(3)
    expect(order(ranked).toSorted()).toEqual([1, 2, 3])
  })

  it('keeps source order when no focus question supplies terms', () => {
    const segments = [segment('serverless inference'), segment('cgroup control'), segment('npu memory')]
    const ranges = [range(0), range(1), range(2)]
    expect(order(rankRangesByQuestion(ranges, segments, [], 2))).toEqual([1, 2, 3])
  })

  it('returns every range even when the budget is smaller', () => {
    const segments = [segment('alpha'), segment('beta'), segment('gamma'), segment('delta')]
    const ranges = [range(0), range(1), range(2), range(3)]
    expect(order(rankRangesByQuestion(ranges, segments, [['alpha', 'beta', 'gamma', 'delta']], 2))).toHaveLength(4)
  })

  it('prefers a range that states the query term over one that merely shares common terms', () => {
    const segments = [
      segment('serverless inference serverless inference serverless inference serverless inference'),
      segment('serverless quota sriov virtual function'),
      segment('unrelated kernel discussion'),
    ]
    const ranges = [range(0), range(1), range(2)]
    expect(order(rankRangesByQuestion(ranges, segments, [['serverless', 'sriov']], 1)).slice(0, 1)).toEqual([2])
  })

  it('ignores terms that appear in every range', () => {
    const segments = [
      segment('agent agent agent agent'),
      segment('agent serverless quota'),
    ]
    const ranges = [range(0), range(1)]
    expect(order(rankRangesByQuestion(ranges, segments, [['serverless']], 1)).slice(0, 1)).toEqual([2])
  })

  it('gives every question a dispatch before repeating one question', () => {
    const segments = [
      segment('alpha scheduling quota'),
      segment('alpha scheduling quota'),
      segment('beta memory tiering'),
      segment('beta memory tiering'),
    ]
    const ranges = [range(0), range(1), range(2), range(3)]
    const ranked = rankRangesByQuestion(ranges, segments, [['alpha'], ['beta']], 4)
    expect(order(ranked).slice(0, 2).toSorted()).toEqual([1, 3])
  })

  it('dispatches a shared match once across questions', () => {
    const segments = [segment('kv cache reuse'), segment('kv cache reuse'), segment('scheduling fairness')]
    const ranges = [range(0), range(1), range(2)]
    const ranked = rankRangesByQuestion(ranges, segments, [['kv'], ['cache']], 3)
    expect(order(ranked)).toEqual([1, 2, 3])
  })

  it('falls back to source order when question terms cannot match the content', () => {
    const segments = [segment('alpha beta'), segment('gamma delta')]
    const ranges = [range(0), range(1)]
    expect(order(rankRangesByQuestion(ranges, segments, [['智能体', '操作系统']], 2))).toEqual([1, 2])
  })

  it('is deterministic for the same input', () => {
    const segments = [segment('alpha one'), segment('beta two'), segment('alpha three')]
    const ranges = [range(0), range(1), range(2)]
    const terms = [['alpha', 'beta']]
    expect(order(rankRangesByQuestion(ranges, segments, terms, 2)))
      .toEqual(order(rankRangesByQuestion(ranges, segments, terms, 2)))
  })

  it('breaks score ties by source order', () => {
    const segments = [segment('alpha'), segment('alpha'), segment('alpha')]
    const ranges = [range(0), range(1), range(2)]
    expect(order(rankRangesByQuestion(ranges, segments, [['alpha']], 2))).toEqual([1, 2, 3])
  })

  it('scores within one long range instead of dropping it', () => {
    const long = `${'filler text '.repeat(200)}cgroup budget enforcement`
    const segments = [segment(long)]
    const ranges = [range(0)]
    expect(order(rankRangesByQuestion(ranges, segments, [['cgroup']], 1))).toEqual([1])
  })

  it('splits a range into scoring units at the stated granularity', () => {
    const long = 'alpha '.repeat(SCORING_UNIT_CHARACTERS)
    const segments = [segment(long), segment('nothing relevant here')]
    const ranges = [range(0), range(1)]
    expect(order(rankRangesByQuestion(ranges, segments, [['alpha']], 1)).slice(0, 1)).toEqual([1])
  })

  it('treats a multi-part range as one dispatch', () => {
    const segments = [segment('first part with sriov'), segment('second part without it')]
    const ranges: EvidenceFragmentRange[] = [{ fragmentIndex: 1, segmentIndex: 0, characterStart: 0, characterEnd: 20,
      sourceRanges: [{ segmentIndex: 0, characterStart: 0, characterEnd: 20 },
        { segmentIndex: 1, characterStart: 0, characterEnd: 22 }] }, range(1, 1, 0, 22)]
    const ranked = rankRangesByQuestion(ranges, segments, [['sriov']], 1)
    expect(order(ranked).slice(0, 1)).toEqual([1])
    expect(ranked).toHaveLength(2)
  })

  it('spends a shrunken budget on the question that still lacks evidence', () => {
    const segments = [segment('alpha scheduling'), segment('alpha quota'), segment('beta tiering'), segment('beta cache')]
    const ranges = [range(0), range(1), range(2), range(3)]
    const ranked = rankRangesByQuestion(ranges, segments, [['alpha'], ['beta']], 2, { weights: [0.25, 1] })
    expect(order(ranked).slice(0, 2)).toEqual([3, 4])
  })

  it('keeps an even share for equal question weights', () => {
    const segments = [segment('alpha scheduling'), segment('alpha quota'), segment('beta tiering'), segment('beta cache')]
    const ranges = [range(0), range(1), range(2), range(3)]
    const ranked = rankRangesByQuestion(ranges, segments, [['alpha'], ['beta']], 2, { weights: [1, 1] })
    expect(order(ranked).slice(0, 2).toSorted()).toEqual([1, 3])
  })

  it('discounts a range too short to carry a full dispatch', () => {
    const long = `${'filler text '.repeat(90)}sriov`
    const segments = [segment(long), segment('sriov')]
    const ranges = [range(0, 0, 0, long.length), range(1, 1, 0, 5)]
    expect(order(rankRangesByQuestion(ranges, segments, [['sriov']], 2, { minimumCharacters: 1 }))[0]).toBe(2)
    expect(order(rankRangesByQuestion(ranges, segments, [['sriov']], 2, { minimumCharacters: 1_000 }))[0]).toBe(1)
  })
})
