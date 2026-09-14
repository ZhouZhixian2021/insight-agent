/** Research run records shared by retrieval, workflow, and analysis; no execution or state transitions. */
import type { BatchStatus, CoverageSummary, ProviderFailure } from './results.ts'
import type { AcademicWorkId, ResearchBriefId, RetrievalRunId } from './types.ts'

/** Coarse research lifecycle; individual retrieval, evidence, and analysis steps are separate progress data. */
export type ResearchStage = 'planning' | 'awaiting_approval' | 'running' | 'completed' | 'failed' | 'cancelled'

/** Common observed data for a run; the workflow owns approval enforcement and record persistence. */
interface RetrievalRunData {
  readonly schemaVersion: 1
  readonly retrievalRunId: RetrievalRunId
  readonly researchBriefId: ResearchBriefId
  /** Positive content version; all work in this run uses this exact approved brief version. */
  readonly researchBriefVersion: number
  /** UTC ISO 8601 time when the run record starts, not necessarily when network execution starts. */
  readonly startedAt: string
  /** Executed query texts in order, including repeated queries when actually executed again. */
  readonly queries: readonly string[]
  /** Names of providers actually called, without duplicates. */
  readonly providers: readonly string[]
  /** Deduplicated works included in this run, preserved alongside individual failures. */
  readonly academicWorkIds: readonly AcademicWorkId[]
  readonly coverageSummary: CoverageSummary
  readonly failures: readonly ProviderFailure[]
}

/**
 * One run's brief binding, observed coverage, and results. Open stages have no final status or
 * completion time. Terminal stages carry both, including cancellation. Status describes returned
 * works and failures by BatchResult rules, not lifecycle completion: completed may be partial_success,
 * and cancelled preserves any successful results. This record does not authorize execution.
 */
export type RetrievalRun = RetrievalRunData & (
  | {
    readonly stage: 'planning' | 'awaiting_approval' | 'running'
    readonly status: null
    readonly completedAt: null
  }
  | {
    readonly stage: 'completed' | 'failed' | 'cancelled'
    readonly status: BatchStatus
    /** UTC ISO 8601 terminal time, including failed and cancelled runs. */
    readonly completedAt: string
  }
)
