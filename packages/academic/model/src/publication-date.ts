/** Date comparison and rule ownership shared by retrieval and full-text review. */
import type { AcademicWork, PartialDate, PublicationDateContext, PublicationDateEvaluation,
  PublicationWindow, ResearchBrief, WorkVersion } from './types.ts'

/** Failure requiring a revised, explicitly approved date policy. */
export class PublicationDatePolicyError extends Error {
  /** Stable admission failure code; the user must approve a clarified plan. */
  readonly code = 'ACADEMIC_PUBLICATION_DATE_POLICY_REVIEW_REQUIRED'
}

/**
 * Freeze the calendar cutoff once using the approved time zone, or reuse the saved context.
 * Legacy null upper bounds with date-bearing natural-language rules require explicit review.
 * @param brief Approved scope; no persisted field is rewritten.
 * @param startedAt Original run start as an ISO instant.
 * @param saved Exact context from the run's recovery checkpoint.
 * @returns Immutable date facts for this execution.
 */
export function resolvePublicationDateContext(
  brief: Pick<ResearchBrief, 'publicationWindow' | 'publicationDatePolicy' | 'inclusionRules' | 'exclusionRules'>,
  startedAt: string,
  saved?: PublicationDateContext,
): PublicationDateContext {
  if (saved !== undefined) return saved
  const policy = brief.publicationDatePolicy
  if (policy === undefined && brief.publicationWindow.end === null
    && [...brief.inclusionRules, ...brief.exclusionRules].some(legacyDateRule)) {
    throw new PublicationDatePolicyError('旧计划未明确日期上限及规则归属。请补充日期政策（固定日期、研究开始时点或无上限），并重新审核计划。')
  }
  const timeZone = policy?.timeZone ?? 'UTC'
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(startedAt))
  const value = (kind: Intl.DateTimeFormatPartTypes): string => parts.find(part => part.type === kind)?.value ?? ''
  const asOfDate = `${value('year')}-${value('month')}-${value('day')}`
  const endMode = policy?.endMode ?? (brief.publicationWindow.end === null ? 'unbounded' : 'fixed')
  return { schemaVersion: 1, startedAt, timeZone, asOfDate, endMode,
    window: { ...brief.publicationWindow, end: endMode === 'run_start' ? { iso: asOfDate, precision: 'day' }
      : endMode === 'unbounded' ? null : brief.publicationWindow.end } }
}

/** Legacy plans cannot distinguish a rolling date bound from an intentionally open window. */
function legacyDateRule(rule: string): boolean {
  return /日期|时间|时点|截至|至今|检索时|发表|发布|近[一二三四五六七八九十\d]*年|\d{4}年/u.test(rule)
    || /\b(?:date|year|month|day|published|publication|release|since|before|after|current|today|recent|past|decade|as\s+of)\b/iu.test(rule)
}

/**
 * Compare complete or partial source dates by calendar interval overlap.
 * @param work Scholarly work carrying the first public release date.
 * @param version Selected version carrying its published date.
 * @param window Resolved publication window.
 * @returns Date input, basis, window and deterministic verdict for audit and prompts.
 */
export function evaluatePublicationDate(work: Pick<AcademicWork, 'firstPublicDate'>,
  version: Pick<WorkVersion, 'releaseDate'>, window: PublicationWindow): PublicationDateEvaluation {
  const candidateDate = window.dateBasis === 'first_public_release' ? work.firstPublicDate : version.releaseDate
  const verdict = (): PublicationDateEvaluation['verdict'] => {
    if (window.start === null && window.end === null) return 'within_window'
    if (candidateDate.status !== 'available') return 'publication_date_unknown'
    const bounds = publicationDateBounds(candidateDate.value)
    if (window.start !== null && bounds.end < publicationDateBounds(window.start).start) return 'before_publication_window'
    if (window.end !== null && bounds.start > publicationDateBounds(window.end).end) return 'after_publication_window'
    return 'within_window'
  }
  return { dateBasis: window.dateBasis, candidateDate, window, verdict: verdict() }
}

/**
 * Calendar bounds preserve source precision, including actual month lengths.
 * @param date Validated calendar date with its source precision.
 * @returns Inclusive lower and upper calendar bounds.
 */
export function publicationDateBounds(date: PartialDate): { readonly start: string; readonly end: string } {
  if (date.precision === 'year') return { start: `${date.iso}-01-01`, end: `${date.iso}-12-31` }
  if (date.precision === 'day') return { start: date.iso, end: date.iso }
  const year = Number(date.iso.slice(0, 4)), month = Number(date.iso.slice(5, 7))
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { start: `${date.iso}-01`, end: `${date.iso}-${lastDay}` }
}

/**
 * Validate calendar syntax and source precision at an untrusted plan boundary.
 * @param date Candidate calendar date from the plan parser.
 * @returns Whether its syntax, precision and calendar day agree.
 */
export function isValidPublicationDate(date: PartialDate): boolean {
  const pattern = { year: /^\d{4}$/u, month: /^\d{4}-\d{2}$/u, day: /^\d{4}-\d{2}-\d{2}$/u }[date.precision]
  if (!pattern.test(date.iso) || Number(date.iso.slice(0, 4)) === 0) return false
  if (date.precision === 'year') return true
  const month = Number(date.iso.slice(5, 7))
  if (month < 1 || month > 12) return false
  if (date.precision === 'month') return true
  const instant = new Date(`${date.iso}T00:00:00Z`)
  return !Number.isNaN(instant.valueOf()) && instant.toISOString().slice(0, 10) === date.iso
}

/**
 * Approved content rules retain their original positions as stable model references.
 * @param brief Approved rule text and optional per-rule ownership.
 * @returns Content rules in approval order, without program-owned date rules.
 */
export function contentScreeningRules(
  brief: Pick<ResearchBrief, 'inclusionRules' | 'exclusionRules' | 'publicationDatePolicy'>,
): readonly { readonly id: string; readonly kind: 'inclusion' | 'exclusion'; readonly text: string }[] {
  return (['inclusion', 'exclusion'] as const).flatMap(kind => brief[`${kind}Rules`].flatMap((text, index) =>
    brief.publicationDatePolicy?.[`${kind}RuleKinds`][index] === 'publication_date' ? []
      : [{ id: `${kind}-${index + 1}`, kind, text }]))
}
