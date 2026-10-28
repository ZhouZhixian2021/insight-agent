import { describe, expect, it } from 'vitest'
import type { SessionFormatJsonObject } from '@deepseek-ai/dsh-session-format'
import { academicSamples } from './academic-samples.ts'
import { academicEvent, migrateAcademicV2 } from './academic-support.ts'

function payload() {
  return structuredClone(academicSamples['academic/trace-v1']!)
}

describe('released master Trace v1 incoming history', () => {
  it('moves only the event position after insertion, preserving every Trace fact and identity', () => {
    const data = payload()
    const source = [academicEvent('turn/start', 0, { turn: 1 }), academicEvent('step/start', 1, { turn: 1, step: 1 }),
      academicEvent('academic/trace-v1', 2, data)]
    const before = structuredClone(source)
    const saved = migrateAcademicV2(source).events.find(event => event.type === 'academic/trace-v1')
    expect(saved).toEqual({ ...source[2]!, seq: 3 })
    expect(saved?.data).toEqual(data)
    expect(source).toEqual(before)
  })

  it('retains unknown measurements and nullable facts without filling values', () => {
    const original = payload(), span = original['span'] as SessionFormatJsonObject
    const data: SessionFormatJsonObject = { ...original, span: { ...span,
      parentSpanId: null, stage: null, academicWorkId: null, workVersionId: null,
      providerId: null, model: null, toolName: null, attemptIndex: null, businessStatus: null,
      startedAt: null, endedAt: null, failure: null, gaps: [],
      timing: { queueMs: { value: null, basis: 'unknown' }, executionMs: { value: null, basis: 'unknown' },
        totalMs: { value: null, basis: 'unknown' } } } }
    expect(migrateAcademicV2([academicEvent('academic/trace-v1', 0, data)]).events[0]?.data).toEqual(data)
  })

  it.each(['spanId', 'status', 'timing', 'failure', 'gaps'])('rejects a missing required span %s', (field) => {
    const data = payload()
    const span = Object.fromEntries(Object.entries(data['span'] as SessionFormatJsonObject).filter(([key]) => key !== field))
    expect(() => migrateAcademicV2([academicEvent('academic/trace-v1', 0, { ...data, span })])).toThrow(/unaudited payload/)
  })

  it.each([
    (span: SessionFormatJsonObject) => ({ ...span, requestSeq: 0 }),
    (span: SessionFormatJsonObject) => ({ ...span, timing: { ...span['timing'] as SessionFormatJsonObject, selectionSeq: 0 } }),
    (span: SessionFormatJsonObject) => ({ ...span, timing: { ...span['timing'] as SessionFormatJsonObject,
      totalMs: { value: 0, basis: 'monotonic', sourceSeq: 0 } } }),
    (span: SessionFormatJsonObject) => ({ ...span, failure: { code: 'transport', phase: 'prepare', message: 'retained', requestSeq: 0 } }),
    (span: SessionFormatJsonObject) => ({ ...span, gaps: [{ code: 'retained', field: 'timing', message: 'retained', eventSeq: 0 }] }),
    (span: SessionFormatJsonObject) => ({ ...span, status: 'future-status' }),
    (span: SessionFormatJsonObject) => ({ ...span, operation: 'future-operation' }),
    (span: SessionFormatJsonObject) => ({ ...span, failure: { code: 'future-code', phase: 'prepare', message: 'retained' } }),
  ])('rejects an unaudited nested field or enum instead of treating it as a reference', (mutate) => {
    const data = payload()
    expect(() => migrateAcademicV2([academicEvent('academic/trace-v1', 0,
      { ...data, span: mutate(data['span'] as SessionFormatJsonObject) })])).toThrow(/unaudited payload/)
  })
})
