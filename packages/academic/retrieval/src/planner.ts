/** Deterministic queries from an approved research brief and explicit expansion terms. */
import {
  candidatePriorityForScore,
  createInclusionTargets,
  createSearchQueryId,
  isExecutableResearchBrief,
  type AcademicSearchQuery,
  type HybridSearchPlan,
  type HybridSearchPlanningInput,
  type HybridSearchPlanningOutput,
  type HybridSearchQuery,
  type ResearchQuestionCoverageResult,
  type SearchQueryBase,
} from '@deepseek-ai/dsh-academic-model'

/** A reviewed synonym or method name supplied by the plan author. */
export interface QueryExpansion {
  readonly expression: string
  readonly kind: 'synonym' | 'method'
  readonly questions: readonly string[]
}

/** Caller-owned query and result limits; no deployment budget is hidden in the planner. */
export interface QueryPlanningOptions {
  readonly academicProviders: readonly string[]
  readonly maximumQueriesPerRound: number
  readonly maximumWebResultsPerQuery: number
  readonly expansions: readonly QueryExpansion[]
}

/**
 * Build channel-specific first-round queries without inventing synonyms or method names.
 * @param input - Approved brief, site hosts, inclusion targets, and ranking policy.
 * @param options - Explicit provider, query, Web-result, and reviewed expansion choices.
 * @returns A plan bound to the exact approved brief version and non-blocking truncation warnings.
 * @throws {RangeError} An approved scope or limit is invalid or cannot fit the required channels.
 */
export function planHybridSearch(
  input: HybridSearchPlanningInput,
  options: QueryPlanningOptions,
): HybridSearchPlanningOutput {
  const { brief } = input
  if (!isExecutableResearchBrief(brief)) throw new RangeError('brief must approve its current version')
  validateOptions(options)
  createInclusionTargets(input.inclusionTargets)
  candidatePriorityForScore(0, false, input.rankingPolicy)
  const topic = nonEmpty(brief.topic, 'brief.topic')
  if (!Number.isSafeInteger(brief.stopConditions.maximumSearchRounds)
    || brief.stopConditions.maximumSearchRounds < 1) {
    throw new RangeError('brief.stopConditions.maximumSearchRounds must be positive')
  }
  for (const question of brief.questions) nonEmpty(question, 'brief.questions')
  const questions = [...new Set(brief.questions)]
  if (questions.length === 0) throw new RangeError('brief.questions must not be empty')
  const hosts = [...new Set(input.requestedSiteHosts.map(siteHost))]
  if (options.maximumQueriesPerRound < 2 + hosts.length) {
    throw new RangeError('maximumQueriesPerRound cannot fit academic, Web, and requested sites')
  }
  const queries: HybridSearchQuery[] = [
    academic(topic, 'core', questions, 1, options.academicProviders),
    web(topic, 'core', questions, 1, options.maximumWebResultsPerQuery),
    ...hosts.map(host => ({ kind: 'site_restricted' as const, ...base(topic, 'site_restricted', questions, 1),
      siteHost: host, maximumResults: options.maximumWebResultsPerQuery })),
  ]
  const expansions: QueryExpansion[] = [
    ...brief.aliases.map(expression => ({ expression, kind: 'synonym' as const, questions })),
    ...options.expansions,
  ]
  const warnings: string[] = []
  for (const expansion of expansions) {
    const term = nonEmpty(expansion.expression, 'expansion.expression')
    const linked = [...new Set(expansion.questions)]
    if (linked.length === 0 || linked.some(question => !questions.includes(question))) {
      throw new RangeError('expansion.questions must name approved brief questions')
    }
    const expression = expansion.kind === 'method' ? `${topic} ${term}` : term
    const candidates = [academic(expression, 'synonym_expansion', linked, 1, options.academicProviders),
      web(expression, 'synonym_expansion', linked, 1, options.maximumWebResultsPerQuery)]
    const additional = candidates.filter(candidate => !queries.some(existing => sameQuery(existing, candidate))).length
    if (queries.length + additional > options.maximumQueriesPerRound) {
      if (!warnings.includes('Reviewed expansions exceeded the query limit.')) {
        warnings.push('Reviewed expansions exceeded the query limit.')
      }
      continue
    }
    for (const candidate of candidates) {
      if (mergeDuplicate(queries, candidate)) continue
      queries.push(candidate)
    }
  }
  return { plan: {
    schemaVersion: 1,
    researchBriefId: brief.researchBriefId,
    researchBriefVersion: brief.version,
    constraints: {
      publicationWindow: brief.publicationWindow,
      includedWorkTypes: brief.includedWorkTypes,
      inclusionRules: brief.inclusionRules,
      exclusionRules: brief.exclusionRules,
      requiredTerms: [],
      excludedTerms: [],
    },
    inclusionTargets: input.inclusionTargets,
    rankingPolicy: input.rankingPolicy,
    queries,
    citationExpansionSeeds: [],
    maximumSearchRounds: brief.stopConditions.maximumSearchRounds,
  }, warnings }
}

/**
 * Add one bounded round of queries for observed evidence gaps.
 * @param plan - Reviewed plan whose existing query identities must stay stable.
 * @param coverage - Coverage of the same brief version, produced after evidence extraction.
 * @param roundIndex - New one-based search round within the reviewed maximum.
 * @param options - Explicit provider, query, and Web-result limits.
 * @returns The extended plan and warnings for gaps omitted by the round limit.
 * @throws {RangeError} Coverage identity, question links, or round limits are invalid.
 */
export function extendPlanForEvidenceGaps(
  plan: HybridSearchPlan,
  coverage: ResearchQuestionCoverageResult,
  roundIndex: number,
  options: QueryPlanningOptions,
): HybridSearchPlanningOutput {
  validateOptions(options)
  if (coverage.researchBriefId !== plan.researchBriefId
    || coverage.researchBriefVersion !== plan.researchBriefVersion) {
    throw new RangeError('coverage must match the planned brief version')
  }
  if (!Number.isSafeInteger(roundIndex) || roundIndex < 2 || roundIndex > plan.maximumSearchRounds
    || plan.queries.some(query => query.roundIndex === roundIndex)) {
    throw new RangeError('roundIndex must name an unused round within the approved maximum')
  }
  const core = plan.queries.find(query => query.kind === 'academic' && query.purpose === 'core')
  if (core === undefined) throw new RangeError('plan requires a core academic query')
  const approvedQuestions = new Set(core.questions)
  const additions: HybridSearchQuery[] = []
  const warnings: string[] = []
  for (const item of coverage.questions) {
    if (!approvedQuestions.has(item.question)) throw new RangeError('coverage contains an unplanned question')
    if (item.status === 'covered') continue
    for (const gap of item.gaps) {
      const expression = `${core.expression} ${nonEmpty(gap, 'coverage.gap')}`
      const candidate = academic(expression, 'evidence_gap', [item.question], roundIndex, options.academicProviders)
      if (plan.queries.some(query => sameQuery(query, candidate))) continue
      if (mergeDuplicate(additions, candidate)) continue
      if (additions.length === options.maximumQueriesPerRound) {
        if (!warnings.includes('Evidence gaps exceeded the query limit.')) {
          warnings.push('Evidence gaps exceeded the query limit.')
        }
        continue
      }
      additions.push(candidate)
    }
  }
  return { plan: { ...plan, queries: [...plan.queries, ...additions] }, warnings }
}

function base(expression: string, purpose: SearchQueryBase['purpose'], questions: readonly string[], roundIndex: number): SearchQueryBase {
  return { searchQueryId: createSearchQueryId(), expression, purpose, questions, roundIndex }
}

function academic(expression: string, purpose: SearchQueryBase['purpose'], questions: readonly string[],
  roundIndex: number, providers: readonly string[]): AcademicSearchQuery {
  return { kind: 'academic', ...base(expression, purpose, questions, roundIndex), providers }
}

function web(expression: string, purpose: SearchQueryBase['purpose'], questions: readonly string[],
  roundIndex: number, maximumResults: number): HybridSearchQuery {
  return { kind: 'web_discovery', ...base(expression, purpose, questions, roundIndex), maximumResults }
}

function mergeDuplicate(queries: HybridSearchQuery[], candidate: HybridSearchQuery): boolean {
  const existing = queries.find(query => sameQuery(query, candidate))
  if (existing === undefined) return false
  const index = queries.indexOf(existing)
  queries[index] = { ...existing, questions: [...new Set([...existing.questions, ...candidate.questions])] }
  return true
}

function sameQuery(left: HybridSearchQuery, right: HybridSearchQuery): boolean {
  return left.kind === right.kind && left.expression.toLowerCase() === right.expression.toLowerCase()
    && (left.kind !== 'site_restricted' || right.kind !== 'site_restricted' || left.siteHost === right.siteHost)
}

function validateOptions(options: QueryPlanningOptions): void {
  if (options.academicProviders.length === 0 || options.academicProviders.some(id => id.trim() === '')
    || new Set(options.academicProviders).size !== options.academicProviders.length) {
    throw new RangeError('academicProviders must contain distinct non-empty IDs')
  }
  for (const [name, value] of [['maximumQueriesPerRound', options.maximumQueriesPerRound],
    ['maximumWebResultsPerQuery', options.maximumWebResultsPerQuery]] as const) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive safe integer`)
  }
}

function nonEmpty(value: string, name: string): string {
  const normalized = value.trim().replace(/\s+/gu, ' ')
  if (normalized.length === 0) throw new RangeError(`${name} must not be empty`)
  return normalized
}

function siteHost(value: string): string {
  const normalized = nonEmpty(value, 'requestedSiteHosts').toLowerCase()
  let parsed: URL
  try { parsed = new URL(`https://${normalized}`) } catch { throw new RangeError('requestedSiteHosts must contain hostnames') }
  if (parsed.hostname !== normalized || !normalized.includes('.') || normalized.includes('..')) {
    throw new RangeError('requestedSiteHosts must contain hostnames without paths or ports')
  }
  return normalized
}
