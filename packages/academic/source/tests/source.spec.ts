import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  createAcademicWorkId,
  createWorkVersionId,
  type AcademicWork,
  type WorkVersion,
} from '@deepseek-ai/dsh-academic-model'
import AcademicSourceRuntime, {
  AcademicSourceError,
  type AcademicSourceProvider,
  type AcademicSourceSearchRequest,
  type AcademicSourceSearchResult,
  type AcademicSourceWork,
} from '@deepseek-ai/dsh-academic-source'

/** A minimal provider-neutral work/version pair for contract tests. */
function makeWork(title: string): AcademicSourceWork {
  const academicWorkId = createAcademicWorkId()
  const workVersionId = createWorkVersionId()
  const academicWork: AcademicWork = {
    schemaVersion: 1,
    academicWorkId,
    title,
    authors: [],
    externalIdentifiers: [],
    workVersionIds: [workVersionId],
    canonicalVersionId: workVersionId,
    firstPublicDate: { status: 'unknown', reason: 'test fixture' },
    publicationStatus: { status: 'unknown', reason: 'test fixture' },
    venue: { status: 'unknown', reason: 'test fixture' },
  }
  const workVersion: WorkVersion = {
    schemaVersion: 1,
    workVersionId,
    academicWorkId,
    versionType: 'unknown',
    versionLabel: { status: 'unknown', reason: 'test fixture' },
    releaseDate: { status: 'unknown', reason: 'test fixture' },
    externalIdentifiers: [],
    sourceRecords: [],
    contentHash: { status: 'not_extracted' },
    supersedesWorkVersionId: null,
    status: 'active',
  }
  return { academicWork, workVersion }
}

/** A scripted source provider for contract tests. */
function makeSearchProvider(
  id: string,
  available: boolean,
  search: (request: AcademicSourceSearchRequest) => Promise<AcademicSourceSearchResult>,
): AcademicSourceProvider {
  return { id, available: () => available, search: request => search(request) }
}

const available = true
const unavailable = false

function searchResult(marker: string, overrides: Partial<AcademicSourceSearchResult> = {}): AcademicSourceSearchResult {
  return { works: [makeWork(marker)], truncated: false, ...overrides }
}

/** Mount an AcademicSourceRuntime on a fresh root context with the given config. */
async function mountSource(
  config: ConstructorParameters<typeof AcademicSourceRuntime>[1] = {},
): Promise<{ ctx: Context; source: AcademicSourceRuntime }> {
  const ctx = new Context()
  await ctx.plugin(AcademicSourceRuntime, config)
  return { ctx, source: ctx.academicSource }
}

describe('AcademicSourceRuntime registration', () => {
  it('registers a search provider and unregisters it via the returned disposer', async () => {
    const { source } = await mountSource()
    const dispose = source.registerSearchProvider(makeSearchProvider('openalex', available, () => Promise.resolve(searchResult('openalex'))))
    await expect(source.search({ query: 'retrieval' })).resolves.toMatchObject({ works: [{ academicWork: { title: 'openalex' } }] })

    dispose()
    await expect(source.search({ query: 'retrieval' })).rejects.toThrow(expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE' }))
  })

  it('throws ACADEMIC_SOURCE_DUPLICATE_PROVIDER on a duplicate id', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('openalex', available, () => Promise.resolve(searchResult('openalex'))))
    expect(() => source.registerSearchProvider(makeSearchProvider('openalex', available, () => Promise.resolve(searchResult('openalex')))))
      .toThrow(expect.objectContaining({ code: 'ACADEMIC_SOURCE_DUPLICATE_PROVIDER' }))
  })

  it('disposes provider registrations when the contributing fiber is disposed (HMR safety)', async () => {
    const { ctx, source } = await mountSource()
    const fiber = await ctx.plugin(Object.assign((inner: Context) => {
      inner.academicSource.registerSearchProvider(makeSearchProvider('openalex', available, () => Promise.resolve(searchResult('openalex'))))
    }, { inject: ['academicSource'] }))
    await expect(source.search({ query: 'retrieval' })).resolves.toMatchObject({ works: [{ academicWork: { title: 'openalex' } }] })
    await fiber.dispose()
    await expect(source.search({ query: 'retrieval' })).rejects.toThrow(expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE' }))
  })
})

describe('AcademicSourceRuntime execution resolution', () => {
  it('throws ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE when nothing is registered', async () => {
    const { source } = await mountSource()
    await expect(source.search({ query: 'retrieval' })).rejects.toThrow(expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE' }))
  })

  it('throws ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE when providers exist but none are usable', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('openalex', unavailable, () => Promise.resolve(searchResult('openalex'))))
    await expect(source.search({ query: 'retrieval' })).rejects.toThrow(expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE' }))
  })

  it('throws ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING for an unregistered configured id', async () => {
    const { source } = await mountSource({ searchProvider: 'crossref' })
    source.registerSearchProvider(makeSearchProvider('openalex', available, () => Promise.resolve(searchResult('openalex'))))
    await expect(source.search({ query: 'retrieval' })).rejects.toThrow(expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('throws ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE for an unusable configured id', async () => {
    const { source } = await mountSource({ searchProvider: 'openalex' })
    source.registerSearchProvider(makeSearchProvider('openalex', unavailable, () => Promise.resolve(searchResult('openalex'))))
    await expect(source.search({ query: 'retrieval' })).rejects.toThrow(expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE' }))
  })

  it('throws ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS rather than picking by order', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('openalex', available, () => Promise.resolve(searchResult('openalex'))))
    source.registerSearchProvider(makeSearchProvider('crossref', available, () => Promise.resolve(searchResult('crossref'))))
    await expect(source.search({ query: 'retrieval' })).rejects.toThrow(expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS' }))
  })

  it('runs the configured provider even when another usable provider is registered', async () => {
    const { source } = await mountSource({ searchProvider: 'crossref' })
    source.registerSearchProvider(makeSearchProvider('openalex', available, () => Promise.resolve(searchResult('openalex'))))
    source.registerSearchProvider(makeSearchProvider('crossref', available, () => Promise.resolve(searchResult('crossref'))))
    await expect(source.search({ query: 'retrieval' })).resolves.toMatchObject({ works: [{ academicWork: { title: 'crossref' } }] })
  })

  it('ignores unusable providers when auto-selecting', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('openalex', available, () => Promise.resolve(searchResult('openalex'))))
    source.registerSearchProvider(makeSearchProvider('crossref', unavailable, () => Promise.resolve(searchResult('crossref'))))
    await expect(source.search({ query: 'retrieval' })).resolves.toMatchObject({ works: [{ academicWork: { title: 'openalex' } }] })
  })

  it('propagates the abort signal to the provider', async () => {
    const { source } = await mountSource()
    const seen: (AbortSignal | undefined)[] = []
    source.registerSearchProvider({
      id: 'openalex',
      available: () => available,
      search: (_request, signal) => { seen.push(signal); return Promise.resolve(searchResult('openalex')) },
    })
    const controller = new AbortController()
    await source.search({ query: 'retrieval' }, controller.signal)
    expect(seen[0]).toBe(controller.signal)
  })
})

describe('AcademicSourceRuntime maxResults enforcement', () => {
  it('truncates works and sets truncated when a provider over-returns', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('openalex', available, () => Promise.resolve(searchResult('openalex', {
      works: [makeWork('a'), makeWork('b'), makeWork('c')],
    }))))
    const result = await source.search({ query: 'retrieval', maxResults: 2 })
    expect(result.works).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })

  it('leaves truncated false when within the bound', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('openalex', available, () => Promise.resolve(searchResult('openalex', {
      works: [makeWork('a')],
    }))))
    const result = await source.search({ query: 'retrieval', maxResults: 8 })
    expect(result.works).toHaveLength(1)
    expect(result.truncated).toBe(false)
  })

  it('does not bound when maxResults is omitted', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('openalex', available, () => Promise.resolve(searchResult('openalex', {
      works: [makeWork('a'), makeWork('b')],
    }))))
    const result = await source.search({ query: 'retrieval' })
    expect(result.works).toHaveLength(2)
    expect(result.truncated).toBe(false)
  })
})

describe('AcademicSourceError', () => {
  it('carries its code and names itself', () => {
    const error = new AcademicSourceError('boom', 'ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE')
    expect(error.code).toBe('ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE')
    expect(error.name).toBe('AcademicSourceError')
  })
})
