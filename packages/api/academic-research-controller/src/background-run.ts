/** Session-persisted background research state and independent live subscribers. */
import { randomUUID } from 'node:crypto'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AcademicBackgroundRunId, AcademicBackgroundRunView, AcademicResearchRunValue } from './types.ts'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Latest complete detached-run view; replay uses the last event for each run ID. */
    'academic/background-run-state': AcademicBackgroundRunView
  }
}

type Observer = (view: AcademicBackgroundRunView) => void
type ActiveRun = {
  view: AcademicBackgroundRunView
  abort: AbortController
  persist: Observer
  settled: Promise<void>
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
   * @returns Current state and future live updates.
   */
  async *watch(
    sessionId: SessionId, backgroundRunId: AcademicBackgroundRunId, signal: AbortSignal,
  ): AsyncIterable<AcademicBackgroundRunView> {
    const entry = this.active.get(backgroundRunId)
    if (entry?.view.sessionId !== sessionId) return
    const pending: AcademicBackgroundRunView[] = [entry.view]
    let wake: (() => void) | undefined
    const observer: Observer = (view) => { pending.push(view); wake?.() }
    const observers = this.observers.get(backgroundRunId) ?? new Set<Observer>()
    observers.add(observer)
    this.observers.set(backgroundRunId, observers)
    const abort = () => { wake?.() }
    signal.addEventListener('abort', abort, { once: true })
    try {
      while (!signal.aborted) {
        const next = pending.shift()
        if (next !== undefined) {
          yield next
          if (next.state !== 'running') return
        } else await new Promise<void>((resolve) => { wake = resolve })
        wake = undefined
      }
    } finally {
      signal.removeEventListener('abort', abort)
      observers.delete(observer)
      if (observers.size === 0) this.observers.delete(backgroundRunId)
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
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined) continue
    if (event.type !== 'academic/background-run-state') continue
    const view = event.data as AcademicBackgroundRunView
    if (view.sessionId === sessionId && view.backgroundRunId === backgroundRunId) return interruptedIfInactive(view)
  }
  return undefined
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
    if (event.type !== 'academic/background-run-state') continue
    const view = event.data as AcademicBackgroundRunView
    if (view.sessionId === sessionId) latest.set(view.backgroundRunId, view)
  }
  return [...latest.values()].map(interruptedIfInactive)
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
