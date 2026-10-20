/** Parse the minimal candidate semantic judgment without calling a model or minting identities. */
import type { Availability, CandidateMetadataQuote, CandidateScopeDecision, CandidateSemanticQuestionMatch,
  CandidateSemanticReviewV1 } from '@deepseek-ai/dsh-academic-model'

/**
 * Read the minimal model judgment and check its questions and quotations against canonical metadata.
 * Transport, timeout, truncation, and invalid JSON are caller failures; this parser never converts a
 * failure into a model `unknown` decision. The caller owns the approved Plan, model transport, logging,
 * and semantic review quality.
 * @param text Complete JSON response containing only `schemaVersion`, `scope`, and `matchedQuestions`.
 * @param title Canonical scholarly title supplied to the reviewer.
 * @param abstract Canonical scholarly-provider abstract; unavailable text cannot support quotations.
 * @param approvedQuestions Exact approved Brief questions permitted in matched questions.
 * @returns A reviewed scope decision whose question quotations occur verbatim in the supplied metadata.
 * @throws {RangeError} JSON, fields, question references, or source quotations are invalid.
 */
export function parseCandidateSemanticReview(text: string, title: string, abstract: Availability<string>,
  approvedQuestions: readonly string[]): CandidateSemanticReviewV1 {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    // JSON.parse alone can fail here; response content is excluded from the diagnostic.
    throw new RangeError('candidate semantic review: requires complete JSON')
  }
  const item = object(value, ['schemaVersion', 'scope', 'matchedQuestions'])
  if (item.schemaVersion !== 1) invalid('unsupported semantic review schemaVersion')
  const matchedQuestions = array(item.matchedQuestions).map(readMatch)
  const seen = new Set<string>()
  for (const match of matchedQuestions) {
    if (!approvedQuestions.includes(match.question)) invalid('matched question must be an approved Brief question')
    if (seen.has(match.question)) invalid('matched questions must be distinct')
    seen.add(match.question)
    validateQuote(match.quote, title, abstract)
  }
  const scope = readScope(item.scope)
  if (scope.status === 'off_topic') validateQuote(scope.quote, title, abstract)
  if (scope.status === 'potentially_relevant') {
    if (matchedQuestions.length === 0) invalid('potentially relevant review must match at least one approved question')
    return { schemaVersion: 1, scope,
      matchedQuestions: matchedQuestions as [CandidateSemanticQuestionMatch, ...CandidateSemanticQuestionMatch[]] }
  }
  if (matchedQuestions.length > 0) invalid('off-topic or unknown review cannot claim matched questions')
  return { schemaVersion: 1, scope, matchedQuestions: [] }
}

function readMatch(value: unknown): CandidateSemanticQuestionMatch {
  const item = object(value, ['question', 'quote'])
  return { question: nonempty(item.question), quote: readQuote(item.quote) }
}

function readQuote(value: unknown): CandidateMetadataQuote {
  const item = object(value, ['source', 'text'])
  if (item.source !== 'title' && item.source !== 'abstract') invalid('quote source must be title or abstract')
  return { source: item.source, text: nonempty(item.text) }
}

function readScope(value: unknown): CandidateScopeDecision {
  const item = object(value, ['status', 'reason', 'quote'])
  const reason = nonempty(item.reason)
  switch (item.status) {
    case 'off_topic': return { status: 'off_topic', reason, quote: readQuote(item.quote) }
    case 'unknown':
    case 'potentially_relevant':
      object(value, ['status', 'reason'])
      return { status: item.status, reason }
    default: return invalid('invalid scope status')
  }
}

function validateQuote(quote: CandidateMetadataQuote, title: string, abstract: Availability<string>): void {
  const source = quote.source === 'title' ? title : abstract.status === 'available' ? abstract.value : undefined
  if (quote.text.trim() === '' || source === undefined || !source.includes(quote.text)) {
    throw new RangeError('candidate semantic review: quote must occur verbatim in the corresponding title or scholarly abstract')
  }
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid('expected object')
  if (Object.keys(value).some(key => !keys.includes(key))) invalid('unexpected field')
  return value as Record<string, unknown>
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid('expected array')
  return value
}

function nonempty(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') invalid('expected non-empty string')
  return value
}

function invalid(message: string): never {
  throw new RangeError(`candidate semantic review: ${message}`)
}
