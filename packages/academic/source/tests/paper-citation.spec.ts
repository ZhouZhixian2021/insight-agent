import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAcademicPaperPage, parseAcademicPaperCitation } from '@deepseek-ai/dsh-academic-source'

afterEach(() => vi.unstubAllGlobals())

describe('official paper pages', () => {
  const url = new URL('https://proceedings.mlr.press/v238/example24a.html')

  it('returns the HTML of one successful response and treats 404 as a missing record', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('<meta name="citation_title" content="A Paper">'))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('with signal'))
    vi.stubGlobal('fetch', fetch)
    await expect(fetchAcademicPaperPage('pmlr', url)).resolves.toContain('A Paper')
    await expect(fetchAcademicPaperPage('pmlr', url)).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: 'error' }))
    await expect(fetchAcademicPaperPage('pmlr', url, new AbortController().signal)).resolves.toBe('with signal')
  })

  it.each([[429, 'ACADEMIC_SOURCE_RATE_LIMIT'], [503, 'ACADEMIC_SOURCE_PROVIDER_ERROR']] as const)(
    'classifies HTTP %i', async (status, code) => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })))
      await expect(fetchAcademicPaperPage('pmlr', url)).rejects.toMatchObject({ code })
    },
  )

  it('distinguishes network failure from cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(fetchAcademicPaperPage('pmlr', url)).rejects.toMatchObject({
      code: 'ACADEMIC_SOURCE_NETWORK_ERROR' })
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    }))
    await expect(fetchAcademicPaperPage('pmlr', url, controller.signal)).rejects.toMatchObject({
      code: 'ACADEMIC_SOURCE_ABORTED' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('aborted', 'AbortError') }))
    await expect(fetchAcademicPaperPage('pmlr', url)).rejects.toMatchObject({
      code: 'ACADEMIC_SOURCE_ABORTED' })
  })

  it('parses citation metadata and decodes HTML entities', () => {
    const html = `<meta NAME='citation_title' CONTENT='Forecasting &amp; Planning'>
<meta name=citation_author content="Alice Example">
<meta name="citation_author" content='Bob Researcher'>
<meta name=citation_publication_date content=2024/09/01>
<meta name=citation_conference_title content="Time Series Conference">
<meta name=citation_doi content="10.1000/example">
<meta name=citation_pdf_url content="https://example.org/paper.pdf">
<meta name=citation_abstract_html_url content="https://example.org/paper">`
    expect(parseAcademicPaperCitation(html)).toEqual({
      title: 'Forecasting & Planning', authors: ['Alice Example', 'Bob Researcher'],
      year: '2024', venue: 'Time Series Conference', doi: '10.1000/example',
      pdfUrl: 'https://example.org/paper.pdf', abstractUrl: 'https://example.org/paper',
    })
  })

  it('uses a journal or book venue when conference metadata is absent', () => {
    expect(parseAcademicPaperCitation('<meta name=citation_title content="A Paper">'
      + '<meta name=citation_author content="Alice">'
      + '<meta name=citation_journal_title content="Journal">'
      + '<meta name=citation_inbook_title content="Book">')).toMatchObject({ venue: 'Journal', year: null })
    expect(parseAcademicPaperCitation('<meta name=citation_title content="A Paper">'
      + '<meta name=citation_author content="Alice">'
      + '<meta name=citation_inbook_title content="Book">')).toMatchObject({ venue: 'Book', doi: null })
  })

  it('rejects a page without a title or authors', () => {
    expect(parseAcademicPaperCitation('<meta name=unrelated content=x><meta name=citation_title>'
      + '<meta name=citation_title content="A Paper"><meta name=citation_author content="Alice">'))
      .toMatchObject({ title: 'A Paper' })
    expect(() => parseAcademicPaperCitation('<meta name=citation_title content="A Paper">'))
      .toThrow(expect.objectContaining({ code: 'ACADEMIC_SOURCE_PARSE_ERROR' }))
    expect(() => parseAcademicPaperCitation('<meta name=citation_author content="Alice">'))
      .toThrow(expect.objectContaining({ code: 'ACADEMIC_SOURCE_PARSE_ERROR' }))
  })
})
