/** Safe model-operation diagnostics; callers own persistence and research identity. */
import { randomUUID } from 'node:crypto'
import { academicTraceSpanId, type AcademicTraceSpan, type AcademicTraceStage,
  type AcademicTraceOperation, type AcademicTraceSpanId, type AcademicWorkId, type WorkVersionId } from '@deepseek-ai/dsh-academic-model'

/** A best-effort diagnostic sink; never carries prompts or response text. */
export type AcademicTraceObserver = (span: AcademicTraceSpan) => void
/** Program-owned model-operation metadata, independent of the model response. */
export interface AcademicTraceOperationIdentity {
  readonly stage: AcademicTraceStage
  readonly operation: AcademicTraceOperation
  readonly academicWorkId?: AcademicWorkId
  readonly workVersionId?: WorkVersionId
}
/** Create an empty diagnostic snapshot.
 * @param id Stable key.
 * @param parent Parent or null.
 * @param kind Node kind.
 * @param stage Stage.
 * @param operation Operation.
 * @returns Unknown-timing snapshot.
 */
export function academicTraceSpan(id: string, parent: AcademicTraceSpanId | null, kind: AcademicTraceSpan['kind'],
  stage: AcademicTraceStage | null, operation: AcademicTraceOperation): AcademicTraceSpan {
  return { spanId: academicTraceSpanId(id), parentSpanId: parent, kind, stage, operation,
    academicWorkId: null, workVersionId: null, providerId: null, model: null, toolName: null, attemptIndex: null,
    status: 'running', businessStatus: null, startedAt: null, endedAt: null, failure: null, gaps: [],
    timing: { queueMs: { value: null, basis: 'unknown' }, executionMs: { value: null, basis: 'unknown' }, totalMs: { value: null, basis: 'unknown' } } }
}
/** Isolate diagnostic failures.
 * @param sink Optional observer.
 * @param span Safe snapshot.
 */
export function observeAcademicTrace(sink: AcademicTraceObserver | undefined, span: AcademicTraceSpan): void {
  try { sink?.(span) } catch {
    // Diagnostics cannot change research execution or its settled business result.
  }
}
/** Allocate one logical call, separate from all its retry attempts. @returns Adapter-owned call key. */
export function academicTraceCallKey(): string { return `call:${randomUUID()}` }

/**
 * Observe one actual tool invocation without logging its URL, input or response.
 * @param identity Explicit operation and canonical paper identity.
 * @param sink Optional diagnostic observer.
 * @param execute Caller-owned operation.
 * @param signal Optional owner signal used to distinguish cancellation from failure.
 * @returns The unchanged operation result; failures retain their original identity.
 */
export async function traceAcademicOperation<T>(identity: AcademicTraceOperationIdentity, sink: AcademicTraceObserver | undefined,
  execute: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const id = academicTraceCallKey()
  const parent = academicTraceSpanId(identity.workVersionId === undefined ? `stage:${identity.stage}` : `paper:${identity.stage}:${identity.workVersionId}`)
  const call = { ...academicTraceSpan(id, parent, 'call', identity.stage, identity.operation),
    academicWorkId: identity.academicWorkId ?? null, workVersionId: identity.workVersionId ?? null,
    startedAt: new Date().toISOString() }
  const attempt = { ...call, kind: 'attempt' as const, spanId: academicTraceSpanId(`${id}:attempt:1`), parentSpanId: call.spanId, attemptIndex: 1 }
  observeAcademicTrace(sink, call); observeAcademicTrace(sink, attempt)
  const started = performance.now()
  let status: AcademicTraceSpan['status'] = 'succeeded'
  try { return await execute() } catch (cause: unknown) {
    status = signal?.aborted === true || cause instanceof Error && cause.name === 'AbortError' ? 'cancelled' : 'failed'
    throw cause
  } finally {
    const settled = { status, endedAt: new Date().toISOString(), timing: { ...call.timing,
      totalMs: { value: Math.round(performance.now() - started), basis: 'monotonic' as const } } }
    observeAcademicTrace(sink, { ...attempt, ...settled }); observeAcademicTrace(sink, { ...call, ...settled })
  }
}
