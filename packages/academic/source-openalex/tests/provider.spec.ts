import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AcademicSourceRuntime from '@deepseek-ai/dsh-academic-source'
import { createIngestIndex, ingestWorks } from '@deepseek-ai/dsh-academic-ingestion'
import { normalizeArxivWork } from '@deepseek-ai/dsh-academic-source-arxiv'
import * as plugin from '../src/index.ts'
import { OpenAlexProvider } from '../src/provider.ts'
import type { OpenAlexOptions } from '../src/provider.ts'
import { normalizeOpenAlexWork } from '../src/normalize.ts'

const options: OpenAlexOptions = { baseURL: 'https://api.openalex.org', apiKey: undefined,
  searchMode: 'keyword', publicationYears: '2017-2020', timeoutMs: 1000, maxResults: 5, maxCachedRecords: 10 }

function bert() {
  return { id: 'https://openalex.org/W2963341956', title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
    doi: 'https://doi.org/10.18653/v1/n19-1423', publication_date: '2019-06-01', type: 'conference-paper', is_retracted: false,
    authorships: ['Jacob Devlin', 'Ming-Wei Chang', 'Kenton Lee', 'Kristina Toutanova'].map(display_name => ({ author: { display_name } })),
    primary_location: { version: 'publishedVersion', raw_source_name: 'NAACL 2019' },
    locations: [{ version: 'publishedVersion', pdf_url: null, landing_page_url: 'https://doi.org/10.18653/v1/n19-1423' }] }
}

function response(results: unknown[] = [bert()], count = results.length) {
  return new Response(JSON.stringify({ meta: { count }, results }), { headers: { 'content-type': 'application/json' } })
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('OpenAlex discovery', () => {
  it('sends exactly one unchanged query, caps upstream results, reports truncation, and resolves an ACL DOI', async () => {
    const fetch = vi.fn().mockResolvedValue(response([bert()], 120))
    vi.stubGlobal('fetch', fetch)
    const provider = new OpenAlexProvider({ ...options, apiKey: 'test-key' })
    const query = 'BERT bidirectional Transformer pre-training contextual representations'
    const result = await provider.search({ query, maxResults: 1 })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as [URL, RequestInit]
    expect(url.searchParams.get('search')).toBe(query)
    expect(url.searchParams.get('filter')).toBe('publication_year:2017-2020')
    expect(url.searchParams.get('per_page')).toBe('1')
    expect(url.href).not.toContain('test-key')
    expect(init.headers).toMatchObject({ authorization: 'Bearer test-key' })
    expect(result.truncated).toBe(true)
    expect(result.works[0]?.academicWork).toMatchObject({ title: bert().title, authors: ['Jacob Devlin', 'Ming-Wei Chang', 'Kenton Lee', 'Kristina Toutanova'],
      firstPublicDate: { status: 'unknown' }, venue: { value: 'NAACL 2019' } })
    expect(result.works[0]?.workVersion).toMatchObject({ versionType: 'version_of_record',
      releaseDate: { value: { iso: '2019-06-01', precision: 'day' } } })
    expect(provider.fullTextUrls(bert().id)).toEqual(['https://aclanthology.org/N19-1423.pdf'])
    expect(provider.fullTextUrls('missing')).toEqual([])
  })

  it('uses a single semantic request when explicitly configured, without a keyword fallback', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 504 }))
    vi.stubGlobal('fetch', fetch)
    await expect(new OpenAlexProvider({ ...options, searchMode: 'semantic' }).search({ query: 'long dependencies' }))
      .rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_PROVIDER_ERROR' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((fetch.mock.calls[0]?.[0] as URL).searchParams.get('search.semantic')).toBe('long dependencies')
  })

  it('distinguishes rate limits, malformed responses and network failures without exposing credentials', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('secret', { status: 429 }))
      .mockResolvedValueOnce(new Response('{bad'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] })))
      .mockRejectedValueOnce(new Error('secret upstream key'))
    vi.stubGlobal('fetch', fetch)
    const provider = new OpenAlexProvider(options)
    for (const code of ['ACADEMIC_SOURCE_RATE_LIMIT', 'ACADEMIC_SOURCE_PARSE_ERROR', 'ACADEMIC_SOURCE_PARSE_ERROR', 'ACADEMIC_SOURCE_NETWORK_ERROR']) {
      const error: unknown = await provider.search({ query: 'test' }).catch((error: unknown) => error)
      expect(error).toMatchObject({ code })
      expect((error as Error).message).not.toContain('secret')
    }
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('aborts the underlying fetch on timeout and distinguishes caller cancellation', async () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn((_url: URL, init: RequestInit) => new Promise((_resolve, reject) => {
      const signal = init.signal as AbortSignal
      signals.push(signal)
      signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
    })))
    await expect(new OpenAlexProvider({ ...options, timeoutMs: 10 }).search({ query: 'test' }))
      .rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_TIMEOUT' })
    expect(signals[0]?.aborted).toBe(true)
    const controller = new AbortController()
    const pending = new OpenAlexProvider(options).search({ query: 'test' }, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_ABORTED' })
    expect(signals[1]?.aborted).toBe(true)
  })

  it('rejects multiline and invalid requests instead of planning queries', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const provider = new OpenAlexProvider(options)
    for (const query of ['', 'one\ntwo']) {
      await expect(provider.search({ query })).rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_INVALID_REQUEST' })
    }
    await expect(provider.search({ query: 'test', maxResults: 0 })).rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_INVALID_REQUEST' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('bounds the full-text cache and does not publish malformed records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response([bert()]))
      .mockResolvedValueOnce(response([{ ...bert(), id: 'https://openalex.org/W2' }]))
      .mockResolvedValueOnce(response([{ ...bert(), id: 'bad' }])))
    const provider = new OpenAlexProvider({ ...options, maxCachedRecords: 1 })
    await provider.search({ query: 'first' })
    await provider.search({ query: 'second' })
    expect(provider.fullTextUrls(bert().id)).toEqual([])
    expect(provider.fullTextUrls('https://openalex.org/W2')).toHaveLength(1)
    await expect(provider.search({ query: 'bad' })).rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_PARSE_ERROR' })
  })
})

describe('OpenAlex metadata and versions', () => {
  it('links published and preprint records to recover first release without mixing version URLs', () => {
    const published = normalizeOpenAlexWork({ ...bert(), locations: [
      { version: 'submittedVersion', landing_page_url: 'https://arxiv.org/abs/1810.04805v2' },
    ] })
    const preprint = normalizeArxivWork({ id: 'http://arxiv.org/abs/1810.04805v2', title: bert().title,
      authors: ['Jacob Devlin', 'Ming-Wei Chang', 'Kenton Lee', 'Kristina Toutanova'],
      published: '2018-10-11T00:00:00Z', updated: '2019-05-24T00:00:00Z', doi: null })
    const merged = ingestWorks(createIngestIndex(), [published.work, preprint])
    expect(merged.works).toHaveLength(1)
    expect(merged.versions).toHaveLength(2)
    expect(merged.works[0]?.firstPublicDate).toMatchObject({ value: { iso: '2018-10-11' } })
    expect(published.work.workVersion.externalIdentifiers.some(id => id.kind === 'arxiv')).toBe(false)
    expect(published.urls).toEqual(['https://aclanthology.org/N19-1423.pdf'])
    expect(published.work.workVersion.versionLabel.status).toBe('unknown')
  })

  it('does not report repository hosting as a conference and can retain a published location venue', () => {
    const raw = { ...bert(), type: 'preprint', doi: null,
      primary_location: { version: 'submittedVersion', source: { type: 'repository', display_name: 'arXiv' } }, locations: [] }
    expect(normalizeOpenAlexWork(raw).work.academicWork.venue.status).toBe('unknown')
    expect(normalizeOpenAlexWork({ ...raw, locations: [
      { version: 'publishedVersion', raw_source_name: 'NAACL 2019' },
    ] }).work.academicWork.venue).toMatchObject({ value: 'NAACL 2019' })
  })

  it('does not download a preprint as the published version', () => {
    const raw = { ...bert(), doi: 'https://doi.org/10.1109/example', locations: [
      { version: 'submittedVersion', pdf_url: 'https://arxiv.org/pdf/1706.03762' },
      { version: 'publishedVersion', pdf_url: 'javascript:bad' },
    ] }
    expect(normalizeOpenAlexWork(raw).urls).toEqual([])
  })

  it('retains preprint identifiers and dates and supports existing ingestion dedup keys', () => {
    const result = normalizeOpenAlexWork({ ...bert(), type: 'preprint', doi: 'https://doi.org/10.48550/arXiv.1706.03762',
      publication_date: '2017-06-12', primary_location: { version: 'submittedVersion' }, locations: [] })
    expect(result.work.academicWork.externalIdentifiers).toContainEqual(expect.objectContaining({ kind: 'arxiv', normalizedValue: '1706.03762' }))
    expect(result.work.academicWork.firstPublicDate).toMatchObject({ status: 'unknown' })
    expect(result.work.workVersion.releaseDate).toMatchObject({ value: { iso: '2017-06-12' } })
    expect(result.work.workVersion.versionType).toBe('preprint')
    expect(result.urls).toEqual(['https://arxiv.org/html/1706.03762', 'https://arxiv.org/pdf/1706.03762'])
  })

  it('canonicalizes legacy ACL links and derives official CVF and PMLR candidates', () => {
    const result = normalizeOpenAlexWork({ ...bert(), doi: null, locations: [
      { version: 'publishedVersion', pdf_url: 'http://www.aclweb.org/anthology/N19-1423.pdf' },
      { version: 'publishedVersion', landing_page_url: 'https://proceedings.mlr.press/v139/nichol21a.html' },
      { version: 'publishedVersion', landing_page_url: 'https://openaccess.thecvf.com/content/CVPR2022/html/Test.html' },
    ] })
    expect(result.urls).toEqual(['https://aclanthology.org/N19-1423.pdf',
      'https://proceedings.mlr.press/v139/nichol21a/nichol21a.pdf',
      'https://openaccess.thecvf.com/content/CVPR2022/papers/Test.pdf'])
  })

  it('rejects invalid dates and missing authors and preserves retractions', () => {
    expect(() => normalizeOpenAlexWork({ ...bert(), publication_date: '2020-02-31' })).toThrow()
    expect(() => normalizeOpenAlexWork({ ...bert(), authorships: [{}] })).toThrow()
    expect(normalizeOpenAlexWork({ ...bert(), is_retracted: true }).work.workVersion.status).toBe('retracted')
  })

  it('does not turn a merged later accepted-version date into the original preprint release', () => {
    const result = normalizeOpenAlexWork({ ...bert(), type: 'preprint', publication_date: '2025-08-23',
      primary_location: { version: 'acceptedVersion' }, locations: [
        { version: 'submittedVersion', pdf_url: 'https://arxiv.org/pdf/1706.03762' },
      ] })
    expect(result.work.academicWork.firstPublicDate.status).toBe('unknown')
    expect(result.work.workVersion.versionType).toBe('accepted_manuscript')
    expect(result.urls).toEqual([])
  })
})

it('registers and disposes the plugin and rejects configuration errors before fetching', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(AcademicSourceRuntime)
    const fiber = await ctx.plugin(plugin, {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([], 0)))
    expect((await ctx.academicSource.searchAll({ query: 'test' })).providers).toEqual(['openalex'])
    await fiber.dispose()
    await expect(ctx.academicSource.searchAll({ query: 'test' })).rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE' })
    for (const config of [{ baseURL: 'http://example.org' }, { timeoutMs: 0 }, { publicationYears: '2020-2017' }, { maxCachedRecords: 1 }]) {
      expect(() => { plugin.apply(ctx, config) }).toThrow()
    }
  } finally { await ctx.fiber.dispose() }
})
