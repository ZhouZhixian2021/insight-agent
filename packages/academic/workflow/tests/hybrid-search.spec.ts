import { describe, expect, it, vi } from 'vitest'
import {
  createAcademicWorkId,
  createBatchResult,
  createWorkVersionId,
  type ProviderFailure,
} from '@deepseek-ai/dsh-academic-model'
import type {
  AcademicReference,
  AcademicReferenceIdentificationResult,
  AcademicReferenceVerificationOutcome,
  AcademicSourceSearchBatchResult,
  AcademicSourceWork,
} from '@deepseek-ai/dsh-academic-source'
import {
  executeHybridSearch,
  type HybridRetrievalPolicy,
  type HybridSearchAdapters,
} from '../src/index.ts'

function work(provider: string, recordId: string): AcademicSourceWork {
  const academicWorkId = createAcademicWorkId()
  const workVersionId = createWorkVersionId()
  return {
    academicWork: {
      schemaVersion: 1,
      academicWorkId,
      title: `${provider}:${recordId}`,
      authors: [],
      externalIdentifiers: [],
      workVersionIds: [workVersionId],
      canonicalVersionId: workVersionId,
      firstPublicDate: { status: 'unknown', reason: 'fixture' },
      publicationStatus: { status: 'unknown', reason: 'fixture' },
      venue: { status: 'unknown', reason: 'fixture' },
    },
    workVersion: {
      schemaVersion: 1,
      academicWorkId,
      workVersionId,
      versionType: 'unknown',
      versionLabel: { status: 'unknown', reason: 'fixture' },
      releaseDate: { status: 'unknown', reason: 'fixture' },
      externalIdentifiers: [],
      sourceRecords: [{ provider, recordId }],
      contentHash: { status: 'not_extracted' },
      supersedesWorkVersionId: null,
      status: 'active',
    },
  }
}

function searchBatch(
  works: readonly AcademicSourceWork[],
  failures: readonly ProviderFailure[] = [],
): AcademicSourceSearchBatchResult {
  const batch = createBatchResult(works, failures)
  return { works: batch.items, batch, providers: ['arxiv'], discoveredRecords: works.length,
    truncated: false, limitations: [] }
}

function identified(...references: readonly AcademicReference[]): AcademicReferenceIdentificationResult {
  if (references.length === 0) {
    return { status: 'discarded', references: [],
      issues: [{ code: 'unrecognized_page', message: 'No supported paper reference.' }] }
  }
  return { status: 'identified', references: references as [AcademicReference, ...AcademicReference[]], issues: [] }
}

function verified(reference: AcademicReference, provider: string, value: AcademicSourceWork): AcademicReferenceVerificationOutcome {
  return { status: 'verified', value: { reference, verificationProvider: provider, work: value, fullText: null } }
}

const policy: HybridRetrievalPolicy = {
  channels: ['academic', 'web_discovery'],
  academicProviders: ['openalex', 'arxiv'],
  verificationProviders: ['openalex', 'arxiv', 'acl', 'pmlr', 'cvf'],
  maximumWebDiscoveryResults: 5,
  maximumReferenceVerifications: 5,
}

type MutableAdapters = { -readonly [K in keyof HybridSearchAdapters]: HybridSearchAdapters[K] }

function adapters(): MutableAdapters {
  return {
    searchAcademic: vi.fn<HybridSearchAdapters['searchAcademic']>(async () => searchBatch([work('arxiv', 'direct')])),
    searchWeb: vi.fn<HybridSearchAdapters['searchWeb']>(async () => ({ candidates: [], truncated: false })),
    identifyReferences: vi.fn<HybridSearchAdapters['identifyReferences']>(() => identified()),
    verifyReference: vi.fn<HybridSearchAdapters['verifyReference']>(
      async (reference, provider) => verified(reference, provider, work(provider, 'verified')),
    ),
  }
}

describe('hybrid Academic discovery', () => {
  it('starts Academic and Web discovery together and admits only verified Web references', async () => {
    let finishAcademic: ((value: AcademicSourceSearchBatchResult) => void) | undefined
    let finishWeb: ((value: { candidates: readonly { url: string }[]; truncated: boolean }) => void) | undefined
    const configured = adapters()
    configured.searchAcademic = vi.fn<HybridSearchAdapters['searchAcademic']>(() => new Promise<AcademicSourceSearchBatchResult>(
      (resolve) => { finishAcademic = resolve },
    ))
    configured.searchWeb = vi.fn<HybridSearchAdapters['searchWeb']>(() => new Promise<{
      candidates: readonly { url: string }[]
      truncated: boolean
    }>(
      (resolve) => { finishWeb = resolve },
    ))
    const reference: AcademicReference = { kind: 'arxiv', normalizedValue: '1706.03762',
      originalValue: '1706.03762', discoveryUrl: 'https://arxiv.org/abs/1706.03762' }
    configured.identifyReferences = vi.fn<HybridSearchAdapters['identifyReferences']>(() => identified(reference))

    const pending = executeHybridSearch({ query: 'attention', maxResults: 5 }, policy, configured)
    await Promise.resolve()
    expect(configured.searchAcademic).toHaveBeenCalledOnce()
    expect(configured.searchWeb).toHaveBeenCalledOnce()
    finishAcademic?.(searchBatch([work('arxiv', 'direct')]))
    finishWeb?.({ candidates: [{ url: reference.discoveryUrl }], truncated: false })

    const result = await pending
    expect(result.search.works.map(item => item.academicWork.title)).toEqual(['arxiv:direct', 'arxiv:verified'])
    expect(configured.verifyReference).toHaveBeenCalledWith(reference, 'arxiv', undefined)
    expect(result.observation.stages).toEqual({
      academicSearch: 'success',
      webDiscovery: 'success',
      referenceIdentification: 'success',
      referenceVerification: 'success',
    })
  })

  it('deduplicates references, filters disallowed providers, and applies the verification budget', async () => {
    const configured = adapters()
    const doi: AcademicReference = { kind: 'doi', normalizedValue: '10.1000/example',
      originalValue: '10.1000/example', discoveryUrl: 'https://doi.org/10.1000/example' }
    const repeated = { ...doi, discoveryUrl: 'https://example.org/citation' }
    const arxiv: AcademicReference = { kind: 'arxiv', normalizedValue: '1706.03762',
      originalValue: '1706.03762', discoveryUrl: 'https://arxiv.org/abs/1706.03762' }
    configured.searchWeb = vi.fn<HybridSearchAdapters['searchWeb']>(async () => ({ candidates: [
      { url: doi.discoveryUrl }, { url: repeated.discoveryUrl }, { url: arxiv.discoveryUrl },
    ], truncated: false }))
    configured.identifyReferences = vi.fn<HybridSearchAdapters['identifyReferences']>(candidate => candidate.url === doi.discoveryUrl ? identified(doi)
      : candidate.url === repeated.discoveryUrl ? identified(repeated) : identified(arxiv))
    const limited: HybridRetrievalPolicy = { ...policy, verificationProviders: ['openalex'],
      maximumReferenceVerifications: 1 }

    const result = await executeHybridSearch({ query: 'attention' }, limited, configured)

    expect(configured.verifyReference).toHaveBeenCalledOnce()
    expect(configured.verifyReference).toHaveBeenCalledWith(doi, 'openalex', undefined)
    expect(result.observation).toMatchObject({ identifiedReferences: 3, duplicateReferences: 1,
      attemptedVerifications: 1, verifiedReferences: 1 })
  })

  it('keeps verified Web works when direct Academic discovery fails', async () => {
    const configured = adapters()
    const reference: AcademicReference = { kind: 'doi', normalizedValue: '10.1000/example',
      originalValue: '10.1000/example', discoveryUrl: 'https://doi.org/10.1000/example' }
    configured.searchAcademic = vi.fn<HybridSearchAdapters['searchAcademic']>(async () => {
      throw Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' })
    })
    configured.searchWeb = vi.fn<HybridSearchAdapters['searchWeb']>(
      async () => ({ candidates: [{ url: reference.discoveryUrl }], truncated: false }),
    )
    configured.identifyReferences = vi.fn<HybridSearchAdapters['identifyReferences']>(() => identified(reference))

    const result = await executeHybridSearch({ query: 'attention' }, policy, configured)

    expect(result.search.works).toHaveLength(1)
    expect(result.search.batch.status).toBe('partial_success')
    expect(result.search.batch.failures[0]).toMatchObject({ provider: 'academic', operation: 'search',
      category: 'network_error' })
    expect(result.observation.stages.academicSearch).toBe('failed')
    expect(result.observation.stages.referenceVerification).toBe('success')
  })

  it('keeps direct Academic works when Web discovery fails', async () => {
    const configured = adapters()
    configured.searchWeb = vi.fn<HybridSearchAdapters['searchWeb']>(async () => { throw new Error('unavailable') })

    const result = await executeHybridSearch({ query: 'attention' }, policy, configured)

    expect(result.search.works.map(item => item.academicWork.title)).toEqual(['arxiv:direct'])
    expect(result.search.batch.status).toBe('partial_success')
    expect(result.search.batch.failures[0]).toMatchObject({ provider: 'web', operation: 'web_search' })
    expect(result.observation.stages).toMatchObject({ webDiscovery: 'failed',
      referenceIdentification: 'not_run', referenceVerification: 'not_run' })
  })

  it('propagates caller cancellation instead of converting it to a source failure', async () => {
    const controller = new AbortController()
    const configured = adapters()
    configured.searchAcademic = vi.fn<HybridSearchAdapters['searchAcademic']>(async () => {
      controller.abort(new Error('cancelled'))
      throw new Error('cancelled')
    })

    await expect(executeHybridSearch({ query: 'attention' }, policy, configured, controller.signal))
      .rejects.toThrow('cancelled')
  })

  it('joins every started verification before propagating cancellation', async () => {
    const controller = new AbortController()
    const configured = adapters()
    const first: AcademicReference = { kind: 'doi', normalizedValue: '10.1000/first',
      originalValue: '10.1000/first', discoveryUrl: 'https://doi.org/10.1000/first' }
    const second: AcademicReference = { kind: 'arxiv', normalizedValue: '1706.03762',
      originalValue: '1706.03762', discoveryUrl: 'https://arxiv.org/abs/1706.03762' }
    configured.searchWeb = vi.fn<HybridSearchAdapters['searchWeb']>(async () => ({
      candidates: [{ url: first.discoveryUrl }, { url: second.discoveryUrl }], truncated: false,
    }))
    configured.identifyReferences = vi.fn<HybridSearchAdapters['identifyReferences']>(candidate => (
      identified(candidate.url === first.discoveryUrl ? first : second)
    ))
    let secondSettled = false
    configured.verifyReference = vi.fn<HybridSearchAdapters['verifyReference']>(async (reference, provider) => {
      if (reference === first) {
        controller.abort(new Error('cancelled'))
        throw new Error('cancelled')
      }
      await Promise.resolve()
      secondSettled = true
      return verified(reference, provider, work(provider, 'second'))
    })

    await expect(executeHybridSearch({ query: 'attention' }, policy, configured, controller.signal))
      .rejects.toThrow('cancelled')
    expect(secondSettled).toBe(true)
  })
})
