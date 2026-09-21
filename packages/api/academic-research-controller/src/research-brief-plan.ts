import type { ResearchBrief, ResearchBriefId } from '@deepseek-ai/dsh-academic-model'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { MAX_DRAFT_SEARCH_QUERIES, validateResearchBriefRequirements } from '@deepseek-ai/dsh-academic-workflow'
import type { AcademicPlannedSearch } from './types.ts'

const EXIT_PLAN_MODE = 'exit_plan_mode'
const BRIEF_FENCE = 'academic-research-brief-json'

interface ApprovedPlan {
  readonly identity: string
  readonly markdown: string
  readonly reviewedAt: string
}

/**
 * Read and validate the Academic Research Brief embedded in the latest approved plan.
 *
 * @param sessionId - Session that owns the plan review.
 * @param events - Durable Session events containing the plan call and successful result.
 * @returns An approved version-1 Brief whose identity is stable for that reviewed plan.
 */
export function researchBriefFromApprovedPlan(
  sessionId: string,
  events: readonly SessionEvent[],
): ResearchBrief {
  return researchPlanFromApprovedPlan(sessionId, events).brief
}

/**
 * Recover the Brief and its system-authored searches from the same approved plan.
 * @param sessionId Session that owns the approval.
 * @param events Durable plan calls and review results.
 * @returns The approved Brief and optional legacy search handoff, without inventing missing searches.
 */
export function researchPlanFromApprovedPlan(
  sessionId: string,
  events: readonly SessionEvent[],
): { brief: ResearchBrief; searches: readonly AcademicPlannedSearch[] | undefined } {
  const approved = latestApprovedPlan(events)
  if (approved === undefined) {
    throw new Error('请先在当前会话完成研究计划审核。')
  }
  const { searchPlan, ...payload } = parseBriefPayload(approved.markdown)
  validateResearchBriefRequirements(payload)
  return { searches: searchPlan, brief: {
    ...payload,
    researchBriefId: `${sessionId}:approved-plan:${approved.identity}` as ResearchBriefId,
    version: 1,
    approval: {
      status: 'approved',
      reviewedBy: 'session-user',
      reviewedAt: approved.reviewedAt,
      approvedBriefVersion: 1,
      comment: null,
    },
  } }
}

/**
 * Reject an incompatible Academic plan before presenting it for user review.
 * @param markdown Complete proposed plan, including its structured Brief.
 * @returns Nothing when the plan can be executed; approval remains a separate user action.
 */
export function validateAcademicPlan(markdown: string): void {
  validateResearchBriefRequirements(parseBriefPayload(markdown))
}

function latestApprovedPlan(events: readonly SessionEvent[]): ApprovedPlan | undefined {
  const nativeCalls = new Map<string, string>()
  let latest: ApprovedPlan | undefined
  for (const event of events) {
    if (event.type === 'tool/call' && event.data.name === EXIT_PLAN_MODE) {
      const plan = planFromJsonArguments(event.data.arguments)
      if (plan !== undefined) nativeCalls.set(String(event.data.callId), plan)
      continue
    }
    if (event.type === 'tool/result') {
      const result = event.data.message.content[0]
      const identity = String(result.toolCallId)
      const plan = nativeCalls.get(identity)
      if (plan !== undefined && !result.isError) {
        latest = { identity, markdown: plan, reviewedAt: eventTime(event.time) }
      }
      continue
    }
    const dispatch = event as unknown as {
      type: string
      data: {
        name?: unknown
        isError?: unknown
        arguments?: unknown
        subCallId?: unknown
      }
    }
    if (dispatch.type === 'tool/code-dispatch' && dispatch.data.name === EXIT_PLAN_MODE && dispatch.data.isError === false) {
      const plan = planFromUnknownArguments(dispatch.data.arguments)
      if (plan !== undefined) {
        latest = { identity: String(dispatch.data.subCallId), markdown: plan, reviewedAt: eventTime(event.time) }
      }
    }
  }
  return latest
}

function eventTime(time: number): string {
  const value = new Date(time)
  if (Number.isNaN(value.valueOf())) throw new Error('the approved plan has an invalid review timestamp')
  return value.toISOString()
}

function planFromJsonArguments(argumentsJson: string): string | undefined {
  try {
    return planFromUnknownArguments(JSON.parse(argumentsJson))
  } catch {
    return undefined
  }
}

function planFromUnknownArguments(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  return typeof value.plan === 'string' ? value.plan : undefined
}

function parseBriefPayload(markdown: string): Omit<ResearchBrief, 'researchBriefId' | 'version' | 'approval'> & {
  searchPlan?: readonly AcademicPlannedSearch[]
} {
  const pattern = new RegExp('(?:^|\\n)```' + BRIEF_FENCE + '\\s*\\n([\\s\\S]*?)\\n```(?=\\n|$)', 'gu')
  const matches = [...markdown.matchAll(pattern)]
  if (matches.length !== 1) {
    throw new Error(`the approved plan must contain exactly one ${BRIEF_FENCE} fenced block`)
  }
  let value: unknown
  try {
    value = JSON.parse(matches.map(match => match[1]).join(''))
  } catch {
    throw new Error(`the ${BRIEF_FENCE} block must contain valid JSON`)
  }
  const root = record(value, 'Research Brief')
  if (root.schemaVersion !== 1 && root.schemaVersion !== 2) throw new Error('schemaVersion must be 1 or 2')
  exactKeys(root, [
    'schemaVersion', 'topic', 'aliases', 'questions', 'publicationWindow', 'includedWorkTypes',
    'inclusionRules', 'exclusionRules', 'evidenceRequirements', 'targetAudience', 'reportRequirements',
    'stopConditions', 'assumptions', ...(root.schemaVersion === 2 || 'searchPlan' in root) ? ['searchPlan'] : [],
  ], 'Research Brief')
  const questions = nonEmptyStringArray(root.questions, 'questions')
  const limits = stopConditions(root.stopConditions)
  return {
    schemaVersion: 1,
    topic: nonEmptyString(root.topic, 'topic'),
    aliases: stringArray(root.aliases, 'aliases'),
    questions,
    publicationWindow: publicationWindow(root.publicationWindow),
    includedWorkTypes: nonEmptyStringArray(root.includedWorkTypes, 'includedWorkTypes'),
    inclusionRules: stringArray(root.inclusionRules, 'inclusionRules'),
    exclusionRules: stringArray(root.exclusionRules, 'exclusionRules'),
    evidenceRequirements: evidenceRequirements(root.evidenceRequirements),
    targetAudience: nonEmptyString(root.targetAudience, 'targetAudience'),
    reportRequirements: reportRequirements(root.reportRequirements),
    stopConditions: limits,
    assumptions: stringArray(root.assumptions, 'assumptions'),
    ...'searchPlan' in root ? { searchPlan: parseSearchPlan(root.searchPlan, questions, limits.maximumSearchRounds) } : {},
  }
}

function parseSearchPlan(value: unknown, questions: readonly string[], rounds: number): readonly AcademicPlannedSearch[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('检索方案必须包含至少一条查询，请重新整理研究计划。')
  const searches = value.map((entry, index) => {
    const item = record(entry, `searchPlan[${index}]`)
    exactKeys(item, ['query', 'purpose', 'questions'], `searchPlan[${index}]`)
    const linked = nonEmptyStringArray(item.questions, `searchPlan[${index}].questions`)
    if (linked.some(question => !questions.includes(question))) throw new Error('检索方案引用了计划之外的研究问题，请修正后重新审核。')
    return { query: nonEmptyString(item.query, `searchPlan[${index}].query`).trim(),
      purpose: nonEmptyString(item.purpose, `searchPlan[${index}].purpose`), questions: linked }
  })
  // Identical expressions execute once, retaining their reviewed purposes and question links.
  const distinct = new Map<string, AcademicPlannedSearch>()
  for (const search of searches) {
    const previous = distinct.get(search.query)
    distinct.set(search.query, previous === undefined ? search : { query: search.query,
      purpose: `${previous.purpose}；${search.purpose}`, questions: [...new Set([...previous.questions, ...search.questions])] })
  }
  const maximum = Math.min(MAX_DRAFT_SEARCH_QUERIES, rounds)
  if (distinct.size > maximum) throw new Error(`检索方案超过已批准的 ${maximum} 条查询上限，请缩小方案后重新审核。`)
  if (questions.some(question => !searches.some(search => search.questions.includes(question)))) {
    throw new Error('检索方案未覆盖全部研究问题，请补齐后重新审核。')
  }
  return [...distinct.values()]
}

function publicationWindow(value: unknown): ResearchBrief['publicationWindow'] {
  const item = record(value, 'publicationWindow')
  exactKeys(item, ['start', 'end', 'dateBasis'], 'publicationWindow')
  return { start: partialDate(item.start, 'publicationWindow.start'), end: partialDate(item.end, 'publicationWindow.end'),
    dateBasis: oneOf(item.dateBasis, ['published', 'first_public_release'] as const, 'publicationWindow.dateBasis') }
}

function partialDate(value: unknown, label: string): ResearchBrief['publicationWindow']['start'] {
  if (value === null) return null
  const item = record(value, label)
  exactKeys(item, ['iso', 'precision'], label)
  return { iso: nonEmptyString(item.iso, `${label}.iso`),
    precision: oneOf(item.precision, ['year', 'month', 'day'] as const, `${label}.precision`) }
}

function evidenceRequirements(value: unknown): ResearchBrief['evidenceRequirements'] {
  const item = record(value, 'evidenceRequirements')
  exactKeys(item, ['minimumIncludedWorks', 'minimumFulltextWorks', 'minimumEvidenceLevel', 'requireLocatableEvidence',
    'allowPreprints', 'insufficientEvidencePolicy'], 'evidenceRequirements')
  return {
    minimumIncludedWorks: nonNegativeInteger(item.minimumIncludedWorks, 'evidenceRequirements.minimumIncludedWorks'),
    minimumFulltextWorks: nonNegativeInteger(item.minimumFulltextWorks, 'evidenceRequirements.minimumFulltextWorks'),
    minimumEvidenceLevel: oneOf(item.minimumEvidenceLevel, ['abstract', 'fulltext'] as const,
      'evidenceRequirements.minimumEvidenceLevel'),
    requireLocatableEvidence: booleanValue(item.requireLocatableEvidence, 'evidenceRequirements.requireLocatableEvidence'),
    allowPreprints: booleanValue(item.allowPreprints, 'evidenceRequirements.allowPreprints'),
    insufficientEvidencePolicy: oneOf(item.insufficientEvidencePolicy, ['continue_with_warning', 'stop_for_review'] as const,
      'evidenceRequirements.insufficientEvidencePolicy'),
  }
}

function reportRequirements(value: unknown): ResearchBrief['reportRequirements'] {
  const item = record(value, 'reportRequirements')
  exactKeys(item, ['language', 'targetLength', 'requiredSections', 'citationStyle', 'includeEvidenceAppendix',
    'includeMethodology', 'includeLimitations', 'includeResearchGaps'], 'reportRequirements')
  const length = record(item.targetLength, 'reportRequirements.targetLength')
  exactKeys(length, ['unit', 'minimum', 'maximum'], 'reportRequirements.targetLength')
  const minimum = nullableNonNegativeInteger(length.minimum, 'reportRequirements.targetLength.minimum')
  const maximum = nullableNonNegativeInteger(length.maximum, 'reportRequirements.targetLength.maximum')
  if (minimum !== null && maximum !== null && minimum > maximum) {
    throw new Error('reportRequirements.targetLength.minimum must not exceed maximum')
  }
  return {
    language: nonEmptyString(item.language, 'reportRequirements.language'),
    targetLength: { unit: nonEmptyString(length.unit, 'reportRequirements.targetLength.unit'), minimum, maximum },
    requiredSections: stringArray(item.requiredSections, 'reportRequirements.requiredSections'),
    citationStyle: oneOf(item.citationStyle, ['numeric', 'author_year'] as const, 'reportRequirements.citationStyle'),
    includeEvidenceAppendix: booleanValue(item.includeEvidenceAppendix, 'reportRequirements.includeEvidenceAppendix'),
    includeMethodology: booleanValue(item.includeMethodology, 'reportRequirements.includeMethodology'),
    includeLimitations: booleanValue(item.includeLimitations, 'reportRequirements.includeLimitations'),
    includeResearchGaps: booleanValue(item.includeResearchGaps, 'reportRequirements.includeResearchGaps'),
  }
}

function stopConditions(value: unknown): ResearchBrief['stopConditions'] {
  const item = record(value, 'stopConditions')
  exactKeys(item, ['maximumSearchRounds', 'maximumCandidateWorks', 'maximumIncludedWorks', 'maximumElapsedMinutes',
    'saturationRounds', 'stopWhenEvidenceRequirementsMet'], 'stopConditions')
  return {
    maximumSearchRounds: positiveInteger(item.maximumSearchRounds, 'stopConditions.maximumSearchRounds'),
    maximumCandidateWorks: positiveInteger(item.maximumCandidateWorks, 'stopConditions.maximumCandidateWorks'),
    maximumIncludedWorks: positiveInteger(item.maximumIncludedWorks, 'stopConditions.maximumIncludedWorks'),
    maximumElapsedMinutes: nullablePositiveInteger(item.maximumElapsedMinutes, 'stopConditions.maximumElapsedMinutes'),
    saturationRounds: positiveInteger(item.saturationRounds, 'stopConditions.saturationRounds'),
    stopWhenEvidenceRequirementsMet: booleanValue(item.stopWhenEvidenceRequirementsMet,
      'stopConditions.stopWhenEvidenceRequirementsMet'),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value)
  const missing = keys.filter(key => !(key in value))
  const unknown = actual.filter(key => !keys.includes(key))
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(`${label} has invalid fields (missing: ${missing.join(', ') || 'none'}; unknown: ${unknown.join(', ') || 'none'})`)
  }
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`)
  return value
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value.map((entry, index) => nonEmptyString(entry, `${label}[${index}]`))
}

function nonEmptyStringArray(value: unknown, label: string): string[] {
  const result = stringArray(value, label)
  if (result.length === 0) throw new Error(`${label} must contain at least one item`)
  return result
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`)
  return value
}

function oneOf<const T extends readonly string[]>(value: unknown, choices: T, label: string): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) {
    throw new Error(`${label} must be one of ${choices.join(', ')}`)
  }
  return value
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative integer`)
  return value as number
}

function positiveInteger(value: unknown, label: string): number {
  const result = nonNegativeInteger(value, label)
  if (result === 0) throw new Error(`${label} must be a positive integer`)
  return result
}

function nullableNonNegativeInteger(value: unknown, label: string): number | null {
  return value === null ? null : nonNegativeInteger(value, label)
}

function nullablePositiveInteger(value: unknown, label: string): number | null {
  return value === null ? null : positiveInteger(value, label)
}
