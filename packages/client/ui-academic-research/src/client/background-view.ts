/** Preserve producer identity and monotonically observed background snapshots. */
import type { AcademicBackgroundRunView } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import type { RunView } from './run-types.ts'

/**
 * Project one complete background state without equating task completion with report approval.
 * @param task Session-owned producer state.
 * @param previous Previously accepted observations for this background task.
 * @param mismatch Localized identity failure.
 * @param interrupted Localized service-interruption explanation.
 * @param cancelled Localized cancellation without result explanation.
 * @param failed Localized failure without diagnostic explanation.
 * @returns Presentation retaining bounded, increasing progress and Q6 observations.
 */
export function backgroundView(task: AcademicBackgroundRunView, previous: RunView | null,
  mismatch: string, interrupted: string, cancelled: string, failed: string): RunView {
  const ids = [task.progress?.retrievalRunId, task.q6?.retrievalRunId, task.result?.retrievalRun.retrievalRunId,
    previous?.progress?.retrievalRunId, previous?.q6?.retrievalRunId].filter(id => id != null)
  if (ids.some(id => task.retrievalRunId !== id)
    || (task.progress != null && task.progress.sessionId !== task.sessionId)
    || (task.q6 != null && (task.q6.sessionId !== task.sessionId || task.q6.researchBriefId !== task.researchBriefId))
    || (task.result != null && (task.result.sessionId !== task.sessionId
      || task.result.retrievalRun.researchBriefId !== task.researchBriefId))) throw new Error(mismatch)
  const progress = task.progress != null && (previous?.progress === undefined || task.progress.sequence > previous.progress.sequence)
    ? task.progress : previous?.progress
  const recent = progress !== previous?.progress && progress !== undefined
    ? [...previous?.recent ?? [], progress].slice(-20) : previous?.recent
  const nextQ6 = task.result?.q6 ?? task.q6
  if (nextQ6 != null && (nextQ6.sessionId !== task.sessionId || nextQ6.retrievalRunId !== task.retrievalRunId
    || nextQ6.researchBriefId !== task.researchBriefId)) throw new Error(mismatch)
  if (nextQ6 != null && previous?.q6 !== undefined
    && nextQ6.researchBriefVersion !== previous.q6.researchBriefVersion) throw new Error(mismatch)
  const q6 = task.result !== null && task.result.q6 == null ? undefined
    : nextQ6 != null && (previous?.q6 === undefined || nextQ6.sequence > previous.q6.sequence) ? nextQ6 : previous?.q6
  const facts = { ...progress === undefined ? {} : { progress },
    ...recent === undefined ? {} : { recent }, ...q6 === undefined ? {} : { q6 } }
  if (task.result !== null) return { phase: 'settled', value: task.result, ...facts }
  if (task.state === 'running') return { phase: 'running', cancelling: task.cancelReason === 'user_requested', ...facts }
  return { phase: 'error', reason: task.state === 'cancelled' ? 'cancelled' : 'server',
    message: task.error ?? (task.state === 'interrupted' ? interrupted : task.state === 'cancelled' ? cancelled : failed), ...facts }
}
