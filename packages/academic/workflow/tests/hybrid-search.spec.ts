import { describe, expect, it, vi } from 'vitest'
import {
  createAcademicWorkId,
  createBatchResult,
  createWorkVersionId,
  type ExternalIdentifier,
  type ProviderFailure,
} from '@deepseek-ai/dsh-academic-model'
import { createIngestIndex, ingestWorks } from '@deepseek-ai/dsh-academic-ingestion'
import { normalizeAcademicCatalogRecord } from '@deepseek-ai/dsh-academic-source'
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

function work(provider: string, recordId: string, doi?: string): AcademicSourceWork {
  const academicWorkId = createAcademicWorkId()
  const workVersionId = createWorkVersionId()
  const identifiers: ExternalIdentifier[] = [{ kind: 'provider_record', normalizedValue: `${provider}:${recordId}`,
    originalValue: recordId, sourceProvider: provider }]
  if (doi !== undefined) identifiers.push({ kind: 'doi', normalizedValue: doi, originalValue: doi, sourceProvider: provider })
  return {
    academicWork: {
      schemaVersion: 1,
      academicWorkId,
      title: `${provider}:${recordId}`,
      authors: [],
      externalIdentifiers: identifiers,
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
      externalIdentifiers: identifiers,
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
  return { status: 'verified', value: { reference, verificationProvider: provider, work: value,
    fullText: null, fullTextFailure: { reference, verificationProvider: provider,
      category: 'fulltext_unavailable', message: 'No full-text candidate.', retryable: false, retryAfter: null } } }
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

  it('retains every discovery URL for a verified DOI-less official record', async () => {
    const configured = adapters()
    const official = normalizeAcademicCatalogRecord('acl', { recordId: '2024.acl-long.1',
      title: 'Official ACL paper', authors: ['Alice'], year: '2024', venue: 'ACL', doi: null })
    const first: AcademicReference = { kind: 'provider_record', provider: 'acl',
      recordId: '2024.acl-long.1', discoveryUrl: 'https://aclanthology.org/2024.acl-long.1/' }
    const second = { ...first, discoveryUrl: 'https://example.org/citation' }
    configured.searchAcademic = vi.fn<HybridSearchAdapters['searchAcademic']>(async () => searchBatch([]))
    configured.searchWeb = vi.fn<HybridSearchAdapters['searchWeb']>(async () => ({ candidates: [
      { url: first.discoveryUrl }, { url: second.discoveryUrl },
    ], truncated: false }))
    configured.identifyReferences = vi.fn<HybridSearchAdapters['identifyReferences']>(candidate => (
      identified(candidate.url === first.discoveryUrl ? first : second)
    ))
    configured.verifyReference = vi.fn<HybridSearchAdapters['verifyReference']>(async (reference, provider) => (
      verified(reference, provider, official)
    ))

    const result = await executeHybridSearch({ query: 'ACL paper', maxResults: 1 }, policy, configured)
    const ingested = ingestWorks(createIngestIndex(), result.search.batch.items)

    expect(configured.verifyReference).toHaveBeenCalledOnce()
    expect(result.observation.duplicateReferences).toBe(1)
    expect(ingested.works).toHaveLength(1)
    expect(ingested.versions).toHaveLength(1)
    expect(ingested.verifiedDiscoveries).toEqual([
      { academicWorkId: ingested.works[0]?.academicWorkId, workVersionId: ingested.versions[0]?.workVersionId,
        discoveryUrl: first.discoveryUrl, verificationProvider: 'acl' },
      { academicWorkId: ingested.works[0]?.academicWorkId, workVersionId: ingested.versions[0]?.workVersionId,
        discoveryUrl: second.discoveryUrl, verificationProvider: 'acl' },
    ])
  })

  it('bounds distinct works after exact merging and keeps their versions', async () => {
    const configured = adapters()
    const direct = work('openalex', 'W1', '10.1000/example')
    const published = work('openalex', 'W2', '10.1000/example')
    const unrelated = work('openalex', 'W3', '10.1000/unrelated')
    const reference: AcademicReference = { kind: 'doi', normalizedValue: '10.1000/example',
      originalValue: '10.1000/example', discoveryUrl: 'https://doi.org/10.1000/example' }
    const otherReference: AcademicReference = { kind: 'doi', normalizedValue: '10.1000/unrelated',
      originalValue: '10.1000/unrelated', discoveryUrl: 'https://doi.org/10.1000/unrelated' }
    configured.searchAcademic = vi.fn<HybridSearchAdapters['searchAcademic']>(async () => searchBatch([direct]))
    configured.searchWeb = vi.fn<HybridSearchAdapters['searchWeb']>(async () => ({
      candidates: [{ url: reference.discoveryUrl }, { url: otherReference.discoveryUrl }], truncated: false,
    }))
    configured.identifyReferences = vi.fn<HybridSearchAdapters['identifyReferences']>(candidate => (
      identified(candidate.url === reference.discoveryUrl ? reference : otherReference)
    ))
    configured.verifyReference = vi.fn<HybridSearchAdapters['verifyReference']>(async (found, provider) => (
      verified(found, provider, found === reference ? published : unrelated)
    ))

    const result = await executeHybridSearch({ query: 'paper', maxResults: 1 }, policy, configured)
    const ingested = ingestWorks(createIngestIndex(), result.search.batch.items)

    expect(result.search.works).toHaveLength(2)
    expect(result.search.truncated).toBe(true)
    expect(result.search.limitations).toContain('The aggregate result bound retained 1 of 2 deduplicated works.')
    expect(ingested.works).toHaveLength(1)
    expect(ingested.versions).toHaveLength(2)
    expect(ingested.verifiedDiscoveries).toEqual([{
      academicWorkId: ingested.works[0]?.academicWorkId,
      workVersionId: published.workVersion.workVersionId,
      discoveryUrl: reference.discoveryUrl,
      verificationProvider: 'openalex',
    }])
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
