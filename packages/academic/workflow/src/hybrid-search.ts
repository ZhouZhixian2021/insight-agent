/** Policy-aware Academic and Web discovery before the existing ingestion pass. */
import { createBatchResult, createFailureId, type FailureCategory, type ProviderFailure } from '@deepseek-ai/dsh-academic-model'
import { createIngestIndex, dedupKeys, ingestWorks } from '@deepseek-ai/dsh-academic-ingestion'
import type {
  AcademicReference,
  AcademicReferenceIdentificationResult,
  AcademicReferenceVerificationFailure,
  AcademicReferenceVerificationOutcome,
  AcademicSourceSearchBatchResult,
  AcademicSourceSearchRequest,
  AcademicSourceWork,
  AcademicWebDiscoveryCandidate,
} from '@deepseek-ai/dsh-academic-source'

/** Direct scholarly providers supported by the first hybrid-search plan. */
export type HybridDirectSearchProvider = 'openalex' | 'arxiv'

/** Providers that may verify a Web-discovered reference in the first hybrid-search plan. */
export type HybridReferenceVerificationProvider = HybridDirectSearchProvider | 'acl' | 'pmlr' | 'cvf'

/** Approved execution policy for one search expression. */
export interface HybridRetrievalPolicy {
  readonly channels: readonly ('academic' | 'web_discovery')[]
  readonly academicProviders: readonly HybridDirectSearchProvider[]
  readonly verificationProviders: readonly HybridReferenceVerificationProvider[]
  readonly maximumWebDiscoveryResults: number
  readonly maximumReferenceVerifications: number
}

/** One Web discovery result with provider truncation retained separately from Academic results. */
export interface HybridWebDiscoveryResult {
  readonly candidates: readonly AcademicWebDiscoveryCandidate[]
  readonly truncated: boolean
}

/** Operations supplied by the Controller and Academic Source runtime. */
export interface HybridSearchAdapters {
  /** Search exactly the approved direct providers and return their settled batch. */
  readonly searchAcademic: (
    request: AcademicSourceSearchRequest,
    providers: readonly HybridDirectSearchProvider[],
    signal?: AbortSignal,
  ) => Promise<AcademicSourceSearchBatchResult>
  /** Run DSH Web discovery without exposing provider-generated summaries to ingestion. */
  readonly searchWeb: (
    request: AcademicSourceSearchRequest,
    signal?: AbortSignal,
  ) => Promise<HybridWebDiscoveryResult>
  /** Identify supported scholarly references without network access. */
  readonly identifyReferences: (candidate: AcademicWebDiscoveryCandidate) => AcademicReferenceIdentificationResult
  /** Settle one reference through its approved authoritative provider. */
  readonly verifyReference: (
    reference: AcademicReference,
    provider: HybridReferenceVerificationProvider,
    signal?: AbortSignal,
  ) => Promise<AcademicReferenceVerificationOutcome>
}

/** Settlement status for one independently observable hybrid-search operation. */
export type HybridSearchStageStatus = 'success' | 'partial_success' | 'failed' | 'not_run'

/** Observations retained for A-H4 projection without mixing URLs, references, and works. */
export interface HybridSearchObservation {
  readonly stages: {
    readonly academicSearch: HybridSearchStageStatus
    readonly webDiscovery: HybridSearchStageStatus
    readonly referenceIdentification: HybridSearchStageStatus
    readonly referenceVerification: HybridSearchStageStatus
  }
  readonly academicDiscoveredRecords: number
  readonly webDiscoveredUrls: number
  readonly identifications: readonly {
    readonly candidate: AcademicWebDiscoveryCandidate
    readonly result: AcademicReferenceIdentificationResult
  }[]
  readonly identifiedReferences: number
  readonly duplicateReferences: number
  readonly attemptedVerifications: number
  readonly verificationOutcomes: readonly AcademicReferenceVerificationOutcome[]
  /** Outcome indexes admitted after the per-query result bound; verification success alone is not admission. */
  readonly retainedVerificationIndexes: readonly number[]
  /** Original contributing records of admitted works, before per-query version reconciliation. */
  readonly admittedRecords: readonly AcademicSourceWork[]
  readonly skippedReferences: readonly {
    readonly reference: AcademicReference
    readonly reason: 'provider_not_approved' | 'verification_limit'
  }[]
  readonly verifiedReferences: number
  readonly failedVerifications: number
  readonly discardedWebCandidates: number
}

/** Standard search batch plus channel-specific facts for later run projection. */
export interface HybridSearchResult {
  readonly search: AcademicSourceSearchBatchResult
  readonly observation: HybridSearchObservation
}

/**
 * Execute the approved Academic and Web channels for one query.
 *
 * Academic and Web discovery begin together. Web summaries never enter the returned works;
 * only references settled as verified contribute a work. Channel and reference failures retain
 * successful sibling results, while caller cancellation aborts the complete operation.
 * @param request - one approved query and its global candidate bound.
 * @param policy - reviewed channels, providers, and Web/reference budgets.
 * @param adapters - direct search, Web discovery, identification, and verification operations.
 * @param signal - caller-owned cancellation and elapsed-time signal.
 * @returns A scholarly batch bounded by distinct works, retaining their versions and verified Web discoveries, and separate observations.
 */
export async function executeHybridSearch(
  request: AcademicSourceSearchRequest,
  policy: HybridRetrievalPolicy,
  adapters: HybridSearchAdapters,
  signal?: AbortSignal,
): Promise<HybridSearchResult> {
  throwIfAborted(signal)
  const academicEnabled = policy.channels.includes('academic')
  const webEnabled = policy.channels.includes('web_discovery')
  const [academic, web] = await Promise.all([
    academicEnabled
      ? settle(() => adapters.searchAcademic(request, policy.academicProviders, signal))
      : Promise.resolve<Settlement<AcademicSourceSearchBatchResult>>({ status: 'not_run' }),
    webEnabled
      ? settle(() => adapters.searchWeb({ query: request.query, maxResults: policy.maximumWebDiscoveryResults }, signal))
      : Promise.resolve<Settlement<HybridWebDiscoveryResult>>({ status: 'not_run' }),
  ])
  throwIfAborted(signal)

  const failures: ProviderFailure[] = []
  const direct = academic.status === 'success' ? academic.value : emptyAcademicBatch()
  if (academic.status === 'failed') failures.push(operationFailure('academic', 'search', academic.reason))
  else failures.push(...direct.batch.failures)
  if (web.status === 'failed') failures.push(operationFailure('web', 'web_search', web.reason))

  const candidates = web.status === 'success' ? web.value.candidates : []
  const identifications = candidates.map(candidate => ({ candidate, result: adapters.identifyReferences(candidate) }))
  const references = identifications.flatMap(entry => entry.result.references)
  const distinct = distinctReferences(references)
  const permitted = distinct.values.filter(reference => policy.verificationProviders.includes(providerFor(reference)))
  const selected = permitted.slice(0, policy.maximumReferenceVerifications)
  const verificationOutcomes = await Promise.all(selected.map(async (reference): Promise<AcademicReferenceVerificationOutcome> => {
    const provider = providerFor(reference)
    try {
      return await adapters.verifyReference(reference, provider, signal)
    } catch (reason: unknown) {
      return { status: 'failed', failure: verificationFailure(reference, provider, reason) }
    }
  }))
  throwIfAborted(signal)

  const verified = verificationOutcomes.flatMap((outcome): readonly AcademicSourceWork[] => {
    if (outcome.status !== 'verified') return []
    const key = referenceKey(outcome.value.reference)
    const discoveryUrls = new Set(references.filter(reference => referenceKey(reference) === key)
      .map(reference => reference.discoveryUrl))
    return [{ ...outcome.value.work, verifiedDiscoveries: [
      ...(outcome.value.work.verifiedDiscoveries ?? []),
      ...[...discoveryUrls].map(discoveryUrl => ({ discoveryUrl, verificationProvider: outcome.value.verificationProvider })),
    ] }]
  })
  for (const outcome of verificationOutcomes) {
    if (outcome.status === 'failed') failures.push(referenceProviderFailure(outcome.failure))
  }
  const allWorks = [...direct.works, ...verified]
  const merged = ingestWorks(createIngestIndex(), allWorks)
  const retainedWorks = request.maxResults === undefined
    ? [...merged.index.records] : [...merged.index.records].slice(0, request.maxResults)
  const retained = retainedWorks.flatMap(([, records]) => records)
  const retainedIds = new Set(retainedWorks.map(([id]) => id))
  const admitted = allWorks.map(record => dedupKeys(record.academicWork).exact.some((key) => {
    const id = merged.index.byExactKey.get(key)
    return id !== undefined && retainedIds.has(id)
  }) || retained.includes(record))
  let verifiedOffset = direct.works.length
  const retainedVerificationIndexes = verificationOutcomes.flatMap((outcome, index) =>
    outcome.status === 'verified' && admitted[verifiedOffset++] ? [index] : [])
  const originalRecords = [...direct.works, ...verificationOutcomes.flatMap(outcome =>
    outcome.status === 'verified' ? [outcome.value.work] : [])]
  const admittedRecords = originalRecords.filter((_, index) => admitted[index])
  const resultBoundTruncated = retainedWorks.length < merged.works.length
  const verificationBoundTruncated = permitted.length > selected.length
  const limitations = [...direct.limitations]
  const discarded = identifications.filter(entry => entry.result.status === 'discarded').length
  if (discarded > 0) limitations.push(`${discarded} Web candidates produced no supported scholarly reference; they were not admitted as papers.`)
  if (permitted.length < distinct.values.length) limitations.push(`${distinct.values.length - permitted.length} references require unapproved verification providers and were not verified.`)
  if (web.status === 'success' && web.value.truncated) limitations.push('Web discovery reached its approved result bound.')
  if (verificationBoundTruncated) limitations.push('Reference verification reached its approved attempt bound.')
  if (resultBoundTruncated) limitations.push(`The aggregate result bound retained ${retainedWorks.length} of ${merged.works.length} deduplicated works.`)
  const batch = createBatchResult(retained, failures)
  return {
    search: {
      works: batch.items,
      batch,
      providers: direct.providers,
      discoveredRecords: direct.discoveredRecords + verified.length,
      truncated: direct.truncated || (web.status === 'success' && web.value.truncated)
        || verificationBoundTruncated || resultBoundTruncated,
      limitations,
    },
    observation: {
      stages: {
        academicSearch: settlementStage(academic, direct),
        webDiscovery: settlementStage(web),
        referenceIdentification: web.status === 'not_run' ? 'not_run' : web.status === 'failed' ? 'not_run'
          : identificationStage(identifications),
        referenceVerification: web.status === 'not_run' || web.status === 'failed' ? 'not_run'
          : verificationStage(verificationOutcomes),
      },
      academicDiscoveredRecords: direct.discoveredRecords,
      webDiscoveredUrls: candidates.length,
      identifications,
      identifiedReferences: references.length,
      duplicateReferences: distinct.duplicates,
      attemptedVerifications: verificationOutcomes.length,
      verificationOutcomes,
      retainedVerificationIndexes,
      admittedRecords,
      skippedReferences: distinct.values.filter(reference => !selected.includes(reference)).map(reference => ({
        reference, reason: policy.verificationProviders.includes(providerFor(reference))
          ? 'verification_limit' : 'provider_not_approved',
      })),
      verifiedReferences: verificationOutcomes.filter(outcome => outcome.status === 'verified').length,
      failedVerifications: verificationOutcomes.filter(outcome => outcome.status === 'failed').length,
      discardedWebCandidates: discarded,
    },
  }
}

type Settlement<T> =
  | { readonly status: 'success'; readonly value: T }
  | { readonly status: 'failed'; readonly reason: unknown }
  | { readonly status: 'not_run' }

async function settle<T>(operation: () => Promise<T>): Promise<Settlement<T>> {
  try {
    return { status: 'success', value: await operation() }
  } catch (reason: unknown) {
    return { status: 'failed', reason }
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}

function emptyAcademicBatch(): AcademicSourceSearchBatchResult {
  const batch = createBatchResult<AcademicSourceWork>([], [])
  return { works: batch.items, batch, providers: [], discoveredRecords: 0, truncated: false, limitations: [] }
}

function distinctReferences(references: readonly AcademicReference[]): {
  readonly values: readonly AcademicReference[]
  readonly duplicates: number
} {
  const found = new Map<string, AcademicReference>()
  for (const reference of references) found.set(referenceKey(reference), found.get(referenceKey(reference)) ?? reference)
  return { values: [...found.values()], duplicates: references.length - found.size }
}

function referenceKey(reference: AcademicReference): string {
  return reference.kind === 'provider_record'
    ? `${reference.provider}:${reference.recordId}`
    : `${reference.kind}:${reference.normalizedValue}`
}

function providerFor(reference: AcademicReference): HybridReferenceVerificationProvider {
  return reference.kind === 'provider_record' ? reference.provider : reference.kind === 'doi' ? 'openalex' : 'arxiv'
}

function settlementStage<T>(settlement: Settlement<T>, batch?: AcademicSourceSearchBatchResult): HybridSearchStageStatus {
  if (settlement.status !== 'success') return settlement.status === 'failed' ? 'failed' : 'not_run'
  if (batch === undefined) return 'success'
  return batch.batch.status
}

function identificationStage(
  entries: readonly { readonly result: AcademicReferenceIdentificationResult }[],
): HybridSearchStageStatus {
  if (entries.length === 0) return 'not_run'
  const issues = entries.filter(entry => entry.result.issues.length > 0).length
  const successes = entries.filter(entry => entry.result.status === 'identified').length
  return issues === 0 ? 'success' : successes === 0 ? 'failed' : 'partial_success'
}

function verificationStage(outcomes: readonly AcademicReferenceVerificationOutcome[]): HybridSearchStageStatus {
  if (outcomes.length === 0) return 'not_run'
  const failed = outcomes.filter(outcome => outcome.status === 'failed').length
  return failed === 0 ? 'success' : failed === outcomes.length ? 'failed' : 'partial_success'
}

function failureCategory(reason: unknown): FailureCategory {
  if (typeof reason === 'object' && reason !== null && 'code' in reason) {
    const code = String(reason.code).toLowerCase()
    if (code.includes('timeout')) return 'timeout'
    if (code.includes('rate')) return 'rate_limited'
    if (code.includes('network') || code.includes('fetch')) return 'network_error'
    if (code.includes('parse')) return 'parse_failed'
    if (code.includes('not_found')) return 'not_found'
  }
  return 'upstream_error'
}

function operationFailure(provider: string, operation: string, reason: unknown): ProviderFailure {
  const expected = typeof reason === 'object' && reason !== null && 'code' in reason
  return { schemaVersion: 1, failureId: createFailureId(), provider, operation,
    category: expected ? failureCategory(reason) : 'unknown',
    message: `${provider} ${operation} failed.`, retryable: expected, retryAfter: null }
}

function verificationFailure(
  reference: AcademicReference,
  provider: HybridReferenceVerificationProvider,
  reason: unknown,
): AcademicReferenceVerificationFailure {
  const expected = typeof reason === 'object' && reason !== null && 'code' in reason
  return { reference, verificationProvider: provider, category: expected ? failureCategory(reason) : 'unknown',
    message: `${provider} reference verification failed.`, retryable: expected, retryAfter: null }
}

function referenceProviderFailure(failure: AcademicReferenceVerificationFailure): ProviderFailure {
  return { schemaVersion: 1, failureId: createFailureId(), provider: failure.verificationProvider,
    operation: 'verify_reference', category: failure.category, message: failure.message,
    retryable: failure.retryable, retryAfter: failure.retryAfter }
}
