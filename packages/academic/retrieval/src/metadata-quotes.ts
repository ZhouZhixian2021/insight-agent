/** Exact scholarly metadata quotations shared by screening and ranking. */
import type { Availability, CandidateMetadataQuote, CandidateScreeningDetails } from '@deepseek-ai/dsh-academic-model'

/**
 * Reject quotations that cannot be traced to the supplied canonical metadata.
 * Schema version 1 screening requires a passage on every signal; version 2 checks only the passages a reviewer
 * supplied and treats their absence as an unquoted indication. An exclusion always carries a checkable passage.
 * @param screening Structured metadata indications and paper-local scope judgment.
 * @param title Canonical scholarly title.
 * @param abstract Canonical scholarly-provider abstract with explicit availability.
 * @param questions Approved questions for this Brief version.
 * @returns Nothing when every supplied quotation and question reference is valid.
 * @throws {RangeError} A supplied quotation is empty, fabricated, references an unapproved question, or version 1
 * screening omits a required quotation.
 */
export function validateScreeningQuotes(screening: CandidateScreeningDetails, title: string,
  abstract: Availability<string>, questions: readonly string[]): void {
  const validate = (quote: CandidateMetadataQuote) => {
    if (!quoteOccursVerbatim(quote, title, abstract)) {
      throw new RangeError('screening quote must occur verbatim in the corresponding title or scholarly abstract')
    }
  }
  const requireQuote = screening.schemaVersion === 1
  for (const signal of screening.signals) {
    if (signal.kind === 'question' && !questions.includes(signal.question)) {
      throw new RangeError('screening signal must reference an approved Brief question')
    }
    if (signal.quote === undefined) {
      if (requireQuote) throw new RangeError('version 1 screening requires a quote for every signal')
      continue
    }
    validate(signal.quote)
  }
  if (screening.scope.status === 'off_topic') validate(screening.scope.quote)
}

/**
 * Whether a quotation occurs verbatim in its declared scholarly-metadata source.
 * @param quote Declared source and exact passage.
 * @param title Canonical scholarly title.
 * @param abstract Canonical scholarly-provider abstract with explicit availability.
 * @returns True when the passage is non-empty and the source contains it unchanged.
 */
export function quoteOccursVerbatim(quote: CandidateMetadataQuote, title: string,
  abstract: Availability<string>): boolean {
  const source = quote.source === 'title' ? title : abstract.status === 'available' ? abstract.value : undefined
  return quote.text.trim() !== '' && source !== undefined && source.includes(quote.text)
}
