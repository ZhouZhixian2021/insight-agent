/** Parse the minimal candidate semantic judgment without calling a model or minting identities. */
import type { Availability, CandidateMetadataQuote, CandidateScopeDecision, CandidateSemanticQuestionMatch,
  CandidateSemanticQuestionMatchV2, CandidateSemanticReview, CandidateSemanticReviewV1,
  CandidateSemanticReviewV2 } from '@deepseek-ai/dsh-academic-model'
import { quoteOccursVerbatim } from './metadata-quotes.ts'
import { screeningJsonReaders } from './screening-json.ts'

const json = screeningJsonReaders('candidate semantic review')
const DOWNGRADED_REASON = 'The reported exclusion passage does not occur verbatim in the supplied title or abstract.'

function invalid(message: string): never { return json.invalid(message) }

/**
 * Read the minimal model judgment and check its questions and quotations against canonical metadata.
 * Version 1 records and responses require a verbatim passage on every matched question and on an exclusion;
 * version 2 requires one only where the reviewer supplied it. An exclusion whose passage is missing or
 * unverifiable becomes an `unknown` decision that records `downgraded`, so an unverifiable exclusion never
 * removes a candidate. Transport, timeout, truncation, and invalid JSON are caller failures; this parser never
 * converts a failure into a model `unknown` decision. The caller owns the approved Plan, model transport,
 * logging, and semantic review quality.
 * @param text Complete JSON response containing only `schemaVersion`, `scope`, and `matchedQuestions`.
 * @param title Canonical scholarly title supplied to the reviewer.
 * @param abstract Canonical scholarly-provider abstract; unavailable text cannot support quotations.
 * @param approvedQuestions Exact approved Brief questions permitted in matched questions.
 * @returns The reviewed judgment, with verified passages and any exclusion downgrade recorded.
 * @throws {RangeError} JSON, fields, question references, or supplied quotations are invalid.
 */
export function parseCandidateSemanticReview(text: string, title: string, abstract: Availability<string>,
  approvedQuestions: readonly string[]): CandidateSemanticReview {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    // JSON.parse alone can fail here; response content is excluded from the diagnostic.
    throw new RangeError('candidate semantic review: requires complete JSON')
  }
  const item = json.object(value, ['schemaVersion', 'scope', 'matchedQuestions'])
  if (item.schemaVersion === 1) return reviewV1(item, title, abstract, approvedQuestions)
  if (item.schemaVersion === 2) return reviewV2(item, title, abstract, approvedQuestions)
  return invalid('unsupported semantic review schemaVersion')
}

function reviewV1(item: Record<string, unknown>, title: string, abstract: Availability<string>,
  approvedQuestions: readonly string[]): CandidateSemanticReviewV1 {
  const matchedQuestions = json.array(item.matchedQuestions).map(readMatchRequired)
  checkQuestions(matchedQuestions, approvedQuestions)
  for (const match of matchedQuestions) validateQuote(match.quote, title, abstract)
  const scoped = readScopeV1(item.scope)
  if (scoped.status === 'off_topic') validateQuote(scoped.quote, title, abstract)
  if (scoped.status === 'potentially_relevant') {
    if (matchedQuestions.length === 0) invalid('potentially relevant review must match at least one approved question')
    return { schemaVersion: 1, scope: scoped,
      matchedQuestions: matchedQuestions as [CandidateSemanticQuestionMatch, ...CandidateSemanticQuestionMatch[]] }
  }
  if (matchedQuestions.length > 0) invalid('off-topic or unknown review cannot claim matched questions')
  return { schemaVersion: 1, scope: scoped, matchedQuestions: [] }
}

function reviewV2(item: Record<string, unknown>, title: string, abstract: Availability<string>,
  approvedQuestions: readonly string[]): CandidateSemanticReviewV2 {
  const matchedQuestions = json.array(item.matchedQuestions).map(readMatchOptional)
  checkQuestions(matchedQuestions, approvedQuestions)
  for (const match of matchedQuestions) {
    if (match.quote !== undefined) validateQuote(match.quote, title, abstract)
  }
  const scoped = readScopeV2(item.scope)
  if (scoped.status === 'off_topic') {
    if (matchedQuestions.length > 0) invalid('off-topic or unknown review cannot claim matched questions')
    if (scoped.quote !== undefined && quoteOccursVerbatim(scoped.quote, title, abstract)) {
      return { schemaVersion: 2, scope: { status: 'off_topic', reason: scoped.reason, quote: scoped.quote },
        matchedQuestions: [] }
    }
    return { schemaVersion: 2, scope: { status: 'unknown', reason: DOWNGRADED_REASON },
      matchedQuestions: [], downgraded: 'unverifiable_exclusion_quote' }
  }
  if (scoped.status === 'potentially_relevant') {
    if (matchedQuestions.length === 0) invalid('potentially relevant review must match at least one approved question')
    return { schemaVersion: 2, scope: scoped,
      matchedQuestions: matchedQuestions as [CandidateSemanticQuestionMatchV2, ...CandidateSemanticQuestionMatchV2[]] }
  }
  if (matchedQuestions.length > 0) invalid('off-topic or unknown review cannot claim matched questions')
  return { schemaVersion: 2, scope: scoped, matchedQuestions: [] }
}

function checkQuestions(matches: readonly { readonly question: string }[], approvedQuestions: readonly string[]): void {
  const seen = new Set<string>()
  for (const match of matches) {
    if (!approvedQuestions.includes(match.question)) invalid('matched question must be an approved Brief question')
    if (seen.has(match.question)) invalid('matched questions must be distinct')
    seen.add(match.question)
  }
}

function readMatchRequired(value: unknown): CandidateSemanticQuestionMatch {
  const item = json.object(value, ['question', 'quote'])
  return { question: json.nonempty(item.question), quote: json.quote(item.quote) }
}

function readMatchOptional(value: unknown): CandidateSemanticQuestionMatchV2 {
  const item = json.object(value, ['question', 'quote'])
  const question = json.nonempty(item.question)
  return item.quote === undefined ? { question } : { question, quote: json.quote(item.quote) }
}

/** Scope as the model wrote it, before any passage requirement is applied. */
type ParsedScope =
  | { readonly status: 'potentially_relevant'; readonly reason: string }
  | { readonly status: 'unknown'; readonly reason: string }
  | { readonly status: 'off_topic'; readonly reason: string; readonly quote?: CandidateMetadataQuote }

function readScopeV1(value: unknown): CandidateScopeDecision {
  const scoped = readScopeV2(value)
  if (scoped.status !== 'off_topic') return scoped
  const quoted = json.object(value, ['status', 'reason', 'quote'])
  return { status: 'off_topic', reason: scoped.reason, quote: json.quote(quoted.quote) }
}

function readScopeV2(value: unknown): ParsedScope {
  const item = json.object(value, ['status', 'reason', 'quote'])
  const reason = json.nonempty(item.reason)
  switch (item.status) {
    case 'off_topic':
      return item.quote === undefined ? { status: 'off_topic', reason } : { status: 'off_topic', reason,
        quote: json.quote(item.quote) }
    case 'unknown':
    case 'potentially_relevant':
      json.object(value, ['status', 'reason'])
      return { status: item.status, reason }
    default: return invalid('invalid scope status')
  }
}

function validateQuote(quote: CandidateMetadataQuote, title: string, abstract: Availability<string>): void {
  if (!quoteOccursVerbatim(quote, title, abstract)) {
    throw new RangeError('candidate semantic review: quote must occur verbatim in the corresponding title or scholarly abstract')
  }
}
