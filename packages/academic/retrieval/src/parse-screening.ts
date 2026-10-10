/** Parse external semantic reviews without calling a model or minting paper identities. */
import type { Availability, CandidateMetadataQuote, CandidateMetadataSignal, CandidateScopeDecision,
  CandidateScreeningDetails, CandidateSurfaceKeywordHit } from '@deepseek-ai/dsh-academic-model'
import { validateScreeningQuotes } from './metadata-quotes.ts'

/**
 * Read a complete semantic review and check it against the canonical scholarly metadata.
 * The caller owns the approved Plan, model transport, logging, and semantic review quality.
 * @param text Complete JSON response containing only CandidateScreeningDetails fields.
 * @param title Canonical scholarly title supplied to the reviewer.
 * @param abstract Canonical scholarly-provider abstract; unavailable text cannot support quotations.
 * @param keywords Canonical scholarly keywords, usable only for surface hits.
 * @param questions Exact approved Brief questions permitted in question signals.
 * @returns Structured indications with exact source quotations, ready for the assessor's reviewedScreenings map.
 * @throws {RangeError} JSON, fields, question references, or source quotations are invalid.
 */
export function parseCandidateScreening(text: string, title: string, abstract: Availability<string>,
  keywords: Availability<readonly string[]>, questions: readonly string[]): CandidateScreeningDetails {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    // JSON.parse alone can fail here; response content is excluded from the diagnostic.
    throw new RangeError('candidate screening requires complete JSON')
  }
  const item = object(value, ['schemaVersion', 'signals', 'surfaceKeywordHits', 'uncertainties', 'scope'])
  if (item.schemaVersion !== 1) invalid('unsupported screening schemaVersion')
  const screening: CandidateScreeningDetails = {
    schemaVersion: 1,
    signals: array(item.signals).map(readSignal),
    surfaceKeywordHits: array(item.surfaceKeywordHits).map(readSurfaceHit),
    uncertainties: array(item.uncertainties).map(nonempty),
    scope: readScope(item.scope),
  }
  validateScreeningQuotes(screening, title, abstract, questions)
  for (const hit of screening.surfaceKeywordHits) {
    const sources = hit.source === 'title' ? [title] : hit.source === 'abstract'
      ? abstract.status === 'available' ? [abstract.value] : []
      : keywords.status === 'available' ? keywords.value : []
    if (!sources.some(source => source.includes(hit.text)) || !hit.text.toLowerCase().includes(hit.term.toLowerCase())) {
      invalid('surface hit must quote its declared scholarly metadata source and contain its term')
    }
  }
  if (screening.scope.status === 'off_topic' && screening.signals.some(signal => signal.kind === 'question')) {
    invalid('off-topic review cannot also claim a matched research question')
  }
  return screening
}

function readSignal(value: unknown): CandidateMetadataSignal {
  const item = object(value, ['kind', 'question', 'label', 'classification', 'quote'])
  const quote = readQuote(item.quote)
  switch (item.kind) {
    case 'question':
      object(value, ['kind', 'question', 'quote'])
      return { kind: 'question', question: nonempty(item.question), quote }
    case 'method':
    case 'evidence_type':
      object(value, ['kind', 'label', 'quote'])
      return { kind: item.kind, label: nonempty(item.label), quote }
    case 'contribution': {
      object(value, ['kind', 'classification', 'quote'])
      const classification = item.classification
      if (classification !== 'core_method' && classification !== 'empirical_evaluation'
        && classification !== 'benchmark_or_dataset' && classification !== 'review'
        && classification !== 'application' && classification !== 'adjacent_technology') {
        invalid('invalid contribution classification')
      }
      return { kind: 'contribution', classification, quote }
    }
    default: return invalid('invalid signal kind')
  }
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

function readSurfaceHit(value: unknown): CandidateSurfaceKeywordHit {
  const item = object(value, ['term', 'source', 'text'])
  if (item.source !== 'title' && item.source !== 'abstract' && item.source !== 'keywords') {
    invalid('invalid surface hit source')
  }
  return { term: nonempty(item.term), source: item.source, text: nonempty(item.text) }
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
  throw new RangeError(`candidate screening: ${message}`)
}
