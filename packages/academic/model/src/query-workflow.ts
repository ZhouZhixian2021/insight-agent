/** Provider-neutral contracts for planned queries, candidate ranking, coverage, and bounded search rounds. */
import type {
  AcademicWorkId,
  Availability,
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

/** Stable reason codes for deterministic candidate rejection and localized presentation. */
export type CandidateHardFilterReasonCode =
  | 'work_retracted'
  | 'version_retracted'
  | 'preprint_not_allowed'
  | 'work_type_not_included'
  | 'before_publication_window'
  | 'after_publication_window'
  | 'publication_date_unknown'
  | 'required_term_missing'
  | 'excluded_term_matched'
  | 'inclusion_rule_not_met'
  | 'exclusion_rule_matched'
  | 'off_topic'

/** One stable rejection code with optional reviewed detail for audit and presentation. */
export interface CandidateHardFilterReason {
  readonly code: CandidateHardFilterReasonCode
  readonly detail?: string
}

/** Current Controller-prepared full-text resolution fact; unresolved does not prove that no full text exists. */
export type CandidateFulltextAvailability =
  | { readonly status: 'resolvable' }
  | { readonly status: 'unresolved'; readonly reason: string }
  | { readonly status: 'unknown'; readonly reason: string }

/** Verbatim title or scholarly-provider abstract text; never a Web discovery snippet. */
export interface CandidateMetadataQuote {
  readonly source: 'title' | 'abstract'
  readonly text: string
}

/** Metadata-grounded indication, not a verified full-text finding. */
export type CandidateMetadataSignal =
  | {
    readonly kind: 'question'
    readonly question: string
    readonly quote: CandidateMetadataQuote
  }
  | {
    readonly kind: 'method' | 'evidence_type'
    readonly label: string
    readonly quote: CandidateMetadataQuote
  }
  | {
    readonly kind: 'contribution'
    readonly classification: Exclude<CandidateClassification, 'background' | 'irrelevant'>
    readonly quote: CandidateMetadataQuote
  }

/** A superficial term occurrence that does not by itself establish research-question relevance. */
export interface CandidateSurfaceKeywordHit {
  readonly term: string
  readonly source: 'title' | 'abstract' | 'keywords'
  readonly text: string
}

/** Plan-specific metadata judgment; unknown must not become a rejection. */
export type CandidateScopeDecision =
  | { readonly status: 'potentially_relevant'; readonly reason: string }
  | { readonly status: 'off_topic'; readonly reason: string; readonly quote: CandidateMetadataQuote }
  | { readonly status: 'unknown'; readonly reason: string }

/** Optional versioned detail for new assessments; absence means legacy screening did not supply it. */
export interface CandidateScreeningDetails {
  readonly schemaVersion: 1
  readonly signals: readonly CandidateMetadataSignal[]
  readonly surfaceKeywordHits: readonly CandidateSurfaceKeywordHit[]
  readonly uncertainties: readonly string[]
  readonly scope: CandidateScopeDecision
}

/** Reviewed semantic facts supplied for one verified work after Q3 ingestion. */
export interface CandidateAssessment {
  readonly academicWorkId: AcademicWorkId
  /** Trusted scholarly-provider abstract only; Web discovery snippets are never accepted here. */
  readonly abstract: Availability<string>
  /** Trusted scholarly-provider keywords only; unavailable values retain their explicit state. */
  readonly keywords: Availability<readonly string[]>
  readonly fulltextAvailability: CandidateFulltextAvailability
  /** Content-matched Brief questions only; approved query provenance is routed separately from Q3. */
  readonly matchedQuestions: readonly string[]
  readonly screening?: CandidateScreeningDetails
  readonly contributionSignals: readonly Exclude<CandidateClassification, 'background' | 'irrelevant'>[]
  /** Unit-interval assessments; the ranker applies the reviewed policy weights. */
  readonly topicRelevance: number
  readonly evidencePotential: number
  readonly methodMatch: number
  readonly sourceQuality: number
  readonly recency: number
  /** One decision per natural-language rule, in plan order; null defers it to full-text scope validation. */
  readonly inclusionRuleMatches: readonly (boolean | null)[]
  readonly exclusionRuleMatches: readonly (boolean | null)[]
  /** Reviewed method or topic labels used to diversify each priority queue. */
  readonly diversityTags: readonly string[]
  readonly reasons: readonly [string, ...string[]]
}

/** New B-produced assessments require structured metadata grounds; older Session records remain readable. */
export type DetailedCandidateAssessment = CandidateAssessment & { readonly screening: CandidateScreeningDetails }

/** Result of date, work-type, retraction, and reviewed lexical checks. */
export type CandidateHardFilterResult =
  | {
    readonly status: 'eligible'
    readonly reasons: readonly CandidateHardFilterReason[]
  }
  | {
    readonly status: 'excluded'
    readonly reasons: readonly [CandidateHardFilterReason, ...CandidateHardFilterReason[]]
  }

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
  readonly fulltextAvailability: CandidateFulltextAvailability
  readonly diversityTags: readonly string[]
  readonly decisionReasons: readonly [string, ...string[]]
}

/** Authoritative, ordered queues consumed by A's batch scheduler and C's explanation UI. */
export interface CandidatePriorityQueues {
  readonly p0: readonly WorkVersionId[]
  readonly p1: readonly WorkVersionId[]
  readonly p2: readonly WorkVersionId[]
  readonly excluded: readonly WorkVersionId[]
}

/** B-owned complete ranking result bound to one exact reviewed plan. */
export interface AcademicCandidateRankingResult {
  readonly schemaVersion: 1
  readonly researchBriefId: ResearchBriefId
  readonly researchBriefVersion: number
  readonly evaluations: readonly AcademicCandidateEvaluation[]
  readonly queues: CandidatePriorityQueues
  readonly limitations: readonly string[]
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

/**
 * Validates and copies one complete candidate-ranking result against its reviewed plan and questions.
 * @param result - Evaluations, ordered priority queues, and non-blocking limitations from B's ranker.
 * @param plan - Exact reviewed plan used to produce the result.
 * @param approvedQuestions - Exact questions from the plan-bound ResearchBrief version.
 * @returns A copied result with one correctly queued entry for every evaluation.
 * @throws {RangeError} Plan binding, scores, priorities, provenance, or queue membership are inconsistent.
 */
export function createCandidateRankingResult(
  result: AcademicCandidateRankingResult,
  plan: HybridSearchPlan,
  approvedQuestions: readonly string[],
): AcademicCandidateRankingResult {
  if (result.researchBriefId !== plan.researchBriefId
    || result.researchBriefVersion !== plan.researchBriefVersion) {
    throw new RangeError('candidate ranking result must target the reviewed plan')
  }
  const queryIds = new Set(plan.queries.map(query => query.searchQueryId))
  const questions = new Set(approvedQuestions)
  const evaluatedWorks = new Set<AcademicWorkId>()
  const evaluations = new Map<WorkVersionId, AcademicCandidateEvaluation>()
  for (const evaluation of result.evaluations) {
    if (evaluations.has(evaluation.workVersionId)) {
      throw new RangeError('candidate evaluations must contain distinct work versions')
    }
    if (evaluatedWorks.has(evaluation.academicWorkId)) {
      throw new RangeError('candidate evaluations must contain distinct works')
    }
    evaluatedWorks.add(evaluation.academicWorkId)
    if (evaluation.discoveredBy.length === 0
      || new Set(evaluation.discoveredBy).size !== evaluation.discoveredBy.length) {
      throw new RangeError('candidate provenance must contain distinct planned queries')
    }
    for (const queryId of evaluation.discoveredBy) {
      if (!queryIds.has(queryId)) throw new RangeError('candidate provenance must reference a planned query')
    }
    for (const question of evaluation.matchedQuestions) {
      if (!questions.has(question)) throw new RangeError('matchedQuestions must use exact reviewed questions')
    }
    const { total, ...values } = evaluation.score
    if (createCandidateScoreBreakdown(values, plan.rankingPolicy).total !== total) {
      throw new RangeError('candidate score total must equal its visible components')
    }
    const expectedPriority = candidatePriorityForScore(total,
      evaluation.hardFilter.status === 'excluded', plan.rankingPolicy)
    if (evaluation.priority !== expectedPriority) {
      throw new RangeError('candidate priority must match its hard filter and score')
    }
    evaluations.set(evaluation.workVersionId, evaluation)
  }
  const queued = new Set<WorkVersionId>()
  for (const priority of candidatePriorityKeys) {
    for (const workVersionId of result.queues[priority]) {
      if (queued.has(workVersionId)) throw new RangeError('a candidate can appear in only one priority queue')
      const evaluation = evaluations.get(workVersionId)
      if (evaluation === undefined) throw new RangeError('priority queues must reference candidate evaluations')
      if (evaluation.priority !== priority) throw new RangeError('candidate queue must match its priority')
      queued.add(workVersionId)
    }
  }
  if (queued.size !== evaluations.size) throw new RangeError('every candidate evaluation must appear in one queue')
  return {
    ...result,
    evaluations: result.evaluations.map((evaluation) => {
      const hardFilter: CandidateHardFilterResult = evaluation.hardFilter.status === 'excluded'
        ? { status: 'excluded', reasons: evaluation.hardFilter.reasons.map(reason => ({ ...reason })) as [
          CandidateHardFilterReason, ...CandidateHardFilterReason[]] }
        : { status: 'eligible', reasons: evaluation.hardFilter.reasons.map(reason => ({ ...reason })) }
      return {
        ...evaluation,
        discoveredBy: [...evaluation.discoveredBy],
        hardFilter,
        matchedQuestions: [...evaluation.matchedQuestions],
        diversityTags: [...evaluation.diversityTags],
        decisionReasons: [...evaluation.decisionReasons] as [string, ...string[]],
      }
    }),
    queues: {
      p0: [...result.queues.p0],
      p1: [...result.queues.p1],
      p2: [...result.queues.p2],
      excluded: [...result.queues.excluded],
    },
    limitations: [...result.limitations],
  }
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

const candidatePriorityKeys = ['p0', 'p1', 'p2', 'excluded'] as const

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
