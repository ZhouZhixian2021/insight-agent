/** Provider-neutral contracts for planned queries, candidate ranking, coverage, and bounded search rounds. */
import type {
  AcademicWorkId,
  EvidenceId,
  ExecutableResearchBrief,
  PublicationWindow,
  ResearchBriefId,
  RetrievalRunId,
  SearchQueryId,
  WorkVersionId,
} from './types.ts'

/** Why a bounded search round or query exists. */
export type SearchRoundPurpose =
  | 'core'
  | 'synonym_expansion'
  | 'site_restricted'
  | 'citation_expansion'
  | 'evidence_gap'

/** Fields shared by every provider-neutral planned query. */
export interface SearchQueryBase {
  readonly searchQueryId: SearchQueryId
  readonly expression: string
  readonly purpose: SearchRoundPurpose
  /** Exact questions from the bound ResearchBrief version. */
  readonly questions: readonly string[]
  /** One-based planned round. */
  readonly roundIndex: number
}

/** Query sent to one or more direct scholarly providers. */
export interface AcademicSearchQuery extends SearchQueryBase {
  readonly kind: 'academic'
  readonly providers: readonly string[]
}

/** General Web query used only to discover scholarly candidates. */
export interface WebDiscoveryQuery extends SearchQueryBase {
  readonly kind: 'web_discovery'
  readonly maximumResults: number
}

/** Web query constrained to one user-reviewed hostname. */
export interface SiteRestrictedQuery extends SearchQueryBase {
  readonly kind: 'site_restricted'
  readonly siteHost: string
  readonly maximumResults: number
}

/** One verified work selected as a seed for references, citations, or related-work discovery. */
export interface CitationExpansionSeed {
  readonly academicWorkId: AcademicWorkId
  readonly workVersionId: WorkVersionId
  readonly direction: 'references' | 'citations' | 'related'
  readonly purpose: SearchRoundPurpose
  readonly questions: readonly string[]
  readonly roundIndex: number
  readonly maximumResults: number
}

/** Query variants produced by the planner; citation expansion uses its separate verified seed type. */
export type HybridSearchQuery = AcademicSearchQuery | WebDiscoveryQuery | SiteRestrictedQuery

/** ResearchBrief constraints normalized for query generation and hard filtering. */
export interface HybridSearchConstraints {
  readonly publicationWindow: PublicationWindow
  readonly includedWorkTypes: readonly string[]
  readonly inclusionRules: readonly string[]
  readonly exclusionRules: readonly string[]
  /** Planner-derived lexical requirements; empty means no lexical requirement was approved. */
  readonly requiredTerms: readonly string[]
  /** Planner-derived lexical exclusions; empty means no lexical exclusion was approved. */
  readonly excludedTerms: readonly string[]
}

/** Minimum delivery floor, desired target, and absolute inclusion ceiling. */
export interface InclusionTargets {
  readonly minimum: number
  readonly target: number
  readonly maximum: number
}

/** Stable score dimensions shared by B's ranker and C's explanation UI. */
export interface CandidateScoreValues {
  readonly topicRelevance: number
  readonly questionMatch: number
  readonly evidencePotential: number
  readonly methodMatch: number
  readonly workTypeFit: number
  readonly sourceQuality: number
  readonly recency: number
  readonly fulltextAvailability: number
}

/** Configurable weights whose sum defines the candidate score scale. */
export type CandidateScoreWeights = CandidateScoreValues

/** Inclusive lower bounds for each non-excluded priority. */
export interface CandidatePriorityThresholds {
  readonly p0: number
  readonly p1: number
  readonly p2: number
}

/** Shared, explainable ranking policy; implementations must not hide another final-score rule. */
export interface CandidateRankingPolicy {
  readonly schemaVersion: 1
  readonly weights: CandidateScoreWeights
  readonly thresholds: CandidatePriorityThresholds
}

/** First-version policy centralized for callers that do not provide an approved override. */
export const ACADEMIC_CANDIDATE_RANKING_POLICY_V1: CandidateRankingPolicy = {
  schemaVersion: 1,
  weights: {
    topicRelevance: 30,
    questionMatch: 20,
    evidencePotential: 15,
    methodMatch: 10,
    workTypeFit: 8,
    sourceQuality: 7,
    recency: 5,
    fulltextAvailability: 5,
  },
  thresholds: { p0: 80, p1: 65, p2: 50 },
}

/** Weighted points and their producer-computed total for one candidate. */
export interface CandidateScoreBreakdown extends CandidateScoreValues {
  readonly total: number
}

/** Stable candidate category used for ranking explanations and diversity selection. */
export type CandidateClassification =
  | 'core_method'
  | 'empirical_evaluation'
  | 'benchmark_or_dataset'
  | 'review'
  | 'application'
  | 'adjacent_technology'
  | 'background'
  | 'irrelevant'

/** Queue priority after hard filtering and explainable scoring. */
export type CandidatePriority = 'p0' | 'p1' | 'p2' | 'excluded'

/** Result of date, work-type, retraction, and explicit inclusion/exclusion checks. */
export type CandidateHardFilterResult =
  | { readonly status: 'eligible'; readonly reasons: readonly string[] }
  | { readonly status: 'excluded'; readonly reasons: readonly [string, ...string[]] }

/** B-owned candidate evaluation returned through A's shared contract. */
export interface AcademicCandidateEvaluation {
  readonly schemaVersion: 1
  readonly academicWorkId: AcademicWorkId
  readonly workVersionId: WorkVersionId
  readonly discoveredBy: readonly SearchQueryId[]
  readonly classification: CandidateClassification
  readonly hardFilter: CandidateHardFilterResult
  readonly score: CandidateScoreBreakdown
  readonly priority: CandidatePriority
  readonly matchedQuestions: readonly string[]
  readonly diversityTags: readonly string[]
  readonly decisionReasons: readonly [string, ...string[]]
}

/** Coverage state for one exact question in the bound ResearchBrief version. */
export interface ResearchQuestionCoverage {
  readonly question: string
  readonly status: 'uncovered' | 'partial' | 'covered'
  readonly supportingWorkIds: readonly AcademicWorkId[]
  readonly evidenceIds: readonly EvidenceId[]
  /** Specific missing evidence that may justify a later evidence-gap query. */
  readonly gaps: readonly string[]
}

/** Question-level evidence coverage used to decide whether another batch or search round is justified. */
export interface ResearchQuestionCoverageResult {
  readonly schemaVersion: 1
  readonly researchBriefId: ResearchBriefId
  readonly researchBriefVersion: number
  readonly assessedAt: string
  readonly questions: readonly ResearchQuestionCoverage[]
  readonly evidenceRequirementsMet: boolean
  readonly allQuestionsCovered: boolean
}

/** Inputs owned by A and passed to B's query planner. */
export interface HybridSearchPlanningInput {
  readonly brief: ExecutableResearchBrief
  readonly inclusionTargets: InclusionTargets
  readonly requestedSiteHosts: readonly string[]
  readonly rankingPolicy: CandidateRankingPolicy
}

/** Reviewed, provider-neutral plan returned by B's query planner. */
export interface HybridSearchPlan {
  readonly schemaVersion: 1
  readonly researchBriefId: ResearchBriefId
  readonly researchBriefVersion: number
  readonly constraints: HybridSearchConstraints
  readonly inclusionTargets: InclusionTargets
  readonly rankingPolicy: CandidateRankingPolicy
  readonly queries: readonly HybridSearchQuery[]
  readonly citationExpansionSeeds: readonly CitationExpansionSeed[]
  readonly maximumSearchRounds: number
}

/** Planner result keeps non-blocking limitations separate from the executable plan. */
export interface HybridSearchPlanningOutput {
  readonly plan: HybridSearchPlan
  readonly warnings: readonly string[]
}

/** Settlement of one planned search round. */
export interface HybridSearchRound {
  readonly roundIndex: number
  readonly purpose: SearchRoundPurpose
  readonly searchQueryIds: readonly SearchQueryId[]
  readonly status: 'planned' | 'running' | 'success' | 'partial_success' | 'failed' | 'cancelled'
  readonly startedAt: string | null
  readonly completedAt: string | null
}

/** Terminal reason for bounded candidate acquisition and evidence-gap replenishment. */
export type SearchStopReason =
  | 'target_and_coverage_met'
  | 'saturated'
  | 'candidate_exhausted'
  | 'maximum_search_rounds'
  | 'maximum_candidate_works'
  | 'maximum_included_works'
  | 'maximum_elapsed_time'
  | 'cancelled'
  | 'review_required'

/** Explicit continue/stop result; a continuing run cannot carry a terminal reason. */
export type SearchStopDecision =
  | { readonly shouldStop: false; readonly reason: null; readonly details: readonly string[] }
  | { readonly shouldStop: true; readonly reason: SearchStopReason; readonly details: readonly string[] }

/** Absolute observed funnel counts for query planning and candidate processing. */
export interface CandidateFunnelCounts {
  readonly discoveredRecords: number
  readonly verifiedWorks: number
  readonly deduplicatedWorks: number
  readonly eligibleWorks: number
  readonly p0Works: number
  readonly p1Works: number
  readonly p2Works: number
  readonly excludedWorks: number
  readonly scheduledFulltextWorks: number
  readonly includedWorks: number
}

/** Absolute question coverage counts carried by progress events. */
export interface QuestionCoverageCounts {
  readonly total: number
  readonly covered: number
  readonly partial: number
  readonly uncovered: number
}

/** Stable phases for the new query-planning and candidate-ranking workflow. */
export type QueryWorkflowPhase =
  | 'query_planning'
  | 'retrieval'
  | 'deduplication'
  | 'hard_filtering'
  | 'candidate_classification'
  | 'candidate_ranking'
  | 'fulltext_batch'
  | 'coverage_assessment'
  | 'gap_search'
  | 'settlement'

/** Draft event contract for Q6; fields are observed facts and never an estimated percentage. */
export interface QueryWorkflowProgressEvent {
  readonly schemaVersion: 1
  readonly retrievalRunId: RetrievalRunId
  readonly sequence: number
  readonly occurredAt: string
  readonly phase: QueryWorkflowPhase
  readonly status: 'pending' | 'running' | 'partial_success' | 'success' | 'failed' | 'cancelled' | 'not_run'
  readonly roundIndex: number | null
  readonly searchQueryId: SearchQueryId | null
  readonly batchIndex: number | null
  readonly batchCount: number | null
  readonly academicWorkId: AcademicWorkId | null
  readonly candidateCounts: CandidateFunnelCounts
  readonly questionCoverage: QuestionCoverageCounts
  readonly stopReason: SearchStopReason | null
}

/**
 * Validates and copies the minimum, desired, and absolute work counts.
 * @param input - Caller-approved work-count targets.
 * @returns A copied target triple satisfying minimum <= target <= maximum.
 * @throws {RangeError} A count is invalid or the ordering is inconsistent.
 */
export function createInclusionTargets(input: InclusionTargets): InclusionTargets {
  for (const [field, value] of Object.entries(input)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${field} must be a non-negative safe integer`)
  }
  if (input.target === 0 || input.maximum === 0) throw new RangeError('target and maximum must be positive')
  if (input.minimum > input.target || input.target > input.maximum) {
    throw new RangeError('inclusion targets must satisfy minimum <= target <= maximum')
  }
  return { ...input }
}

/**
 * Validates weighted candidate points and computes their total without hidden scoring.
 * @param values - Weighted points for every shared scoring dimension.
 * @param policy - Approved weights defining each component's maximum.
 * @returns A copied breakdown with the arithmetic total.
 * @throws {RangeError} A point value is invalid or exceeds its approved weight.
 */
export function createCandidateScoreBreakdown(
  values: CandidateScoreValues,
  policy: CandidateRankingPolicy,
): CandidateScoreBreakdown {
  validateRankingPolicy(policy)
  let total = 0
  for (const key of candidateScoreKeys) {
    const value = values[key]
    if (!Number.isFinite(value) || value < 0 || value > policy.weights[key]) {
      throw new RangeError(`${key} must be between 0 and its approved weight`)
    }
    total += value
  }
  return { ...values, total }
}

/**
 * Maps one validated score and hard-filter result to the shared P0/P1/P2 queues.
 * @param score - Weighted score on the policy's complete scale.
 * @param hardExcluded - Whether deterministic eligibility rules rejected the work.
 * @param policy - Approved priority thresholds.
 * @returns P0, P1, P2, or excluded.
 * @throws {RangeError} The score or policy is invalid.
 */
export function candidatePriorityForScore(
  score: number,
  hardExcluded: boolean,
  policy: CandidateRankingPolicy,
): CandidatePriority {
  validateRankingPolicy(policy)
  const maximum = candidateScoreKeys.reduce((total, key) => total + policy.weights[key], 0)
  if (!Number.isFinite(score) || score < 0 || score > maximum) {
    throw new RangeError(`score must be between 0 and ${maximum}`)
  }
  if (hardExcluded || score < policy.thresholds.p2) return 'excluded'
  if (score >= policy.thresholds.p0) return 'p0'
  if (score >= policy.thresholds.p1) return 'p1'
  return 'p2'
}

const candidateScoreKeys = [
  'topicRelevance',
  'questionMatch',
  'evidencePotential',
  'methodMatch',
  'workTypeFit',
  'sourceQuality',
  'recency',
  'fulltextAvailability',
] as const

function validateRankingPolicy(policy: CandidateRankingPolicy): void {
  const total = candidateScoreKeys.reduce((sum, key) => {
    const value = policy.weights[key]
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${key} weight must be non-negative`)
    return sum + value
  }, 0)
  if (total !== 100) throw new RangeError('candidate ranking weights must sum to 100')
  const { p0, p1, p2 } = policy.thresholds
  if (![p0, p1, p2].every(value => Number.isFinite(value) && value >= 0 && value <= total)
    || p0 < p1 || p1 < p2) {
    throw new RangeError('candidate priority thresholds must satisfy 100 >= p0 >= p1 >= p2 >= 0')
  }
}
