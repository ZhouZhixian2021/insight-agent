/** Project a validated minimal semantic review into the screening details the evaluator merges. */
import type { CandidateScreeningDetails, CandidateScopeDecision, CandidateSemanticReview } from '@deepseek-ai/dsh-academic-model'

/**
 * Carry only the model's scope and question matches into screening details.
 * The evaluator merges its code-computed lexical cues and surface keyword hits into this value, so a
 * caller passes the validated model judgment instead of rebuilding lexical indications itself. A version 2
 * judgment may match a question without a passage; that signal then carries no quote.
 * @param review - Validated minimal model judgment.
 * @returns Screening details with the model scope and question matches and no code-computed cues.
 */
export function screeningFromSemanticReview(review: CandidateSemanticReview): CandidateScreeningDetails {
  return {
    schemaVersion: review.schemaVersion,
    signals: review.matchedQuestions.map((match) => {
      const question = { kind: 'question' as const, question: match.question }
      return match.quote === undefined ? question : { ...question, quote: match.quote }
    }),
    surfaceKeywordHits: [],
    uncertainties: [],
    scope: scoped(review),
  }
}

function scoped(review: CandidateSemanticReview): CandidateScopeDecision {
  const { reason } = review.scope
  if (review.scope.status === 'off_topic') return { status: 'off_topic', reason, quote: review.scope.quote }
  if (review.scope.status === 'potentially_relevant') return { status: 'potentially_relevant', reason }
  return { status: 'unknown', reason }
}
