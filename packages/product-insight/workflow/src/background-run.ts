/** Durable product task state; the generic jobs service owns live execution. */
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

/** One committed task transition for an exact approved product plan. */
export interface ProductBackgroundRunState {
  readonly planId: string
  readonly jobId: string
  readonly state: 'running' | 'completed' | 'failed' | 'cancelled'
  readonly startedAt: string
  readonly updatedAt: string
  readonly reportRef: string | null
  readonly deliveryStatus: 'blocked' | 'draft' | 'final' | null
  readonly error: string | null
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete task transition, kept beside source, claim and report events. */
    'product/background-run-v1': ProductBackgroundRunState
  }
}

/** Find the last task for one plan; an unclosed task is interrupted after its live job disappears. */
export function latestProductBackgroundRun(events: readonly SessionEvent[], planId: string,
  isActive: (jobId: string) => boolean): ProductBackgroundRunState | (Omit<ProductBackgroundRunState, 'state'>
    & { readonly state: 'interrupted' }) | undefined {
  const latest = events.findLast(event => event.type === 'product/background-run-v1'
    && event.data.planId === planId)
  if (latest?.type !== 'product/background-run-v1') return undefined
  const state = latest.data
  return state.state === 'running' && !isActive(state.jobId)
    ? { ...state, state: 'interrupted' } : state
}
