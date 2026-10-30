import { describe, expect, it } from 'vitest'
import { bodySegmentIndexes, isBackMatterSection, segmentSectionTitle,
  type EvidenceContentSegment } from '../src/index.ts'

function paragraph(text: string, sectionTitle: string): EvidenceContentSegment {
  return { text, locator: { kind: 'paragraph', sectionTitle, paragraphNumber: 1 } }
}

function figure(text = 'figure text'): EvidenceContentSegment {
  return { text, locator: { kind: 'figure', figureNumber: '1' } }
}

describe('isBackMatterSection', () => {
  it.each(['References', '7 References', 'REFERENCES', 'Bibliography', 'Works Cited', 'Literature Cited',
    'Acknowledgments', 'Acknowledgement', 'Funding', 'Author Contributions', 'Conflict of Interest',
    'Data Availability', 'Appendix', 'A. Appendix', 'IV Appendix', 'Appendices', 'Supplementary Material',
    'Supplementary Information', 'Supporting Information', 'References and Notes', '参考文献', '引用文献',
    '致谢', '鸣谢', '附录', '补充材料', 'References:'])('recognizes %s', heading => {
    expect(isBackMatterSection(heading)).toBe(true)
  })

  it.each(['Introduction', 'Related Work', 'Background and Motivation', 'Appendix-Driven Design',
    'Methods', 'Empirical Evaluation', 'Conclusion', 'Notes', 'Broader Impact', 'PDF page 12'])(
  'keeps %s as body', heading => {
    expect(isBackMatterSection(heading)).toBe(false)
  })

  it('treats a missing heading as body', () => {
    expect(isBackMatterSection(null)).toBe(false)
  })
})

describe('segmentSectionTitle', () => {
  it('reads the heading a paragraph locator carries', () => {
    expect(segmentSectionTitle(paragraph('text', 'Methods'))).toBe('Methods')
  })

  it('reports no heading for a locator without one', () => {
    expect(segmentSectionTitle(figure())).toBeNull()
  })
})

describe('bodySegmentIndexes', () => {
  it('drops back matter and keeps original indexes', () => {
    const segments = [paragraph('intro', 'Introduction'), paragraph('refs', 'References'),
      paragraph('body', 'Methods'), paragraph('thanks', 'Acknowledgments')]
    expect(bodySegmentIndexes(segments)).toStrictEqual([0, 2])
  })

  it('keeps every segment when none carries a body heading', () => {
    const segments = [paragraph('refs', 'References'), paragraph('thanks', 'Acknowledgments')]
    expect(bodySegmentIndexes(segments)).toStrictEqual([0, 1])
  })

  it('keeps page and figure segments that carry no section heading', () => {
    expect(bodySegmentIndexes([figure()])).toStrictEqual([0])
  })
})
