/** Browser-safe diagnostic observations, independent of Session storage and UI. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { AcademicWorkId, RetrievalRunId, WorkVersionId } from './types.ts'
import { brandString } from '@deepseek-ai/dsh-brand'

/** Create a stable trace key from its owning run.
 * @param runId Research identity.
 * @returns Trace identity.
 */
export function academicTraceId(runId: RetrievalRunId): AcademicTraceId { return brandString<AcademicTraceId>(`academic-trace-v1:${runId}`) }
/** Brand an adapter-owned stable operation key.
 * @param key Operation key.
 * @returns Span identity.
 */
export function academicTraceSpanId(key: string): AcademicTraceSpanId { return brandString<AcademicTraceSpanId>(key) }
/** Brand a stable source-record key.
 * @param key Source key.
 * @returns Event identity.
 */
export function academicTraceEventId(key: string): AcademicTraceEventId { return brandString<AcademicTraceEventId>(key) }

/** Stable identity of one research diagnostic projection. */
export type AcademicTraceId = Branded<'AcademicTraceId'>
/** Stable identity of one operation, including one actual attempt. */
export type AcademicTraceSpanId = Branded<'AcademicTraceSpanId'>
/** Stable identity of one persisted diagnostic observation. */
export type AcademicTraceEventId = Branded<'AcademicTraceEventId'>
/** Observed diagnostic state; success never implies semantic approval. */
export type AcademicTraceStatus = 'queued' | 'running' | 'retry_wait' | 'succeeded' | 'partial_success'
  | 'failed' | 'cancelled' | 'skipped' | 'unknown'
/** Research stages shared by all adapters. */
export type AcademicTraceStage = 'retrieval' | 'screening' | 'fulltext' | 'extraction' | 'analysis' | 'report'
/** Allowlisted operation vocabulary; titles do not determine operation identity. */
export type AcademicTraceOperation = 'research' | 'stage' | 'paper_processing' | 'academic_search'
  | 'web_discovery' | 'reference_verification' | 'candidate_review' | 'fulltext_fetch' | 'fulltext_parse'
  | 'scope_review' | 'evidence_extract' | 'evidence_validate' | 'synthesis' | 'report_render' | 'tool_call' | 'unknown'
/** A measured interval; missing measurements are null rather than zero. */
export interface AcademicTraceDuration {
  readonly value: number | null
  readonly basis: 'monotonic' | 'wall_clock' | 'unknown'
}
/** Explicitly missing diagnostic facts; messages contain no raw source content. */
export interface AcademicTraceGap {
  readonly code: string
  readonly field: string
  readonly message: string
}
/** Failure categories do not identify a particular network hop. */
export interface AcademicTraceFailure {
  readonly code: 'timeout' | 'transport' | 'output_limit' | 'parse' | 'validation' | 'admission' | 'other' | 'unknown'
  readonly phase: 'prepare' | 'admission' | 'before_content' | 'after_content' | 'parse' | 'unknown'
  readonly message: string
}
/** Complete safe operation snapshot, including immutable attempt identity. */
export interface AcademicTraceSpan {
  readonly spanId: AcademicTraceSpanId
  readonly parentSpanId: AcademicTraceSpanId | null
  readonly kind: 'run' | 'stage' | 'paper' | 'call' | 'attempt'
  readonly stage: AcademicTraceStage | null
  readonly operation: AcademicTraceOperation
  readonly academicWorkId: AcademicWorkId | null
  readonly workVersionId: WorkVersionId | null
  readonly providerId: string | null
  readonly model: string | null
  readonly toolName: string | null
  readonly attemptIndex: number | null
  readonly status: AcademicTraceStatus
  readonly businessStatus: string | null
  readonly startedAt: string | null
  readonly endedAt: string | null
  readonly timing: {
    readonly queueMs: AcademicTraceDuration
    readonly executionMs: AcademicTraceDuration
    readonly totalMs: AcademicTraceDuration
  }
  readonly failure: AcademicTraceFailure | null
  readonly gaps: readonly AcademicTraceGap[]
}
/** Immutable observation; its identity and order survive refresh and replay. */
export interface AcademicTraceEvent {
  readonly eventId: AcademicTraceEventId
  readonly sequence: number
  readonly kind: 'span_snapshot'
  readonly observedAt: string | null
  readonly sourceRef: { readonly recordId: string; readonly recordType: string } | null
  readonly span: AcademicTraceSpan
}
/** Persisted current-adapter observation; it carries no prompt, stream or full text. */
export interface AcademicTraceRecord {
  readonly schemaVersion: 1
  readonly researchRunId: RetrievalRunId
  readonly span: AcademicTraceSpan
}
/** Per-run summary; total duration is never the sum of child durations. */
export interface AcademicTraceSummary {
  readonly logicalCalls: number
  readonly attempts: number
  readonly attemptStates: {
    readonly queued: number
    readonly running: number
    readonly retry_wait: number
    readonly succeeded: number
    readonly partial_success: number
    readonly failed: number
    readonly cancelled: number
    readonly skipped: number
    readonly unknown: number
  }
  readonly runTotalMs: AcademicTraceDuration
  readonly excludedUnlinkedRecords: number | null
}
/** One immutable-watermark page; refresh starts a new snapshot. */
export interface AcademicTracePage {
  readonly schemaVersion: 1
  readonly status: 'ok' | 'not_found'
  readonly traceId: AcademicTraceId
  readonly snapshotId: string
  readonly producer: { readonly adapterId: string; readonly adapterVersion: string }
  readonly items: readonly AcademicTraceSpan[]
  readonly events: readonly AcademicTraceEvent[]
  readonly nextCursor: string | null
  readonly summary: AcademicTraceSummary
  readonly gaps: readonly AcademicTraceGap[]
}
