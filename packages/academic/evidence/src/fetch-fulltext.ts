/** Ordered HTML/PDF acquisition over a caller-owned web fetcher. */

import type { FailureCategory } from '@deepseek-ai/dsh-academic-model'

import { prepareFetchedAcademicFullText } from './fetched-fulltext.ts'
import { prepareFetchedAcademicPdf } from './fetched-pdf.ts'
import { EvidenceError } from './types.ts'
import type {
  AcademicFullTextFetchInput,
  AcademicFullTextObservation,
  AcademicFullTextObserver,
  AcademicWebFetcher,
  EvidenceExtractionInput,
} from './types.ts'

/**
 * Fetch candidate full-text URLs in order, accepting the first confirmed HTML or PDF body.
 *
 * @param input - paper provenance and candidate URLs in preference order.
 * @param fetcher - caller adapter over its configured web fetch service.
 * @param signal - optional cancellation forwarded through acquisition and parsing.
 * @param onFullText - optional observer of per-candidate started and settled facts.
 * @returns the first confirmed locatable full-text input.
 */
export async function fetchAcademicFullText(
  input: AcademicFullTextFetchInput,
  fetcher: AcademicWebFetcher,
  signal?: AbortSignal,
  onFullText?: AcademicFullTextObserver,
): Promise<EvidenceExtractionInput> {
  if (input.urls.length === 0) throw new EvidenceError('at least one full-text URL is required', 'EVIDENCE_FULLTEXT_UNCONFIRMED')
  const { urls, ...provenance } = input
  let failure: unknown
  for (const [index, url] of urls.entries()) {
    signal?.throwIfAborted()
    const candidate = { url, candidateIndex: index + 1, candidateCount: urls.length }
    reportFullText(onFullText, { ...candidate, phase: 'started', settlement: null, category: null, bodyKind: null })
    try {
      const fetched = await fetcher(url, signal)
      const prepared = { ...provenance, fetched }
      const result = fetched.body.kind === 'pdf'
        ? await prepareFetchedAcademicPdf(prepared, signal)
        : prepareFetchedAcademicFullText(prepared)
      reportFullText(onFullText, { ...candidate, phase: 'settled', settlement: 'success',
        category: null, bodyKind: fetched.body.kind === 'pdf' ? 'pdf' : 'html' })
      return result
    } catch (error: unknown) {
      if (signal?.aborted === true) {
        reportFullText(onFullText, { ...candidate, phase: 'settled', settlement: 'cancelled',
          category: null, bodyKind: null })
        signal.throwIfAborted()
      }
      failure = error
      reportFullText(onFullText, { ...candidate, phase: 'settled', settlement: 'failed',
        category: fullTextFailureCategory(error), bodyKind: null })
    }
  }
  throw failure
}

/**
 * Classify one candidate failure into the shared failure taxonomy. Evidence errors map by their
 * stable code; a timeout DOMException is a timeout and every other rejection is a transport failure.
 * Caller cancellation is published as `cancelled` before this runs.
 * @param error - the candidate's rejection value.
 * @returns the shared failure category.
 */
function fullTextFailureCategory(error: unknown): FailureCategory {
  if (error instanceof EvidenceError) {
    switch (error.code) {
      case 'EVIDENCE_FULLTEXT_UNCONFIRMED': return 'fulltext_unavailable'
      case 'EVIDENCE_FETCH_STATUS': return 'upstream_error'
      case 'EVIDENCE_FETCH_TRUNCATED':
      case 'EVIDENCE_FETCH_BODY_UNSUPPORTED':
      case 'EVIDENCE_PDF_PARSE_FAILED': return 'parse_failed'
      default: return 'unknown'
    }
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout'
  return 'network_error'
}

/**
 * Publish one candidate observation. Progress is observational: a throwing observer never
 * changes the acquisition result or interrupts sibling notifications.
 * @param observer - the caller's observer, if any.
 * @param observation - the fact to publish.
 */
function reportFullText(observer: AcademicFullTextObserver | undefined, observation: AcademicFullTextObservation): void {
  if (observer === undefined) return
  try {
    observer(observation)
  } catch {
    // Progress is observational; a broken subscriber cannot change full-text acquisition.
  }
}
