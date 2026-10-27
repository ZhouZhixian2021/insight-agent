import { queryTraceObservations } from './trace-query.ts'
/** Current-Session Trace adapter and bounded, immutable-watermark queries. */
import { isDeepStrictEqual } from 'node:util'
import { academicTraceEventId, academicTraceSpanId,
  type RetrievalRunId, type AcademicTraceRecord, type AcademicTraceSpan, type AcademicTraceStatus,
  type AcademicTracePage, type AcademicTraceEvent } from '@deepseek-ai/dsh-academic-model'
import { academicTraceSpan, type AcademicTraceObserver, type AcademicWorkflowProgressSnapshot } from '@deepseek-ai/dsh-academic-workflow'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { AcademicTraceQuery } from './types.ts'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Safe diagnostic snapshot; contains no model input, response stream, URL or credential. */
    'academic/trace-v1': AcademicTraceRecord
  }
}

/** Collect safe facts for one owned research operation; Session persistence owns durable writes. */
export class AcademicTraceRecorder {
  private readonly latest = new Map<string, AcademicTraceSpan>()
  private readonly started = performance.now()
  private unavailable = false

  /** @param session Owning Session.
 * @param runId Explicit research identity, including recovery.
 * @param resumed Whether this invocation continues a previous process interval.
 * @param previousStartedAt Original run start from an owned Session observation, or unknown.
 */
  constructor(private readonly session: Session, private readonly runId: RetrievalRunId, private readonly resumed = false,
    previousStartedAt: string | null = null) {
    const startedAt = resumed ? previousStartedAt : new Date().toISOString()
    this.record({ ...academicTraceSpan('run', null, 'run', null, 'research'), startedAt })
  }

  /** Observer bound to this run, independent of concurrent paper completion order. */
  readonly observe: AcademicTraceObserver = (span) => {
    if (span.stage !== null) {
      const stage = academicTraceSpan(`stage:${span.stage}`, academicTraceSpanId('run'), 'stage', span.stage, 'stage')
      if (!this.latest.has(stage.spanId)) this.record(stage)
      if (span.workVersionId !== null) {
        const paper = { ...academicTraceSpan(`paper:${span.stage}:${span.workVersionId}`, stage.spanId, 'paper', span.stage, 'paper_processing'),
          academicWorkId: span.academicWorkId, workVersionId: span.workVersionId }
        if (!this.latest.has(paper.spanId)) this.record(paper)
      }
    }
    this.record(span)
  }

  /** Save only changed stage/paper observations.
 * @param progress Actual workflow snapshot.
 */
  progress(progress: AcademicWorkflowProgressSnapshot): void {
    for (const key of ['retrieval', 'screening', 'fulltext', 'extraction', 'analysis', 'report'] as const) {
      const state = progress.stages[key]
      this.record({ ...academicTraceSpan(`stage:${key}`, academicTraceSpanId('run'), 'stage', key, 'stage'),
        status: traceStatus(state.status), businessStatus: state.status, startedAt: state.startedAt, endedAt: state.completedAt,
        timing: { queueMs: { value: null, basis: 'unknown' }, executionMs: { value: null, basis: 'unknown' },
          totalMs: this.resumed ? { value: null, basis: 'unknown' } : wallDuration(state.startedAt, state.completedAt) } })
    }
    for (const activity of progress.activities) {
      if (activity.kind !== 'paper') continue
      const id = `paper:${activity.stage}:${activity.workVersionId}`
      this.record({ ...academicTraceSpan(id, academicTraceSpanId(`stage:${activity.stage}`), 'paper', activity.stage, 'paper_processing'),
        academicWorkId: activity.academicWorkId, workVersionId: activity.workVersionId,
        startedAt: activity.startedAt, status: activity.operation === 'waiting_retry' ? 'retry_wait' : 'running' })
    }
  }

  /** Commit the observed root outcome without promoting unfinished children.
 * @param status Actual operation settlement.
 */
  settle(status: AcademicTraceStatus): void {
    const run = this.latest.get('run')
    if (run === undefined) return
    this.record({ ...run, status, endedAt: new Date().toISOString(),
      timing: { ...run.timing, totalMs: this.resumed ? { value: null, basis: 'unknown' } : { value: Math.round(performance.now() - this.started), basis: 'monotonic' } },
      gaps: [...this.unavailable ? [{ code: 'source_unavailable', field: 'events', message: 'Some diagnostic observations could not be recorded.' }] : [],
        ...this.resumed ? [{ code: 'resume_timing_unavailable', field: 'timing.totalMs', message: 'A single reliable interval across process recovery is unavailable.' }] : []] })
  }

  private record(span: AcademicTraceSpan): void {
    if (isDeepStrictEqual(this.latest.get(span.spanId), span)) return
    try {
      this.session.append('academic/trace-v1', { schemaVersion: 1, researchRunId: this.runId, span })
      this.latest.set(span.spanId, span)
    } catch {
      // A diagnostic append cannot turn a successful research operation into a business failure.
      this.unavailable = true
    }
  }
}

function traceStatus(value: string): AcademicTraceStatus {
  switch (value) {
    case 'success': return 'succeeded'
    case 'partial_success': return 'partial_success'
    case 'failed': return 'failed'
    case 'cancelled': return 'cancelled'
    case 'running': return 'running'
    case 'not_run': return 'skipped'
    default: return 'unknown'
  }
}

function wallDuration(start: string | null, end: string | null): AcademicTraceSpan['timing']['totalMs'] {
  if (start === null || end === null) return { value: null, basis: 'unknown' }
  const value = Date.parse(end) - Date.parse(start)
  return Number.isFinite(value) && value >= 0 ? { value, basis: 'wall_clock' } : { value: null, basis: 'unknown' }
}

/**
 * Normalize current Session records and query only the requested run.
 * @param records Current-format Session observations.
 * @param query Session/run scope and page selection.
 * @param active Whether this host still owns the research task.
 * @returns Safe diagnostic page; unknown history is never assigned to a run.
 */
export function queryAcademicTrace(records: readonly SessionEvent[], query: AcademicTraceQuery, active: boolean): AcademicTracePage {
  const observations: AcademicTraceEvent[] = records.flatMap((event) => {
    if (event.type !== 'academic/trace-v1' || event.data.researchRunId !== query.researchRunId) return []
    const key = `${query.sessionId}:academic-trace-v1:${event.seq}`
    return [{ kind: 'span_snapshot' as const, eventId: academicTraceEventId(key), sequence: event.seq,
      observedAt: new Date(event.time).toISOString(), sourceRef: { recordId: key, recordType: event.type }, span: event.data.span }]
  })
  return queryTraceObservations(observations, query, active, records.reduce((last, event) => Math.max(last, event.seq), -1))
}
