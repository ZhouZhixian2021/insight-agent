import { describe, expect, it } from 'vitest'
import { SessionFormatEventCollector } from '@deepseek-ai/dsh-session-format'
import type { SessionFormatEvent, SessionFormatJsonObject } from '@deepseek-ai/dsh-session-format'
import { createSessionFormatV3ToV4 } from '../src/index.ts'
import { academicSamples } from '../../session-format-v2-to-v3/tests/academic-samples.ts'
import { academicEvent, academicHeader, academicReferencePositions, backgroundReportEvent, migrateAcademicV2, referenceHistory, semanticSelection } from '../../session-format-v2-to-v3/tests/academic-support.ts'

function convert(events: readonly SessionFormatEvent[], sourceKind: 'decoded' | 'transformed' = 'transformed') {
  const migration = createSessionFormatV3ToV4([]), sourceHeader = { ...academicHeader, version: 3 }
  const stage = migration.createStage({ sourceHeader, targetHeader: migration.migrateHeader(sourceHeader),
    sourceInheritedEventCount: 0, sourceKind })
  const output = new SessionFormatEventCollector()
  for (const event of events) stage.transformEvent(event, output)
  stage.finish(output)
  return output.values
}

describe('academic intermediates in the V3 to V4 incoming edge', () => {
  it('composes released V2 Trace through both insertions without rewriting its diagnostic payload', () => {
    const data = structuredClone(academicSamples['academic/trace-v1']!)
    const source = [academicEvent('turn/start', 0, { turn: 1 }), academicEvent('step/start', 1, { turn: 1, step: 1 }),
      academicEvent('step/end', 2, { turn: 1, step: 1 }),
      academicEvent('agent/inbox/spliced', 3, { target: 'next-turn', start: 0,
        inserted: [{ id: 'trace-restart', role: 'user', source: { kind: 'user' }, content: [] }] }),
      academicEvent('turn/start', 4, { turn: 2 }), academicEvent('academic/trace-v1', 5, data)]
    const before = structuredClone(source)
    const intermediate = migrateAcademicV2(source)
    const saved = convert(intermediate.events).find(event => event.type === 'academic/trace-v1')
    expect(saved).toEqual({ ...source[5]!, seq: 7 })
    expect(saved?.data).toEqual(data)
    expect(source).toEqual(before)
  })

  it.each(Object.keys(academicSamples))('preserves %s in the audited transformed path', (type) => {
    const source = type.endsWith('verified-v1')
      ? [academicEvent('academic/candidate-semantic-review-request-v1', 0), academicEvent(type, 1)] : [academicEvent(type, 0)]
    const original = structuredClone(source), output = convert(source)
    expect(source).toEqual(original)
    for (const [index, event] of output.entries()) {
      const data = original[index]!.data as SessionFormatJsonObject
      const messages = data['messages'] as readonly SessionFormatJsonObject[] | undefined
      expect(event).toEqual(messages === undefined ? original[index] : { ...original[index], data: { ...data,
        messages: messages.map(message => ({ ...message, source: { kind: event.type.includes('candidate-') ? 'academic-candidate-review' : 'academic-workflow' } })) } })
    }
  })

  it.each(Object.keys(academicSamples))('keeps direct required V3 %s unsupported', (type) => {
    expect(() => convert([academicEvent(type, 0)], 'decoded')).toThrow(/unknown event type/)
  })

  it.each([undefined, 'delivery', 'content'])('retains report issue category %s through both incoming edges', (category) => {
    const source = backgroundReportEvent(category), before = structuredClone(source)
    expect(convert(migrateAcademicV2([source]).events)).toEqual([before])
    expect(source).toEqual(before)
  })

  it('refuses an unknown report issue category in a transformed background result', () => {
    const source = backgroundReportEvent('unclassified'), before = structuredClone(source)
    expect(() => convert([source])).toThrow(/unaudited payload/)
    expect(source).toEqual(before)
  })

  it.each(academicReferencePositions)('checks $index.$field when no insertion changes seq', ({ index, field }) => {
    const rows = referenceHistory()
    rows[index] = { ...rows[index]!, data: { ...rows[index]!.data as SessionFormatJsonObject, [field]: index } }
    expect(() => convert(rows)).toThrow(/earlier/)
  })

  it('composes system-head and interrupted-turn insertions with both reference maps', () => {
    const request = { ...academicSamples['academic/candidate-semantic-review-request-v1']!, selectionSeq: 0 }
    const result = { ...academicSamples['academic/candidate-semantic-review-result-v1']!, selectionSeq: 0, requestSeq: 6 }
    const source: SessionFormatEvent[] = [academicEvent('academic/candidate-review-selection-v1', 0, semanticSelection()),
      academicEvent('turn/start', 1, { turn: 1 }), academicEvent('step/start', 2, { turn: 1, step: 1 }),
      academicEvent('step/end', 3, { turn: 1, step: 1 }), academicEvent('agent/inbox/spliced', 4, { target: 'next-turn', start: 0,
        inserted: [{ id: 'restart-message', role: 'user', source: { kind: 'user' }, content: [] }] }),
      academicEvent('turn/start', 5, { turn: 2 }), academicEvent('academic/candidate-semantic-review-request-v1', 6, request),
      academicEvent('academic/candidate-semantic-review-result-v1', 7, result)]
    const before = structuredClone(source), intermediate = migrateAcademicV2(source)
    expect(intermediate.events.find(e => e.type.endsWith('review-result-v1'))?.data).toMatchObject({ requestSeq: 7 })
    const output = convert(intermediate.events), saved = output.find(e => e.type.endsWith('review-result-v1'))!
    expect(saved.data).toMatchObject({ requestSeq: 8, selectionSeq: 0 })
    expect(output.find(e => e.seq === 8)?.type).toBe('academic/candidate-semantic-review-request-v1')
    expect(saved.time).toBe(8)
    expect(source).toEqual(before)
  })

  it.each(['plugin', 'role', 'content'])('refuses unaudited request %s rather than rewriting it', (field) => {
    const original = academicSamples['academic/evidence-request']!
    const messages = original['messages'] as readonly SessionFormatJsonObject[]
    const message = messages[0]!
    const changed = field === 'plugin' ? { ...message, source: { kind: 'plugin', plugin: 'unreviewed' } }
      : field === 'role' ? { ...message, role: 'assistant' } : { ...message, content: [{ type: 'unreviewed', coordinate: 0 }] }
    const data = { ...original, messages: [changed] }
    expect(() => convert([academicEvent('academic/evidence-request', 0, data)])).toThrow(/unaudited payload/)
  })

  it('retains raw stream text, tool arguments, provider replay JSON, and usage', () => {
    const data = { ...structuredClone(academicSamples['academic/evidence-result']!),
      stream: [{ type: 'chunk', time: 0, chunk: { type: 'finish', reason: { kind: 'stop' },
        replayState: { response: { seq: 0, nested: { approved: true } }, blocks: [{ requestSeq: 0 }] } } }],
    }
    expect(convert([academicEvent('academic/evidence-result', 0, data)])[0]?.data).toEqual(data)
  })
})
