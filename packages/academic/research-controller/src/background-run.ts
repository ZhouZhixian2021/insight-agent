/** Session-persisted background research state and independent live subscribers. */
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AcademicBackgroundRunId, AcademicBackgroundRunView, AcademicQ6Projection, AcademicResearchRunValue } from './types.ts'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete detached-run checkpoint; subsequent progress retains its Q6 and lifecycle facts. */
    'academic/background-run-state': AcademicBackgroundRunView
    /** Progress after a complete checkpoint; required to recover the latest detached-run view. */
    'academic/background-run-progress': AcademicBackgroundRunProgress
    /** Q6 metadata after a checkpoint with identical candidates; required for exact recovery. */
    'academic/background-run-q6-update': AcademicBackgroundRunQ6Update
  }
}

/** Durable progress fields that leave the checkpoint's Q6, result, and lifecycle facts unchanged. */
export interface AcademicBackgroundRunProgress {
  readonly schemaVersion: AcademicBackgroundRunView['schemaVersion']
  readonly sessionId: AcademicBackgroundRunView['sessionId']
  readonly backgroundRunId: AcademicBackgroundRunView['backgroundRunId']
  readonly researchBriefId: AcademicBackgroundRunView['researchBriefId']
  readonly retrievalRunId: AcademicBackgroundRunView['retrievalRunId']
  readonly updatedAt: AcademicBackgroundRunView['updatedAt']
  readonly progress: AcademicBackgroundRunView['progress']
}

/** All Q6 metadata; candidate facts remain owned by the complete checkpoint. */
export type AcademicBackgroundRunQ6Metadata = Omit<AcademicQ6Projection, 'candidates'>

/** A Q6 revision whose candidate facts are unchanged from the complete checkpoint. */
export interface AcademicBackgroundRunQ6Update extends AcademicBackgroundRunProgress {
  readonly q6: AcademicBackgroundRunQ6Metadata
}

const runIdentityFields = {
  schemaVersion: z.literal(1), sessionId: z.string(), backgroundRunId: z.string(),
  researchBriefId: z.string(), retrievalRunId: z.string().nullable(),
}
const progressIdentitySchema = z.object({
  schemaVersion: z.literal(1), sessionId: z.string(), retrievalRunId: z.string(),
}).loose().and(z.json())
const progressRecordSchema = z.object({
  ...runIdentityFields, updatedAt: z.string(), progress: progressIdentitySchema.nullable(),
}).strict()
const checkpointIdentitySchema = z.object({
  ...runIdentityFields, state: z.enum(['running', 'completed', 'cancelled', 'failed', 'interrupted']),
}).loose()
const planIdentitySchema = z.object({
  schemaVersion: z.literal(1), researchBriefId: z.string(), researchBriefVersion: z.number().int().positive(),
}).loose()
const q6IdentityFields = {
  schemaVersion: z.literal(1), sessionId: z.string(), retrievalRunId: z.string(), researchBriefId: z.string(),
  researchBriefVersion: z.number().int().positive(), sequence: z.number().int().nonnegative(),
}
const q6CheckpointIdentitySchema = z.object({ ...q6IdentityFields, plan: planIdentitySchema }).loose()
const q6MetadataSchema = z.object({
  ...q6IdentityFields, updatedAt: z.string(), status: z.enum(['running', 'settled', 'cancelled']),
  plan: planIdentitySchema.and(z.json()), rounds: z.json(), batches: z.json(), coverage: z.json(),
  stopDecision: z.json(), limitations: z.array(z.string()),
}).strict()
const q6UpdateRecordSchema = progressRecordSchema.extend({ q6: q6MetadataSchema }).strict()

/** Check durable fields read by these folds without asserting a parsed complete domain model. */
function validateDurableRecord(value: unknown, schema: z.ZodType, message: string): void {
  if (!schema.safeParse(value).success) throw new Error(message)
}

type Observer = (view: AcademicBackgroundRunView) => void
type ActiveRun = {
  view: AcademicBackgroundRunView
  abort: AbortController
  persist: Observer
  settled: Promise<void>
}

/**
 * Persist every view while recording unchanged Q6 and lifecycle facts only in complete checkpoints.
 * @param writeState - durable writer for a complete view.
 * @param writeProgress - durable writer for progress after the last complete checkpoint.
 * @param writeQ6Update - durable writer for Q6 metadata whose candidates match the checkpoint.
 * @returns One run's observer; its remembered view advances only after the selected writer succeeds.
 */
export function createBackgroundRunPersistence(
  writeState: Observer,
  writeProgress: (progress: AcademicBackgroundRunProgress) => void,
  writeQ6Update: (update: AcademicBackgroundRunQ6Update) => void,
): Observer {
  let saved: AcademicBackgroundRunView | undefined
  return (view) => {
    if (saved !== undefined
      && saved.sessionId === view.sessionId
      && saved.backgroundRunId === view.backgroundRunId
      && saved.researchBriefId === view.researchBriefId
      && saved.state === 'running' && view.state === 'running'
      && saved.retrievalRunId === view.retrievalRunId
      && sameQ6Candidates(saved, view)
      && saved.result === view.result
      && saved.cancelReason === view.cancelReason
      && saved.error === view.error
      && saved.startedAt === view.startedAt) {
      const progress: AcademicBackgroundRunProgress = {
        schemaVersion: view.schemaVersion,
        sessionId: view.sessionId,
        backgroundRunId: view.backgroundRunId,
        researchBriefId: view.researchBriefId,
        retrievalRunId: view.retrievalRunId,
        updatedAt: view.updatedAt,
        progress: view.progress,
      }
      if (saved.q6 !== view.q6 && view.q6 !== null) {
        writeQ6Update({ ...progress, q6: q6Metadata(view.q6) })
      } else {
        writeProgress(progress)
      }
    } else {
      writeState(view)
    }
    saved = view
  }
}

function q6BelongsToRun(view: AcademicBackgroundRunView, q6: AcademicQ6Projection): boolean {
  return q6.sessionId === view.sessionId
    && q6.retrievalRunId === view.retrievalRunId
    && q6.researchBriefId === view.researchBriefId
    && q6.plan.researchBriefId === q6.researchBriefId
    && q6.plan.researchBriefVersion === q6.researchBriefVersion
}

function sameQ6Candidates(before: AcademicBackgroundRunView, after: AcademicBackgroundRunView): boolean {
  const previous = before.q6
  const next = after.q6
  return previous === next || previous !== null && next !== null
    && q6BelongsToRun(before, previous)
    && q6BelongsToRun(after, next)
    && previous.sessionId === next.sessionId
    && previous.retrievalRunId === next.retrievalRunId
    && previous.researchBriefId === next.researchBriefId
    && previous.researchBriefVersion === next.researchBriefVersion
    && next.sequence >= previous.sequence
    && isDeepStrictEqual(previous.candidates, next.candidates)
}

function q6Metadata({ candidates: _candidates, ...metadata }: AcademicQ6Projection): AcademicBackgroundRunQ6Metadata {
  return metadata
}

function exactRunningCheckpoint(
  view: AcademicBackgroundRunView | undefined,
  event: AcademicBackgroundRunProgress,
): AcademicBackgroundRunView {
  if (view === undefined) throw new Error('Academic background progress requires a complete checkpoint.')
  validateDurableRecord(view, checkpointIdentitySchema, 'Academic background checkpoint has invalid durable identities.')
  if (view.sessionId !== event.sessionId
    || view.backgroundRunId !== event.backgroundRunId
    || view.researchBriefId !== event.researchBriefId
    || view.retrievalRunId !== event.retrievalRunId) {
    throw new Error('Academic background progress must match its checkpoint identities.')
  }
  if (view.state !== 'running') throw new Error('Academic background progress requires a running checkpoint.')
  if (event.progress !== null && (event.progress.sessionId !== event.sessionId
    || event.progress.retrievalRunId !== event.retrievalRunId)) {
    throw new Error('Academic background progress must retain its producer identities.')
  }
  return view
}

/**
 * Apply durable progress to its exact complete running checkpoint.
 * @param view - previously restored view; absent checkpoints are rejected.
 * @param event - progress from the same Session, background run, Brief, and retrieval run.
 * @returns The complete view with only progress and its update time replaced.
 * @throws When the checkpoint, lifecycle, or producer identities do not match.
 */
export function applyBackgroundRunProgress(
  view: AcademicBackgroundRunView | undefined,
  event: AcademicBackgroundRunProgress,
): AcademicBackgroundRunView {
  validateDurableRecord(event, progressRecordSchema, 'Academic background progress has an invalid durable record.')
  const checkpoint = exactRunningCheckpoint(view, event)
  return { ...checkpoint, progress: event.progress, updatedAt: event.updatedAt }
}

/**
 * Restore Q6 metadata against its exact checkpoint without replacing candidate facts.
 * @param view - complete running checkpoint, including the retained Q6 candidates.
 * @param event - progress and Q6 metadata with the same producer identities and Brief version.
 * @returns The complete updated view, sharing the checkpoint's candidates.
 * @throws When metadata has candidates, lacks a Q6 checkpoint, changes identity or version, or moves backwards.
 */
export function applyBackgroundRunQ6Update(
  view: AcademicBackgroundRunView | undefined,
  event: AcademicBackgroundRunQ6Update,
): AcademicBackgroundRunView {
  validateDurableRecord(event, q6UpdateRecordSchema, 'Academic background Q6 update has an invalid durable record.')
  const checkpoint = exactRunningCheckpoint(view, event)
  const base = checkpoint.q6
  if (base === null) throw new Error('Academic background Q6 update requires a complete Q6 checkpoint.')
  validateDurableRecord(base, q6CheckpointIdentitySchema, 'Academic background Q6 checkpoint has invalid durable identities.')
  const next = event.q6
  if (base.sessionId !== checkpoint.sessionId || next.sessionId !== checkpoint.sessionId
    || base.retrievalRunId !== checkpoint.retrievalRunId || next.retrievalRunId !== checkpoint.retrievalRunId
    || base.researchBriefId !== checkpoint.researchBriefId || next.researchBriefId !== checkpoint.researchBriefId
    || next.researchBriefVersion !== base.researchBriefVersion
    || base.plan.researchBriefId !== base.researchBriefId || next.plan.researchBriefId !== next.researchBriefId
    || base.plan.researchBriefVersion !== base.researchBriefVersion || next.plan.researchBriefVersion !== next.researchBriefVersion
    || next.sequence < base.sequence) {
    throw new Error('Academic background Q6 update must retain checkpoint identities, version, and sequence.')
  }
  return { ...checkpoint, progress: event.progress, updatedAt: event.updatedAt,
    q6: { ...next, candidates: base.candidates } }
}

/** Host lifetime registry; every state transition is also written to the owning Session. */
export class AcademicBackgroundRuns {
  private readonly active = new Map<AcademicBackgroundRunId, ActiveRun>()
  private readonly bySession = new Map<SessionId, AcademicBackgroundRunId>()
  private readonly observers = new Map<AcademicBackgroundRunId, Set<Observer>>()

  /**
   * Return an active view only within its owning Session.
   * @param sessionId Owning Session.
   * @param backgroundRunId Host task identity.
   * @returns Active state, or undefined when not active or not owned by the Session.
   */
  get(sessionId: SessionId, backgroundRunId: AcademicBackgroundRunId): AcademicBackgroundRunView | undefined {
    const entry = this.active.get(backgroundRunId)
    return entry?.view.sessionId === sessionId ? entry.view : undefined
  }

  /**
   * Check whether this Session already has active background work.
   * @param sessionId Owning Session.
   * @returns Whether another background task is active.
   */
  hasActiveSession(sessionId: SessionId): boolean { return this.bySession.has(sessionId) }

  /**
   * Begin work detached from the Remote caller's AbortSignal.
   * @param input Session identity, approved Brief identity, and wall-clock start time.
   * @param persist Write every state transition to the owning Session.
   * @param execute Invoke the existing workflow with an explicit task signal and two progress observers.
   * @returns Durable initial state with the new background run ID.
   */
  start(
    input: Pick<AcademicBackgroundRunView, 'sessionId' | 'researchBriefId' | 'startedAt'>,
    persist: Observer,
    execute: (
      signal: AbortSignal,
      update: (change: Partial<Pick<AcademicBackgroundRunView, 'retrievalRunId' | 'progress' | 'q6'>>) => void,
    ) => Promise<AcademicResearchRunValue>,
  ): AcademicBackgroundRunView {
    if (this.bySession.has(input.sessionId)) throw new Error('academic research already has an active background run')
    const backgroundRunId = randomUUID()
    const initial: AcademicBackgroundRunView = {
      schemaVersion: 1, ...input, backgroundRunId, updatedAt: input.startedAt, state: 'running',
      retrievalRunId: null, progress: null, q6: null, result: null, error: null, cancelReason: null,
    }
    persist(initial)
    const entry: ActiveRun = { view: initial, abort: new AbortController(), persist, settled: Promise.resolve() }
    this.active.set(backgroundRunId, entry)
    this.bySession.set(input.sessionId, backgroundRunId)
    const update = (change: Partial<Pick<AcademicBackgroundRunView, 'retrievalRunId' | 'progress' | 'q6'>>) => {
      if (entry.view.state !== 'running') return
      this.commit(entry, { ...entry.view, ...change, updatedAt: new Date().toISOString() }, persist)
    }
    entry.settled = Promise.resolve().then(() => execute(entry.abort.signal, update)).then((result) => {
      const cancelled = result.status === 'cancelled'
      const interrupted = cancelled && entry.view.cancelReason === 'service_stopped'
      this.commit(entry, { ...entry.view, state: interrupted ? 'interrupted' : cancelled ? 'cancelled' : 'completed',
        updatedAt: new Date().toISOString(), retrievalRunId: result.retrievalRun.retrievalRunId,
        result, q6: result.q6, cancelReason: cancelled ? entry.view.cancelReason : null }, persist)
    }, (cause: unknown) => {
      const cancelled = entry.abort.signal.aborted
      const interrupted = cancelled && entry.view.cancelReason === 'service_stopped'
      this.commit(entry, { ...entry.view, state: interrupted ? 'interrupted' : cancelled ? 'cancelled' : 'failed',
        updatedAt: new Date().toISOString(), error: cancelled ? null : backgroundFailureMessage(cause) }, persist)
    }).finally(() => { this.active.delete(backgroundRunId); this.bySession.delete(input.sessionId) })
    return initial
  }

  /**
   * Cancel only through an explicit command, leaving subscribers free to disconnect.
   * @param sessionId Owning Session.
   * @param backgroundRunId Host task identity.
   * @param persist Save the user cancellation intent in the Session.
   * @returns Latest state, or undefined for a missing task.
   */
  cancel(sessionId: SessionId, backgroundRunId: AcademicBackgroundRunId, persist: Observer): AcademicBackgroundRunView | undefined {
    const entry = this.active.get(backgroundRunId)
    if (entry?.view.sessionId !== sessionId) return undefined
    if (entry.view.state !== 'running') return entry.view
    if (!entry.abort.signal.aborted) {
      this.commit(entry, { ...entry.view, updatedAt: new Date().toISOString(), cancelReason: 'user_requested' }, persist)
      entry.abort.abort(new Error('Academic research cancelled by user'))
    }
    return entry.view
  }

  /**
   * Stop active tasks and wait for their settlement before the Host plugin is released.
   * @returns Completion after every active workflow has settled.
   */
  async dispose(): Promise<void> {
    const entries = [...this.active.values()]
    for (const entry of entries) {
      if (entry.view.state !== 'running' || entry.abort.signal.aborted) continue
      if (entry.view.cancelReason === null) {
        this.commit(entry, { ...entry.view, updatedAt: new Date().toISOString(), cancelReason: 'service_stopped' }, entry.persist)
      }
      entry.abort.abort(new Error('Academic research Host disposed'))
    }
    await Promise.all(entries.map(entry => entry.settled))
  }

  /**
   * Observe one active task; subscriber cancellation never aborts the task.
   * @param sessionId Owning Session.
   * @param backgroundRunId Host task identity.
   * @param signal Subscriber lifetime.
   * @returns Current state and the latest unconsumed live snapshot; durable events retain every transition.
   */
  async *watch(
    sessionId: SessionId, backgroundRunId: AcademicBackgroundRunId, signal: AbortSignal,
  ): AsyncIterable<AcademicBackgroundRunView> {
    if (signal.aborted) return
    const entry = this.active.get(backgroundRunId)
    if (entry?.view.sessionId !== sessionId) return
    let pending: AcademicBackgroundRunView | undefined = entry.view
    const subscription = { closed: false }
    let wake: (() => void) | undefined
    const notify = (): void => {
      const resume = wake
      wake = undefined
      resume?.()
    }
    const observer: Observer = (view) => {
      if (subscription.closed) return
      if (pending === undefined || pending.state === 'running') pending = view
      notify()
    }
    const observers = this.observers.get(backgroundRunId) ?? new Set<Observer>()
    observers.add(observer)
    this.observers.set(backgroundRunId, observers)
    const stop = (): void => {
      if (subscription.closed) return
      subscription.closed = true
      pending = undefined
      observers.delete(observer)
      if (observers.size === 0) this.observers.delete(backgroundRunId)
      signal.removeEventListener('abort', stop)
      notify()
    }
    signal.addEventListener('abort', stop, { once: true })
    try {
      while (!subscription.closed) {
        const next = pending
        pending = undefined
        if (next !== undefined) {
          yield next
          if (next.state !== 'running') return
        } else await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      stop()
    }
  }

  private commit(entry: { view: AcademicBackgroundRunView }, view: AcademicBackgroundRunView, persist: Observer): void {
    persist(view)
    entry.view = view
    for (const observer of this.observers.get(view.backgroundRunId) ?? []) observer(view)
  }
}

/**
 * Replay a completed view or identify a task no longer active on this host.
 * @param sessionId Owning Session.
 * @param backgroundRunId Host task identity.
 * @param events Ordered Session events.
 * @returns Last saved view or undefined when the run is absent.
 */
export function replayBackgroundRun(
  sessionId: SessionId,
  backgroundRunId: AcademicBackgroundRunId,
  events: readonly { readonly type: string; readonly data: unknown }[],
): AcademicBackgroundRunView | undefined {
  let latest: AcademicBackgroundRunView | undefined
  for (const event of events) {
    if (event.type === 'academic/background-run-state') {
      const view = event.data as AcademicBackgroundRunView
      if (view.sessionId === sessionId && view.backgroundRunId === backgroundRunId) latest = view
    } else if (event.type === 'academic/background-run-progress') {
      validateDurableRecord(event.data, progressRecordSchema, 'Academic background progress has an invalid durable record.')
      const progress = event.data as AcademicBackgroundRunProgress
      if (progress.sessionId === sessionId && progress.backgroundRunId === backgroundRunId) {
        latest = applyBackgroundRunProgress(latest, progress)
      }
    } else if (event.type === 'academic/background-run-q6-update') {
      validateDurableRecord(event.data, q6UpdateRecordSchema, 'Academic background Q6 update has an invalid durable record.')
      const update = event.data as AcademicBackgroundRunQ6Update
      if (update.sessionId === sessionId && update.backgroundRunId === backgroundRunId) {
        latest = applyBackgroundRunQ6Update(latest, update)
      }
    }
  }
  return latest === undefined ? undefined : interruptedIfInactive(latest)
}

/**
 * Recover the latest state of each task in first-start order.
 * @param sessionId Owning Session.
 * @param events Ordered Session events.
 * @returns Latest view for each run in this Session.
 */
export function replayBackgroundRuns(
  sessionId: SessionId,
  events: readonly { readonly type: string; readonly data: unknown }[],
): AcademicBackgroundRunView[] {
  const latest = new Map<AcademicBackgroundRunId, AcademicBackgroundRunView>()
  for (const event of events) {
    if (event.type === 'academic/background-run-state') {
      const view = event.data as AcademicBackgroundRunView
      if (view.sessionId === sessionId) latest.set(view.backgroundRunId, view)
    } else if (event.type === 'academic/background-run-progress') {
      validateDurableRecord(event.data, progressRecordSchema, 'Academic background progress has an invalid durable record.')
      const progress = event.data as AcademicBackgroundRunProgress
      if (progress.sessionId === sessionId) {
        latest.set(progress.backgroundRunId, applyBackgroundRunProgress(latest.get(progress.backgroundRunId), progress))
      }
    } else if (event.type === 'academic/background-run-q6-update') {
      validateDurableRecord(event.data, q6UpdateRecordSchema, 'Academic background Q6 update has an invalid durable record.')
      const update = event.data as AcademicBackgroundRunQ6Update
      if (update.sessionId === sessionId) {
        latest.set(update.backgroundRunId, applyBackgroundRunQ6Update(latest.get(update.backgroundRunId), update))
      }
    }
  }
  return [...latest.values()].map(interruptedIfInactive)
}

/**
 * Recover one run from its already-folded latest view without reading Session history.
 *
 * @param sessionId - Session that owns the run.
 * @param backgroundRunId - Run to recover.
 * @param view - Latest projected state for the run, if one exists.
 * @returns The validated run view with inactive work marked interrupted, or undefined.
 */
export function backgroundRunFromProjection(
  sessionId: SessionId,
  backgroundRunId: AcademicBackgroundRunId,
  view: AcademicBackgroundRunView | undefined,
): AcademicBackgroundRunView | undefined {
  if (view?.sessionId !== sessionId || view.backgroundRunId !== backgroundRunId) return undefined
  return interruptedIfInactive(view)
}

/**
 * Recover recent runs in first-start order from the Session projection.
 *
 * @param sessionId - Session whose runs should be returned.
 * @param order - Run IDs in their first-start order.
 * @param latest - Latest projected state indexed by run ID.
 * @returns Run views belonging to the Session, in first-start order.
 */
export function backgroundRunsFromProjection(
  sessionId: SessionId,
  order: readonly string[],
  latest: Readonly<Record<string, AcademicBackgroundRunView>>,
): AcademicBackgroundRunView[] {
  return order.flatMap((id) => {
    const view = latest[id]
    return view?.sessionId === sessionId ? [interruptedIfInactive(view)] : []
  })
}

function interruptedIfInactive(view: AcademicBackgroundRunView): AcademicBackgroundRunView {
  if (view.state !== 'running') return view
  return { ...view, state: 'interrupted',
    error: '当前服务没有此运行的活动任务；可使用已保存的检索检查点恢复，未结算批次需要重新执行。' }
}

function backgroundFailureMessage(cause: unknown): string {
  if (cause !== null && typeof cause === 'object' && 'code' in cause && cause.code === 'session/agent-busy') {
    return '当前会话正在执行其他任务，请稍后重新发起研究。'
  }
  return '学术研究运行失败；可查看 Session 中已记录的进度和失败信息。'
}
