import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AcademicSourceError } from '@deepseek-ai/dsh-academic-source'
import AcademicSourceRuntime from '@deepseek-ai/dsh-academic-source'
import * as plugin from '../src/index.ts'
import {
  OpenAlexProvider,
  OPENALEX_PROVIDER_ID,
  type OpenAlexProviderOptions,
} from '../src/index.ts'
import type { OpenAlexRawWork } from '../src/index.ts'

type FetchMock = (url: URL, init?: RequestInit) => Promise<Response>

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

const articleRecord: OpenAlexRawWork = {
  id: 'https://openalex.org/W2111111111',
  doi: 'https://doi.org/10.0000/Example.RAG.2025.001',
  display_name: 'Joint evaluation of retrieval and generation',
  authorships: [{ author: { display_name: 'Example Author A' } }],
  publication_year: 2025,
  publication_date: '2025-02-10',
  type: 'article',
  is_retracted: false,
  primary_location: { source: { display_name: 'Example Conference' } },
}

const searchOptions = (overrides: Partial<OpenAlexProviderOptions> = {}): OpenAlexProviderOptions => ({
  baseURL: 'https://api.openalex.org',
  mailto: 'team@example.com',
  ...overrides,
})

/** The URL a stubbed `fetch` was first called with. */
function requestedUrl(fetchMock: ReturnType<typeof vi.fn<FetchMock>>): URL {
  const input = fetchMock.mock.calls[0]?.[0]
  expect(input).toBeInstanceOf(URL)
  return input as URL
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OpenAlexProvider.search', () => {
  it('queries /works with search, per-page, and mailto, and maps results through normalization', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => jsonResponse({ results: [articleRecord] }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAlexProvider(() => searchOptions())
    const result = await provider.search({ query: 'retrieval evaluation', maxResults: 5 })

    expect(result.truncated).toBe(false)
    expect(result.works).toHaveLength(1)
    expect(result.works[0]?.academicWork.title).toBe('Joint evaluation of retrieval and generation')
    expect(result.works[0]?.academicWork.externalIdentifiers).toEqual([
      expect.objectContaining({ kind: 'openalex', normalizedValue: 'W2111111111' }),
      expect.objectContaining({ kind: 'doi', normalizedValue: '10.0000/example.rag.2025.001' }),
    ])

    const requested = requestedUrl(fetchMock)
    expect(requested.pathname).toBe('/works')
    expect(requested.searchParams.get('search')).toBe('retrieval evaluation')
    expect(requested.searchParams.get('per-page')).toBe('5')
    expect(requested.searchParams.get('mailto')).toBe('team@example.com')
    expect(requested.searchParams.get('api_key')).toBeNull()
  })

  it('omits per-page and mailto when unset and adds api_key when configured', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => jsonResponse({ results: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAlexProvider(() => ({ baseURL: 'https://api.openalex.org', apiKey: 'premium-key' }))
    await provider.search({ query: 'x' })

    const requested = requestedUrl(fetchMock)
    expect(requested.searchParams.get('per-page')).toBeNull()
    expect(requested.searchParams.get('mailto')).toBeNull()
    expect(requested.searchParams.get('api_key')).toBe('premium-key')
  })

  it('clamps per-page to the upstream maximum', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => jsonResponse({ results: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAlexProvider(() => searchOptions())
    await provider.search({ query: 'x', maxResults: 500 })

    expect(requestedUrl(fetchMock).searchParams.get('per-page')).toBe('200')
  })

  it('returns an empty works list when the response carries no results', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => jsonResponse({})))
    const provider = new OpenAlexProvider(() => searchOptions())
    await expect(provider.search({ query: 'x' })).resolves.toEqual({ works: [], truncated: false })
  })
})

describe('OpenAlexProvider.search failures', () => {
  it('throws ACADEMIC_SOURCE_PROVIDER_ERROR on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => jsonResponse({ error: 'boom' }, { status: 429 })))
    const provider = new OpenAlexProvider(() => searchOptions())
    await expect(provider.search({ query: 'x' })).rejects.toThrow(
      expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_ERROR' }),
    )
  })

  it('throws ACADEMIC_SOURCE_PROVIDER_ERROR when the response body is unprocessable', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => new Response('not json', { status: 200 })))
    const provider = new OpenAlexProvider(() => searchOptions())
    await expect(provider.search({ query: 'x' })).rejects.toThrow(
      expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_ERROR' }),
    )
  })

  it('throws ACADEMIC_SOURCE_ABORTED when already aborted before dispatch', async () => {
    const fetchMock = vi.fn<FetchMock>()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort()
    const provider = new OpenAlexProvider(() => searchOptions())
    await expect(provider.search({ query: 'x' }, controller.signal)).rejects.toThrow(
      expect.objectContaining({ code: 'ACADEMIC_SOURCE_ABORTED' }),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('OpenAlexProvider.available', () => {
  it('is true for a parseable endpoint and false otherwise', () => {
    const usable = new OpenAlexProvider(() => searchOptions())
    expect(usable.available()).toBe(true)

    const broken = new OpenAlexProvider(() => ({ baseURL: 'not a url' }))
    expect(broken.available()).toBe(false)
  })
})

describe('OpenAlexProvider registration', () => {
  it('registers with ctx.academicSource and is selected by the seam', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => jsonResponse({ results: [articleRecord] })))

    const ctx = new Context()
    await ctx.plugin(AcademicSourceRuntime)
    await ctx.plugin(plugin, { baseURL: 'https://api.openalex.org' })

    await expect(ctx.academicSource.search({ query: 'retrieval' })).resolves.toMatchObject({
      works: [{ academicWork: { title: 'Joint evaluation of retrieval and generation' } }],
    })
  })

  it('exports a namespace plugin entry (no default export drops inject)', () => {
    expect(plugin.name).toBe('academic-source-openalex')
    expect(plugin.inject).toEqual(['academicSource'])
    expect(typeof plugin.apply).toBe('function')
    expect(OPENALEX_PROVIDER_ID).toBe('openalex')
    expect((plugin as Record<string, unknown>).default).toBeUndefined()
  })

  it('is an AcademicSourceError carrying its code', () => {
    const error = new AcademicSourceError('boom', 'ACADEMIC_SOURCE_PROVIDER_ERROR')
    expect(error.code).toBe('ACADEMIC_SOURCE_PROVIDER_ERROR')
    expect(error.name).toBe('AcademicSourceError')
  })
})
