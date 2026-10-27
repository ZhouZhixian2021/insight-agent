/** Base-independent Trace pagination, replay and summary computation. */
import { academicTraceId, type AcademicTraceEvent, type AcademicTraceSpan, type AcademicTraceGap,
  type AcademicTracePage, type AcademicTraceStatus } from '@deepseek-ai/dsh-academic-model'
import type { AcademicTraceQuery } from './types.ts'

/**
 * Project one authorized Session without exposing raw records or guessing historical call ownership.
 * @param records Unified observations already scoped by the version adapter.
 * @param query Validated run scope, filters and optional detail identity.
 * @param active Whether the current host still owns this run; false does not imply successful completion.
 * @param watermark Highest available immutable source sequence.
 * @returns One stable list or detail page; cursor changes cannot widen the Session/run scope.
 */
export function queryTraceObservations(records: readonly AcademicTraceEvent[], query: AcademicTraceQuery,
  active: boolean, watermark: number): AcademicTracePage {
  const limit = query.limit ?? 50
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid_query')
  const scope = JSON.stringify([query.sessionId, query.researchRunId, query.stage ?? null, query.status ?? null, query.spanId ?? null])
  let through = watermark
  let offset = 0
  if (query.cursor != null) {
    let parsed: unknown
    try { parsed = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) } catch { throw new Error('invalid_cursor') }
    if (typeof parsed !== 'object' || parsed === null || !('scope' in parsed) || parsed.scope !== scope
      || !('through' in parsed) || typeof parsed.through !== 'number' || !Number.isSafeInteger(parsed.through) || parsed.through < -1 || parsed.through > through
      || !('offset' in parsed) || typeof parsed.offset !== 'number' || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0) throw new Error('invalid_cursor')
    through = parsed.through; offset = parsed.offset
  }
  const traceId = academicTraceId(query.researchRunId)
  const observations: AcademicTraceEvent[] = []
  const latest = new Map<string, AcademicTraceSpan>()
  const seen = new Map<string, AcademicTraceEvent>()
  for (const event of [...records].sort((a, b) => a.sequence - b.sequence)) {
    if (event.sequence > through) continue
    const previous = seen.get(event.eventId)
    if (previous !== undefined) { if (JSON.stringify(previous) !== JSON.stringify(event)) throw new Error('event_conflict'); continue }
    seen.set(event.eventId, event)
    const observation = event
    observations.push(observation); latest.set(observation.span.spanId, observation.span)
  }
  const gaps: AcademicTraceGap[] = []
  if (observations.length === 0) gaps.push({ code: 'run_link_missing', field: 'events', message: 'No Trace observations are recorded for this run. Historical model records are not assigned by title or time.' })
  const root = latest.get('run')
  const closed = root !== undefined && !['running', 'queued', 'retry_wait', 'unknown'].includes(root.status)
  const spans = [...latest.values()].map((span) => {
    if (['running', 'queued', 'retry_wait'].includes(span.status) && (!active || closed)) {
      return { ...span, gaps: [...span.gaps, { code: 'interrupted_observation', field: 'status', message: 'No final observation is available; the last state is retained.' }] }
    }
    return span
  })
  const attempts = spans.filter(span => span.kind === 'attempt')
  const attemptStates: Record<AcademicTraceStatus, number> = { queued: 0, running: 0, retry_wait: 0, succeeded: 0,
    partial_success: 0, failed: 0, cancelled: 0, skipped: 0, unknown: 0 }
  for (const attempt of attempts) attemptStates[attempt.status]++
  const matches = spans.filter(span => (query.stage == null || span.stage === query.stage)
    && (query.status == null || span.status === query.status))
  const details = observations.filter(event => event.span.spanId === query.spanId)
  const rows = query.spanId == null ? matches : details
  if (offset > rows.length) throw new Error('invalid_cursor')
  const next = offset + limit < rows.length ? Buffer.from(JSON.stringify({ scope, through, offset: offset + limit })).toString('base64url') : null
  return { schemaVersion: 1, status: observations.length === 0 || (query.spanId != null && details.length === 0) ? 'not_found' : 'ok',
    traceId, snapshotId: `${traceId}:${through}`, producer: { adapterId: 'academic-session', adapterVersion: '1' },
    items: query.spanId == null ? matches.slice(offset, offset + limit) : spans.filter(span => span.spanId === query.spanId),
    events: query.spanId == null ? [] : details.slice(offset, offset + limit), nextCursor: next,
    summary: { logicalCalls: spans.filter(span => span.kind === 'call').length, attempts: attempts.length, attemptStates,
      runTotalMs: root?.timing.totalMs ?? { value: null, basis: 'unknown' }, excludedUnlinkedRecords: null }, gaps }
}
