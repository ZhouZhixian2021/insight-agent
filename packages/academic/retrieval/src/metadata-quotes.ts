/** Exact scholarly metadata quotations shared by screening and ranking. */
import type { Availability, CandidateMetadataQuote, CandidateScreeningDetails } from '@deepseek-ai/dsh-academic-model'

/**
 * Reject quotations that cannot be traced to the supplied canonical metadata.
 * @param screening Structured metadata indications and paper-local scope judgment.
 * @param title Canonical scholarly title.
 * @param abstract Canonical scholarly-provider abstract with explicit availability.
 * @param questions Approved questions for this Brief version.
 * @returns Nothing when every quotation and question reference is valid.
 * @throws {RangeError} A quotation is empty, fabricated, or references an unapproved question.
 */
export function validateScreeningQuotes(screening: CandidateScreeningDetails, title: string,
  abstract: Availability<string>, questions: readonly string[]): void {
  const validate = (quote: CandidateMetadataQuote) => {
    const source = quote.source === 'title' ? title : abstract.status === 'available' ? abstract.value : undefined
    if (quote.text.trim() === '' || source === undefined || !source.includes(quote.text)) {
      throw new RangeError('screening quote must occur verbatim in the corresponding title or scholarly abstract')
    }
  }
  for (const signal of screening.signals) {
    validate(signal.quote)
    if (signal.kind === 'question' && !questions.includes(signal.question)) {
      throw new RangeError('screening signal must reference an approved Brief question')
    }
  }
  if (screening.scope.status === 'off_topic') validate(screening.scope.quote)
}
