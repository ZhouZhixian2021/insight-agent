/** Bridge reviewed Session searches to the provider-neutral Academic retrieval plan. */
import {
  ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
  createSearchQueryId,
  isExecutableResearchBrief,
  targetIncludedWorks,
  type HybridSearchPlan,
  type HybridSearchQuery,
  type ResearchBrief,
  type SearchQueryId,
} from '@deepseek-ai/dsh-academic-model'
import {
  executePlannedSearchRound,
  type PlannedSearchAdapters,
  type PlannedSearchLimits,
  type PlannedSearchProgressObserver,
  type PlannedSearchRoundResult,
} from '@deepseek-ai/dsh-academic-retrieval'
import type { AcademicPlannedSearch } from './types.ts'

/** Reviewed per-direction policy that is not carried by a channel-specific query record. */
export interface ApprovedSearchDirectionPolicy {
  /** Zero-based position in the reviewed Session search plan. */
  readonly directionIndex: number
  /** Channel-specific Q3 query identities generated for this reviewed direction. */
  readonly searchQueryIds: readonly SearchQueryId[]
  readonly verificationProviders: readonly string[]
  readonly maximumReferenceVerificationsPerQuery: number
}

/** Transitional Q2/Q3 handoff; Q5 will persist the plan and add ranked candidate scheduling. */
export interface ApprovedHybridSearchHandoff {
  readonly plan: HybridSearchPlan
  readonly directions: readonly ApprovedSearchDirectionPolicy[]
}

/**
 * Convert the exact user-reviewed Session searches into channel-specific query records.
 *
 * This bridge deliberately does not call the query generator: approval already happened, so
 * regenerating expressions from the topic could execute text that the user never reviewed.
 * @param brief Approved ResearchBrief owning the searches and resource bounds.
 * @param searches Exact version-3 search directions recovered from the same approved plan.
 * @returns A transient Q2/Q3 handoff. Q5 must persist it before relying on IDs across restarts.
 * @throws {RangeError} The Brief, search bounds, or explicit retrieval policy is incompatible.
 */
export function approvedHybridSearchHandoff(
  brief: ResearchBrief,
  searches: readonly AcademicPlannedSearch[],
): ApprovedHybridSearchHandoff {
  if (!isExecutableResearchBrief(brief)) throw new RangeError('ResearchBrief must approve its current version.')
  if (searches.length === 0) throw new RangeError('The approved search plan must contain at least one search.')
  const minimum = brief.evidenceRequirements.minimumIncludedWorks
  const target = targetIncludedWorks(brief)
  const maximum = brief.stopConditions.maximumIncludedWorks
  if (minimum > target || target > maximum || target > brief.stopConditions.maximumCandidateWorks) {
    throw new RangeError('The included-work counts must satisfy minimum <= target <= maximum and target <= candidate maximum.')
  }
  const queries: HybridSearchQuery[] = []
  const directions: ApprovedSearchDirectionPolicy[] = []
  for (const [offset, search] of searches.entries()) {
    const retrieval = search.retrieval
    if (retrieval === undefined) {
      throw new RangeError('Legacy searches without an explicit retrieval policy must use the legacy search adapter.')
    }
    // Every user-reviewed direction belongs to the initial retrieval round. Later round
    // indexes are reserved for evidence-gap replenishment after evidence has been assessed.
    const roundIndex = 1
    const searchQueryIds: SearchQueryId[] = []
    if (retrieval.channels.includes('academic')) {
      const searchQueryId = createSearchQueryId()
      searchQueryIds.push(searchQueryId)
      queries.push({ kind: 'academic', searchQueryId, expression: search.query,
        purpose: 'core', questions: [...search.questions], roundIndex,
        providers: [...retrieval.academicProviders] })
    }
    if (retrieval.channels.includes('web_discovery')) {
      const searchQueryId = createSearchQueryId()
      searchQueryIds.push(searchQueryId)
      queries.push({ kind: 'web_discovery', searchQueryId, expression: search.query,
        purpose: 'core', questions: [...search.questions], roundIndex,
        maximumResults: retrieval.maximumWebDiscoveryResults })
    }
    directions.push({ directionIndex: offset, searchQueryIds,
      verificationProviders: [...retrieval.verificationProviders],
      maximumReferenceVerificationsPerQuery: retrieval.maximumReferenceVerifications })
  }
  return {
    plan: {
      schemaVersion: 1,
      researchBriefId: brief.researchBriefId,
      researchBriefVersion: brief.version,
      constraints: {
        publicationWindow: brief.publicationWindow,
        includedWorkTypes: [...brief.includedWorkTypes],
        inclusionRules: [...brief.inclusionRules],
        exclusionRules: [...brief.exclusionRules],
        requiredTerms: [],
        excludedTerms: [],
      },
      inclusionTargets: { minimum, target, maximum },
      rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
      queries,
      citationExpansionSeeds: [],
      maximumSearchRounds: brief.stopConditions.maximumSearchRounds,
    },
    directions,
  }
}

/**
 * Execute one reviewed search direction within the initial Q3 retrieval round.
 * @param handoff Transient plan and per-direction policies produced from one approved Session plan.
 * @param directionIndex Zero-based approved search direction to execute.
 * @param maximumAcademicResultsPerQuery Current scheduler-owned direct-search result bound.
 * @param adapters Session-owned Academic source and Web operations.
 * @param signal Caller cancellation propagated through the retrieval package.
 * @param onProgress Optional observer forwarded to the Q3 round executor.
 * @returns Verified, ingested candidates and per-query settlement facts.
 */
export function executeApprovedSearchDirection(
  handoff: ApprovedHybridSearchHandoff,
  directionIndex: number,
  maximumAcademicResultsPerQuery: number,
  adapters: PlannedSearchAdapters,
  signal?: AbortSignal,
  onProgress?: PlannedSearchProgressObserver,
): Promise<PlannedSearchRoundResult> {
  const policy = handoff.directions.find(direction => direction.directionIndex === directionIndex)
  if (policy === undefined) throw new RangeError('directionIndex is not present in the approved Session search plan.')
  const queryIds = new Set(policy.searchQueryIds)
  const queries = handoff.plan.queries.filter(query => queryIds.has(query.searchQueryId))
  const scopedPlan = { ...handoff.plan, queries }
  const hasWebQuery = queries.some(query => query.kind !== 'academic')
  const limits: PlannedSearchLimits = {
    maximumAcademicResultsPerQuery,
    // Q3 validates this field as positive even when a round has no Web query. A value of one
    // cannot authorize verification in an Academic-only round because no Web operation exists.
    maximumReferenceVerificationsPerQuery: hasWebQuery
      ? policy.maximumReferenceVerificationsPerQuery : Math.max(1, policy.maximumReferenceVerificationsPerQuery),
    verificationProviders: policy.verificationProviders,
  }
  return executePlannedSearchRound(scopedPlan, 1, limits, adapters, signal, onProgress)
}
