/** Executes one approved query round and admits only provider-verified scholarly records. */
import { createBatchResult, createFailureId, type AcademicWorkId, type HybridSearchPlan,
  type HybridSearchQuery, type ProviderFailure, type SearchQueryId } from '@deepseek-ai/dsh-academic-model'
import { createIngestIndex, ingestWorks, type IngestOutcome, type IngestRecord } from '@deepseek-ai/dsh-academic-ingestion'
import type { AcademicReference, AcademicReferenceIdentificationResult, AcademicReferenceVerificationOutcome,
  AcademicReferenceIdentificationIssueCode, AcademicSourceSearchBatchResult,
  AcademicWebDiscoveryCandidate } from '@deepseek-ai/dsh-academic-source'

/** Source and Web operations supplied by the owning Academic controller. */
export interface PlannedSearchAdapters {
  readonly searchAcademic: (query: string, providers: readonly string[], maximumResults: number,
    signal?: AbortSignal) => Promise<AcademicSourceSearchBatchResult>
  readonly searchWeb: (query: string, maximumResults: number,
    signal?: AbortSignal) => Promise<{ readonly candidates: readonly AcademicWebDiscoveryCandidate[]; readonly truncated: boolean }>
  readonly identifyReferences: (candidate: AcademicWebDiscoveryCandidate) => AcademicReferenceIdentificationResult
  readonly verifyReference: (reference: AcademicReference, provider: string,
    signal?: AbortSignal) => Promise<AcademicReferenceVerificationOutcome>
}

/** Caller-approved bounds and verification Provider IDs for one round. */
export interface PlannedSearchLimits {
  readonly maximumAcademicResultsPerQuery: number
  readonly maximumReferenceVerificationsPerQuery: number
  readonly verificationProviders: readonly string[]
}

/** Deduplicated works, retained versions, query provenance, and independent query settlements. */
export interface PlannedSearchRoundResult {
  readonly ingested: IngestOutcome
  readonly discoveredBy: readonly {
    readonly academicWorkId: AcademicWorkId
    readonly searchQueryIds: readonly SearchQueryId[]
  }[]
  readonly queries: readonly {
    readonly searchQueryId: SearchQueryId
    readonly status: 'success' | 'partial_success' | 'failed'
    readonly discoveredRecords: number
    readonly verifiedWorks: number
    readonly unverifiedReferences: number
    readonly failures: readonly ProviderFailure[]
    readonly limitations: readonly string[]
    readonly identifications: readonly {
      readonly discoveryUrl: string
      readonly status: 'identified' | 'discarded'
      readonly issues: readonly AcademicReferenceIdentificationIssueCode[]
    }[]
    readonly verifications: readonly {
      readonly reference: AcademicReference
      readonly status: 'verified' | 'failed' | 'skipped'
      readonly reason: 'provider_not_approved' | 'verification_limit' | 'verification_failed' | null
    }[]
  }[]
}

type QueryResult = PlannedSearchRoundResult['queries'][number] & {
  readonly records: readonly IngestRecord[]
}

/**
 * Execute only the named round of a reviewed plan; Web text is never a work record.
 * Expected Web and reference failures leave successful sibling records intact. Missing
 * configured Academic providers and caller cancellation reject the round.
 * @param plan - Approved query plan, including stable query IDs and channel assignments.
 * @param roundIndex - One-based round whose queries are executed exactly once.
 * @param limits - Explicit Academic-result and verification-attempt bounds.
 * @param adapters - Session-owned Academic and Web operations.
 * @param signal - Caller cancellation propagated to each operation.
 * @returns Deduplicated candidates, verified discoveries, query provenance, and per-query facts.
 */
export async function executePlannedSearchRound(
  plan: HybridSearchPlan,
  roundIndex: number,
  limits: PlannedSearchLimits,
  adapters: PlannedSearchAdapters,
  signal?: AbortSignal,
): Promise<PlannedSearchRoundResult> {
  validateLimits(limits)
  if (!Number.isSafeInteger(roundIndex) || roundIndex < 1 || roundIndex > plan.maximumSearchRounds) {
    throw new RangeError('roundIndex is outside the approved plan')
  }
  const queries = plan.queries.filter(query => query.roundIndex === roundIndex)
  if (queries.length === 0) throw new RangeError('the approved round has no queries')
  if (new Set(queries.map(query => query.searchQueryId)).size !== queries.length) {
    throw new RangeError('planned search query IDs must be distinct')
  }
  const results: QueryResult[] = []
  // ponytail: execute queries in plan order; add bounded query concurrency only if latency warrants it.
  for (const query of queries) {
    throwIfAborted(signal)
    results.push(await executeQuery(query, limits, adapters, signal))
  }
  throwIfAborted(signal)
  const ingested = ingestWorks(createIngestIndex(), results.flatMap(result => result.records))
  return {
    ingested,
    discoveredBy: ingested.works.map(work => ({ academicWorkId: work.academicWorkId,
      searchQueryIds: [...new Set((ingested.index.records.get(work.academicWorkId) ?? [])
        .flatMap(record => record.discoveredBy ?? []))] })),
    queries: results.map(({ records: _records, ...result }) => result),
  }
}

async function executeQuery(query: HybridSearchQuery, limits: PlannedSearchLimits,
  adapters: PlannedSearchAdapters, signal?: AbortSignal): Promise<QueryResult> {
  if (query.kind === 'academic') {
    if (query.providers.length === 0) throw new RangeError('academic query requires providers')
    const result = await adapters.searchAcademic(query.expression, query.providers,
      limits.maximumAcademicResultsPerQuery, signal)
    return { searchQueryId: query.searchQueryId, status: result.batch.status,
      discoveredRecords: result.discoveredRecords, verifiedWorks: result.batch.items.length,
      unverifiedReferences: 0, failures: result.batch.failures, limitations: result.limitations,
      identifications: [], verifications: [],
      records: result.batch.items.map(record => ({ ...record, discoveredBy: [query.searchQueryId] })) }
  }
  if (!Number.isSafeInteger(query.maximumResults) || query.maximumResults < 1) {
    throw new RangeError('Web query maximumResults must be a positive safe integer')
  }
  const expression = query.kind === 'site_restricted'
    ? `site:${query.siteHost} ${query.expression}` : query.expression
  let discovery: Awaited<ReturnType<PlannedSearchAdapters['searchWeb']>>
  try {
    discovery = await adapters.searchWeb(expression, query.maximumResults, signal)
  } catch {
    throwIfAborted(signal)
    const failures = [failure('web', 'web_search', 'Web discovery failed.')]
    return { searchQueryId: query.searchQueryId, status: 'failed', discoveredRecords: 0,
      verifiedWorks: 0, unverifiedReferences: 0, failures, limitations: [],
      identifications: [], verifications: [], records: [] }
  }
  throwIfAborted(signal)
  const candidates = discovery.candidates.slice(0, query.maximumResults)
  const identifications = candidates.map(candidate => ({ candidate, result: adapters.identifyReferences(candidate) }))
  const references = identifications.flatMap(entry => entry.result.references)
  const byReference = new Map<string, { reference: AcademicReference; urls: Set<string> }>()
  for (const reference of references) {
    const key = referenceKey(reference)
    const entry = byReference.get(key) ?? { reference, urls: new Set<string>() }
    entry.urls.add(reference.discoveryUrl)
    byReference.set(key, entry)
  }
  const permitted = [...byReference.values()].filter(entry => limits.verificationProviders.includes(providerFor(entry.reference)))
  const selected = permitted.slice(0, limits.maximumReferenceVerificationsPerQuery)
  const failures: ProviderFailure[] = []
  const records: IngestRecord[] = []
  const verifications: PlannedSearchRoundResult['queries'][number]['verifications'][number][] = []
  for (const entry of byReference.values()) {
    if (!limits.verificationProviders.includes(providerFor(entry.reference))) {
      verifications.push({ reference: entry.reference, status: 'skipped', reason: 'provider_not_approved' })
    } else if (!selected.includes(entry)) {
      verifications.push({ reference: entry.reference, status: 'skipped', reason: 'verification_limit' })
    }
  }
  for (const entry of selected) {
    throwIfAborted(signal)
    const provider = providerFor(entry.reference)
    let outcome: AcademicReferenceVerificationOutcome
    try {
      outcome = await adapters.verifyReference(entry.reference, provider, signal)
    } catch {
      throwIfAborted(signal)
      failures.push(failure(provider, 'verify_reference', 'Reference verification failed.'))
      verifications.push({ reference: entry.reference, status: 'failed', reason: 'verification_failed' })
      continue
    }
    if (outcome.status === 'failed') {
      failures.push({ schemaVersion: 1, failureId: createFailureId(), provider,
        operation: 'verify_reference', category: outcome.failure.category,
        message: outcome.failure.message, retryable: outcome.failure.retryable,
        retryAfter: outcome.failure.retryAfter })
      verifications.push({ reference: entry.reference, status: 'failed', reason: 'verification_failed' })
      continue
    }
    if (outcome.value.verificationProvider !== provider) {
      throw new Error('Reference verification returned a different provider.')
    }
    verifications.push({ reference: entry.reference, status: 'verified', reason: null })
    records.push({ ...outcome.value.work, discoveredBy: [query.searchQueryId],
      verifiedDiscoveries: [...(outcome.value.work.verifiedDiscoveries ?? []),
        ...[...entry.urls].map(discoveryUrl => ({ discoveryUrl, verificationProvider: provider }))] })
    if (outcome.value.fullTextFailure !== null) {
      failures.push({ schemaVersion: 1, failureId: createFailureId(), provider,
        operation: 'resolve_fulltext', category: outcome.value.fullTextFailure.category,
        message: outcome.value.fullTextFailure.message,
        retryable: outcome.value.fullTextFailure.retryable,
        retryAfter: outcome.value.fullTextFailure.retryAfter })
    }
  }
  throwIfAborted(signal)
  const skipped = byReference.size - selected.length
  const limitations = [
    ...discovery.truncated || discovery.candidates.length > candidates.length
      ? ['Web discovery reached its approved result bound.'] : [],
    ...skipped > 0 ? [`${skipped} Web references were not verified because of provider or attempt limits.`] : [],
  ]
  return { searchQueryId: query.searchQueryId, status: createBatchResult(records, failures).status,
    discoveredRecords: discovery.candidates.length, verifiedWorks: records.length,
    unverifiedReferences: byReference.size - records.length, failures, limitations,
    identifications: identifications.map(({ candidate, result }) => ({ discoveryUrl: candidate.url,
      status: result.status, issues: result.issues.map(issue => issue.code) })),
    verifications, records }
}

function referenceKey(reference: AcademicReference): string {
  return reference.kind === 'provider_record'
    ? JSON.stringify([reference.provider, reference.recordId])
    : JSON.stringify([reference.kind, reference.normalizedValue])
}

function providerFor(reference: AcademicReference): string {
  return reference.kind === 'provider_record' ? reference.provider : reference.kind === 'doi' ? 'openalex' : 'arxiv'
}

function failure(provider: string, operation: string, message: string): ProviderFailure {
  return { schemaVersion: 1, failureId: createFailureId(), provider, operation,
    category: 'unknown', message, retryable: false, retryAfter: null }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Search aborted.', 'AbortError')
}

function validateLimits(limits: PlannedSearchLimits): void {
  for (const [name, value] of [['maximumAcademicResultsPerQuery', limits.maximumAcademicResultsPerQuery],
    ['maximumReferenceVerificationsPerQuery', limits.maximumReferenceVerificationsPerQuery]] as const) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive safe integer`)
  }
  if (new Set(limits.verificationProviders).size !== limits.verificationProviders.length
    || limits.verificationProviders.some(provider => provider.trim() === '')) {
    throw new RangeError('verificationProviders must contain distinct non-empty IDs')
  }
}
