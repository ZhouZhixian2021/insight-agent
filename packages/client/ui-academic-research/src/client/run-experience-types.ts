/** Client-only prototype data; these are not proposed backend or Remote contracts. */
import type { AcademicResearchProgressStatus } from '@deepseek-ai/dsh-api-academic-research-controller/types'

/** Fixed UI state scenarios pending A's durable run-status interface. */
export type PreviewRunStatus = 'running' | 'paused' | 'completed' | 'completed_with_limitations' | 'failed' | 'cancelled'

/** Recorded count with its explicit unit; unknown totals remain null. */
export interface PreviewStage {
  readonly phase: 'discovery' | 'verification' | 'screening' | 'ranking' | 'fulltext' | 'extraction' | 'inclusion' | 'report'
  readonly status: AcademicResearchProgressStatus
  readonly input: number | null
  readonly output: number | null
  readonly unit: 'records' | 'papers' | 'evidence' | 'reports'
  readonly reasons: readonly string[]
}

/** Authored JSON presentation scenario, explicitly synthetic even when counts mirror a real incident. */
export interface PreviewRun {
  readonly id: string
  readonly status: PreviewRunStatus
  readonly elapsedMinutes: number
  readonly cancellationReason: 'user_cancelled' | 'client_disconnected' | 'session_switched' | 'server_shutdown' | 'unknown' | null
  readonly connected: boolean
  readonly currentWork: string
  readonly stages: readonly PreviewStage[]
  readonly counts: {
    readonly discovered: number
    readonly candidateLimit: number
    readonly scheduled: number
    readonly processed: number | null
    readonly failed: number | null
    readonly evidence: number
    readonly usable: number
    readonly coveredQuestions: number
    readonly totalQuestions: number
  }
  readonly unmetRequirements: readonly string[]
  readonly report: { readonly state: 'not_generated' | 'draft' | 'failed'; readonly markdown: string | null }
}

/** React-owned demo state survives modal close, but not page refresh or plugin disposal. */
export interface PreviewState {
  readonly selected: string
  readonly runs: readonly PreviewRun[]
}
