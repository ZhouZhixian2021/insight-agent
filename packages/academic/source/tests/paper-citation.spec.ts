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
      abstract: null, keywords: [],
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

  it('reads scholarly abstract tags and keywords without adopting a generic page description', () => {
    const base = '<meta name=citation_title content="A Paper"><meta name=citation_author content="Alice">'
    expect(parseAcademicPaperCitation(base + '<meta name=description content="Promotional snippet">'
      + '<meta name=keywords content="Generic site keywords">'))
      .toMatchObject({ abstract: null, keywords: [] })
    expect(parseAcademicPaperCitation(base + '<meta name=citation_abstract content="An empirical &amp; scholarly abstract.">'
      + '<meta name=citation_keywords content="retrieval; faithfulness, evaluation">'))
      .toMatchObject({ abstract: 'An empirical & scholarly abstract.', keywords: ['retrieval', 'faithfulness', 'evaluation'] })
    expect(parseAcademicPaperCitation(base + '<meta name="DC.Description" content="Scholarly summary">'))
      .toMatchObject({ abstract: 'Scholarly summary' })
  })

  it.each(['acl', 'pmlr', 'cvf'] as const)('reads only the %s official abstract block', (provider) => {
    const base = '<meta name=citation_title content="A Paper"><meta name=citation_author content="Alice">'
    const selector = provider === 'acl' ? 'class="card-body acl-abstract"' : 'id="abstract"'
    expect(parseAcademicPaperCitation(base + `<div ${selector}><h5>Abstract</h5>`
      + '<span>Scholarly <b>retrieval</b> &amp; evaluation.</span></div><p>Unrelated page text.</p>', provider))
      .toMatchObject({ abstract: 'Scholarly retrieval & evaluation.' })
    expect(parseAcademicPaperCitation(base + '<div id="unrelated">Website description.</div>', provider))
      .toMatchObject({ abstract: null })
    expect(parseAcademicPaperCitation(base + `<div ${selector}> </div>`, provider).abstract).toBeNull()
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
