/** Adapt approved plan searches to Session-owned Academic and DSH Web services. */
import { createBatchResult, isExecutableResearchBrief, type AcademicCandidateRankingResult,
  type CandidateAssessment, type ExecutableResearchBrief, type HybridSearchPlan,
  type ResearchBrief, type ResearchQuestionCoverageResult } from '@deepseek-ai/dsh-academic-model'
import { executePlannedSearchRound, extendPlanForEvidenceGaps, rankPlannedCandidates,
  type PlannedSearchAdapters, type PlannedSearchRoundResult,
  type QueryPlanningOptions } from '@deepseek-ai/dsh-academic-retrieval'
import { dedupKeys, ingestWorks, type IngestOutcome, type IngestRecord } from '@deepseek-ai/dsh-academic-ingestion'
import { identifyAcademicReferences, type AcademicSourceFullText, type AcademicSourceProviderObserver,
  type AcademicSourceRuntime } from '@deepseek-ai/dsh-academic-source'
import { executeHybridSearch, type CandidateBatchPolicy, type CandidateScheduling, type DraftPipelineAdapters,
  type DraftSearchResult, type HybridDirectSearchProvider,
  type HybridSearchAdapters, type HybridSearchObservation, type HybridSearchStageStatus,
  type ReplenishedCandidates, selectResearchPapers, type SelectedPaper } from '@deepseek-ai/dsh-academic-workflow'
import type { WebRuntime } from '@deepseek-ai/dsh-web'
import { approvedHybridSearchHandoff, executeApprovedSearchDirection } from './planned-retrieval.ts'
import type { AcademicPlannedSearch } from './types.ts'

/** Deployment-owned bounds for one evidence-gap replenishment round. */
export interface GapRoundPolicy {
  /** Maximum queries generated in one gap round. */
  readonly maximumQueriesPerRound: number
  /** Maximum Academic results per gap-round query. */
  readonly maximumAcademicResultsPerQuery: number
}

/**
 * Keep verified full-text candidates beside their owning source records for this run.
 * @param brief Approved ResearchBrief that owns the reviewed query policies.
 * @param searches Approved query policies.
 * @param academicSource Session-owned source runtime, also used for direct-search candidates.
 * @param web Session-owned Web discovery runtime.
 * @param candidateBatchPolicy Explicit Q5 batch sizes and per-question coverage threshold.
 * @param gapRoundPolicy Bounds for one Q5 evidence-gap replenishment round.
 * @param onPlan Optional observer for the exact reviewed plan used by formal execution.
 * @returns Search and selection operations sharing only this run's verified resolution results.
 */
export function approvedPaperAdapters(
  brief: ResearchBrief,
  searches: readonly AcademicPlannedSearch[],
  academicSource: AcademicSourceRuntime,
  web: WebRuntime,
  candidateBatchPolicy: CandidateBatchPolicy,
  gapRoundPolicy: GapRoundPolicy,
  onPlan?: (plan: HybridSearchPlan) => void,
): Pick<DraftPipelineAdapters, 'search' | 'selectPapers' | 'replenishCandidates'> {
  if (searches.some(search => search.retrieval === undefined)) {
    return legacyPaperAdapters(searches, academicSource, web)
  }
  if (!isExecutableResearchBrief(brief)) throw new Error('Ranked candidate scheduling requires an approved ResearchBrief.')
  const approvedBrief: ExecutableResearchBrief = brief
  const handoff = approvedHybridSearchHandoff(approvedBrief, searches)
  onPlan?.(handoff.plan)
  const resolutions = new Map<string, AcademicSourceFullText | null>()
  const key = (provider: string, recordId: string) => JSON.stringify([provider, recordId])
  return {
    search: async (request, signal, onProvider, onHybrid) => {
      const directionIndex = searches.findIndex(search => search.query === request.query)
      const approvedSearch = searches[directionIndex]
      if (directionIndex < 0 || approvedSearch === undefined) {
        throw new Error('Search expression is not in the approved plan.')
      }
      const result = await executeApprovedSearchDirection(handoff, directionIndex,
        request.maxResults ?? approvedBrief.stopConditions.maximumCandidateWorks,
        plannedSearchAdapters(academicSource, web, onProvider), signal, onHybrid)
      const projected = plannedRoundDraftResult(handoff.plan, approvedSearch, result)
      const verificationOutcomes = projected.hybridObservation?.verificationOutcomes ?? []
      for (const outcome of verificationOutcomes) {
        if (outcome.status !== 'verified') continue
        for (const record of outcome.value.work.workVersion.sourceRecords) {
          if (record.provider !== outcome.value.verificationProvider) continue
          const identity = key(record.provider, record.recordId)
          if (resolutions.get(identity) == null) resolutions.set(identity, outcome.value.fullText)
        }
      }
      return projected
    },
    selectPapers: (ingested, effectiveBrief) => rankedPaperSelection(approvedBrief, effectiveBrief, handoff.plan,
      ingested, resolutions, academicSource, key, candidateBatchPolicy),
    replenishCandidates: (scheduling, ingested, coverage, nextRoundIndex, signal) =>
      replenishRankedCandidates(approvedBrief, candidateBatchPolicy, gapRoundPolicy, academicSource, web,
        resolutions, key, scheduling, ingested, coverage, nextRoundIndex, signal),
  }
}

function legacyPaperAdapters(
  searches: readonly AcademicPlannedSearch[], academicSource: AcademicSourceRuntime, web: WebRuntime,
): Pick<DraftPipelineAdapters, 'search' | 'selectPapers'> {
  const search = approvedSearchAdapter(searches, academicSource, web)
  return {
    search,
    selectPapers: (ingested, brief) => selectResearchPapers(ingested, brief, (_work, version) => {
      const fullText = academicSource.resolveFullText(version)
      if (fullText === null) return null
      return { ...fullText, extractionMethod: { method: 'dsh-academic-evidence', methodVersion: '1' },
        hasHistoricalEvidence: false }
    }),
  }
}

function rankedPaperSelection(
  approvedBrief: ExecutableResearchBrief,
  effectiveBrief: ResearchBrief,
  plan: HybridSearchPlan,
  ingested: IngestOutcome,
  resolutions: ReadonlyMap<string, AcademicSourceFullText | null>,
  academicSource: AcademicSourceRuntime,
  key: (provider: string, recordId: string) => string,
  policy: CandidateBatchPolicy,
): ReturnType<DraftPipelineAdapters['selectPapers']> {
  const built = buildRanking(approvedBrief, plan, ingested, resolutions, academicSource, key)
  const evaluations = new Map(built.ranking.evaluations.map(evaluation => [evaluation.workVersionId, evaluation]))
  const resolvable = [...built.ranking.queues.p0, ...built.ranking.queues.p1, ...built.ranking.queues.p2]
    .filter(workVersionId => evaluations.get(workVersionId)?.fulltextAvailability.status === 'resolvable')
  const bounded = resolvable.slice(0, effectiveBrief.stopConditions.maximumCandidateWorks)
  return {
    papers: bounded.map((workVersionId) => {
      const paper = built.papers.get(workVersionId)
      /* v8 ignore next -- buildRanking inserts one paper handoff for every evaluation before ranking queues are created. */
      if (paper === undefined) throw new Error('Ranked candidate has no full-text handoff.')
      return paper
    }),
    truncated: resolvable.length > bounded.length,
    candidateScheduling: { plan, assessments: built.assessments, ranking: built.ranking, policy },
  }
}

/** Build conservative assessments and a Q4 ranking for one deduplicated ingestion outcome. */
function buildRanking(
  approvedBrief: ExecutableResearchBrief,
  plan: HybridSearchPlan,
  ingested: IngestOutcome,
  resolutions: ReadonlyMap<string, AcademicSourceFullText | null>,
  academicSource: AcademicSourceRuntime,
  key: (provider: string, recordId: string) => string,
): {
  readonly assessments: readonly CandidateAssessment[]
  readonly ranking: AcademicCandidateRankingResult
  readonly papers: ReadonlyMap<string, SelectedPaper> } {
  const versions = new Map(ingested.versions.map(version => [version.workVersionId, version]))
  const queryQuestions = new Map(plan.queries.map(query => [query.searchQueryId, query.questions]))
  const discoveredBy = ingested.works.map((work) => {
    const records = ingested.index.records.get(work.academicWorkId)
    /* v8 ignore next -- ingestWorks creates one records entry for every reconciled work in the same outcome. */
    if (records === undefined) throw new Error('Ingested work has no source records.')
    return { academicWorkId: work.academicWorkId,
      searchQueryIds: [...new Set(records.flatMap(record => record.discoveredBy ?? []))] }
  })
  const provenance = new Map(discoveredBy.map(item => [item.academicWorkId, item.searchQueryIds]))
  const papers = new Map<string, SelectedPaper>()
  const assessments: CandidateAssessment[] = ingested.works.map((work) => {
    const version = versions.get(work.canonicalVersionId)
    /* v8 ignore next -- ingestWorks reconciles every canonicalVersionId into the versions collection returned beside the work. */
    if (version === undefined) throw new Error('Ranked candidate requires its canonical version.')
    const resolved = resolveFullText(version, resolutions, academicSource, key)
    const queryIds = provenance.get(work.academicWorkId)
    /* v8 ignore next -- provenance is built from the same ingested.works iteration immediately above. */
    if (queryIds === undefined) throw new Error('Ranked candidate requires query provenance.')
    const matchedQuestions = [...new Set(queryIds.flatMap(queryId => queryQuestions.get(queryId) ?? []))]
    const sourceProviders = [...new Set(version.sourceRecords.map(record => record.provider))]
    papers.set(version.workVersionId, {
      workVersionId: version.workVersionId,
      urls: resolved?.urls ?? [],
      sourceProvider: resolved?.sourceProvider ?? sourceProviders[0] ?? 'unknown',
      extractionMethod: { method: 'dsh-academic-evidence', methodVersion: '1' },
      hasHistoricalEvidence: false,
    })
    const topicRelevance = Math.min(1, matchedQuestions.length / Math.max(1, approvedBrief.questions.length))
    return {
      academicWorkId: work.academicWorkId,
      abstract: { status: 'unknown', reason: 'The normalized provider record does not carry an abstract.' },
      keywords: { status: 'unknown', reason: 'The normalized provider record does not carry keywords.' },
      fulltextAvailability: resolved === null
        ? { status: 'unresolved', reason: 'No configured Academic provider returned a full-text candidate.' }
        : { status: 'resolvable' },
      matchedQuestions,
      contributionSignals: [],
      topicRelevance,
      evidencePotential: resolved === null ? 0 : 0.5,
      methodMatch: 0,
      sourceQuality: 1,
      recency: 0.5,
      inclusionRuleMatches: plan.constraints.inclusionRules.map(() => null),
      exclusionRuleMatches: plan.constraints.exclusionRules.map(() => null),
      diversityTags: sourceProviders,
      reasons: [
        matchedQuestions.length > 0
          ? 'Candidate question matches come from reviewed query provenance.'
          : 'No reviewed query-question provenance was retained for this candidate.',
        'Natural-language scope rules are deferred to full-text validation because trusted abstract metadata is unavailable.',
      ],
    }
  })
  const round: PlannedSearchRoundResult = { ingested, discoveredBy, queries: [] }
  const ranking = rankPlannedCandidates(plan, approvedBrief, round, assessments)
  return { assessments, ranking, papers }
}

/** Execute one evidence-gap replenishment round and re-rank the merged candidate pool. */
async function replenishRankedCandidates(
  approvedBrief: ExecutableResearchBrief,
  candidateBatchPolicy: CandidateBatchPolicy,
  gapPolicy: GapRoundPolicy,
  academicSource: AcademicSourceRuntime,
  web: WebRuntime,
  resolutions: ReadonlyMap<string, AcademicSourceFullText | null>,
  key: (provider: string, recordId: string) => string,
  scheduling: CandidateScheduling,
  ingested: IngestOutcome,
  coverage: ResearchQuestionCoverageResult,
  nextRoundIndex: number,
  signal?: AbortSignal,
): Promise<ReplenishedCandidates> {
  const options: QueryPlanningOptions = {
    academicProviders: [...new Set(scheduling.plan.queries
      .filter(query => query.kind === 'academic').flatMap(query => query.providers))],
    maximumQueriesPerRound: gapPolicy.maximumQueriesPerRound,
    maximumWebResultsPerQuery: 1,
    expansions: [],
  }
  const { plan } = extendPlanForEvidenceGaps(scheduling.plan, coverage, nextRoundIndex, options)
  // Evidence-gap queries are Academic-only by construction. Q3 remains the single owner of
  // query settlement, provenance, and ingestion for both the approved and replenishment rounds.
  const executed = await executePlannedSearchRound(plan, nextRoundIndex, {
    maximumAcademicResultsPerQuery: gapPolicy.maximumAcademicResultsPerQuery,
    // The Q3 contract requires a positive bound. No Web query or verification provider exists
    // in a generated gap round, so this value cannot authorize a verification attempt.
    maximumReferenceVerificationsPerQuery: 1,
    verificationProviders: [],
  }, plannedSearchAdapters(academicSource, web), signal)
  const discoveredRecords: IngestRecord[] = executed.queries.flatMap(query =>
    query.admittedRecords.map(record => ({ ...record, discoveredBy: [query.searchQueryId] })))
  // Keep already-ranked works' canonical versions stable: a gap round that re-finds an
  // already-ingested work through its exact identifiers must not re-shape that work.
  const gapKeys = new Set<string>()
  const gapRecords = discoveredRecords.filter((record) => {
    const exactKeys = dedupKeys(record.academicWork).exact
    if (exactKeys.some(identity => ingested.index.byExactKey.has(identity))) return false
    if (exactKeys.some(identity => gapKeys.has(identity))) return false
    exactKeys.forEach(identity => gapKeys.add(identity))
    return true
  })
  const mergedIngested = ingestWorks(ingested.index, gapRecords)
  const previousWorkIds = new Set(ingested.index.records.keys())
  const versionWorks = new Map(mergedIngested.versions.map(version => [version.workVersionId, version.academicWorkId]))
  const built = buildRanking(approvedBrief, plan, mergedIngested, resolutions, academicSource, key)
  const evaluations = new Map(built.ranking.evaluations.map(evaluation => [evaluation.workVersionId, evaluation]))
  const papers = [...built.ranking.queues.p0, ...built.ranking.queues.p1, ...built.ranking.queues.p2]
    .filter((workVersionId) => {
      const academicWorkId = versionWorks.get(workVersionId)
      return academicWorkId !== undefined && !previousWorkIds.has(academicWorkId)
        && evaluations.get(workVersionId)?.fulltextAvailability.status === 'resolvable'
    })
    .map((workVersionId) => {
      const paper = built.papers.get(workVersionId)
      /* v8 ignore next -- the queue comes from the same buildRanking result that populated papers for every evaluated version. */
      if (paper === undefined) throw new Error('Ranked candidate has no full-text handoff.')
      return paper
    })
  return { scheduling: { plan, assessments: built.assessments, ranking: built.ranking, policy: candidateBatchPolicy },
    ingested: mergedIngested, papers }
}

/** Bind the workflow hybrid-search executor to Session-owned Academic and Web services. */
function hybridSearchAdapters(
  academicSource: AcademicSourceRuntime,
  web: WebRuntime,
  onProvider?: AcademicSourceProviderObserver,
): HybridSearchAdapters {
  return {
    searchAcademic: (request, providers, signal) =>
      academicSource.searchProviders(request, providers, signal, onProvider),
    searchWeb: async (request, signal) => {
      const result = await web.search(request, signal)
      return { candidates: result.sources, truncated: result.truncated }
    },
    identifyReferences: identifyAcademicReferences,
    verifyReference: (reference, provider, signal) => academicSource.verifyReference(reference, [provider], signal),
  }
}

/** Bind the provider-neutral Q3 executor to the Session-owned Academic and Web runtimes. */
function plannedSearchAdapters(
  academicSource: AcademicSourceRuntime,
  web: WebRuntime,
  onProvider?: AcademicSourceProviderObserver,
): PlannedSearchAdapters {
  return {
    searchAcademic: (query, providers, maximumResults, signal) =>
      academicSource.searchProviders({ query, maxResults: maximumResults },
        directSearchProviders(providers), signal, onProvider),
    searchWeb: async (query, maximumResults, signal) => {
      const result = await web.search({ query, maxResults: maximumResults }, signal)
      return { candidates: result.sources, truncated: result.truncated }
    },
    identifyReferences: identifyAcademicReferences,
    verifyReference: (reference, provider, signal) =>
      academicSource.verifyReference(reference, [provider], signal),
  }
}

/** Project one Q3 round into the stable workflow result and browser observation contracts. */
function plannedRoundDraftResult(
  plan: HybridSearchPlan,
  approvedSearch: AcademicPlannedSearch,
  result: PlannedSearchRoundResult,
): DraftSearchResult {
  const retrieval = approvedSearch.retrieval
  /* v8 ignore next -- callers route legacy searches away before constructing a Q3 handoff. */
  if (retrieval === undefined) throw new Error('Q3 execution requires an explicit retrieval policy.')
  const queryKinds = new Map(plan.queries.map(query => [query.searchQueryId, query.kind]))
  const academicQueries = result.queries.filter(query => queryKinds.get(query.searchQueryId) === 'academic')
  const webQueries = result.queries.filter(query => queryKinds.get(query.searchQueryId) !== 'academic')
  const records: IngestRecord[] = result.queries.flatMap(query =>
    query.admittedRecords.map(record => ({ ...record, discoveredBy: [query.searchQueryId] })))
  const failures = result.queries.flatMap(query => query.failures)
  const identifications = webQueries.flatMap(query => query.identifications)
  const verificationOutcomes = webQueries.flatMap(query => query.verificationOutcomes)
  const verifications = webQueries.flatMap(query => query.verifications)
  const webDiscoveryFailed = webQueries.some(query =>
    query.failures.some(failure => failure.operation === 'web_search'))
  const attemptedVerifications = verifications.filter(verification => verification.status !== 'skipped')
  const verifiedReferences = attemptedVerifications.filter(verification => verification.status === 'verified').length
  const failedVerifications = attemptedVerifications.filter(verification => verification.status === 'failed').length
  const academicDiscoveredRecords = academicQueries.reduce((count, query) => count + query.discoveredRecords, 0)
  const webDiscoveredUrls = webQueries.reduce((count, query) => count + query.webCandidates.length, 0)
  const observation: HybridSearchObservation = {
    policy: retrieval,
    stages: {
      academicSearch: aggregateQueryStatus(academicQueries.map(query => query.status)),
      webDiscovery: webQueries.length === 0 ? 'not_run' : webDiscoveryFailed ? 'failed' : 'success',
      referenceIdentification: identificationStatus(identifications),
      referenceVerification: verificationStatus(verifiedReferences, failedVerifications),
    },
    academicDiscoveredRecords,
    webDiscoveredUrls,
    identifications,
    identifiedReferences: identifications.reduce((count, entry) => count + entry.result.references.length, 0),
    duplicateReferences: webQueries.reduce((count, query) => count + query.duplicateReferences, 0),
    attemptedVerifications: attemptedVerifications.length,
    verificationOutcomes,
    retainedVerificationIndexes: verificationOutcomes.flatMap((outcome, index) =>
      outcome.status === 'verified' ? [index] : []),
    admittedRecords: records,
    skippedReferences: verifications.flatMap(verification =>
      verification.status === 'skipped'
        && (verification.reason === 'provider_not_approved' || verification.reason === 'verification_limit')
        ? [{ reference: verification.reference, reason: verification.reason }] : []),
    verifiedReferences,
    failedVerifications,
    discardedWebCandidates: identifications.filter(entry => entry.result.status === 'discarded').length,
  }
  const batch = createBatchResult(records, failures)
  return {
    providers: [...new Set(academicQueries.flatMap((query) => {
      const planned = plan.queries.find(candidate => candidate.searchQueryId === query.searchQueryId)
      return planned?.kind === 'academic' ? planned.providers : []
    }))].sort(),
    discoveredRecords: academicDiscoveredRecords + verifiedReferences,
    batch,
    works: batch.items,
    truncated: result.queries.some(query => query.truncated),
    limitations: [...new Set(result.queries.flatMap(query => query.limitations))],
    hybridObservation: observation,
  }
}

function aggregateQueryStatus(
  statuses: readonly ('success' | 'partial_success' | 'failed')[],
): HybridSearchStageStatus {
  if (statuses.length === 0) return 'not_run'
  if (statuses.every(status => status === 'success')) return 'success'
  if (statuses.every(status => status === 'failed')) return 'failed'
  return 'partial_success'
}

function identificationStatus(
  identifications: HybridSearchObservation['identifications'],
): HybridSearchStageStatus {
  if (identifications.length === 0) return 'not_run'
  const identified = identifications.filter(entry => entry.result.status === 'identified').length
  if (identified === identifications.length) return 'success'
  return identified === 0 ? 'failed' : 'partial_success'
}

function verificationStatus(verified: number, failed: number): HybridSearchStageStatus {
  if (verified + failed === 0) return 'not_run'
  if (failed === 0) return 'success'
  return verified === 0 ? 'failed' : 'partial_success'
}

/** Narrow reviewed plan providers to the direct-search set; other providers fail loud. */
function directSearchProviders(providers: readonly string[]): readonly HybridDirectSearchProvider[] {
  for (const provider of providers) {
    if (provider !== 'openalex' && provider !== 'arxiv') {
      throw new Error(`Evidence-gap search requires an approved direct provider, received "${provider}".`)
    }
  }
  return providers as readonly HybridDirectSearchProvider[]
}

function resolveFullText(
  version: PlannedSearchRoundResult['ingested']['versions'][number],
  resolutions: ReadonlyMap<string, AcademicSourceFullText | null>,
  academicSource: AcademicSourceRuntime,
  key: (provider: string, recordId: string) => string,
): AcademicSourceFullText | null {
  for (const record of version.sourceRecords) {
    const resolved = resolutions.get(key(record.provider, record.recordId))
    if (resolved !== undefined) {
      if (resolved !== null) return resolved
      continue
    }
    const providerResult = academicSource.resolveFullText({ ...version, sourceRecords: [record] })
    if (providerResult !== null) return providerResult
  }
  return null
}

/**
 * Bind source execution to the exact queries and policies from the approved Session plan.
 * @param searches - reviewed expressions and optional version-3 policies.
 * @param academicSource - Session-owned scholarly search and verification service.
 * @param web - Session-owned Web discovery service; generated answers are discarded.
 * @returns a pipeline search operation forwarding its candidate bound and cancellation signal.
 */
export function approvedSearchAdapter(
  searches: readonly AcademicPlannedSearch[],
  academicSource: AcademicSourceRuntime,
  web: WebRuntime,
): DraftPipelineAdapters['search'] {
  const approvedSearches = new Map(searches.map(search => [search.query, search]))
  return async (search, operationSignal, onProvider, onHybrid) => {
    const approved = approvedSearches.get(search.query)
    if (approved === undefined) throw new Error('Search expression is not in the approved plan.')
    if (approved.retrieval === undefined) return academicSource.searchAll(search, operationSignal, onProvider)
    const result = await executeHybridSearch(search, approved.retrieval,
      hybridSearchAdapters(academicSource, web, onProvider), operationSignal, onHybrid)
    return { ...result.search, hybridObservation: result.observation }
  }
}
