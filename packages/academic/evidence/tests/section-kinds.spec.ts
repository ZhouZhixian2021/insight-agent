import { describe, expect, it } from 'vitest'
import { bodySegmentIndexes, bodyText, hasBodySegment, isBackMatterSection, isBackMatterSegment,
  referenceHeadingOffset, referenceStartPage, segmentSectionTitle, type EvidenceContentSegment } from '../src/index.ts'

function paragraph(text: string, sectionTitle: string): EvidenceContentSegment {
  return { text, locator: { kind: 'paragraph', sectionTitle, paragraphNumber: 1 } }
}

function page(text: string, pdfPage: number): EvidenceContentSegment {
  return { text, locator: { kind: 'page_section', sectionTitle: `PDF page ${pdfPage}`, pdfPage } }
}

function figure(text = 'figure text'): EvidenceContentSegment {
  return { text, locator: { kind: 'figure', figureNumber: '1' } }
}

describe('isBackMatterSection', () => {
  it.each(['References', '7 References', 'REFERENCES', 'Bibliography', 'Works Cited', 'Literature Cited',
    'Acknowledgments', 'Acknowledgement', 'Funding', 'Author Contributions', 'Conflict of Interest',
    'Data Availability', 'Appendix', 'A. Appendix', 'IV Appendix', 'Appendices', 'Supplementary Material',
    'Supplementary Information', 'Supporting Information', 'References and Notes', '参考文献', '引用文献',
    '致谢', '鸣谢', '附录', '补充材料', 'References:'])('recognizes %s', (heading) => {
    expect(isBackMatterSection(heading)).toBe(true)
  })

  it.each(['Introduction', 'Related Work', 'Background and Motivation', 'Appendix-Driven Design',
    'Methods', 'Empirical Evaluation', 'Conclusion', 'Notes', 'Broader Impact', 'PDF page 12'])(
    'keeps %s as body', (heading) => {
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

describe('hasBodySegment', () => {
  it('reports a parse that carries a body section', () => {
    expect(hasBodySegment([paragraph('intro', 'Introduction'), paragraph('refs', 'References')])).toBe(true)
  })

  it('rejects a parse of headings and references alone', () => {
    expect(hasBodySegment([paragraph('refs', 'References'), paragraph('thanks', 'Acknowledgments')])).toBe(false)
  })

  it('rejects an empty parse', () => {
    expect(hasBodySegment([])).toBe(false)
  })

  it('rejects a parse whose only page is a reference list', () => {
    expect(hasBodySegment([page('References\n[1] R. Smith. 2024.', 1)])).toBe(false)
  })
})

describe('referenceStartPage', () => {
  it('reports where a page opens its reference list', () => {
    expect(referenceHeadingOffset('body\nReferences\n[1] A. 2024')).toBe(5)
  })

  it('reports the first page that opens a reference list', () => {
    expect(referenceStartPage([page('body text', 12), page('body then\nReferences\n[1] A. 2024', 13),
      page('[1] A. 2024', 14)])).toBe(13)
  })

  it('reports nothing when no page lists cited works', () => {
    expect(referenceStartPage([page('body text', 1), page('more body', 2)])).toBeUndefined()
  })
})

describe('isBackMatterSegment', () => {
  it('drops the pages that follow the first reference page', () => {
    const segments = [page('body', 12), page('body then\nReferences\n[1] A. 2024', 13), page('[1] A. 2024', 14)]
    expect(segments.map((segment, index) =>
      isBackMatterSegment(segment, referenceStartPage(segments) ?? index))).toStrictEqual([false, false, true])
  })

  it('keeps an appendix page after the reference list', () => {
    expect(isBackMatterSegment(page('Appendix A\nDetails', 15), 13)).toBe(false)
  })

  it('keeps a page of a document that lists no cited works', () => {
    expect(isBackMatterSegment(page('body text', 15), undefined)).toBe(false)
  })
})

describe('bodyText', () => {
  it('blanks the reference list a page opens mid-page', () => {
    const text = 'results text\nReferences\n[1] A. 2024'
    const body = bodyText(page(text, 13))
    expect(body.trimEnd()).toBe('results text')
    expect(body).toHaveLength(text.length)
  })

  it('keeps the whole text of a page that lists no cited works', () => {
    expect(bodyText(page('results text', 13))).toBe('results text')
  })
})
