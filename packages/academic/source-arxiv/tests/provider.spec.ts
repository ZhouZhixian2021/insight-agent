import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AcademicSourceRuntime from '@deepseek-ai/dsh-academic-source'
import * as plugin from '../src/index.ts'
import { ArxivProvider, ARXIV_PROVIDER_ID } from '../src/index.ts'

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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ArxivProvider.search', () => {
  it('queries /api/query with search_query and max_results, and maps entries', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => atomResponse(FEED))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new ArxivProvider(() => ({ baseURL: 'https://export.arxiv.org' }))
    const result = await provider.search({ query: 'retrieval', maxResults: 3 })

    expect(result.truncated).toBe(false)
    expect(result.works).toHaveLength(1)
    expect(result.works[0]?.academicWork.title).toBe('Joint evaluation')

    const requested = requestedUrl(fetchMock)
    expect(requested.pathname).toBe('/api/query')
    expect(requested.searchParams.get('search_query')).toBe('all:retrieval')
    expect(requested.searchParams.get('max_results')).toBe('3')
  })

  it('throws ACADEMIC_SOURCE_PROVIDER_ERROR on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => atomResponse('error', { status: 503 })))
    const provider = new ArxivProvider(() => ({ baseURL: 'https://export.arxiv.org' }))
    await expect(provider.search({ query: 'x' })).rejects.toThrow(
      expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_ERROR' }),
    )
  })

  it('throws ACADEMIC_SOURCE_PROVIDER_ERROR on unparseable XML', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => atomResponse('<not valid')))
    const provider = new ArxivProvider(() => ({ baseURL: 'https://export.arxiv.org' }))
    await expect(provider.search({ query: 'x' })).rejects.toThrow(
      expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_ERROR' }),
    )
  })
})

describe('ArxivProvider.available', () => {
  it('is true for a parseable endpoint and false otherwise', () => {
    expect(new ArxivProvider(() => ({ baseURL: 'https://export.arxiv.org' })).available()).toBe(true)
    expect(new ArxivProvider(() => ({ baseURL: 'not a url' })).available()).toBe(false)
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
})
