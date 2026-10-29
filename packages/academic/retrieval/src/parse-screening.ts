/** Parse external semantic reviews without calling a model or minting paper identities. */
import type { Availability, CandidateMetadataQuote, CandidateMetadataSignal, CandidateScopeDecision,
  CandidateScreeningDetails, CandidateSurfaceKeywordHit } from '@deepseek-ai/dsh-academic-model'
import { quoteOccursVerbatim, validateScreeningQuotes } from './metadata-quotes.ts'
import { screeningJsonReaders } from './screening-json.ts'

const json = screeningJsonReaders('candidate screening')
const DOWNGRADED_REASON = 'The reported exclusion passage does not occur verbatim in the supplied title or abstract.'

function invalid(message: string): never { return json.invalid(message) }

/**
 * Read a complete semantic review and check it against the canonical scholarly metadata.
 * Version 1 requires a passage on every signal; version 2 accepts unquoted indications and downgrades an
 * exclusion whose passage is missing or unverifiable to an `unknown` scope. The caller owns the approved Plan,
 * model transport, logging, and semantic review quality.
 * @param text Complete JSON response containing only CandidateScreeningDetails fields.
 * @param title Canonical scholarly title supplied to the reviewer.
 * @param abstract Canonical scholarly-provider abstract; unavailable text cannot support quotations.
 * @param keywords Canonical scholarly keywords, usable only for surface hits.
 * @param questions Exact approved Brief questions permitted in question signals.
 * @returns Structured indications with their verified passages, ready for the assessor's reviewedScreenings map.
 * @throws {RangeError} JSON, fields, question references, or supplied quotations are invalid.
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
  const item = json.object(value, ['schemaVersion', 'signals', 'surfaceKeywordHits', 'uncertainties', 'scope'])
  if (item.schemaVersion !== 1 && item.schemaVersion !== 2) invalid('unsupported screening schemaVersion')
  const version = item.schemaVersion
  const screening: CandidateScreeningDetails = {
    schemaVersion: version,
    signals: json.array(item.signals).map(entry => readSignal(entry, version)),
    surfaceKeywordHits: json.array(item.surfaceKeywordHits).map(readSurfaceHit),
    uncertainties: json.array(item.uncertainties).map(json.nonempty),
    scope: readScope(item.scope, version, title, abstract),
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

function readSignal(value: unknown, version: 1 | 2): CandidateMetadataSignal {
  const item = json.object(value, ['kind', 'question', 'label', 'classification', 'quote'])
  const quote = readOptionalQuote(item, version)
  switch (item.kind) {
    case 'question':
      json.object(value, ['kind', 'question', 'quote'])
      return { kind: 'question', question: json.nonempty(item.question), ...quote }
    case 'method':
    case 'evidence_type':
      json.object(value, ['kind', 'label', 'quote'])
      return { kind: item.kind, label: json.nonempty(item.label), ...quote }
    case 'contribution': {
      json.object(value, ['kind', 'classification', 'quote'])
      const classification = item.classification
      if (classification !== 'core_method' && classification !== 'empirical_evaluation'
        && classification !== 'benchmark_or_dataset' && classification !== 'review'
        && classification !== 'application' && classification !== 'adjacent_technology') {
        invalid('invalid contribution classification')
      }
      return { kind: 'contribution', classification, ...quote }
    }
    default: return invalid('invalid signal kind')
  }
}

/** Present field for both versions; version 2 may omit it entirely. */
function readOptionalQuote(item: Record<string, unknown>, version: 1 | 2): { readonly quote?: CandidateMetadataQuote } {
  if (version === 1 || item.quote !== undefined) return { quote: json.quote(item.quote) }
  return {}
}

function readScope(value: unknown, version: 1 | 2, title: string,
  abstract: Availability<string>): CandidateScopeDecision {
  const item = json.object(value, ['status', 'reason', 'quote'])
  const reason = json.nonempty(item.reason)
  switch (item.status) {
    case 'off_topic': {
      if (version === 1) return { status: 'off_topic', reason, quote: json.quote(item.quote) }
      if (item.quote === undefined) return { status: 'unknown', reason: DOWNGRADED_REASON }
      const quote = json.quote(item.quote)
      return quoteOccursVerbatim(quote, title, abstract)
        ? { status: 'off_topic', reason, quote }
        : { status: 'unknown', reason: DOWNGRADED_REASON }
    }
    case 'unknown':
    case 'potentially_relevant':
      json.object(value, ['status', 'reason'])
      return { status: item.status, reason }
    default: return invalid('invalid scope status')
  }
}

function readSurfaceHit(value: unknown): CandidateSurfaceKeywordHit {
  const item = json.object(value, ['term', 'source', 'text'])
  if (item.source !== 'title' && item.source !== 'abstract' && item.source !== 'keywords') {
    invalid('invalid surface hit source')
  }
  return { term: json.nonempty(item.term), source: item.source, text: json.nonempty(item.text) }
}
