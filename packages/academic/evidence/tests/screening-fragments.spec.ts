import { describe, expect, it } from 'vitest'
import { selectScreeningFragments, type EvidenceContentSegment, type ScreeningConditionQuery } from '../src/index.ts'

function paragraph(text: string, sectionTitle: string, paragraphNumber = 1): EvidenceContentSegment {
  return { text, locator: { kind: 'paragraph', sectionTitle, paragraphNumber } }
}

function condition(conditionId: string, ...terms: string[]): ScreeningConditionQuery {
  return { conditionId, terms }
}

const policy = { maximumFragments: 6, maximumCharacters: 1500, leadCharacters: 200 }

describe('selectScreeningFragments', () => {
  it('returns the same selection for the same input', () => {
    const segments = [paragraph('intro alpha', 'Introduction'), paragraph('method beta', 'Methods'),
      paragraph('result gamma', 'Results')]
    const conditions = [condition('c1', 'alpha'), condition('c2', 'beta'), condition('c3', 'gamma')]
    expect(selectScreeningFragments(segments, conditions, policy))
      .toStrictEqual(selectScreeningFragments(segments, conditions, policy))
  })

  it('gives every undecided condition its own window', () => {
    const segments = [paragraph('intro alpha', 'Introduction'), paragraph('method beta', 'Methods'),
      paragraph('result gamma', 'Results')]
    const selection = selectScreeningFragments(segments,
      [condition('c1', 'alpha'), condition('c2', 'beta'), condition('c3', 'gamma')], policy)
    expect(selection.fragments).toHaveLength(3)
    expect(selection.uncoveredConditionIds).toStrictEqual([])
    expect([...new Set(selection.fragments.flatMap(fragment => fragment.conditionIds))].toSorted())
      .toStrictEqual(['c1', 'c2', 'c3'])
  })

  it('spreads additional windows across sections before repeating one', () => {
    const segments = [paragraph('intro alpha', 'Introduction'), paragraph('result beta', 'Results')]
    const selection = selectScreeningFragments(segments, [condition('c1', 'alpha', 'beta')],
      { maximumFragments: 2, maximumCharacters: 1500, leadCharacters: 0 })
    expect(selection.fragments.map(fragment => fragment.sectionTitle)).toStrictEqual(['Introduction', 'Results'])
  })

  it('bounds each window and keeps the reviewed context lead', () => {
    const text = `${'x'.repeat(3000)}gamma${'y'.repeat(1996)}`
    const selection = selectScreeningFragments([paragraph(text, 'Methods')], [condition('c1', 'gamma')],
      { maximumFragments: 1, maximumCharacters: 1500, leadCharacters: 100 })
    const [fragment] = selection.fragments
    expect(fragment?.start).toBe(2900)
    expect(fragment?.end).toBe(4400)
    expect((fragment?.end ?? 0) - (fragment?.start ?? 0)).toBe(1500)
  })

  it('falls back to spread windows and reports conditions no term reached', () => {
    const segments = [paragraph('a', 'One'), paragraph('b', 'Two'), paragraph('c', 'Three'), paragraph('d', 'Four')]
    const selection = selectScreeningFragments(segments, [condition('c1', 'absent')],
      { maximumFragments: 2, maximumCharacters: 10, leadCharacters: 0 })
    expect(selection.fragments).toHaveLength(2)
    expect(selection.fragments.every(fragment => fragment.conditionIds.length === 0)).toBe(true)
    expect(selection.uncoveredConditionIds).toStrictEqual(['c1'])
    expect(selection.sourceComplete).toBe(false)
  })

  it('marks the source complete only when the windows cover every character', () => {
    const selection = selectScreeningFragments([paragraph('short alpha text', 'Abstract')],
      [condition('c1', 'alpha')], { maximumFragments: 1, maximumCharacters: 1500, leadCharacters: 0 })
    expect(selection.sourceComplete).toBe(true)
  })

  it('reports truncation when more windows exist than the policy admits', () => {
    const segments = Array.from({ length: 5 }, (_, index) => paragraph(`alpha ${index}`, `Section ${index}`))
    const selection = selectScreeningFragments(segments, [condition('c1', 'alpha')],
      { maximumFragments: 2, maximumCharacters: 1500, leadCharacters: 0 })
    expect(selection.fragments).toHaveLength(2)
    expect(selection.truncated).toBe(true)
  })

  it('rejects invalid policies and conditions', () => {
    const segments = [paragraph('alpha', 'Methods')]
    expect(() => selectScreeningFragments(segments, [condition('c1', 'alpha')],
      { maximumFragments: 0, maximumCharacters: 1500, leadCharacters: 0 })).toThrow(RangeError)
    expect(() => selectScreeningFragments(segments, [condition('c1', 'alpha'), condition('c1', 'beta')], policy))
      .toThrow(RangeError)
    expect(() => selectScreeningFragments(segments, [condition('c1')], policy)).toThrow(RangeError)
  })
})
