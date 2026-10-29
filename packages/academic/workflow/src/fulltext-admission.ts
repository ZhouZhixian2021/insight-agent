/** Metadata admission keeps uncertain candidates available without unbounded full-text work. */
import type { AcademicCandidateRankingResult, CandidateAssessment, WorkVersionId } from '@deepseek-ai/dsh-academic-model'

/** Independent run-wide full-text limits; scheduled failures and cache hits both consume a work slot. */
export interface FulltextAdmissionPolicy {
  readonly maximumWorks: number
  readonly maximumUncertainWorks: number
}

/**
 * Prefer positively reviewed candidates and admit only a bounded uncertain exploration set.
 * @param order Hard-eligible, resolvable versions in ranking order.
 * @param ranking Exact candidate identities, including previously scheduled versions.
 * @param assessments Latest metadata review facts; absent review remains uncertain.
 * @param scheduled Versions already scheduled in this run, including failures.
 * @param policy Explicit run-wide admission limits.
 * @returns Ready versions and the number left on the metadata waitlist.
 */
export function admitFulltextCandidates(order: readonly WorkVersionId[], ranking: AcademicCandidateRankingResult,
  assessments: readonly CandidateAssessment[], scheduled: readonly WorkVersionId[], policy: FulltextAdmissionPolicy) {
  for (const value of [policy.maximumWorks, policy.maximumUncertainWorks]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Full-text admission limits must be non-negative safe integers.')
  }
  if (policy.maximumWorks < 1 || policy.maximumUncertainWorks > policy.maximumWorks) {
    throw new RangeError('Full-text exploration cannot exceed the positive total work limit.')
  }
  const byWork = new Map(assessments.map(item => [item.academicWorkId, item]))
  const byVersion = new Map(ranking.evaluations.map(item => [item.workVersionId, item.academicWorkId]))
  const confirmed = (id: WorkVersionId) => {
    const work = byVersion.get(id)
    const review = work === undefined ? undefined : byWork.get(work)?.semanticReview
    return review?.status === 'validated' && review.scope === 'potentially_relevant'
  }
  const attempted = new Set(scheduled)
  const remaining = order.filter(id => !attempted.has(id))
  const available = Math.max(0, policy.maximumWorks - attempted.size)
  const exploration = Math.max(0, policy.maximumUncertainWorks - scheduled.filter(id => !confirmed(id)).length)
  const positive = remaining.filter(confirmed)
  const uncertain = remaining.filter(id => !confirmed(id))
  // Reserved exploration keeps undecided candidates reachable while confirmed candidates exist.
  const reserved = Math.min(exploration, uncertain.length, available)
  const ready = [...positive.slice(0, available - reserved), ...uncertain.slice(0, reserved)]
  return { ready, deferred: remaining.length - ready.length }
}
