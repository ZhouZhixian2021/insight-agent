import { describe, expect, it, vi } from 'vitest'
import { BrowserAcademicProvider } from '../src/provider.ts'
import type { BrowserAcademicExecutor, BrowserAcademicOptions } from '../src/types.ts'

const options: BrowserAcademicOptions = {
  sites: [{ url: 'https://papers.example/search', scope: 'Configured test volume only.', inputSelector: '#query',
    mode: 'submit', readySelector: '#results', resultSelector: 'a.paper', paperUrlPattern: '^https://papers\\.example/paper/',
    pdfOrigins: ['https://files.example'] }],
  maximumResults: 6, maximumCachedRecords: 10, operationTimeoutMs: 1000, maximumMetadataCharacters: 2000,
  maximumPdfBytes: 1000, otherFetchProvider: 'http',
}
const paper = (id = '1') => ({ url: `https://papers.example/paper/${id}`, html:
  `<meta name="citation_title" content="Paper ${id}"><meta name="citation_author" content="A. Author">`
  + '<meta name="citation_publication_date" content="2025"><meta name="citation_doi" content="10.1000/test">'
  + `<meta name="citation_pdf_url" content="https://files.example/observed-${id}.pdf">` })
const result = (papers = [paper()], truncated = false) => ({ papers, truncated })

describe('browser academic provider', () => {
  it('normalizes page-published citation metadata and resolves only the observed PDF link', async () => {
    const execute = vi.fn<BrowserAcademicExecutor>().mockResolvedValue(result())
    const provider = new BrowserAcademicProvider(options, execute, () => true)
    const found = await provider.search({ query: 'a "literal" query' })
    expect(found.works[0]?.academicWork).toMatchObject({ title: 'Paper 1', authors: ['A. Author'] })
    expect(found.works[0]?.workVersion.sourceRecords).toEqual([{ provider: 'browser', recordId: paper().url }])
    expect(provider.fullTextUrls(paper().url)).toEqual(['https://files.example/observed-1.pdf'])
    expect(provider.fullTextUrls('unobserved')).toEqual([])
    expect(execute.mock.calls[0]?.[0]).toContain(JSON.stringify('a "literal" query'))
    await provider.dispose()
    expect(provider.available()).toBe(false)
    expect(provider.fullTextUrls(paper().url)).toEqual([])
  })

  it('keeps configured scopes and shares the aggregate bound across sites', async () => {
    const execute = vi.fn<BrowserAcademicExecutor>().mockResolvedValueOnce(result([paper('1'), paper('2')]))
      .mockResolvedValueOnce(result([paper('3'), paper('4')], true))
    const provider = new BrowserAcademicProvider({ ...options, sites: [...options.sites, ...options.sites] }, execute, () => true)
    const found = await provider.search({ query: 'paper', maxResults: 2 })
    expect(found.works.map(work => work.academicWork.title)).toEqual(['Paper 1', 'Paper 3'])
    expect(found.truncated).toBe(true)
    expect(provider.limitations).toContain('Configured test volume only.')
    await provider.dispose()
  })

  it.each([
    { papers: [{ ...paper(), url: 'https://attacker.example/paper/1' }], truncated: false },
    result([{ ...paper(), html: paper().html.replace('https://files.example', 'https://attacker.example') }]),
    result([{ ...paper(), html: '<title>Not a scholarly paper</title>' }]),
    { papers: 'not an array', truncated: false },
  ])('rejects invalid browser data without caching untrusted PDF links', async (payload) => {
    const provider = new BrowserAcademicProvider(options, async () => payload, () => true)
    await expect(provider.search({ query: 'paper' })).rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_PARSE_ERROR' })
    expect(provider.fullTextUrls(paper().url)).toEqual([])
    await provider.dispose()
  })

  it('rejects invalid bounds before opening a page and preserves explicit empty results', async () => {
    const execute = vi.fn<BrowserAcademicExecutor>().mockResolvedValue(result([]))
    const provider = new BrowserAcademicProvider(options, execute, () => true)
    await expect(provider.search({ query: ' ' })).rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_INVALID_REQUEST' })
    await expect(provider.search({ query: 'paper', maxResults: 0 })).rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_INVALID_REQUEST' })
    expect(execute).not.toHaveBeenCalled()
    await expect(provider.search({ query: 'unmatched' })).resolves.toEqual({ works: [], truncated: false })
    await provider.dispose()
  })

  it('fails without evicting a prior paper when its configured cache is full', async () => {
    const execute = vi.fn<BrowserAcademicExecutor>().mockResolvedValueOnce(result()).mockResolvedValueOnce(result([paper('2')]))
    const provider = new BrowserAcademicProvider({ ...options, maximumCachedRecords: 1 }, execute, () => true)
    await provider.search({ query: 'paper' })
    await expect(provider.search({ query: 'paper' })).rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_PROVIDER_ERROR' })
    expect(provider.fullTextUrls(paper().url)).toHaveLength(1)
    expect(provider.fullTextUrls(paper('2').url)).toEqual([])
    await provider.dispose()
  })

  it('aborts and drains an active browser operation on unload', async () => {
    const entered = Promise.withResolvers<undefined>()
    const provider = new BrowserAcademicProvider(options, async (_code, signal) => {
      entered.resolve(undefined)
      return await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => { reject(new Error('Provider stopped')) }, { once: true })
      })
    }, () => true)
    const running = provider.search({ query: 'paper' })
    const rejected = expect(running).rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_ABORTED' })
    await entered.promise
    await provider.dispose()
    await rejected
  })
})
