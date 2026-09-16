/** Ordered HTML/PDF acquisition over a caller-owned web fetcher. */

import { prepareFetchedAcademicFullText } from './fetched-fulltext.ts'
import { prepareFetchedAcademicPdf } from './fetched-pdf.ts'
import { EvidenceError } from './types.ts'
import type { AcademicFullTextFetchInput, AcademicWebFetcher, EvidenceExtractionInput } from './types.ts'

/**
 * Fetch candidate full-text URLs in order, accepting the first confirmed HTML or PDF body.
 *
 * @param input - paper provenance and candidate URLs in preference order.
 * @param fetcher - caller adapter over its configured web fetch service.
 * @param signal - optional cancellation forwarded through acquisition and parsing.
 * @returns the first confirmed locatable full-text input.
 */
export async function fetchAcademicFullText(
  input: AcademicFullTextFetchInput,
  fetcher: AcademicWebFetcher,
  signal?: AbortSignal,
): Promise<EvidenceExtractionInput> {
  if (input.urls.length === 0) throw new EvidenceError('at least one full-text URL is required', 'EVIDENCE_FULLTEXT_UNCONFIRMED')
  const { urls, ...provenance } = input
  let failure: unknown
  for (const url of urls) {
    signal?.throwIfAborted()
    try {
      const fetched = await fetcher(url, signal)
      const prepared = { ...provenance, fetched }
      if (fetched.body.kind === 'pdf') return await prepareFetchedAcademicPdf(prepared, signal)
      return prepareFetchedAcademicFullText(prepared)
    } catch (error: unknown) {
      signal?.throwIfAborted()
      failure = error
    }
  }
  throw failure
}
