/** Pure aspect-review validation and coverage aggregation shared by runtime and replay tests. */
import { createHash } from 'node:crypto'
import { EvidenceError } from '@deepseek-ai/dsh-academic-evidence'
import type { ResearchAspectCoverage, ResearchQuestionCoverageResult } from '@deepseek-ai/dsh-academic-model'
import type { CoverageReview, CoverageReviewInput } from './coverage-types.ts'

/**
 * Bind a cached judgment to the exact approved requirements and admitted evidence view.
 * @param input Immutable review inputs.
 * @returns Stable digest reused only for identical inputs.
 */
export function coverageFingerprint(input: CoverageReviewInput): string {
  return createHash('sha256').update(JSON.stringify({ requirements: input.brief.coverageRequirements,
    evidence: input.evidence, questionLinks: input.questionLinks })).digest('hex')
}

/**
 * Validate every aspect and its supporting references at the model boundary.
 * @param text Complete model JSON.
 * @param input Approved aspects and admitted, source-verified evidence.
 * @returns One reviewed decision per approved aspect, with no model-owned whole-question status.
 * @throws EvidenceError when a field, aspect, reference or parent-question association is invalid.
 */
export function parseCoverageReview(text: string, input: CoverageReviewInput): CoverageReview {
  const invalid = (): never => { throw new EvidenceError('Invalid aspect coverage review.', 'ACADEMIC_COVERAGE_INVALID_REVIEW') }
  let value: unknown
  try { value = JSON.parse(text) } catch { return invalid() }
  const object = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !keys.includes(key))) return invalid()
    return value as Record<string, unknown>
  }
  const root = object(value, input.delta === undefined ? ['aspects', 'gapTerms', 'preferredRepairs']
    : ['aspects', 'gapTerms', 'invalidatedAspectIds'])
  if (!Array.isArray(root.aspects)) return invalid()
  const approved = (input.brief.coverageRequirements ?? []).flatMap(requirement =>
    requirement.aspects.filter(a => input.delta === undefined || input.delta.aspectIds.includes(a.aspectId))
      .map(aspect => ({ ...aspect, question: requirement.question })))
  if (root.aspects.length !== approved.length || approved.length === 0) return invalid()
  const seen = new Set<string>()
  const evidence = new Map(input.evidence.map(record => [String(record.evidenceId), record]))
  const aspects = root.aspects.map((entry): ResearchAspectCoverage => {
    const item = object(entry, ['aspectId', 'status', 'evidenceIds', 'reason'])
    const aspect = approved.find(aspect => aspect.aspectId === item.aspectId)
    if (aspect === undefined || seen.has(aspect.aspectId) || typeof item.reason !== 'string' || item.reason.trim() === '') return invalid()
    seen.add(aspect.aspectId)
    const status = item.status
    if (status !== 'covered' && status !== 'partial' && status !== 'missing' && status !== 'uncertain') return invalid()
    if (!Array.isArray(item.evidenceIds) || item.evidenceIds.some(id => typeof id !== 'string')
      || new Set(item.evidenceIds).size !== item.evidenceIds.length) return invalid()
    const invalidParents: string[] = []
    const evidenceIds = item.evidenceIds.flatMap((id) => {
      const record = evidence.get(String(id))
      if (record === undefined) return invalid()
      if (!input.questionLinks.some(link => link.evidenceId === record.evidenceId && link.question === aspect.question)) {
        invalidParents.push(record.evidenceId)
        return []
      }
      if (status === 'covered' && aspect.evidenceRequirement === 'quantitative' && record.level !== 'fulltext') return invalid()
      return [record.evidenceId]
    })
    if (invalidParents.length > 0) return { aspectId: aspect.aspectId, status: 'uncertain', evidenceIds,
      reason: '核查引用包含不属于该问题的证据；该方面保留不确定，不能据此认定已覆盖。' }
    if ((status === 'covered' || status === 'partial') && evidenceIds.length === 0) return invalid()
    if (status === 'missing' && evidenceIds.length !== 0) return invalid()
    return { aspectId: aspect.aspectId, status, evidenceIds, reason: item.reason }
  })
  const gapTerms: NonNullable<CoverageReview['gapTerms']>[number][] = []
  if (root.gapTerms !== undefined) {
    if (!Array.isArray(root.gapTerms) || root.gapTerms.length > approved.length) return invalid()
    for (const entry of root.gapTerms) {
      const item = object(entry, ['aspectId', 'terms'])
      const aspect = approved.find(a => a.aspectId === item.aspectId)
      if (aspect === undefined || gapTerms.some(g => g.aspectId === aspect.aspectId) || !Array.isArray(item.terms)
        || item.terms.length === 0 || item.terms.length > 3 || item.terms.some(t =>
        typeof t !== 'string' || t.length > 80 || !/^[\p{L}\p{N}][\p{L}\p{N}\s\-–—()/]*$/u.test(t))) return invalid()
      gapTerms.push({ aspectId: aspect.aspectId, terms: item.terms.map(t => String(t).trim()) })
    }
  }
  const terms = gapTerms.length === 0 ? {} : { gapTerms }
  const preferredRepairs: NonNullable<CoverageReview['preferredRepairs']>[number][] = []
  if (root.preferredRepairs !== undefined) {
    if (!Array.isArray(root.preferredRepairs) || root.preferredRepairs.length > input.brief.questions.length) return invalid()
    for (const entry of root.preferredRepairs) {
      const item = object(entry, ['question', 'workVersionId', 'windowIndexes'])
      const source = input.repairSources?.find(s => s.workVersionId === item.workVersionId)
      if (source === undefined || typeof item.question !== 'string' || !input.brief.questions.includes(item.question)
        || !Array.isArray(item.windowIndexes) || item.windowIndexes.length === 0 || item.windowIndexes.length > 2
        || item.windowIndexes.some(i => !Number.isSafeInteger(i) || Number(i) < 0
          || source.windows[Number(i)] === undefined)) return invalid()
      preferredRepairs.push({ question: item.question, workVersionId: source.workVersionId,
        windowIndexes: item.windowIndexes.map(Number) })
    }
  }
  if (input.delta === undefined) return { aspects, ...terms, ...preferredRepairs.length === 0 ? {} : { preferredRepairs } }
  const invalidated = root.invalidatedAspectIds
  if (!Array.isArray(invalidated) || invalidated.some(id =>
    !input.delta?.baseline.aspects.some(a => a.aspectId === id && a.status === 'covered'))) return invalid()
  return { aspects, ...terms, invalidatedAspectIds: input.delta.baseline.aspects.filter(a =>
    invalidated.includes(a.aspectId)).map(a => a.aspectId) }
}

/**
 * Aggregate reviewed aspects without treating a paper count as semantic completeness.
 * @param input Exact review input.
 * @param review Validated model judgment, or null when review is pending or failed.
 * @param evidenceRequirementsMet Whether global evidence admission passed.
 * @param minimumSupportingWorks Existing independent-work floor for each question.
 * @param assessedAt Caller clock.
 * @returns Coverage with explicit aspect gaps; unreviewed questions cannot be covered.
 */
export function reviewedCoverage(input: CoverageReviewInput, review: CoverageReview | null,
  evidenceRequirementsMet: boolean, minimumSupportingWorks: number, assessedAt: string): ResearchQuestionCoverageResult {
  const records = new Map(input.evidence.map(record => [record.evidenceId, record]))
  const questions = (input.brief.coverageRequirements ?? []).map((requirement) => {
    const aspects = requirement.aspects.map(aspect => review?.aspects.find(item => item.aspectId === aspect.aspectId)
      ?? { aspectId: aspect.aspectId, status: 'uncertain' as const, evidenceIds: [], reason: '覆盖尚未完成核查。' })
    const evidenceIds = [...new Set(review === null ? input.questionLinks.filter(link => link.question === requirement.question)
      .map(link => link.evidenceId) : aspects.flatMap(aspect => aspect.evidenceIds))]
    const supportingWorkIds = [...new Set(evidenceIds.flatMap((id) => {
      const record = records.get(id)
      return record === undefined ? [] : [record.academicWorkId]
    }))]
    const covered = aspects.every(aspect => aspect.status === 'covered') && supportingWorkIds.length >= minimumSupportingWorks
    const gaps = aspects.flatMap((aspect) => {
      if (aspect.status === 'covered') return []
      const requirementAspect = requirement.aspects.find(item => item.aspectId === aspect.aspectId)
      return [`${requirementAspect?.label ?? requirement.question}：${aspect.reason}`]
    })
    if (!covered && gaps.length === 0) gaps.push(`独立支持论文不足 ${minimumSupportingWorks} 篇。`)
    return { question: requirement.question, status: covered ? 'covered' as const
      : supportingWorkIds.length === 0 ? 'uncovered' as const : 'partial' as const,
    supportingWorkIds, evidenceIds, gaps, aspects }
  })
  return { schemaVersion: 1, researchBriefId: input.brief.researchBriefId, researchBriefVersion: input.brief.version,
    assessedAt, questions, evidenceRequirementsMet, basis: 'reviewed_aspects',
    allQuestionsCovered: questions.length === input.brief.questions.length && questions.every(question => question.status === 'covered') }
}
