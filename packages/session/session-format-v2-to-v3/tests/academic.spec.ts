import { describe, expect, it } from 'vitest'
import type { SessionFormatEvent, SessionFormatJsonObject } from '@deepseek-ai/dsh-session-format'
import { ACADEMIC_V2_EVENT_TYPES } from '../src/index.ts'
import { academicSamples } from './academic-samples.ts'
import { academicEvent, academicReferencePositions, backgroundReportEvent, migrateAcademicV2, referenceHistory } from './academic-support.ts'

describe('audited academic incoming history', () => {
  it('keeps T0 plus released master Trace as a fixed 20-event inventory', () => {
    expect([...ACADEMIC_V2_EVENT_TYPES].sort()).toEqual(Object.keys(academicSamples).sort())
    expect(ACADEMIC_V2_EVENT_TYPES.size).toBe(20)
    expect(() => migrateAcademicV2([academicEvent('academic/future-request', 0, {})])).toThrow(/unclassified event/)
  })

  it.each(Object.keys(academicSamples))('retains the admitted %s payload, identity and time', (type) => {
    const rows = type.endsWith('verified-v1')
      ? [academicEvent('academic/candidate-semantic-review-request-v1', 0), academicEvent(type, 1)]
      : [academicEvent(type, 0)]
    const original = structuredClone(rows)
    expect(migrateAcademicV2(rows).events).toEqual(original)
    expect(rows).toEqual(original)
  })

  it.each(Object.keys(academicSamples))('refuses unclassified fields in %s', (type) => {
    expect(() => migrateAcademicV2([academicEvent(type, 0, { ...academicSamples[type]!, extraCoordinate: 0 })]))
      .toThrow(/unaudited payload/)
  })

  it.each([undefined, 'delivery', 'content'])('retains report issue category %s in a complete background result', (category) => {
    const source = backgroundReportEvent(category), before = structuredClone(source)
    expect(migrateAcademicV2([source]).events).toEqual([before])
    expect(source).toEqual(before)
  })

  it('refuses an unknown report issue category in a complete background result', () => {
    const source = backgroundReportEvent('unclassified'), before = structuredClone(source)
    expect(() => migrateAcademicV2([source])).toThrow(/unaudited payload/)
    expect(source).toEqual(before)
  })

  it.each(academicReferencePositions)('remaps $index.$field after a system insertion', ({ index, field }) => {
    const history = referenceHistory()
    const rows: SessionFormatEvent[] = [academicEvent('turn/start', 0, { turn: 1 }),
      academicEvent('step/start', 1, { turn: 1, step: 1 }), ...history.map((event) => {
        const data = { ...event.data as SessionFormatJsonObject }
        for (const key of ['requestSeq', 'selectionSeq']) if (typeof data[key] === 'number') data[key] += 2
        return { ...event, seq: event.seq + 2, data }
      })]
    const old = (rows[index + 2]!.data as SessionFormatJsonObject)[field] as number
    const output = migrateAcademicV2(rows).events
    expect((output[index + 3]!.data as SessionFormatJsonObject)[field]).toBe(old + 1)
    expect(output.find(event => event.seq === old + 1)?.type).toBe(history[old - 2]!.type)
  })

  const invalidReferences = academicReferencePositions.flatMap(position =>
    [-1, 0.5, 100, position.index, position.index + 1].map(value => ({ ...position, value })),
  )
  it.each(invalidReferences)(
    'rejects invalid reference $index.$field=$value', ({ index, field, value }) => {
      const rows = referenceHistory()
      rows[index] = { ...rows[index]!, data: { ...rows[index]!.data as SessionFormatJsonObject, [field]: value } }
      expect(() => migrateAcademicV2(rows)).toThrow()
    },
  )

  it.each(academicReferencePositions)('rejects absent $index.$field instead of filling null', ({ index, field }) => {
    const rows = referenceHistory(), data = rows[index]!.data as SessionFormatJsonObject
    const withoutReference = Object.fromEntries(Object.entries(data).filter(([key]) => key !== field))
    rows[index] = { ...rows[index]!, data: withoutReference }
    expect(() => migrateAcademicV2(rows)).toThrow(/unaudited payload/)
  })

  it.each(['researchBriefId', 'researchBriefVersion', 'workVersionId', 'roundIndex', 'selectionSeq'])('rejects mismatched semantic %s', (field) => {
    const rows = referenceHistory(), data = { ...rows[2]!.data as SessionFormatJsonObject }
    data[field] = field === 'selectionSeq' ? null : typeof data[field] === 'number' ? 999 : 'another-identity'
    rows[2] = { ...rows[2]!, data }
    expect(() => migrateAcademicV2(rows)).toThrow(/identity mismatch|does not select/)
  })

  it('rejects a selection that did not choose the referenced work', () => {
    const rows = referenceHistory(), data = rows[0]!.data as SessionFormatJsonObject
    rows[0] = { ...rows[0]!, data: { ...data, selection: { ...data['selection'] as SessionFormatJsonObject, decisions: [] } } }
    expect(() => migrateAcademicV2(rows)).toThrow(/does not select/)
  })

  it.each(['schemaVersion', 'plan', 'pendingBatchIndex'])('validates nested checkpoint %s without guessing new fields', (field) => {
    const original = academicSamples['academic/recovery-checkpoint']!
    const data = { ...structuredClone(original), [field]: field === 'schemaVersion' ? 2
      : field === 'plan' ? { ...original['plan'] as SessionFormatJsonObject, extra: 1 } : 'not-a-number' }
    expect(() => migrateAcademicV2([academicEvent('academic/recovery-checkpoint', 0, data)])).toThrow(/unaudited payload/)
  })

  it.each(['surfaceOp', 'sourceEventSeqs'])('rejects academic envelope %s', (field) => {
    const event = { ...academicEvent('academic/evidence-request', 0), [field]: field === 'surfaceOp' ? 'append' : [] }
    expect(() => migrateAcademicV2([event])).toThrow(/log-only/)
  })

  it('retains counters, locators, complete state and nullable references without numeric rewriting', () => {
    const rows = ['academic/background-run-state', 'academic/recovery-checkpoint', 'academic/evidence-fragment-verified',
      'academic/evidence-result', 'academic/candidate-semantic-review-result-v1'].map((type, seq) => academicEvent(type, seq))
    const original = structuredClone(rows)
    expect(migrateAcademicV2(rows).events).toEqual(original)
  })

  it('maps a seeded cut after insertion while retaining inherited academic references', () => {
    const rows = [academicEvent('turn/start', 0, { turn: 1 }), academicEvent('step/start', 1, { turn: 1, step: 1 }),
      academicEvent('academic/evidence-request', 2),
      academicEvent('academic/evidence-result', 3, { ...academicSamples['academic/evidence-result']!, requestSeq: 2 }),
      academicEvent('session/end-seed', 4, { inherited: true })]
    const output = migrateAcademicV2(rows, true)
    expect(output.cut).toBe(5)
    expect(output.events[4]?.data).toMatchObject({ requestSeq: 3 })
  })
})
