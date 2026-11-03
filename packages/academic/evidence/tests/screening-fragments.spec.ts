import { describe, expect, it } from 'vitest'
import { selectScreeningFragments, type EvidenceContentSegment, type ScreeningConditionQuery } from '../src/index.ts'

function paragraph(text: string, sectionTitle: string, paragraphNumber = 1): EvidenceContentSegment {
  return { text, locator: { kind: 'paragraph', sectionTitle, paragraphNumber } }
}

function page(text: string, pdfPage: number): EvidenceContentSegment {
  return { text, locator: { kind: 'page_section', sectionTitle: `PDF page ${pdfPage}`, pdfPage } }
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

  it.each(['References', '7 References', 'REFERENCES', 'Bibliography', 'Acknowledgments',
    'Appendix', 'A. Appendix', 'Supplementary Material', '参考文献', '附录', '致谢'])(
    'never screens %s for reviewed terms', (heading) => {
      const segments = [paragraph('body text without the term', 'Introduction'),
        paragraph('eBPF kernel policy eBPF kernel policy', heading)]
      const selection = selectScreeningFragments(segments, [condition('c1', 'ebpf')], policy)
      expect(selection.fragments.map(fragment => fragment.sectionTitle)).toStrictEqual(['Introduction'])
      expect(selection.fragments.flatMap(fragment => fragment.matchedTerms)).toStrictEqual([])
      expect(selection.uncoveredConditionIds).toStrictEqual(['c1'])
    })

  it('keeps a body heading that mentions a reviewed term', () => {
    const segments = [paragraph('Our eBPF design', 'Related work and eBPF background')]
    const selection = selectScreeningFragments(segments, [condition('c1', 'ebpf')], policy)
    expect(selection.fragments).toHaveLength(1)
  })

  it('completes the source without reading back matter', () => {
    const segments = [paragraph('short alpha text', 'Abstract'),
      paragraph('a long reference list with alpha alpha alpha', 'References')]
    const selection = selectScreeningFragments(segments, [condition('c1', 'alpha')],
      { maximumFragments: 1, maximumCharacters: 1500, leadCharacters: 0 })
    expect(selection.fragments.map(fragment => fragment.segmentIndex)).toStrictEqual([0])
    expect(selection.sourceComplete).toBe(true)
  })

  it('spreads fallback windows over body segments only', () => {
    const segments = [paragraph('body one', 'Introduction'), paragraph('body two', 'Methods'),
      paragraph('ref one', 'References'), paragraph('ack', 'Acknowledgments')]
    const selection = selectScreeningFragments(segments, [condition('c1', 'absent')],
      { maximumFragments: 4, maximumCharacters: 100, leadCharacters: 0 })
    expect(selection.fragments.map(fragment => fragment.sectionTitle)).toStrictEqual(['Introduction', 'Methods'])
  })

  it('screens every segment when no heading names body text', () => {
    const segments = [paragraph('only refs here', 'References')]
    const selection = selectScreeningFragments(segments, [condition('c1', 'absent')],
      { maximumFragments: 1, maximumCharacters: 100, leadCharacters: 0 })
    expect(selection.fragments).toHaveLength(1)
  })

  it('adds the paper opening when every hit sits in one late segment', () => {
    const references = `${'x'.repeat(3000)} 2024 ${'y'.repeat(3000)}`
    const segments = [paragraph('Kernel design for AI workloads.', 'PDF page 1'),
      paragraph(references, 'PDF page 13')]
    const selection = selectScreeningFragments(segments, [condition('c1', '2024')], policy)
    expect(selection.fragments.map(fragment => fragment.segmentIndex)).toStrictEqual([1, 0])
    expect(selection.fragments[0]?.matchedTerms).toStrictEqual(['2024'])
    expect(selection.fragments[1]?.matchedTerms).toStrictEqual([])
  })

  it('defers hits from the segment the previous dispatch read', () => {
    const segments = [paragraph('Kernel design opening.', 'PDF page 1'),
      paragraph(`${'z'.repeat(2000)} 2024 ${'w'.repeat(2000)}`, 'PDF page 13'),
      paragraph('Body text about scheduling.', 'PDF page 2')]
    const first = selectScreeningFragments(segments, [condition('c1', '2024')], policy)
    expect(first.fragments.map(fragment => fragment.segmentIndex)).toStrictEqual([1, 0])
    const read = segments.map((segment, index) => ({ ...segment,
      text: first.fragments.filter(fragment => fragment.segmentIndex === index)
        .reduce((text, fragment) => `${text.slice(0, fragment.start)}${' '.repeat(fragment.end - fragment.start)}`
          + text.slice(fragment.end), segment.text) }))
    const second = selectScreeningFragments(read, [condition('c1', '2024')], policy,
      { avoidSegmentIndex: 1 })
    expect(second.fragments.map(fragment => fragment.segmentIndex)).toStrictEqual([0, 2])
  })

  it('ignores a reference list a page opens, so the paper opening leads', () => {
    const segments = [page('Kernel design for AI workloads.', 1),
      page(`body paragraph about scheduling ${'x'.repeat(400)}\nReferences\n[1] A. 2024.`, 13),
      page('[2] B. 2024.', 14)]
    const selection = selectScreeningFragments(segments, [condition('c1', '2024')], policy)
    expect(selection.fragments[0]?.segmentIndex).toBe(0)
    expect(selection.fragments.flatMap(fragment => fragment.matchedTerms)).toStrictEqual([])
    expect(selection.fragments.map(fragment => fragment.segmentIndex)).not.toContain(2)
    expect(selection.uncoveredConditionIds).toStrictEqual(['c1'])
  })
})
