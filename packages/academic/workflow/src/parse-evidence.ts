/** Parses untrusted model JSON into B's evidence drafts without minting identities. */
import { EvidenceError, type EvidenceDraft, type EvidenceCardItemDraft } from '@deepseek-ai/dsh-academic-evidence'
import type { Availability } from '@deepseek-ai/dsh-academic-model'
import { MAX_EVIDENCE_DRAFTS } from './model-limits.ts'
import type { PaperModelResponse, PaperScopeDecision } from './model-types.ts'

type Reader<T> = (value: unknown, path: string) => T

/**
 * Validates a complete scope-and-evidence JSON response before returning its evidence drafts.
 * Failed availability requires producer-owned identities and is not accepted from the model.
 * Source index bounds, excerpt matching and semantic review remain downstream checks.
 * @param text - complete model response, without Markdown framing.
 * @returns validated drafts, including an empty array when no evidence was proposed or the paper was excluded.
 * @throws EvidenceError with EVIDENCE_INVALID_MODEL_OUTPUT for invalid JSON or fields.
 */
export function parseEvidenceDrafts(text: string): readonly EvidenceDraft[] {
  return parsePaperModelResponse(text).evidence
}

/**
 * Validates one complete scope decision and its evidence drafts.
 * @param text - complete model response, without Markdown framing.
 * @returns the validated scope decision and evidence drafts.
 * @throws EvidenceError with EVIDENCE_INVALID_MODEL_OUTPUT for invalid JSON or fields.
 */
export function parsePaperModelResponse(text: string): PaperModelResponse {
  const value = parseJson(text)
  const response = object(value, '$', ['scope', 'evidence'])
  const scope = scopeDecision(response.scope, '$.scope')
  const drafts = array(response.evidence, '$.evidence', draft)
  if (drafts.length > MAX_EVIDENCE_DRAFTS) invalid('$', `expected at most ${MAX_EVIDENCE_DRAFTS} entries`)
  if (scope.status !== 'included' && drafts.length > 0) invalid('$.evidence', 'expected no evidence for a non-included paper')
  return { scope, evidence: drafts }
}

/**
 * Validate one paper-level admission answer without interpreting source text as instructions.
 * @param text - complete model response.
 * @returns included, excluded, or insufficient-context decision.
 */
export function parseScopeDecision(text: string): PaperScopeDecision {
  return scopeDecision(parseJson(text), '$')
}

/**
 * Validate focused model facts and construct conservative six-section card items.
 * Missing section details remain not_extracted; source matching is owned by the evidence package.
 * @param text - complete model response.
 * @returns evidence drafts for source verification.
 */
export function parseFocusedEvidence(text: string): readonly EvidenceDraft[] {
  const response = object(parseJson(text), '$', ['evidence'])
  const drafts = array(response.evidence, '$.evidence', (value, path): EvidenceDraft => {
    const item = object(value, path, ['segmentIndex', 'questionIndexes', 'sourcedStatement', 'verbatimExcerpt', 'section'])
    const index = item.segmentIndex
    if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
      invalid(`${path}.segmentIndex`, 'expected non-negative safe integer')
    }
    const section = choice('researchQuestions', 'methods', 'datasets', 'metrics', 'findings', 'limitations')(
      item.section, `${path}.section`)
    const statement = nonempty(item.sourcedStatement, `${path}.sourcedStatement`)
    const missing = { status: 'not_extracted' as const }
    let cardItem: EvidenceCardItemDraft
    switch (section) {
      case 'researchQuestions': cardItem = { section, statement, questionType: missing }; break
      case 'methods': cardItem = { section, statement, methodName: missing, methodRole: missing }; break
      case 'datasets': cardItem = { section, statement, datasetName: missing, version: missing, split: missing,
        scale: missing }; break
      case 'metrics': cardItem = { section, statement, metricName: missing, value: missing, unit: missing,
        direction: missing, evaluationContext: missing }; break
      case 'findings': cardItem = { section, statement, findingType: missing, conditions: missing }; break
      case 'limitations': cardItem = { section, statement, limitationType: missing }; break
    }
    return { segmentIndex: index, questionIndexes: questionIndexes(item.questionIndexes, `${path}.questionIndexes`),
      sourcedStatement: statement, verbatimExcerpt: nonempty(item.verbatimExcerpt, `${path}.verbatimExcerpt`),
      cardItems: [cardItem] }
  })
  if (drafts.length > MAX_EVIDENCE_DRAFTS) invalid('$.evidence', `expected at most ${MAX_EVIDENCE_DRAFTS} entries`)
  return drafts
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // JSON.parse is the only operation here; syntax failures expose no response content.
    return invalid('$', 'expected JSON')
  }
}

function scopeDecision(value: unknown, path: string): PaperScopeDecision {
  const item = object(value, path, ['status', 'reason'])
  const reason = nonempty(item.reason, `${path}.reason`)
  if (item.status === 'included' || item.status === 'excluded' || item.status === 'needs_more_context') {
    return { status: item.status, reason }
  }
  return invalid(`${path}.status`, 'invalid enum value')
}

function invalid(path: string, message: string): never {
  throw new EvidenceError(`${path}: ${message}`, 'EVIDENCE_INVALID_MODEL_OUTPUT')
}

function object(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'expected object')
  if (Object.keys(value).some(key => !keys.includes(key))) invalid(path, 'unexpected field')
  return value as Record<string, unknown>
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') invalid(path, 'expected string')
  return value
}

function nonempty(value: unknown, path: string): string {
  const text = string(value, path)
  if (text.trim().length === 0) invalid(path, 'expected non-empty string')
  return text
}

function array<T>(value: unknown, path: string, read: Reader<T>): T[] {
  if (!Array.isArray(value)) invalid(path, 'expected array')
  return value.map((entry: unknown, index: number) => read(entry, `${path}[${index}]`))
}

function choice<const T extends string>(...values: readonly T[]): Reader<T> {
  return (value, path) => {
    const found = values.find(candidate => candidate === value)
    if (found === undefined) invalid(path, 'invalid enum value')
    return found
  }
}

function availability<T>(read: Reader<T>): Reader<Availability<T>> {
  return (value, path) => {
    const item = object(value, path, ['status', 'value', 'reason'])
    switch (item.status) {
      case 'available':
        object(item, path, ['status', 'value'])
        return { status: 'available', value: read(item.value, `${path}.value`) }
      case 'unknown':
      case 'not_applicable':
        object(item, path, ['status', 'reason'])
        return { status: item.status, reason: nonempty(item.reason, `${path}.reason`) }
      case 'not_extracted':
        object(item, path, ['status', 'reason'])
        return { status: 'not_extracted', ...item.reason === undefined
          ? {} : { reason: string(item.reason, `${path}.reason`) } }
      default:
        return invalid(`${path}.status`, 'unsupported model availability state')
    }
  }
}

function metricValue(value: unknown, path: string): string | number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid(path, 'expected finite number')
    return value
  }
  return string(value, path)
}

function draft(value: unknown, path: string): EvidenceDraft {
  const item = object(value, path, ['segmentIndex', 'questionIndexes', 'sourcedStatement', 'verbatimExcerpt', 'cardItems', 'qualityNotes'])
  const index = item.segmentIndex
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
    invalid(`${path}.segmentIndex`, 'expected non-negative safe integer')
  }
  return {
    segmentIndex: index,
    questionIndexes: questionIndexes(item.questionIndexes, `${path}.questionIndexes`),
    sourcedStatement: nonempty(item.sourcedStatement, `${path}.sourcedStatement`),
    verbatimExcerpt: nonempty(item.verbatimExcerpt, `${path}.verbatimExcerpt`),
    cardItems: array(item.cardItems, `${path}.cardItems`, cardItem),
    ...item.qualityNotes === undefined ? {} : { qualityNotes: array(item.qualityNotes, `${path}.qualityNotes`, string) },
  }
}

function questionIndexes(value: unknown, path: string): readonly number[] {
  const indexes = array(value, path, (entry, entryPath) => {
    if (typeof entry !== 'number' || !Number.isSafeInteger(entry) || entry < 0) {
      invalid(entryPath, 'expected non-negative safe integer')
    }
    return entry
  })
  if (indexes.length === 0) invalid(path, 'expected at least one focus-question index')
  if (new Set(indexes).size !== indexes.length) invalid(path, 'expected distinct focus-question indexes')
  return indexes
}

function cardItem(value: unknown, path: string): EvidenceCardItemDraft {
  const item = object(value, path, [
    'section', 'statement', 'questionType', 'methodName', 'methodRole', 'datasetName', 'version', 'split', 'scale',
    'metricName', 'value', 'unit', 'direction', 'evaluationContext', 'findingType', 'conditions', 'limitationType',
  ])
  const statement = nonempty(item.statement, `${path}.statement`)
  const field = <T>(key: string, read: Reader<T>): Availability<T> => availability(read)(item[key], `${path}.${key}`)
  const keys = (...fields: string[]): void => { object(item, path, ['section', 'statement', ...fields]) }
  switch (item.section) {
    case 'researchQuestions':
      keys('questionType')
      return { section: 'researchQuestions', statement,
        questionType: field('questionType', choice('descriptive', 'comparative', 'causal', 'exploratory', 'other')) }
    case 'methods':
      keys('methodName', 'methodRole')
      return { section: 'methods', statement, methodName: field('methodName', string),
        methodRole: field('methodRole', choice('proposed', 'baseline', 'evaluation', 'analysis', 'other')) }
    case 'datasets':
      keys('datasetName', 'version', 'split', 'scale')
      return { section: 'datasets', statement, datasetName: field('datasetName', string), version: field('version', string),
        split: field('split', string), scale: field('scale', string) }
    case 'metrics':
      keys('metricName', 'value', 'unit', 'direction', 'evaluationContext')
      return { section: 'metrics', statement, metricName: field('metricName', string), value: field('value', metricValue),
        unit: field('unit', string), direction: field('direction', choice('higher_better', 'lower_better', 'context_dependent')),
        evaluationContext: field('evaluationContext', string) }
    case 'findings':
      keys('findingType', 'conditions')
      return { section: 'findings', statement,
        findingType: field('findingType', choice('primary', 'secondary', 'negative', 'null_result', 'other')),
        conditions: field('conditions', string) }
    case 'limitations':
      keys('limitationType')
      return { section: 'limitations', statement,
        limitationType: field('limitationType', choice('data', 'method', 'evaluation', 'generalizability', 'author_stated', 'other')) }
    default:
      return invalid(`${path}.section`, 'invalid card section')
  }
}
