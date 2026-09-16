/** Parses untrusted model JSON into B's evidence drafts without minting identities. */
import { EvidenceError, type EvidenceDraft, type EvidenceCardItemDraft } from '@deepseek-ai/dsh-academic-evidence'
import type { Availability } from '@deepseek-ai/dsh-academic-model'
import { MAX_EVIDENCE_DRAFTS } from './model-limits.ts'

type Reader<T> = (value: unknown, path: string) => T

/**
 * Validates a complete JSON response of at most six entries before returning any evidence drafts.
 * Failed availability requires producer-owned identities and is not accepted from the model.
 * Source index bounds, excerpt matching and semantic review remain downstream checks.
 * @param text - complete model response, without Markdown framing.
 * @returns validated drafts, including an empty array when no evidence was proposed.
 * @throws EvidenceError with EVIDENCE_INVALID_MODEL_OUTPUT for invalid JSON or fields.
 */
export function parseEvidenceDrafts(text: string): readonly EvidenceDraft[] {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    // JSON.parse is the only operation here; syntax failures expose no response content.
    return invalid('$', 'expected JSON')
  }
  const drafts = array(value, '$', draft)
  if (drafts.length > MAX_EVIDENCE_DRAFTS) invalid('$', `expected at most ${MAX_EVIDENCE_DRAFTS} entries`)
  return drafts
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
  const item = object(value, path, ['segmentIndex', 'sourcedStatement', 'verbatimExcerpt', 'cardItems', 'qualityNotes'])
  const index = item.segmentIndex
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
    invalid(`${path}.segmentIndex`, 'expected non-negative safe integer')
  }
  return {
    segmentIndex: index,
    sourcedStatement: nonempty(item.sourcedStatement, `${path}.sourcedStatement`),
    verbatimExcerpt: nonempty(item.verbatimExcerpt, `${path}.verbatimExcerpt`),
    cardItems: array(item.cardItems, `${path}.cardItems`, cardItem),
    ...item.qualityNotes === undefined ? {} : { qualityNotes: array(item.qualityNotes, `${path}.qualityNotes`, string) },
  }
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
