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
  search: (request: AcademicSourceSearchRequest, signal?: AbortSignal) => Promise<AcademicSourceSearchResult>,
): AcademicSourceProvider {
  return {
    id,
    available: () => available,
    search: (request, signal) => search(request, signal),
    fullTextUrls: recordId => [`https://example.org/${id}/${recordId}.pdf`],
  }
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
      fullTextUrls: () => [],
    })
    const controller = new AbortController()
    await source.search({ query: 'retrieval' }, controller.signal)
    expect(seen[0]).toBe(controller.signal)
  })
})

describe('AcademicSourceRuntime multi-provider execution', () => {
  it('searches every usable provider and interleaves the total result bound', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('beta', available, () => Promise.resolve({
      works: [makeWork('b1'), makeWork('b2')], truncated: false,
    })))
    source.registerSearchProvider(makeSearchProvider('alpha', available, () => Promise.resolve({
      works: [makeWork('a1'), makeWork('a2')], truncated: false,
    })))

    const result = await source.searchAll({ query: 'retrieval', maxResults: 3 })

    expect(result.works.map(work => work.academicWork.title)).toEqual(['a1', 'b1', 'a2'])
    expect(result.truncated).toBe(true)
  })

  it('ignores unavailable providers and resolves full text through source records', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('alpha', available, () => Promise.resolve(searchResult('alpha'))))
    source.registerSearchProvider(makeSearchProvider('beta', unavailable, () => Promise.resolve(searchResult('beta'))))
    const result = await source.searchAll({ query: 'retrieval' })
    const version = result.works[0]?.workVersion
    if (version === undefined) throw new Error('missing test version')
    const withRecord = { ...version, sourceRecords: [{ provider: 'alpha', recordId: 'paper-1' }] }

    expect(result.works.map(work => work.academicWork.title)).toEqual(['alpha'])
    expect(source.resolveFullText(withRecord)).toEqual({
      sourceProvider: 'alpha',
      urls: ['https://example.org/alpha/paper-1.pdf'],
    })
  })
})

describe('AcademicSourceRuntime searchAll batch result', () => {
  it('reports success with zero results when every provider succeeds empty', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('alpha', available, () => Promise.resolve({ works: [], truncated: false })))
    source.registerSearchProvider(makeSearchProvider('beta', available, () => Promise.resolve({ works: [], truncated: false })))

    const result = await source.searchAll({ query: 'retrieval' })

    expect(result.batch.status).toBe('success')
    expect(result.batch.items).toEqual([])
    expect(result.batch.failures).toEqual([])
    expect(result.providers).toEqual(['alpha', 'beta'])
    expect(result.discoveredRecords).toBe(0)
    expect(result.truncated).toBe(false)
    expect(result.limitations).toEqual([])
  })

  it('keeps successful works and records one source-level failure on partial success', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('alpha', available, () => Promise.resolve(searchResult('a1'))))
    source.registerSearchProvider(makeSearchProvider('beta', available, () => Promise.reject(new AcademicSourceError(
      'beta catalog request failed (HTTP 503)',
      'ACADEMIC_SOURCE_PROVIDER_ERROR',
    ))))

    const result = await source.searchAll({ query: 'retrieval' })

    expect(result.batch.status).toBe('partial_success')
    expect(result.batch.items.map(work => work.academicWork.title)).toEqual(['a1'])
    expect(result.batch.failures).toHaveLength(1)
    const failure = result.batch.failures[0]
    if (failure === undefined) throw new Error('missing test failure')
    expect(failure.provider).toBe('beta')
    expect(failure.operation).toBe('search')
    expect(failure.category).toBe('upstream_error')
    expect(failure.message).toBe('beta catalog request failed (HTTP 503)')
    expect(failure.retryable).toBe(true)
    expect(failure.retryAfter).toBeNull()
    expect('affectedWorkVersionId' in failure).toBe(false)
    expect(result.providers).toEqual(['alpha', 'beta'])
    expect(result.works).toBe(result.batch.items)
  })

  it('returns failed with every failure detail when all called providers fail', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('alpha', available, () => Promise.reject(new AcademicSourceError(
      'alpha catalog request failed (HTTP 500)',
      'ACADEMIC_SOURCE_PROVIDER_ERROR',
    ))))
    source.registerSearchProvider(makeSearchProvider('beta', available, () => Promise.reject(new Error('unexpected crash'))))

    const result = await source.searchAll({ query: 'retrieval' })

    expect(result.batch.status).toBe('failed')
    expect(result.batch.items).toEqual([])
    expect(result.batch.failures).toHaveLength(2)
    const [alpha, beta] = result.batch.failures
    if (alpha === undefined || beta === undefined) throw new Error('missing test failures')
    expect(alpha.provider).toBe('alpha')
    expect(alpha.category).toBe('upstream_error')
    expect(alpha.retryable).toBe(true)
    expect(beta.provider).toBe('beta')
    expect(beta.category).toBe('unknown')
    expect(beta.retryable).toBe(false)
    expect(beta.message).toBe('Error: unexpected crash')
    expect(result.providers).toEqual(['alpha', 'beta'])
    expect(result.discoveredRecords).toBe(0)
  })

  it('aborts the whole round on cancellation without fabricating provider failures', async () => {
    const { source } = await mountSource()
    const controller = new AbortController()
    source.registerSearchProvider(makeSearchProvider('alpha', available, () => Promise.resolve(searchResult('a1'))))
    source.registerSearchProvider(makeSearchProvider('beta', available, (_request, signal) => {
      controller.abort()
      if (signal?.aborted === true) {
        return Promise.reject(new AcademicSourceError('beta search aborted', 'ACADEMIC_SOURCE_ABORTED'))
      }
      return Promise.resolve(searchResult('b1'))
    }))

    await expect(source.searchAll({ query: 'retrieval' }, controller.signal))
      .rejects.toThrow(expect.objectContaining({ code: 'ACADEMIC_SOURCE_ABORTED' }))
  })

  it('aborts when the signal is already aborted even if every provider ignored it', async () => {
    const { source } = await mountSource()
    const controller = new AbortController()
    controller.abort()
    source.registerSearchProvider(makeSearchProvider('alpha', available, () => Promise.resolve(searchResult('a1'))))

    await expect(source.searchAll({ query: 'retrieval' }, controller.signal))
      .rejects.toThrow(expect.objectContaining({ code: 'ACADEMIC_SOURCE_ABORTED' }))
  })

  it('counts discovered records before the aggregate bound and reports the truncation', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('alpha', available, () => Promise.resolve({
      works: [makeWork('a1'), makeWork('a2'), makeWork('a3')], truncated: false,
    })))
    source.registerSearchProvider(makeSearchProvider('beta', available, () => Promise.resolve({
      works: [makeWork('b1'), makeWork('b2')], truncated: false,
    })))

    const result = await source.searchAll({ query: 'retrieval', maxResults: 2 })

    expect(result.discoveredRecords).toBe(5)
    expect(result.batch.items.map(work => work.academicWork.title)).toEqual(['a1', 'b1'])
    expect(result.works.map(work => work.academicWork.title)).toEqual(['a1', 'b1'])
    expect(result.truncated).toBe(true)
    expect(result.limitations).toEqual(['The aggregate result bound retained 2 of 5 discovered records.'])
    expect(result.batch.status).toBe('success')
  })

  it('sets truncated through a provider-side drop without an aggregate limitation', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('alpha', available, () => Promise.resolve({
      works: [makeWork('a1')], truncated: true,
    })))

    const result = await source.searchAll({ query: 'retrieval' })

    expect(result.truncated).toBe(true)
    expect(result.limitations).toEqual([])
    expect(result.discoveredRecords).toBe(1)
  })

  it('collects declared provider coverage limitations in provider order without duplicates', async () => {
    const { source } = await mountSource()
    const shared = 'Catalog search covers only configured catalog pages.'
    source.registerSearchProvider(makeSearchProvider('beta', available, () => Promise.resolve(searchResult('b1'))))
    source.registerSearchProvider({
      ...makeSearchProvider('alpha', available, () => Promise.resolve(searchResult('a1'))),
      limitations: [shared, 'Alpha rejects queries shorter than three characters.'],
    })
    source.registerSearchProvider({
      ...makeSearchProvider('gamma', available, () => Promise.resolve(searchResult('g1'))),
      limitations: [shared],
    })

    const result = await source.searchAll({ query: 'retrieval' })

    expect(result.limitations).toEqual([shared, 'Alpha rejects queries shorter than three characters.'])
  })

  it('keeps throwing the configuration error when no provider is usable', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('alpha', unavailable, () => Promise.resolve(searchResult('a1'))))
    await expect(source.searchAll({ query: 'retrieval' }))
      .rejects.toThrow(expect.objectContaining({ code: 'ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE' }))
  })

  it('includes zero-result and failed providers in the called provider list', async () => {
    const { source } = await mountSource()
    source.registerSearchProvider(makeSearchProvider('zeta', available, () => Promise.resolve({ works: [], truncated: false })))
    source.registerSearchProvider(makeSearchProvider('alpha', available, () => Promise.reject(new AcademicSourceError(
      'alpha down',
      'ACADEMIC_SOURCE_PROVIDER_ERROR',
    ))))

    const result = await source.searchAll({ query: 'retrieval' })

    expect(result.providers).toEqual(['alpha', 'zeta'])
    expect(result.batch.status).toBe('failed')
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
