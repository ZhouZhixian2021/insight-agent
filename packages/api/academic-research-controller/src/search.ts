/** Adapt approved plan searches to Session-owned Academic and DSH Web services. */
import { createBatchResult, isExecutableResearchBrief, type AcademicCandidateRankingResult,
  type AcademicWorkId, type Availability, type CandidateAssessment, type CandidateFulltextAvailability,
  type CandidateScreeningDetails, type CandidateSemanticReviewStateV1, type CandidateReviewSelectionV1,
  type ExecutableResearchBrief, type HybridSearchPlan,
  type ResearchBrief, type ResearchQuestionCoverageResult, type WorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { assessPlannedCandidates, executePlannedSearchRound, extendPlanForEvidenceGaps,
  rankPlannedCandidates, selectCandidateReviews,
  type PlannedSearchAdapters, type PlannedSearchRoundResult,
  type QueryPlanningOptions } from '@deepseek-ai/dsh-academic-retrieval'
import { dedupKeys, ingestWorks, metadataForVersion, type IngestOutcome, type IngestRecord } from '@deepseek-ai/dsh-academic-ingestion'
import { identifyAcademicReferences, type AcademicSourceFullText, type AcademicSourceProviderObserver,
  type AcademicSourceRuntime } from '@deepseek-ai/dsh-academic-source'
import { executeHybridSearch, type CandidateBatchPolicy, type CandidateScheduling, type DraftPipelineAdapters,
  type DraftSearchResult, type HybridDirectSearchProvider,
  type HybridSearchAdapters, type HybridSearchObservation, type HybridSearchStageStatus,
  type CandidateReviewProgressObservation, type ReplenishedCandidates, selectResearchPapers,
  type SelectedPaper } from '@deepseek-ai/dsh-academic-workflow'
import type { WebRuntime } from '@deepseek-ai/dsh-web'
import type { SessionSeq } from '@deepseek-ai/dsh-session'
import { approvedHybridSearchHandoff, executeApprovedSearchDirection } from './planned-retrieval.ts'
import { approvedCandidateScreeningCriteria, type AcademicCandidateScreening } from './candidate-screening.ts'
import type { AcademicPlannedSearch } from './types.ts'

/** Deployment-owned bounds for one evidence-gap replenishment round. */
export interface GapRoundPolicy {
  /** Maximum queries generated in one gap round. */
  readonly maximumQueriesPerRound: number
  /** Maximum Academic results per gap-round query. */
  readonly maximumAcademicResultsPerQuery: number
}

/** Canonical scholarly metadata supplied to the model reviewer after Q3 deduplication. */
export interface CandidateReviewInput {
  readonly academicWorkId: AcademicWorkId
  readonly workVersionId: WorkVersionId
  readonly roundIndex: number
  readonly selectionSeq?: SessionSeq
  readonly title: string
  readonly abstract: Availability<string>
  readonly brief: ExecutableResearchBrief
  readonly plan: HybridSearchPlan
  /** Called after the exact dispatch request is durable, before model streaming. */
  readonly onDispatch?: () => void
}

/** Validated output or a recoverable failure; persistence and cancellation failures propagate. */
export type CandidateReviewOutcome =
  | { readonly status: 'validated'; readonly screening: CandidateScreeningDetails }
  | { readonly status: 'failed'; readonly code: string }

/** Review one work; the reviewer notifies onDispatch only when a model call is admitted. */
export type CandidateReviewer = (input: CandidateReviewInput,
  signal?: AbortSignal) => Promise<CandidateReviewOutcome>

/** Deployment concurrency and durable pre-dispatch selection recording. */
export interface CandidateReviewExecution {
  readonly concurrency: number
  /** Reviews reserved for newly discovered evidence-gap candidates; omitted reserves none. */
  readonly gapReserve?: number
  readonly recordSelection?: (selection: CandidateReviewSelectionV1, roundIndex: number) => Promise<SessionSeq>
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
 * @param candidateScreening Optional metadata cues from that same approved plan.
 * @param reviewCandidate Optional Session-backed semantic review of canonical scholarly metadata.
 * @param initialAcademicResultsPerQuery Independent bound for raw Academic records before candidate screening.
 * @param maximumModelReviews Upper bound for semantic model calls across initial and gap rounds.
 * @param reviewExecution Candidate concurrency and durable selection recorder.
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
  candidateScreening?: AcademicCandidateScreening,
  reviewCandidate?: CandidateReviewer,
  initialAcademicResultsPerQuery?: number,
  maximumModelReviews = 24,
  reviewExecution: CandidateReviewExecution = { concurrency: 1 },
): Pick<DraftPipelineAdapters, 'search' | 'selectPapers' | 'reviewCandidates' | 'replenishCandidates'> {
  if (searches.some(search => search.retrieval === undefined)) {
    return legacyPaperAdapters(searches, academicSource, web)
  }
  if (!isExecutableResearchBrief(brief)) throw new Error('Ranked candidate scheduling requires an approved ResearchBrief.')
  const approvedBrief: ExecutableResearchBrief = brief
  const handoff = approvedHybridSearchHandoff(approvedBrief, searches)
  onPlan?.(handoff.plan)
  const resolutions = new Map<string, AcademicSourceFullText | null>()
  const reviewedScreenings = new Map<AcademicWorkId, CandidateScreeningDetails>()
  const attemptedReviews = new Set<AcademicWorkId>()
  let initialReviewComplete = false
  const reviewStates = new Map<AcademicWorkId, CandidateSemanticReviewStateV1>()
  if (!Number.isSafeInteger(reviewExecution.concurrency) || reviewExecution.concurrency < 1 || reviewExecution.concurrency > 2) {
    throw new RangeError('Candidate review concurrency must be 1 or 2.')
  }
  const key = (provider: string, recordId: string) => JSON.stringify([provider, recordId])
  const reviewIngested = async (plan: HybridSearchPlan, ingested: IngestOutcome, signal?: AbortSignal,
    onCandidateReview?: (observation: CandidateReviewProgressObservation) => void, roundIndex = 0,
    questions?: readonly string[], scheduled: readonly WorkVersionId[] = [],
    maximumReviews = candidateBatchPolicy.initialBatchSize) => {
    if (reviewCandidate === undefined) return
    // Rank the full pool with the existing lexical assessment first. The final ranking is
    // rebuilt after the bounded model review, so review evidence can still change priorities.
    const lexical = buildRanking(approvedBrief, plan, ingested, resolutions, academicSource, key,
      candidateScreening, reviewedScreenings, reviewStates)
    const worksByVersion = new Map(ingested.works.map(work => [work.canonicalVersionId, work]))
    const versions = new Map(ingested.versions.map(version => [version.workVersionId, version]))
    const skippedVersions = new Set(scheduled)
    const eligibleRanking = { ...lexical.ranking,
      evaluations: lexical.ranking.evaluations.filter(item => !skippedVersions.has(item.workVersionId)),
    }
    const reserve = roundIndex < 2 && plan.maximumSearchRounds > 1 ? reviewExecution.gapReserve ?? 0 : 0
    const selection = selectCandidateReviews(approvedBrief, plan, eligibleRanking, lexical.assessments,
      attemptedReviews, maximumModelReviews, {
        maximumReviews: Math.min(maximumReviews, Math.max(0, maximumModelReviews - attemptedReviews.size - reserve)),
        ...(questions === undefined ? {} : { questions }),
      })
    signal?.throwIfAborted()
    const selectionSeq = await reviewExecution.recordSelection?.(selection, roundIndex)
    signal?.throwIfAborted()
    for (const decision of selection.decisions) {
      if (decision.status === 'already_attempted') continue
      reviewStates.set(decision.academicWorkId, { status: 'not_selected',
        reason: decision.status === 'selected' ? 'cancelled_before_dispatch' : decision.status })
    }
    // B guarantees a numeric order for every selected decision.
    const selected = selection.decisions.filter(item => item.status === 'selected')
      .sort((a, b) => (a.selectionOrder as number) - (b.selectionOrder as number))
    const skipped = selection.decisions.filter(item => item.status === 'not_selected_budget').length
    let completed = 0, succeeded = 0, failed = 0
    const report = (phase: CandidateReviewProgressObservation['phase'], title: string | null) => {
      try {
        onCandidateReview?.({ phase, completed, total: selected.length, succeeded, failed, skipped, title })
      } catch {
        // Progress callbacks are observational; they cannot interrupt review settlement.
      }
    }
    report('planned', null)
    const outcomes = new Map<AcademicWorkId, CandidateReviewOutcome>()
    const queue = selected.values()
    let stopped = false
    const worker = async () => {
      try {
        while (!stopped) {
          signal?.throwIfAborted()
          const next = queue.next()
          if (next.done) return
          const decision = next.value
          const work = worksByVersion.get(decision.workVersionId)
          const version = versions.get(decision.workVersionId)
          if (work === undefined || version === undefined) throw new Error('Candidate review requires canonical metadata.')
          const metadata = metadataForVersion(ingested.index, version)
          report('started', work.title)
          let outcome: CandidateReviewOutcome
          try {
            outcome = await reviewCandidate({ academicWorkId: work.academicWorkId,
              workVersionId: version.workVersionId, roundIndex, title: work.title, abstract: metadata.abstract,
              brief: approvedBrief, plan, ...selectionSeq === undefined ? {} : { selectionSeq },
              onDispatch: () => attemptedReviews.add(work.academicWorkId) }, signal)
          } catch (error: unknown) {
            if (signal?.aborted && attemptedReviews.has(work.academicWorkId)) {
              outcomes.set(work.academicWorkId, { status: 'failed', code: 'CANDIDATE_REVIEW_CANCELLED' })
            }
            throw error
          }
          outcomes.set(work.academicWorkId, outcome)
          completed++
          if (outcome.status === 'validated') succeeded++
          else failed++
          report('settled', null)
        }
      } catch (error: unknown) {
        stopped = true
        throw error
      }
    }
    // Drain every in-flight worker before returning, including after cancellation or log failure.
    const workers = await Promise.allSettled(Array.from({ length: Math.min(reviewExecution.concurrency, selected.length) }, worker))
    for (const decision of selected) {
      const id = decision.academicWorkId
      const outcome = outcomes.get(id)
      if (outcome === undefined) continue
      if (outcome.status === 'validated') {
        reviewedScreenings.set(id, outcome.screening)
        const scope = outcome.screening.scope.status
        reviewStates.set(id, scope === 'unknown' ? { status: 'unknown' } : { status: 'validated', scope })
      } else reviewStates.set(id, { status: 'failed', code: outcome.code })
    }
    const rejected = workers.find(worker => worker.status === 'rejected')
    if (rejected?.status === 'rejected') throw rejected.reason
  }
  return {
    reviewCandidates: async (scheduling, ingested, coverage, scheduled, signal) => {
      const questions = coverage.questions.filter(item => item.status !== 'covered').map(item => item.question)
      const roundIndex = Math.max(...scheduling.plan.queries.map(query => query.roundIndex))
      await reviewIngested(scheduling.plan, ingested, signal, undefined, roundIndex, questions, scheduled,
        candidateBatchPolicy.replenishmentBatchSize)
      return rankedPaperSelection(approvedBrief, approvedBrief, scheduling.plan, ingested,
        resolutions, academicSource, key, candidateBatchPolicy, candidateScreening, reviewedScreenings, reviewStates)
    },
    search: async (request, signal, onProvider, onHybrid) => {
      const directionIndex = searches.findIndex(search => search.query === request.query)
      const approvedSearch = searches[directionIndex]
      if (directionIndex < 0 || approvedSearch === undefined) {
        throw new Error('Search expression is not in the approved plan.')
      }
      const result = await executeApprovedSearchDirection(handoff, directionIndex,
        Math.max(initialAcademicResultsPerQuery ?? 0,
          request.maxResults ?? approvedBrief.stopConditions.maximumCandidateWorks),
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
    selectPapers: async (ingested, effectiveBrief, signal, onCandidateReview) => {
      if (!initialReviewComplete) {
        await reviewIngested(handoff.plan, ingested, signal, onCandidateReview)
        initialReviewComplete = true
      }
      return rankedPaperSelection(approvedBrief, effectiveBrief, handoff.plan,
        ingested, resolutions, academicSource, key, candidateBatchPolicy, candidateScreening, reviewedScreenings,
        reviewStates)
    },
    replenishCandidates: (scheduling, ingested, coverage, nextRoundIndex, signal) =>
      replenishRankedCandidates(approvedBrief, candidateBatchPolicy, gapRoundPolicy, academicSource, web,
        resolutions, key, scheduling, ingested, coverage, nextRoundIndex, candidateScreening,
        reviewIngested, reviewedScreenings, reviewStates, signal),
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
  candidateScreening?: AcademicCandidateScreening,
  reviewedScreenings?: ReadonlyMap<AcademicWorkId, CandidateScreeningDetails>,
  reviewStates?: ReadonlyMap<AcademicWorkId, CandidateSemanticReviewStateV1>,
): ReturnType<DraftPipelineAdapters['selectPapers']> {
  const built = buildRanking(approvedBrief, plan, ingested, resolutions, academicSource, key,
    candidateScreening, reviewedScreenings, reviewStates)
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

/** Build trusted metadata assessments and a Q4 ranking for one deduplicated ingestion outcome. */
function buildRanking(
  approvedBrief: ExecutableResearchBrief,
  plan: HybridSearchPlan,
  ingested: IngestOutcome,
  resolutions: ReadonlyMap<string, AcademicSourceFullText | null>,
  academicSource: AcademicSourceRuntime,
  key: (provider: string, recordId: string) => string,
  candidateScreening?: AcademicCandidateScreening,
  reviewedScreenings?: ReadonlyMap<AcademicWorkId, CandidateScreeningDetails>,
  reviewStates?: ReadonlyMap<AcademicWorkId, CandidateSemanticReviewStateV1>,
): {
  readonly assessments: readonly CandidateAssessment[]
  readonly ranking: AcademicCandidateRankingResult
  readonly papers: ReadonlyMap<string, SelectedPaper> } {
  const versions = new Map(ingested.versions.map(version => [version.workVersionId, version]))
  const discoveredBy = ingested.works.map((work) => {
    const records = ingested.index.records.get(work.academicWorkId)
    /* v8 ignore next -- ingestWorks creates one records entry for every reconciled work in the same outcome. */
    if (records === undefined) throw new Error('Ingested work has no source records.')
    return { academicWorkId: work.academicWorkId,
      searchQueryIds: [...new Set(records.flatMap(record => record.discoveredBy ?? []))] }
  })
  const queryIdsByWork = new Map(discoveredBy.map(item => [item.academicWorkId, item.searchQueryIds]))
  const papers = new Map<string, SelectedPaper>()
  const fulltextFacts = new Map<WorkVersionId, CandidateFulltextAvailability>()
  for (const work of ingested.works) {
    const version = versions.get(work.canonicalVersionId)
    /* v8 ignore next -- ingestWorks reconciles every canonicalVersionId into the versions collection returned beside the work. */
    if (version === undefined) throw new Error('Ranked candidate requires its canonical version.')
    const resolved = resolveFullText(version, resolutions, academicSource, key)
    const queryIds = queryIdsByWork.get(work.academicWorkId)
    /* v8 ignore next -- The query map is built from the same ingested.works iteration immediately above. */
    if (queryIds === undefined) throw new Error('Ranked candidate requires query provenance.')
    const sourceProviders = [...new Set(version.sourceRecords.map(record => record.provider))]
    papers.set(version.workVersionId, {
      workVersionId: version.workVersionId,
      urls: resolved?.urls ?? [],
      sourceProvider: resolved?.sourceProvider ?? sourceProviders[0] ?? 'unknown',
      extractionMethod: { method: 'dsh-academic-evidence', methodVersion: '1' },
      hasHistoricalEvidence: false,
    })
    fulltextFacts.set(version.workVersionId, resolved === null
      ? { status: 'unresolved', reason: 'No configured Academic provider returned a full-text candidate.' }
      : { status: 'resolvable' })
  }
  const round: PlannedSearchRoundResult = { ingested, discoveredBy, queries: [] }
  const assessments = assessPlannedCandidates(plan, approvedBrief, round,
    approvedCandidateScreeningCriteria(approvedBrief, plan, candidateScreening), fulltextFacts, reviewedScreenings)
    .map((assessment) => {
      const semanticReview = reviewStates?.get(assessment.academicWorkId)
      if (semanticReview === undefined) return assessment
      const reason = semanticReview.status === 'failed'
        ? 'Semantic model review failed; lexical metadata screening was retained. See the Session semantic-review result.'
        : semanticReview.status === 'not_selected' && semanticReview.reason === 'not_selected_budget'
          ? 'Bounded semantic model review did not cover this work; lexical scholarly metadata screening was retained.' : null
      const reasons: [string, ...string[]] = [assessment.reasons[0], ...assessment.reasons.slice(1),
        ...reason === null ? [] : [reason]]
      return { ...assessment, semanticReview, reasons }
    })
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
  candidateScreening?: AcademicCandidateScreening,
  reviewIngested?: (plan: HybridSearchPlan, ingested: IngestOutcome, signal?: AbortSignal,
    onCandidateReview?: (observation: CandidateReviewProgressObservation) => void, roundIndex?: number,
    questions?: readonly string[], scheduled?: readonly WorkVersionId[]) => Promise<void>,
  reviewedScreenings?: ReadonlyMap<AcademicWorkId, CandidateScreeningDetails>,
  reviewStates?: ReadonlyMap<AcademicWorkId, CandidateSemanticReviewStateV1>,
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
  // query settlement, discovery-query associations, and ingestion for both the approved and replenishment rounds.
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
  await reviewIngested?.(plan, mergedIngested, signal, undefined, nextRoundIndex,
    coverage.questions.filter(item => item.status !== 'covered').map(item => item.question),
    ingested.works.map(work => work.canonicalVersionId))
  const previousWorkIds = new Set(ingested.index.records.keys())
  const versionWorks = new Map(mergedIngested.versions.map(version => [version.workVersionId, version.academicWorkId]))
  const built = buildRanking(approvedBrief, plan, mergedIngested, resolutions, academicSource, key,
    candidateScreening, reviewedScreenings, reviewStates)
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
