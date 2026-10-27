import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { AcademicTraceRecord } from '@deepseek-ai/dsh-academic-model'
import type { AcademicTraceQuery } from '../src/types.ts'
import { AcademicTraceRecorder, queryAcademicTrace } from '../src/trace.ts'

// Synthetic serialized IDs acquire their brands at this fixture input, not in production projection.
const fixture = JSON.parse(readFileSync(new URL('../../../../z-team_docs/interface-samples/academic-trace-v1/cases.sample.json', import.meta.url), 'utf8')) as {
  cases: { name: string
    trace: { sessionId: AcademicTraceQuery['sessionId']
      researchRunId: AcademicTraceQuery['researchRunId']
      events: { sequence: number; span: import('@deepseek-ai/dsh-academic-model').AcademicTraceSpan }[] }
    expected: { logicalCalls: number; attempts: number; runTotalMs: number | null } }[]
}
function saved(index: number) {
  const data = fixture.cases[index]!
  const records: SessionEvent<'academic/trace-v1'>[] = data.trace.events.map(e => ({
    type: 'academic/trace-v1', seq: SessionSeq(e.sequence), time: 0,
    data: { schemaVersion: 1, researchRunId: data.trace.researchRunId, span: e.span },
  }))
  return { data, records, query: { sessionId: data.trace.sessionId, researchRunId: data.trace.researchRunId } }
}

describe('persisted Academic Trace', () => {
  it('does not present a resumed process interval as total research duration', () => {
    const prior = saved(6)
    const rows: AcademicTraceRecord[] = []
    const session = {
      append: (_type: 'academic/trace-v1', data: AcademicTraceRecord) => { rows.push(data) },
    }
    const previous = prior.records.findLast(event => event.type === 'academic/trace-v1' && event.data.span.kind === 'run')
    const startedAt = previous?.type === 'academic/trace-v1' ? previous.data.span.startedAt : null
    const recorder = new AcademicTraceRecorder(session, prior.query.researchRunId, true, startedAt)
    recorder.settle('succeeded')
    expect(rows[0]?.span.startedAt).toBe(startedAt)
    expect(rows.at(-1)?.span.timing.totalMs).toEqual({ value: null, basis: 'unknown' })
    expect(rows.at(-1)?.span.gaps).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'resume_timing_unavailable' })]))
  })
  it.each(fixture.cases.map((c, index) => ({ name: c.name, index })))('replays $name without changing its counts or wall time', ({ index }) => {
    const { records, query, data } = saved(index)
    const page = queryAcademicTrace(records, query, true)
    expect(page.summary.logicalCalls).toBe(data.expected.logicalCalls)
    expect(page.summary.attempts).toBe(data.expected.attempts)
    expect(page.summary.runTotalMs.value).toBe(data.expected.runTotalMs)
  })

  it('holds the event watermark across pages and rejects reused cursors from another scope', () => {
    const { records, query } = saved(0)
    const first = queryAcademicTrace(records, { ...query, limit: 3 }, true)
    const extra: SessionEvent<'academic/trace-v1'> = { ...records.at(-1)!, seq: SessionSeq(200),
      data: { ...records.at(-1)!.data, span: { ...first.items[0]!, status: 'failed' } } }
    const next = queryAcademicTrace([...records, extra], { ...query, cursor: first.nextCursor, limit: 3 }, false)
    expect(next.snapshotId).toBe(first.snapshotId)
    expect(next.summary).toEqual(first.summary)
    expect(() => queryAcademicTrace(records, { ...query, status: 'failed', cursor: first.nextCursor }, true)).toThrow('invalid_cursor')
    const other = queryAcademicTrace(records, { ...query, researchRunId: 'other' as AcademicTraceQuery['researchRunId'] }, false)
    expect(other.status).toBe('not_found')
    expect(other.items).toEqual([])
  })

  it('retains a failed attempt after successful retry and marks interrupted observations', () => {
    const { records, query } = saved(0)
    const page = queryAcademicTrace(records, { ...query, spanId: 'attempt-1' as never }, false)
    expect(page.items[0]?.status).toBe('failed')
    expect(page.events.map(e => e.span.status)).toEqual(['running', 'failed'])
    const restart = saved(6)
    expect(queryAcademicTrace(restart.records, restart.query, false).items.find(s => s.kind === 'attempt')?.gaps)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'interrupted_observation' })]))
  })

  it('keeps a missing resumed start unknown instead of inventing a new start', () => {
    const rows: AcademicTraceRecord[] = []
    const session = { append: (_type: 'academic/trace-v1', data: AcademicTraceRecord) => { rows.push(data) } }
    new AcademicTraceRecorder(session, saved(0).query.researchRunId, true).settle('failed')
    expect(rows[0]?.span.startedAt).toBeNull()
    expect(rows.at(-1)?.span.startedAt).toBeNull()
    expect(rows.at(-1)?.span.timing.totalMs).toEqual({ value: null, basis: 'unknown' })
  })

  it('contains observer storage failures and does not claim a research success', () => {
    const rows: unknown[] = []
    let fail = true
    const session = { append: (_type: 'academic/trace-v1', data: AcademicTraceRecord) => {
      if (fail) throw new Error('storage'); rows.push(data)
    } }
    const recorder = new AcademicTraceRecorder(session, saved(0).query.researchRunId)
    expect(() =>{  recorder.observe(saved(0).data.trace.events[3]!.span) }).not.toThrow()
    fail = false
    recorder.settle('succeeded')
    expect(rows).toEqual([])
  })
})
