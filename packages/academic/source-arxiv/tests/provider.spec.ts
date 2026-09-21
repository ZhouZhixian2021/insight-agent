import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AcademicSourceRuntime from '@deepseek-ai/dsh-academic-source'
import * as plugin from '../src/index.ts'
import { ArxivProvider, ARXIV_PROVIDER_ID } from '../src/index.ts'
import type { ArxivProviderOptions } from '../src/index.ts'

type FetchMock = (url: URL, init?: RequestInit) => Promise<Response>

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2406.12345v1</id>
    <title>Joint evaluation</title>
    <published>2024-06-15T12:34:56Z</published>
    <author><name>Alice Example</name></author>
  </entry>
</feed>`

function atomResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/atom+xml' }, ...init })
}

function requestedUrl(fetchMock: ReturnType<typeof vi.fn<FetchMock>>): URL {
  const input = fetchMock.mock.calls[0]?.[0]
  expect(input).toBeInstanceOf(URL)
  return input as URL
}

function provider(options: Partial<ArxivProviderOptions> = {}) {
  return new ArxivProvider(() => ({
    baseURL: 'https://export.arxiv.org',
    maxAttempts: 1,
    retryDelayMs: 0,
    ...options,
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ArxivProvider.search', () => {
  it('queries /api/query with search_query and max_results, and maps entries', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => atomResponse(FEED))
    vi.stubGlobal('fetch', fetchMock)

    const arxiv = provider()
    const result = await arxiv.search({ query: 'retrieval', maxResults: 3 })

    expect(result.truncated).toBe(false)
    expect(result.works).toHaveLength(1)
    expect(result.works[0]?.academicWork.title).toBe('Joint evaluation')

    const requested = requestedUrl(fetchMock)
    expect(requested.pathname).toBe('/api/query')
    expect(requested.searchParams.get('search_query')).toBe('all:retrieval')
    expect(requested.searchParams.get('max_results')).toBe('3')
    expect(arxiv.fullTextUrls('2406.12345v1')).toEqual([
      'https://arxiv.org/html/2406.12345v1',
      'https://arxiv.org/pdf/2406.12345v1',
    ])
  })

  it('reports upstream truncation when totalResults exceeds the returned entries', async () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <opensearch:totalResults>6</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2406.12345v1</id>
    <title>Joint evaluation</title>
    <published>2024-06-15T12:34:56Z</published>
    <author><name>Alice Example</name></author>
  </entry>
</feed>`
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => atomResponse(feed)))

    const result = await provider().search({ query: 'retrieval', maxResults: 5 })

    expect(result.truncated).toBe(true)
    expect(result.works).toHaveLength(1)
  })

  it('reports no truncation when totalResults matches the returned entries', async () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <opensearch:totalResults>1</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2406.12345v1</id>
    <title>Joint evaluation</title>
    <published>2024-06-15T12:34:56Z</published>
    <author><name>Alice Example</name></author>
  </entry>
</feed>`
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => atomResponse(feed)))

    const result = await provider().search({ query: 'retrieval', maxResults: 5 })

    expect(result.truncated).toBe(false)
    expect(result.works).toHaveLength(1)
  })

  it('throws ACADEMIC_SOURCE_PROVIDER_ERROR on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => atomResponse('error', { status: 503 })))
    const arxiv = provider()
    await expect(arxiv.search({ query: 'x' })).rejects.toThrow(
      expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_ERROR' }),
    )
  })

  it('throws ACADEMIC_SOURCE_PROVIDER_ERROR on unparseable XML', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => atomResponse('<not valid')))
    const arxiv = provider()
    await expect(arxiv.search({ query: 'x' })).rejects.toThrow(
      expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_ERROR' }),
    )
  })

  it('retries only network failures up to the configured attempt bound', async () => {
    const fetchMock = vi.fn<FetchMock>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(atomResponse(FEED))
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider({ maxAttempts: 2 }).search({ query: 'retrieval' })).resolves.toMatchObject({
      works: [{ academicWork: { title: 'Joint evaluation' } }],
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    fetchMock.mockReset().mockRejectedValue(new TypeError('still unavailable'))
    await expect(provider({ maxAttempts: 2 }).search({ query: 'retrieval' }))
      .rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_NETWORK_ERROR', message: 'arXiv search network request failed after 2 attempt(s)' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('ArxivProvider.available', () => {
  it('is true for a parseable endpoint and false otherwise', () => {
    expect(provider().available()).toBe(true)
    expect(provider({ baseURL: 'not a url' }).available()).toBe(false)
  })
})

describe('ArxivProvider registration', () => {
  it('registers with ctx.academicSource and is selected by the seam', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => atomResponse(FEED)))

    const ctx = new Context()
    await ctx.plugin(AcademicSourceRuntime)
    await ctx.plugin(plugin, { baseURL: 'https://export.arxiv.org' })

    await expect(ctx.academicSource.search({ query: 'retrieval' })).resolves.toMatchObject({
      works: [{ academicWork: { title: 'Joint evaluation' } }],
    })
  })

  it('exports a namespace plugin entry', () => {
    expect(plugin.name).toBe('academic-source-arxiv')
    expect(plugin.inject).toEqual(['academicSource'])
    expect(typeof plugin.apply).toBe('function')
    expect(ARXIV_PROVIDER_ID).toBe('arxiv')
    expect((plugin as Record<string, unknown>).default).toBeUndefined()
  })

  it('rejects invalid retry configuration before registration', () => {
    const ctx = new Context()
    expect(() => { plugin.apply(ctx, { maxAttempts: 0 }) }).toThrow(/maxAttempts/)
    expect(() => { plugin.apply(ctx, { retryDelayMs: -1 }) }).toThrow(/retryDelayMs/)
  })
})
