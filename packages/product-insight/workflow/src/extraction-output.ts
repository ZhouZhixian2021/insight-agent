/** Per-item extraction validation and request-local question aliases. */
import { createHash } from 'node:crypto'
import type { CandidatePage, ProductQuestionId } from '@deepseek-ai/dsh-product-insight-model'
import type { ProductEvidenceDraft } from '@deepseek-ai/dsh-product-insight-source'

type Question = { readonly questionId: ProductQuestionId; readonly text: string }

/** A rejected array entry retained for a single targeted repair. */
export interface DraftIssue {
  readonly index: number
  readonly reason: string
  readonly value: unknown
}

/** Valid siblings remain usable even when other entries need repair. */
export interface DraftInspection {
  readonly drafts: readonly ProductEvidenceDraft[]
  readonly issues: readonly DraftIssue[]
}

/**
 * Assign short IDs in the exact supplied question order; no global alias state.
 * @param questions - Questions selected for this source.
 * @returns Model-facing questions with request-local aliases.
 */
export function extractionQuestions(questions: readonly Question[]): readonly { questionId: string; text: string }[] {
  return questions.map((question, index) => ({ questionId: `Q${index + 1}`, text: question.text }))
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Validate individual entries, restoring only IDs present in this request's mapping.
 * @param text - Complete JSON array, optionally inside one JSON code fence.
 * @param questions - Exact questions supplied to the model.
 * @param repair - Rejected entries this response is allowed to replace.
 * @returns Valid siblings and explicit unresolved entries; malformed containers throw.
 */
export function inspectExtraction(text: string, questions: readonly Question[], repair?: readonly DraftIssue[]): DraftInspection {
  const trimmed = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/u, '$1')
  const value: unknown = JSON.parse(trimmed)
  if (!Array.isArray(value)) throw new RangeError('Evidence model must return an array')
  const aliases = new Map<string, ProductQuestionId>()
  questions.forEach((question, index) => {
    aliases.set(`Q${index + 1}`, question.questionId)
    aliases.set(question.questionId, question.questionId)
  })
  const drafts: ProductEvidenceDraft[] = [], issues: DraftIssue[] = []
  const pending = new Map(repair?.map(issue => [issue.index, issue]) ?? [])
  const seen = new Set<number>()
  for (const [index, item] of value.entries()) {
    const repairIndex = record(item) ? item.repairIndex : undefined
    if (repair !== undefined && (typeof repairIndex !== 'number' || !pending.has(repairIndex) || seen.has(repairIndex))) {
      issues.push({ index, reason: 'unknown_or_duplicate_repair_index', value: item }); continue
    }
    const issueIndex = typeof repairIndex === 'number' && repair !== undefined ? repairIndex : index
    if (repair !== undefined) seen.add(issueIndex)
    const ids = record(item) && Array.isArray(item.questionIds) ? item.questionIds : []
    const mapped = ids.map((id: unknown) => typeof id === 'string' ? aliases.get(id) : undefined)
    const questionIds = mapped.filter((id): id is ProductQuestionId => id !== undefined)
    let reason: string | undefined
    if (!record(item)) reason = 'draft_must_be_object'
    else if (typeof item.verbatimExcerpt !== 'string' || !item.verbatimExcerpt.trim()) reason = 'missing_excerpt'
    else if (typeof item.sourcedStatement !== 'string' || !item.sourcedStatement.trim()) reason = 'missing_statement'
    else if (ids.length === 0 || questionIds.length !== ids.length) reason = 'unknown_or_missing_question'
    else if (item.startHint !== undefined && (typeof item.startHint !== 'number' || !Number.isSafeInteger(item.startHint) || item.startHint < 0)) reason = 'invalid_start_hint'
    if (reason !== undefined) { issues.push({ index: issueIndex, reason, value: item }); continue }
    // Narrow again at the construction boundary instead of casting model-controlled fields.
    if (record(item) && typeof item.verbatimExcerpt === 'string' && typeof item.sourcedStatement === 'string') {
      drafts.push({ verbatimExcerpt: item.verbatimExcerpt, sourcedStatement: item.sourcedStatement,
        questionIds: [...new Set(questionIds)], ...typeof item.startHint === 'number' ? { startHint: item.startHint } : {} })
    }
  }
  for (const [index, issue] of pending) if (!seen.has(index)) issues.push({ ...issue, reason: 'repair_missing' })
  return { drafts, issues }
}

/**
 * Reuse only byte-identical saved text for the same origin, plan, source kind and questions.
 * @param page - Current source identity; URL origin participates but page ID does not.
 * @param text - Unmodified saved text supplied to extraction.
 * @param questions - Ordered full question identities and wording.
 * @param configuration - Resolved model configuration and extraction instructions.
 * @param range - Fragment's offsets in its saved source.
 * @returns Run-local cache key; receiving pages still verify and bind their own evidence.
 */
export function extractionReuseKey(page: CandidatePage, text: string, questions: readonly Question[],
  configuration: unknown, range?: { readonly start: number; readonly end: number }): string {
  return createHash('sha256').update(JSON.stringify({ origin: new URL(page.url).origin,
    planId: page.planId, productId: page.productId, publisher: page.publisher, sourceType: page.sourceType,
    text, questions, configuration, range })).digest('hex')
}
