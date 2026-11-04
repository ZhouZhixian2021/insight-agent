import { expect, it, vi } from 'vitest'
import { normalizeAcademicCatalogRecord, type AcademicSourceProvider } from '@deepseek-ai/dsh-academic-source'
import { academicBrowserWebSearch } from '../src/web-search.ts'

it('returns observed paper pages and abstracts through Web search and preserves failures', async () => {
  const work = normalizeAcademicCatalogRecord('browser', { recordId: 'https://papers.example/observed',
    title: 'Observed paper', authors: ['Author'], year: '2026', venue: null, doi: null,
    abstract: 'Published abstract.' })
  const search = vi.fn<AcademicSourceProvider['search']>().mockResolvedValue({ works: [work], truncated: true })
  const source: AcademicSourceProvider = { id: 'browser', available: () => true, search,
    fullTextUrls: () => [], limitations: ['Configured conference only.'] }
  const web = academicBrowserWebSearch(source)
  const signal = new AbortController().signal
  expect(await web.search({ query: 'literal query', maxResults: 1 }, signal)).toEqual({
    content: '浏览器学术站内搜索。\nConfigured conference only.',
    sources: [{ url: 'https://papers.example/observed', title: 'Observed paper', snippet: 'Published abstract.' }], truncated: true,
  })
  expect(search).toHaveBeenCalledWith({ query: 'literal query', maxResults: 1 }, signal)
  expect(web.available()).toBe(true)
  const failure = new Error('Website unavailable')
  search.mockRejectedValueOnce(failure)
  await expect(web.search({ query: 'query' })).rejects.toBe(failure)
})
