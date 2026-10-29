/** Project a validated minimal semantic review into the screening details the evaluator merges. */
import type { CandidateScreeningDetails, CandidateSemanticReviewV1 } from '@deepseek-ai/dsh-academic-model'

/**
 * Carry only the model's scope and quoted question matches into screening details.
 * The evaluator merges its code-computed lexical cues and surface keyword hits into this value, so a
 * caller passes the validated model judgment instead of rebuilding lexical indications itself.
 * @param review - Validated minimal model judgment.
 * @returns Screening details with the model scope and quoted question matches and no code-computed cues.
 */
export function screeningFromSemanticReview(review: CandidateSemanticReviewV1): CandidateScreeningDetails {
  return {
    schemaVersion: 1,
    signals: review.matchedQuestions.map(match => ({ kind: 'question', question: match.question, quote: match.quote })),
    surfaceKeywordHits: [],
    uncertainties: [],
    scope: review.scope,
  }
}
