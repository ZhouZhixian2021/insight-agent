/** Fixed T0 and released master Trace history admission for the incoming edges. */

import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { SessionFormatError, SessionFormatUnsupportedMigrationError, isSessionFormatJsonObject, sessionFormatCount } from '@deepseek-ai/dsh-session-format'
import type { SessionFormatArtifact, SessionFormatEvent, SessionFormatJsonObject, SessionFormatJsonValue } from '@deepseek-ai/dsh-session-format'
import { academicV2Schema } from './academic-schema.ts'

const payloads = new Map(Object.entries(academicV2Schema.properties).map(([type, schema]) =>
  [type, z.fromJSONSchema({ ...schema, $defs: academicV2Schema.$defs })]))
const envelope = z.strictObject({ type: z.string(), seq: z.number().int().nonnegative(), time: z.number().int(),
  data: z.unknown(), ignorable: z.literal(true).optional() })

/** Exact audited T0 and released Trace event names; installed plugins do not extend this set. */
export const ACADEMIC_V2_EVENT_TYPES: ReadonlySet<string> = new Set(payloads.keys())

const requestTypes: Readonly<Record<string, string>> = {
  'academic/evidence-result': 'academic/evidence-request',
  'academic/synthesis-result': 'academic/synthesis-request',
  'academic/candidate-screening-result': 'academic/candidate-screening-request',
  'academic/candidate-semantic-review-result-v1': 'academic/candidate-semantic-review-request-v1',
  'academic/candidate-semantic-review-verified-v1': 'academic/candidate-semantic-review-request-v1',
}
const selectionTypes = new Set(['academic/candidate-semantic-review-request-v1',
  'academic/candidate-semantic-review-result-v1', 'academic/candidate-semantic-review-verified-v1'])
const targetTypes = new Set([...Object.values(requestTypes), 'academic/candidate-review-selection-v1'])
const identityFields = ['academicWorkId', 'workVersionId', 'researchBriefId', 'researchBriefVersion',
  'roundIndex', 'selectionSeq', 'source', 'phase', 'attempt'] as const

/**
 * Validate one audited academic log envelope and its fixed historical payload without rewriting values.
 * @param event - decoded V2 input or the academic intermediate emitted into V3.
 */
export function assertAcademicV2Event(event: SessionFormatEvent): void {
  const schema = payloads.get(event.type)
  if (schema === undefined) throw new SessionFormatUnsupportedMigrationError('unclassified academic history event ' + event.type)
  const framing = envelope.safeParse(event)
  if (!framing.success) throw new SessionFormatUnsupportedMigrationError(`academic history envelope at seq ${event.seq} is not log-only`)
  const result = schema.safeParse(event.data)
  if (!result.success) {
    const field = result.error.issues[0]?.path.join('.') ?? 'data'
    throw new SessionFormatUnsupportedMigrationError(
      `academic history ${event.type} at seq ${event.seq} has unaudited payload field ${field}`,
    )
  }
}

/** Per-artifact academic target identities; each incoming edge owns an independent instance. */
export class AcademicV2History {
  private readonly targets = new Map<number, {
    type: string
    identity: SessionFormatJsonObject
    selected: readonly SessionFormatJsonObject[]
  }>()

  /**
   * Validate and remap audited references, keeping counters, nulls, and all identities unchanged.
   * @param event - source-coordinate event, including standard events that pass through unchanged.
   * @param seq - actual target position after any insertion in this edge.
   * @param mapping - settled target positions of earlier source events.
   * @returns the academic event in target coordinates, or the unchanged standard event.
   */
  remap(event: SessionFormatEvent, seq: number, mapping: readonly number[]): SessionFormatEvent {
    if (!ACADEMIC_V2_EVENT_TYPES.has(event.type)) return event
    assertAcademicV2Event(event)
    const data = object(event.data)
    let converted = data
    const reference = (field: 'selectionSeq' | 'requestSeq', expected: string): void => {
      if (data[field] === null) return
      const source = sessionFormatCount(data[field], 'academic ' + field)
      const target = this.targets.get(source), mapped = mapping[source]
      if (source >= event.seq || mapped === undefined || target?.type !== expected) {
        throw new SessionFormatError('academic ' + field + ' must name an earlier ' + expected)
      }
      for (const key of identityFields) {
        if (Object.hasOwn(data, key) && Object.hasOwn(target.identity, key)
          && !isDeepStrictEqual(data[key], target.identity[key])) {
          throw new SessionFormatError('academic ' + field + ' identity mismatch: ' + key)
        }
      }
      if (field === 'selectionSeq' && !target.selected.some(candidate =>
        candidate['academicWorkId'] === data['academicWorkId'] && candidate['workVersionId'] === data['workVersionId'])) {
        throw new SessionFormatError('academic selectionSeq does not select this work version')
      }
      converted = { ...converted, [field]: mapped }
    }
    if (selectionTypes.has(event.type)) reference('selectionSeq', 'academic/candidate-review-selection-v1')
    const expected = Object.hasOwn(requestTypes, event.type) ? requestTypes[event.type] : undefined
    if (expected !== undefined) reference('requestSeq', expected)
    if (targetTypes.has(event.type)) {
      const identityEntries: [string, SessionFormatJsonValue][] = []
      for (const key of identityFields) {
        const value = data[key]
        if (Object.hasOwn(data, key) && value !== undefined) identityEntries.push([key, value])
      }
      const identity = Object.fromEntries(identityEntries)
      const selected = event.type === 'academic/candidate-review-selection-v1'
        ? (object(data['selection'])['decisions'] as readonly SessionFormatJsonObject[]).filter(item => item['status'] === 'selected') : []
      this.targets.set(event.seq, { type: event.type, identity, selected })
    }
    return { ...event, seq, data: converted }
  }
}

/**
 * Recheck converted V3 child history without granting native V3 extension admission.
 * @param artifact - V3 intermediate produced by the predecessor chain.
 * @returns the same artifact after academic payload and relationship checks.
 */
export function validateAcademicV3History(artifact: SessionFormatArtifact): SessionFormatArtifact {
  const history = new AcademicV2History(), mapping: number[] = []
  for (const event of artifact.events) {
    history.remap(event, event.seq, mapping)
    mapping.push(event.seq)
  }
  return artifact
}

/**
 * Convert only the two audited request attributions after academic V3 validation.
 * @param event - validated academic V3 intermediate with remapped references.
 * @returns an event retaining request IDs, roles, text, config, and all other payload values.
 */
export function rewriteAcademicV3Sources(event: SessionFormatEvent): SessionFormatEvent {
  if (!event.type.endsWith('-request') && !event.type.endsWith('-request-v1')) return event
  const data = object(event.data)
  const messages = data['messages'] as readonly SessionFormatJsonObject[]
  const kind = event.type.startsWith('academic/candidate-') ? 'academic-candidate-review' : 'academic-workflow'
  return { ...event, data: { ...data, messages: messages.map(message => ({ ...message, source: { kind } })) } }
}

function object(value: unknown): SessionFormatJsonObject {
  if (!isSessionFormatJsonObject(value)) throw new SessionFormatError('academic history data must be an object')
  return value as SessionFormatJsonObject
}
