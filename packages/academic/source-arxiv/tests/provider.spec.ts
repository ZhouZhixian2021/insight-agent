import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AcademicSourceRuntime, { AcademicSourceError } from '@deepseek-ai/dsh-academic-source'
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

  it('classifies failures while reading API error and successful feed bodies', async () => {
    const unreadableError = atomResponse('', { status: 503 })
    vi.spyOn(unreadableError, 'text').mockRejectedValue(new TypeError('read failed'))
    const unreadableFeed = atomResponse(FEED)
    vi.spyOn(unreadableFeed, 'text').mockRejectedValue(new TypeError('read failed'))
    const classifiedFeed = atomResponse(FEED)
    vi.spyOn(classifiedFeed, 'text').mockRejectedValue(new AcademicSourceError(
      'invalid official feed', 'ACADEMIC_SOURCE_PARSE_ERROR'))
    const abortedError = atomResponse('', { status: 503 })
    vi.spyOn(abortedError, 'text').mockRejectedValue(new DOMException('aborted', 'AbortError'))
    const abortedFeed = atomResponse(FEED)
    vi.spyOn(abortedFeed, 'text').mockRejectedValue(new DOMException('aborted', 'AbortError'))
    const fetch = vi.fn<FetchMock>()
      .mockResolvedValueOnce(atomResponse('', { status: 503 }))
      .mockResolvedValueOnce(unreadableError)
      .mockResolvedValueOnce(unreadableFeed)
      .mockResolvedValueOnce(classifiedFeed)
      .mockResolvedValueOnce(abortedError)
      .mockResolvedValueOnce(abortedFeed)
    vi.stubGlobal('fetch', fetch)
    const arxiv = provider()
    for (const code of ['ACADEMIC_SOURCE_PROVIDER_ERROR', 'ACADEMIC_SOURCE_PROVIDER_ERROR',
      'ACADEMIC_SOURCE_PROVIDER_ERROR', 'ACADEMIC_SOURCE_PARSE_ERROR',
      'ACADEMIC_SOURCE_ABORTED', 'ACADEMIC_SOURCE_ABORTED']) {
      await expect(arxiv.search({ query: 'retrieval' })).rejects.toMatchObject({ code })
    }
    expect(fetch).toHaveBeenCalledTimes(6)
  })

  it('passes a caller signal through retry and stops during a retry wait', async () => {
    const controller = new AbortController()
    const fetch = vi.fn<FetchMock>()
      .mockRejectedValueOnce(new TypeError('temporary'))
      .mockResolvedValueOnce(atomResponse(FEED))
    vi.stubGlobal('fetch', fetch)
    await expect(provider({ maxAttempts: 2 }).search({ query: 'retrieval' }, controller.signal))
      .resolves.toMatchObject({ works: [{ academicWork: { title: 'Joint evaluation' } }] })
    fetch.mockReset().mockImplementationOnce(async () => {
      setImmediate(() => { controller.abort('stop retry') })
      throw new TypeError('temporary')
    })
    await expect(provider({ maxAttempts: 2, retryDelayMs: 60_000 }).search({ query: 'retrieval' }, controller.signal))
      .rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_ABORTED' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects a pre-aborted request and an AbortError before any HTTP response', async () => {
    const controller = new AbortController()
    controller.abort('cancelled')
    const fetch = vi.fn<FetchMock>()
    vi.stubGlobal('fetch', fetch)
    await expect(provider().search({ query: 'retrieval' }, controller.signal))
      .rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_ABORTED' })
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockRejectedValue(new DOMException('aborted', 'AbortError'))
    await expect(provider().search({ query: 'retrieval' }))
      .rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_ABORTED' })
  })
})

describe('ArxivProvider.verifyReference', () => {
  it('queries only the requested ID and retains its explicit version', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => atomResponse(FEED))
    vi.stubGlobal('fetch', fetchMock)
    const result = await provider().verifyReference({ kind: 'arxiv', normalizedValue: '2406.12345v1',
      originalValue: '2406.12345v1', discoveryUrl: 'https://arxiv.org/abs/2406.12345v1' })
    expect(requestedUrl(fetchMock).searchParams.get('id_list')).toBe('2406.12345v1')
    expect(requestedUrl(fetchMock).searchParams.has('search_query')).toBe(false)
    expect(result?.workVersion).toMatchObject({ versionLabel: { value: 'v1' },
      sourceRecords: [{ provider: 'arxiv', recordId: '2406.12345v1' }] })
  })

  it('rejects a different version and a missing record', async () => {
    const reference = { kind: 'arxiv' as const, normalizedValue: '2406.12345v2',
      originalValue: '2406.12345v2', discoveryUrl: 'https://arxiv.org/abs/2406.12345v2' }
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => atomResponse(FEED)))
    await expect(provider().verifyReference(reference)).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => atomResponse('<feed xmlns="http://www.w3.org/2005/Atom"></feed>')))
    await expect(provider().verifyReference(reference)).resolves.toBeNull()
  })

  it('accepts the returned latest version when no version was requested', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => atomResponse(FEED)))
    await expect(provider().verifyReference({ kind: 'arxiv', normalizedValue: '2406.12345',
      originalValue: '2406.12345', discoveryUrl: 'https://arxiv.org/abs/2406.12345' }))
      .resolves.toMatchObject({ workVersion: { sourceRecords: [{ recordId: '2406.12345v1' }] } })
  })

  it('rejects malformed references before requesting arXiv', async () => {
    const fetch = vi.fn<FetchMock>()
    vi.stubGlobal('fetch', fetch)
    await expect(provider().verifyReference({ kind: 'arxiv', normalizedValue: 'invalid',
      originalValue: 'invalid', discoveryUrl: 'https://arxiv.org/abs/invalid' }))
      .rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_INVALID_REQUEST' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([[429, 'ACADEMIC_SOURCE_RATE_LIMIT'], [503, 'ACADEMIC_SOURCE_PROVIDER_ERROR']] as const)(
    'classifies paper request HTTP %i', async (status, code) => {
      vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => atomResponse('', { status })))
      await expect(provider().verifyReference({ kind: 'arxiv', normalizedValue: '2406.12345v1',
        originalValue: '2406.12345v1', discoveryUrl: 'https://arxiv.org/abs/2406.12345v1' }))
        .rejects.toMatchObject({ code })
    },
  )

  it('rejects multiple returned records and malformed feed content', async () => {
    const duplicate = FEED.replace('</feed>', `<entry>
<id>http://arxiv.org/abs/2406.12346v1</id><title>Another paper</title>
<published>2024-06-15T12:34:56Z</published><author><name>Bob Example</name></author>
</entry></feed>`)
    const fetch = vi.fn<FetchMock>()
      .mockResolvedValueOnce(atomResponse(duplicate))
      .mockResolvedValueOnce(atomResponse('<not valid'))
    vi.stubGlobal('fetch', fetch)
    const reference = { kind: 'arxiv' as const, normalizedValue: '2406.12345v1',
      originalValue: '2406.12345v1', discoveryUrl: 'https://arxiv.org/abs/2406.12345v1' }
    await expect(provider().verifyReference(reference)).rejects.toMatchObject({
      code: 'ACADEMIC_SOURCE_PARSE_ERROR' })
    await expect(provider().verifyReference(reference)).rejects.toMatchObject({
      code: 'ACADEMIC_SOURCE_PARSE_ERROR' })
  })

  it('propagates cancellation while reading the paper response', async () => {
    const controller = new AbortController()
    const response = atomResponse(FEED)
    vi.spyOn(response, 'text').mockImplementation(async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })
    const fetch = vi.fn<FetchMock>(async () => response)
    vi.stubGlobal('fetch', fetch)
    await expect(provider().verifyReference({ kind: 'arxiv', normalizedValue: '2406.12345v1',
      originalValue: '2406.12345v1', discoveryUrl: 'https://arxiv.org/abs/2406.12345v1' }, controller.signal))
      .rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_ABORTED' })
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
