import { describe, expect, it } from 'vitest'
import type { SessionFormatEvent } from '@deepseek-ai/dsh-session-format'
import { historicalSessionFormatCatalog, createSessionFormatCatalogWithChildren } from '../src/index.ts'
import { academicEvent, academicHeader, referenceHistory } from '../../session-format-v2-to-v3/tests/academic-support.ts'

function restore(events: readonly SessionFormatEvent[], version = 2, historical = false) {
  const catalog = historical ? historicalSessionFormatCatalog : createSessionFormatCatalogWithChildren([])
  const reader = catalog.createRestore({ type: 'session', ...academicHeader, version }, {
    recovery: 'strict', validation: historical && version === 2 ? 'transformed' : 'current',
  })
  for (const event of events) reader.decodeRow(event)
  return reader.finish()
}

describe('academic incoming history in the static catalogs', () => {
  it('validates a synthetic V2 academic artifact through both edges and installed current validation', () => {
    const rows = referenceHistory(), before = structuredClone(rows)
    const artifact = restore(rows)
    expect(artifact.header).toEqual({ ...academicHeader, version: 4 })
    expect(artifact.events).toHaveLength(rows.length)
    expect(artifact.events[2]?.data).toMatchObject({ requestSeq: 1, selectionSeq: 0 })
    expect(rows).toEqual(before)
  })

  it('admits converted child prerequisites without granting native V3 academic support', () => {
    const rows = referenceHistory(), artifact = restore(rows, 2, true)
    expect(artifact.header.version).toBe(3)
    expect(artifact.events).toEqual(rows)
    expect(() => restore(rows, 3, true)).toThrow(/unknown event type/)
    expect(() => restore(rows, 3)).toThrow(/unknown event type/)
  })

  it('does not admit extra format-2 PTC metadata or synthesize approval', () => {
    const start = { rootCallId: 'root:code:0', parentCallId: 'root:code:0', subCallId: 'root:code:1', name: 'exit_plan_mode', arguments: { plan: 'retained' } }
    const rows = [academicEvent('turn/start', 0, { turn: 1 }), academicEvent('step/start', 1, { turn: 1, step: 1 }),
      academicEvent('tool/code-dispatch-start', 2, start),
      academicEvent('tool/code-dispatch', 3, { ...start, isError: false, content: [] }),
      academicEvent('step/end', 4, { turn: 1, step: 1 }),
      academicEvent('turn/end', 5, { turn: 1, reason: { kind: 'completed' } })]
    const artifact = restore(rows)
    expect(artifact.events[4]?.type).toBe('tool/ptc-dispatch')
    expect(artifact.events[4]?.data).toEqual(rows[3]?.data)
    const withUnreleasedMetadata = [...rows.slice(0, 3),
      { ...rows[3]!, data: { ...start, isError: false, content: [], meta: { approved: true } } }, ...rows.slice(4)]
    expect(() => restore(withUnreleasedMetadata)).toThrow()
  })
})
