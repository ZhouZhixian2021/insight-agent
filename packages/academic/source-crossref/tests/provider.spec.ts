import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AcademicSourceRuntime from '@deepseek-ai/dsh-academic-source'
import * as plugin from '../src/index.ts'
import {
  CrossrefProvider,
  CROSSREF_PROVIDER_ID,
  type CrossrefProviderOptions,
} from '../src/index.ts'
import type { CrossrefRawWork } from '../src/index.ts'

type FetchMock = (url: URL, init?: RequestInit) => Promise<Response>

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

const articleRecord: CrossrefRawWork = {
  DOI: '10.0000/example.1',
  title: ['Joint evaluation'],
  author: [{ given: 'Alice', family: 'Example' }],
  published: { 'date-parts': [[2024, 6, 1]] },
  type: 'journal-article',
  'container-title': ['Example Journal'],
}

const searchOptions = (overrides: Partial<CrossrefProviderOptions> = {}): CrossrefProviderOptions => ({
  baseURL: 'https://api.crossref.org',
  mailto: 'team@example.com',
  ...overrides,
})

function requestedUrl(fetchMock: ReturnType<typeof vi.fn<FetchMock>>): URL {
  const input = fetchMock.mock.calls[0]?.[0]
  expect(input).toBeInstanceOf(URL)
  return input as URL
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CrossrefProvider.search', () => {
  it('queries /works with query, rows, and mailto, and maps items through normalization', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => jsonResponse({ message: { items: [articleRecord] } }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new CrossrefProvider(() => searchOptions())
    const result = await provider.search({ query: 'retrieval', maxResults: 5 })

    expect(result.truncated).toBe(false)
    expect(result.works).toHaveLength(1)
    expect(result.works[0]?.academicWork.title).toBe('Joint evaluation')

    const requested = requestedUrl(fetchMock)
    expect(requested.pathname).toBe('/works')
    expect(requested.searchParams.get('query')).toBe('retrieval')
    expect(requested.searchParams.get('rows')).toBe('5')
    expect(requested.searchParams.get('mailto')).toBe('team@example.com')
  })

  it('returns an empty works list when the response carries no items', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => jsonResponse({ message: {} })))
    const provider = new CrossrefProvider(() => searchOptions())
    await expect(provider.search({ query: 'x' })).resolves.toEqual({ works: [], truncated: false })
  })

  it('throws ACADEMIC_SOURCE_PROVIDER_ERROR on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => jsonResponse({ error: 'boom' }, { status: 429 })))
    const provider = new CrossrefProvider(() => searchOptions())
    await expect(provider.search({ query: 'x' })).rejects.toThrow(
      expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_ERROR' }),
    )
  })
})

describe('CrossrefProvider.available', () => {
  it('is true for a parseable endpoint and false otherwise', () => {
    expect(new CrossrefProvider(() => searchOptions()).available()).toBe(true)
    expect(new CrossrefProvider(() => ({ baseURL: 'not a url' })).available()).toBe(false)
  })
})

describe('CrossrefProvider registration', () => {
  it('registers with ctx.academicSource and is selected by the seam', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => jsonResponse({ message: { items: [articleRecord] } })))

    const ctx = new Context()
    await ctx.plugin(AcademicSourceRuntime)
    await ctx.plugin(plugin, { baseURL: 'https://api.crossref.org' })

    await expect(ctx.academicSource.search({ query: 'retrieval' })).resolves.toMatchObject({
      works: [{ academicWork: { title: 'Joint evaluation' } }],
    })
  })

  it('exports a namespace plugin entry', () => {
    expect(plugin.name).toBe('academic-source-crossref')
    expect(plugin.inject).toEqual(['academicSource'])
    expect(typeof plugin.apply).toBe('function')
    expect(CROSSREF_PROVIDER_ID).toBe('crossref')
    expect((plugin as Record<string, unknown>).default).toBeUndefined()
  })
})
