/** Convert bounded semantic judgments into source-bound product conclusions. */
import { createProductClaimId, type ProductClaim, type ProductEvidence,
  type ProductEvidenceId, type ProductPlan, type ProductQuestionId } from '@deepseek-ai/dsh-product-insight-model'

/** One model judgment about whether an extracted statement follows from its exact excerpt. */
export interface ProductSemanticReview {
  readonly evidenceId: ProductEvidenceId
  readonly verdict: 'supported' | 'unsupported' | 'uncertain'
  readonly questionIds: readonly ProductQuestionId[]
  readonly rationale: string
}

/**
 * Attribute a supported judgment that omits its question list to the questions its excerpt was
 * collected for. Both claim admission and report settlement read the result, so one rule decides
 * which question a supported statement answers.
 * @param evidence - Exact source excerpts submitted for review.
 * @param reviews - Model judgments, possibly without question ids.
 * @returns Judgments whose supported verdicts name at least the excerpt questions.
 */
export function adoptEvidenceQuestions(evidence: readonly ProductEvidence[],
  reviews: readonly ProductSemanticReview[]): readonly ProductSemanticReview[] {
  const byId = new Map(evidence.map(item => [item.evidenceId, item]))
  return reviews.map(review => review.verdict !== 'supported' || review.questionIds.length > 0
    ? review
    : { ...review, questionIds: byId.get(review.evidenceId)?.questionIds ?? [] })
}

/**
 * Admit source-bound conclusions from one judgment per evidence record.
 * A supported judgment that omits its question list answers the questions the excerpt was collected
 * for; an omitted list on another verdict carries no conclusion.
 * @param plan - Approved plan whose questions can receive conclusions.
 * @param evidence - Exact source excerpts submitted for review.
 * @param reviews - One model judgment for each evidence item.
 * @returns Source-bound claims for supported, question-linked statements.
 */
export function claimsFromSemanticReview(plan: ProductPlan, evidence: readonly ProductEvidence[],
  reviews: readonly ProductSemanticReview[]): readonly ProductClaim[] {
  const byId = new Map(evidence.map(item => [item.evidenceId, item]))
  if (byId.size !== evidence.length || reviews.length !== evidence.length) {
    throw new RangeError('Semantic review must cover each distinct evidence record exactly once')
  }
  const seen = new Set<ProductEvidenceId>()
  const claims: ProductClaim[] = []
  for (const review of adoptEvidenceQuestions(evidence, reviews)) {
    const item = byId.get(review.evidenceId)
    if (item === undefined || seen.has(review.evidenceId) || !review.rationale.trim()
      || review.rationale.length > 600 || !['supported', 'unsupported', 'uncertain'].includes(review.verdict)
      || new Set(review.questionIds).size !== review.questionIds.length
      || review.questionIds.some(id => !plan.questions.some(question => question.questionId === id))
      || review.verdict === 'supported' && review.questionIds.length === 0) {
      throw new RangeError('Semantic review contains an unknown, repeated or invalid judgment')
    }
    seen.add(review.evidenceId)
    if (review.verdict !== 'supported') continue
    claims.push({ schemaVersion: 1, claimId: createProductClaimId(), text: item.sourcedStatement,
      scope: plan.scope, questionIds: review.questionIds, confidence: 'low',
      confidenceReasons: [review.rationale, 'One source excerpt supports this statement; independent confirmation is unavailable.'],
      evidenceLinks: [{ evidenceId: item.evidenceId, relation: 'supports', rationale: review.rationale }],
      evidenceSnapshot: { planId: plan.planId, planVersion: plan.version,
        evidenceItems: [{ evidenceId: item.evidenceId, candidatePageId: item.candidatePageId,
          contentHash: item.contentHash }] }, validity: 'current' })
  }
  return claims
}
