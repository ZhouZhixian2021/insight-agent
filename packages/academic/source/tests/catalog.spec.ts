import { afterEach, describe, expect, it, vi } from 'vitest'
import { academicCatalogHtmlText, normalizeAcademicCatalogRecord, searchAcademicCatalogs } from '@deepseek-ai/dsh-academic-source'
import type { AcademicCatalogRecord } from '@deepseek-ai/dsh-academic-source'

afterEach(() => vi.unstubAllGlobals())

const first: AcademicCatalogRecord = {
  recordId: 'paper-1', title: 'Time Series Forecasting', authors: ['Alice'],
  year: '2024', venue: 'Conference', doi: 'https://doi.org/10.1000/EXAMPLE',
}
const second: AcademicCatalogRecord = {
  recordId: 'paper-2', title: 'Forecasting Models', authors: ['Bob'],
  year: null, venue: null, doi: null, searchText: 'time series',
}

describe('academic catalog search', () => {
  it('deduplicates records, filters query terms, and reports a result bound', async () => {
    const fetch = vi.fn(async (url: URL) => new Response(url.pathname))
    vi.stubGlobal('fetch', fetch)
    const result = await searchAcademicCatalogs({
      providerId: 'pmlr', catalogUrls: ['https://example.org/one', 'https://example.org/two'],
      parse: (_html, url) => url.pathname === '/one' ? [first] : [
        first, { ...second, recordId: 'unrelated', searchText: '' }, second,
      ],
    }, { query: 'time series', maxResults: 1 }, new AbortController().signal)
    expect(result.works.map(work => work.workVersion.sourceRecords[0]?.recordId)).toEqual(['paper-1'])
    expect(result.truncated).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([[503, 'ACADEMIC_SOURCE_PROVIDER_ERROR']] as const)(
    'reports catalog HTTP %i as %s', async (status, code) => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })))
      await expect(searchAcademicCatalogs({ providerId: 'pmlr',
        catalogUrls: ['https://example.org/catalog'], parse: () => [] }, { query: 'paper' }))
        .rejects.toMatchObject({ code })
    },
  )

  it('classifies catalog network errors and cancellation', async () => {
    const options = { providerId: 'pmlr', catalogUrls: ['https://example.org/catalog'], parse: () => [] }
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(searchAcademicCatalogs(options, { query: 'paper' })).rejects.toMatchObject({
      code: 'ACADEMIC_SOURCE_PROVIDER_ERROR' })
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async () => {
      controller.abort()
      throw new DOMException('cancelled', 'AbortError')
    }))
    await expect(searchAcademicCatalogs(options, { query: 'paper' }, controller.signal))
      .rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_ABORTED' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('cancelled', 'AbortError') }))
    await expect(searchAcademicCatalogs(options, { query: 'paper' }))
      .rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_ABORTED' })
  })

  it('keeps unknown year and venue separate from a published source record', () => {
    const work = normalizeAcademicCatalogRecord('pmlr', { ...second, year: 'unknown' })
    expect(work.academicWork.firstPublicDate.status).toBe('unknown')
    expect(work.academicWork.venue.status).toBe('unknown')
    expect(work.academicWork.externalIdentifiers).toEqual([
      expect.objectContaining({ kind: 'provider_record', originalValue: 'paper-2' }),
    ])
    expect(normalizeAcademicCatalogRecord('pmlr', first).academicWork.externalIdentifiers)
      .toContainEqual(expect.objectContaining({ kind: 'doi', normalizedValue: '10.1000/example' }))
  })

  it('decodes valid numeric entities and leaves out-of-range entities intact', () => {
    expect(academicCatalogHtmlText('A&#65; &#1114112; &#999999999999999999999;'))
      .toBe('AA &#1114112; &#999999999999999999999;')
  })
})
