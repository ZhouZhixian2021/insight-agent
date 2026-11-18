/** Material-led report sections with a separate research coverage record. */
import type { ProductSynthesisInput } from './report.ts'
import { inspectProductSynthesis, readEntries, synthesisAliases, type SynthesisResponse } from './synthesis-output.ts'

/** One independently validated report section, unrelated to question ordering. */
export interface InsightSection {
  readonly sectionId: string
  readonly title: string
  readonly text: string
  readonly status: 'answered' | 'partial' | 'insufficient'
}

/** Coverage is a reading aid, not evidence or a delivery gate. */
export interface InsightCoverage {
  readonly questionId: string
  readonly status: 'answered' | 'partial' | 'insufficient'
  readonly sectionIds: readonly string[]
  readonly gap: string
}

/** Section order is chosen from materials; original questions live only in coverage. */
export interface ProductInsight {
  readonly kind: 'insight'
  readonly sections: readonly InsightSection[]
  readonly coverage: readonly InsightCoverage[]
  readonly notices: readonly string[]
}

/** A repair can affect a section, a coverage record, or a missing report structure. */
export interface InsightIssue {
  readonly kind: 'section' | 'coverage' | 'structure'
  readonly id: string
  readonly reasons: readonly string[]
  readonly drafts: readonly unknown[]
}

/** Complete siblings survive malformed or incomplete neighboring entries. */
export interface InsightInspection extends ProductInsight {
  readonly issues: readonly InsightIssue[]
  readonly sectionOrder: readonly string[]
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function status(value: unknown): value is InsightSection['status'] {
  return value === 'answered' || value === 'partial' || value === 'insufficient'
}

/**
 * Collect evidence once rather than repeating the same pool under every question.
 * @param input - Existing investigation material.
 * @returns Original evidence records deduplicated by identity, not by source similarity.
 */
export function insightEvidence(input: ProductSynthesisInput): ProductSynthesisInput['questions'][number]['evidence'] {
  return [...new Map(input.questions.flatMap(q => q.evidence).map(item => [item.evidenceId, item])).values()]
}

/**
 * Inspect section prose/citations and question coverage as separate records.
 * @param text - Model output array of section and coverage entries.
 * @param input - Research questions and eligible evidence.
 * @param aliases - Stable short evidence IDs shared by every repair.
 * @param knownSections - Section identities retained from an earlier response.
 * @returns Valid sections, coverage and independently repairable errors.
 */
export function inspectInsight(text: string, input: ProductSynthesisInput,
  aliases: ReadonlyMap<string, string> = synthesisAliases(input), knownSections: readonly string[] = []): InsightInspection {
  const parsed = readEntries(text)
  const sections: InsightSection[] = [], coverage: InsightCoverage[] = [], issues: InsightIssue[] = []
  const notices = parsed.note ? [parsed.note] : []
  const sectionOrder: string[] = []
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const [index, entry] of parsed.entries.entries()) {
    if (!record(entry) || entry.kind !== 'section') continue
    const id = typeof entry.sectionId === 'string' && /^S[1-9]\d*$/u.test(entry.sectionId) ? entry.sectionId : `S${index + 1}`
    if (entry.sectionId !== id) notices.push(`Assigned section identity ${id}.`)
    if (!groups.has(id)) sectionOrder.push(id)
    groups.set(id, [...groups.get(id) ?? [], entry])
  }
  const evidence = insightEvidence(input)
  for (const [sectionId, entries] of groups) {
    const entry = entries[0]
    if (!entry) continue
    const reasons: string[] = []
    if (new Set(entries.map(item => JSON.stringify(item))).size > 1) reasons.push('Different sections use the same identity.')
    if (typeof entry.title !== 'string' || !entry.title.trim()) reasons.push('Section title is missing.')
    else if (input.questions.some(q => q.question.trim() === entry.title)) reasons.push('Use a material-led heading, not a copied research question.')
    const checked = inspectProductSynthesis(JSON.stringify([{ ...entry, questionId: sectionId }]), {
      scope: input.scope, questions: [{ questionId: sectionId, question: '', evidence }],
    }, aliases)
    reasons.push(...checked.issues.flatMap(issue => issue.reasons))
    notices.push(...checked.notes)
    const body = checked.answers.get(sectionId)
    if (reasons.length || body === undefined || typeof entry.title !== 'string') {
      issues.push({ kind: 'section', id: sectionId, reasons, drafts: entries })
    } else sections.push({ sectionId, title: entry.title.trim(), text: body, status: status(entry.status) ? entry.status : 'answered' })
  }
  if (groups.size === 0 && knownSections.length === 0) issues.push({ kind: 'structure', id: 'report',
    reasons: ['No complete report section was returned.'], drafts: parsed.entries })
  const sectionIds = new Set([...knownSections, ...sectionOrder])
  for (const question of input.questions) {
    const entries = parsed.entries.filter(entry => record(entry) && entry.kind === 'coverage' && entry.questionId === question.questionId)
    const entry = entries[0], reasons: string[] = []
    if (entries.length !== 1 || !record(entry)) reasons.push('Return one coverage record for this research question.')
    else {
      if (!status(entry.status)) reasons.push('Unknown coverage status.')
      if (!Array.isArray(entry.sectionIds) || !entry.sectionIds.every(id => typeof id === 'string' && sectionIds.has(id))) {
        reasons.push('Coverage references an unknown section.')
      }
      if (typeof entry.gap !== 'string') reasons.push('Coverage gap must be text, empty when nothing is missing.')
      if (entry.status !== 'insufficient' && Array.isArray(entry.sectionIds) && entry.sectionIds.length === 0) {
        reasons.push('Answered or partial coverage needs an existing section.')
      }
      if (entry.status !== 'answered' && typeof entry.gap === 'string' && !entry.gap.trim()) reasons.push('Describe the concrete coverage gap.')
    }
    if (reasons.length || !record(entry) || !status(entry.status) || !Array.isArray(entry.sectionIds) || typeof entry.gap !== 'string') {
      issues.push({ kind: 'coverage', id: question.questionId, reasons, drafts: entries })
    } else coverage.push({ questionId: question.questionId, status: entry.status,
      sectionIds: entry.sectionIds.filter((id): id is string => typeof id === 'string'), gap: entry.gap.trim() })
  }
  return { kind: 'insight', sections, coverage, notices, issues, sectionOrder }
}

/**
 * Serialize one global evidence pool and research questions used only as coverage guidance.
 * @param input - Full source-supported material.
 * @param aliases - Stable evidence aliases for generation and repair.
 * @param correction - The single rejected unit and accepted section context, if repairing.
 * @returns Exact model request without repeating evidence per question.
 */
export function insightRequest(input: ProductSynthesisInput, aliases: ReadonlyMap<string, string>,
  correction?: { issue: InsightIssue; sections: readonly InsightSection[] }): string {
  const reverse = new Map([...aliases].map(([alias, id]) => [id, alias]))
  return JSON.stringify({ scope: input.scope, sourceCriteria: input.sourceCriteria, sources: input.sources,
    researchQuestions: input.questions.map(({ questionId, question, limitations }) => ({ questionId, question, limitations })),
    evidence: insightEvidence(input).map(item => ({ ...item, evidenceId: reverse.get(item.evidenceId) ?? item.evidenceId })),
    ...correction === undefined ? {} : { correction: {
      unit: correction.issue.kind, id: correction.issue.id, reasons: correction.issue.reasons, drafts: correction.issue.drafts,
      acceptedSections: correction.sections.map(section => ({ sectionId: section.sectionId, title: section.title,
        text: section.text.replace(/\[\[cite:([^\]]+)\]\]/gu, (_match, id: string) => `[[cite:${reverse.get(id) ?? id}]]`) })),
      instruction: 'Return only the requested section or coverage record in an array. Keep its identity. '
        + 'Do not rewrite accepted sections. Correct references by meaning, never by guessing. '
        + 'For a structure repair with no usable sections, create a material-led report and its coverage records.',
    } } })
}

/**
 * Repair rejected sections or coverage records once, retaining all accepted siblings.
 * @param input - Approved source material, not a prescribed chapter outline.
 * @param invoke - Persisted model call with stable evidence aliases.
 * @param signal - Cancellation; no correction starts after cancellation.
 * @returns Ordered sections and separate coverage, including explicit unresolved notices.
 */
export async function repairInsight(input: ProductSynthesisInput,
  invoke: (user: string, ordinal: 1 | 2, knownSections: readonly string[], target?: InsightIssue) => Promise<SynthesisResponse>,
  signal?: AbortSignal): Promise<ProductInsight> {
  const aliases = synthesisAliases(input)
  signal?.throwIfAborted()
  const first = await invoke(insightRequest(input, aliases), 1, [])
  signal?.throwIfAborted()
  let inspected = inspectInsight(first.text, input, aliases)
  if (inspected.sectionOrder.length === 0) {
    const issue: InsightIssue = { kind: 'structure', id: 'report', reasons: ['No usable report structure.'], drafts: [] }
    const retry = await invoke(insightRequest(input, aliases, { issue, sections: [] }), 2, [])
    signal?.throwIfAborted()
    inspected = inspectInsight(retry.text, input, aliases)
    return settleInsight(inspected, input)
  }
  const sections = new Map(inspected.sections.map(section => [section.sectionId, section]))
  const coverage = new Map(inspected.coverage.map(item => [item.questionId, item]))
  const notices = [...inspected.notices]
  for (const issue of inspected.issues) {
    signal?.throwIfAborted()
    const response = await invoke(insightRequest(input, aliases, { issue, sections: [...sections.values()] }),
      2, inspected.sectionOrder, issue)
    signal?.throwIfAborted()
    const repaired = inspectInsight(response.text, input, aliases, inspected.sectionOrder)
    if (issue.kind === 'section') {
      const section = repaired.sections.find(item => item.sectionId === issue.id)
      if (section) sections.set(issue.id, section)
      else notices.push(`章节 ${issue.id} 的格式或引用未完成修复，其他正文已保留；这不表示缺少相关资料。`)
    } else if (issue.kind === 'coverage') {
      const item = repaired.coverage.find(item => item.questionId === issue.id)
      if (item) coverage.set(issue.id, item)
    }
  }
  return settleInsight({ ...inspected, sections: [...sections.values()], coverage: [...coverage.values()], notices }, input)
}

/**
 * Limit repair diagnostics to the requested unit without requiring accepted siblings again.
 * @param inspection - Parsed response including retained section identities.
 * @param target - Requested local correction, absent for a full response.
 * @returns Errors for the requested output only, including a missing repair target.
 */
export function insightRepairIssues(inspection: InsightInspection, target?: InsightIssue): readonly InsightIssue[] {
  if (!target || target.kind === 'structure') return inspection.issues
  const issues = inspection.issues.filter(issue => issue.kind === target.kind && issue.id === target.id)
  const found = target.kind === 'section' ? inspection.sections.some(section => section.sectionId === target.id)
    : inspection.coverage.some(item => item.questionId === target.id)
  return issues.length || found ? issues : [{ ...target, reasons: ['Requested repair target was not returned.'], drafts: [] }]
}

function settleInsight(inspected: InsightInspection, input: ProductSynthesisInput): ProductInsight {
  const byId = new Map(inspected.sections.map(section => [section.sectionId, section]))
  const sections = inspected.sectionOrder.flatMap(id => byId.get(id) ?? [])
  const coverage = input.questions.map((question) => {
    const item = inspected.coverage.find(item => item.questionId === question.questionId)
    if (item && item.sectionIds.every(id => byId.has(id))) return item
    return { questionId: question.questionId, status: 'insufficient' as const, sectionIds: [],
      gap: '覆盖记录或关联章节未完成生成，不能据此判断原始材料是否足够。' }
  })
  const notices = [...inspected.notices]
  if (!sections.length) notices.push('连贯正文尚未生成，不能将来源清单视为已完成的洞察报告。')
  return { kind: 'insight', sections, coverage, notices }
}
