/** Reviewed, bounded direction reconnaissance before a domain research brief is authored. */
import type { DomainSurveyLimits, DomainSurveyQuery, DomainSurveySelectionPolicy } from '@deepseek-ai/dsh-academic-retrieval'
import type { ApprovedPlan } from './research-brief-plan.ts'

const FENCE = 'academic-domain-survey-json'

/** A domain reconnaissance request approved in the same Session as its later research plan. */
export interface ApprovedDomainSurveyPlan {
  readonly planId: string
  readonly topic: string
  readonly scope: string
  readonly selection: DomainSurveySelectionPolicy
  readonly queries: readonly DomainSurveyQuery[]
  readonly limits: DomainSurveyLimits & { readonly maximumElapsedMinutes: number }
  readonly reviewedAt: string
}

/**
 * Parse one approved reconnaissance plan without granting authority to an ordinary research plan.
 * @param approved Latest explicitly approved Plan-mode result.
 * @param sessionId Session that owns the approval.
 * @returns Reviewed query expressions and resource ceilings.
 */
export function domainSurveyPlanFromApproval(approved: ApprovedPlan, sessionId: string): ApprovedDomainSurveyPlan {
  const plan = parseDomainSurveyPlan(approved.markdown)
  return { ...plan, planId: `${sessionId}:approved-survey:${approved.identity}`, reviewedAt: approved.reviewedAt }
}

/**
 * Validate one proposed metadata survey before the user can approve it.
 * @param markdown Complete Chinese plan with one structured survey block.
 * @returns Reviewed topic, queries and bounds without an approval identity.
 */
export function parseDomainSurveyPlan(markdown: string): Omit<ApprovedDomainSurveyPlan, 'planId' | 'reviewedAt'> {
  const pattern = new RegExp('(?:^|\\n)```' + FENCE + '\\s*\\n([\\s\\S]*?)\\n```(?=\\n|$)', 'gu')
  const matches = [...markdown.matchAll(pattern)]
  if (matches.length !== 1 || markdown.includes('academic-research-brief-json')) {
    throw new Error('领域勘察计划须有且仅有一个 academic-domain-survey-json 执行块。')
  }
  let value: unknown
  try { value = JSON.parse(matches[0]?.[1] ?? '') } catch { throw new Error('领域勘察执行块必须是有效 JSON。') }
  const root = object(value, '领域勘察计划')
  exactKeys(root, ['schemaVersion', 'topic', 'scope', 'selection', 'queries', 'limits'], '领域勘察计划')
  if (root.schemaVersion !== 1) throw new Error('领域勘察执行块仅支持版本 1。')
  const title = markdown.match(/^#\s+([^\n]+)/u)?.[1] ?? ''
  if (!title.includes('领域勘察')) throw new Error('领域勘察计划标题须明确标注领域勘察。')
  const topic = string(root.topic, 'topic')
  const scope = string(root.scope, 'scope')
  const rawSelection = object(root.selection, 'selection')
  exactKeys(rawSelection, ['startYear', 'endYear', 'dateBasis', 'includedVersionTypes'], 'selection')
  const startYear = integer(rawSelection.startYear, 'startYear', 1900, 2100)
  const endYear = integer(rawSelection.endYear, 'endYear', startYear, 2100)
  if (rawSelection.dateBasis !== 'published' && rawSelection.dateBasis !== 'first_public_release') {
    throw new Error('selection.dateBasis 必须是发表日期或首次公开日期。')
  }
  const types = ['preprint', 'accepted_manuscript', 'version_of_record'] as const
  if (!Array.isArray(rawSelection.includedVersionTypes) || rawSelection.includedVersionTypes.length === 0
    || rawSelection.includedVersionTypes.some((type: unknown) => !types.includes(type as typeof types[number]))
    || new Set(rawSelection.includedVersionTypes).size !== rawSelection.includedVersionTypes.length) {
    throw new Error('selection.includedVersionTypes 须列出不重复的预印本、录用稿或正式发表版本。')
  }
  const selection: DomainSurveySelectionPolicy = { startYear, endYear,
    dateBasis: rawSelection.dateBasis, includedVersionTypes: rawSelection.includedVersionTypes }
  if (!Array.isArray(root.queries) || root.queries.length < 2 || root.queries.length > 12) {
    throw new Error('领域勘察需要 2 至 12 条已审核查询。')
  }
  const queries: DomainSurveyQuery[] = root.queries.map((entry: unknown, index: number) => {
    const item = object(entry, `queries[${index}]`)
    exactKeys(item, ['expression', 'purpose', 'roundIndex'], `queries[${index}]`)
    const expression = string(item.expression, `queries[${index}].expression`)
    if (item.purpose !== 'discovery' && item.purpose !== 'omission_check') {
      throw new Error(`queries[${index}].purpose 无效。`)
    }
    const roundIndex = integer(item.roundIndex, `queries[${index}].roundIndex`, 1, 4)
    return { expression, purpose: item.purpose, roundIndex }
  })
  if (new Set(queries.map(query => query.expression)).size !== queries.length
    || !queries.some(query => query.purpose === 'discovery' && query.roundIndex === 1)
    || !queries.some(query => query.purpose === 'omission_check' && query.roundIndex > 1)
    || queries.some((query, index) => index > 0 && query.roundIndex < (queries[index - 1]?.roundIndex ?? 0))
    || new Set(queries.map(query => query.roundIndex)).size !== Math.max(...queries.map(query => query.roundIndex))
    || queries.some(query => queries.filter(other => other.roundIndex === query.roundIndex).length > 3)) {
    throw new Error('领域勘察须按轮次列出不同查询，每轮最多三条，并在后续轮次独立检查遗漏。')
  }
  const rawLimits = object(root.limits, 'limits')
  exactKeys(rawLimits, ['maximumCandidates', 'maximumResultsPerQuery', 'maximumElapsedMinutes'], 'limits')
  const limits = { maximumQueries: queries.length, maximumQueriesPerRound: 3,
    maximumCandidates: integer(rawLimits.maximumCandidates, 'maximumCandidates', 1, 40),
    maximumResultsPerQuery: integer(rawLimits.maximumResultsPerQuery, 'maximumResultsPerQuery', 1, 30),
    maximumElapsedMinutes: integer(rawLimits.maximumElapsedMinutes, 'maximumElapsedMinutes', 1, 60) }
  const readable = markdown.slice(0, matches[0]?.index ?? 0)
  const names = { preprint: '预印本', accepted_manuscript: '录用稿', version_of_record: '正式发表版本' }
  if (!readable.includes(String(startYear)) || !readable.includes(String(endYear))
    || !readable.includes(String(limits.maximumCandidates))
    || !readable.includes(String(limits.maximumElapsedMinutes))
    || (selection.dateBasis === 'first_public_release' && !readable.includes('首次公开'))
    || (selection.dateBasis === 'published' && !readable.includes('发表'))
    || selection.includedVersionTypes.some(type => !readable.includes(names[type as keyof typeof names]))) {
    throw new Error('领域勘察正文须披露与执行块一致的年份、日期口径、论文版本、候选与耗时上限。')
  }
  return { topic, scope, selection, queries, limits }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象。`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) {
    throw new Error(`${label} 字段缺失或含有未经审核的字段。`)
  }
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} 必须是非空字符串。`)
  return value.trim()
}

function integer(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`${label} 必须是 ${min} 至 ${max} 的整数。`)
  }
  return Number(value)
}
