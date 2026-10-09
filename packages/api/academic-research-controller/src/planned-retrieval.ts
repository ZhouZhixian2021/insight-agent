/** Bridge reviewed Session searches to the provider-neutral Academic retrieval plan. */
import {
  ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
  createSearchQueryId,
  isExecutableResearchBrief,
  type HybridSearchPlan,
  type HybridSearchQuery,
  type ResearchBrief,
} from '@deepseek-ai/dsh-academic-model'
import {
  executePlannedSearchRound,
  type PlannedSearchAdapters,
  type PlannedSearchLimits,
  type PlannedSearchRoundResult,
} from '@deepseek-ai/dsh-academic-retrieval'
import type { AcademicPlannedSearch } from './types.ts'

/** Reviewed per-round policy that is not carried by a channel-specific query record. */
export interface ApprovedSearchRoundPolicy {
  readonly roundIndex: number
  readonly verificationProviders: readonly string[]
  readonly maximumReferenceVerificationsPerQuery: number
}

/** Transitional Q2/Q3 handoff; Q5 will persist the plan and add ranked candidate scheduling. */
export interface ApprovedHybridSearchHandoff {
  readonly plan: HybridSearchPlan
  readonly rounds: readonly ApprovedSearchRoundPolicy[]
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
  if (searches.length > brief.stopConditions.maximumSearchRounds) {
    throw new RangeError('The approved search plan exceeds the ResearchBrief search-round limit.')
  }
  const minimum = brief.evidenceRequirements.minimumIncludedWorks
  const maximum = brief.stopConditions.maximumIncludedWorks
  if (minimum > maximum) {
    throw new RangeError('The minimum included-work requirement exceeds the maximum included-work limit.')
  }
  const queries: HybridSearchQuery[] = []
  const rounds: ApprovedSearchRoundPolicy[] = []
  for (const [offset, search] of searches.entries()) {
    const retrieval = search.retrieval
    if (retrieval === undefined) {
      throw new RangeError('Legacy searches without an explicit retrieval policy must use the legacy search adapter.')
    }
    const roundIndex = offset + 1
    if (retrieval.channels.includes('academic')) {
      queries.push({ kind: 'academic', searchQueryId: createSearchQueryId(), expression: search.query,
        purpose: 'core', questions: [...search.questions], roundIndex,
        providers: [...retrieval.academicProviders] })
    }
    if (retrieval.channels.includes('web_discovery')) {
      queries.push({ kind: 'web_discovery', searchQueryId: createSearchQueryId(), expression: search.query,
        purpose: 'core', questions: [...search.questions], roundIndex,
        maximumResults: retrieval.maximumWebDiscoveryResults })
    }
    rounds.push({ roundIndex, verificationProviders: [...retrieval.verificationProviders],
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
      // The current reviewed Brief has a minimum and a hard ceiling, but no separate desired count.
      // Until the plan schema adds one, the reviewed ceiling is also the desired target.
      inclusionTargets: { minimum, target: maximum, maximum },
      rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
      queries,
      citationExpansionSeeds: [],
      maximumSearchRounds: brief.stopConditions.maximumSearchRounds,
    },
    rounds,
  }
}

/**
 * Execute one reviewed bridge round through B's Q3 retrieval boundary.
 * @param handoff Transient plan and per-round policies produced from one approved Session plan.
 * @param roundIndex One-based approved search direction to execute.
 * @param maximumAcademicResultsPerQuery Current scheduler-owned direct-search result bound.
 * @param adapters Session-owned Academic source and Web operations.
 * @param signal Caller cancellation propagated through the retrieval package.
 * @returns Verified, ingested candidates and per-query settlement facts.
 */
export function executeApprovedSearchRound(
  handoff: ApprovedHybridSearchHandoff,
  roundIndex: number,
  maximumAcademicResultsPerQuery: number,
  adapters: PlannedSearchAdapters,
  signal?: AbortSignal,
): Promise<PlannedSearchRoundResult> {
  const policy = handoff.rounds.find(round => round.roundIndex === roundIndex)
  if (policy === undefined) throw new RangeError('roundIndex is not present in the approved Session search plan.')
  const hasWebQuery = handoff.plan.queries.some(query => query.roundIndex === roundIndex && query.kind !== 'academic')
  const limits: PlannedSearchLimits = {
    maximumAcademicResultsPerQuery,
    // Q3 validates this field as positive even when a round has no Web query. A value of one
    // cannot authorize verification in an Academic-only round because no Web operation exists.
    maximumReferenceVerificationsPerQuery: hasWebQuery
      ? policy.maximumReferenceVerificationsPerQuery : Math.max(1, policy.maximumReferenceVerificationsPerQuery),
    verificationProviders: policy.verificationProviders,
  }
  return executePlannedSearchRound(handoff.plan, roundIndex, limits, adapters, signal)
}
