/** Run-local progress facts emitted by the Academic workflow. */
import type { AcademicWorkId, FailureCategory, RetrievalRunId, WorkVersionId } from '@deepseek-ai/dsh-academic-model'

/** Ordered stages observed during one Academic research run. */
export type AcademicWorkflowProgressStage =
  | 'retrieval'
  | 'screening'
  | 'fulltext'
  | 'extraction'
  | 'analysis'
  | 'report'

/** Current or terminal settlement of one workflow stage. */
export type AcademicWorkflowProgressStatus =
  | 'pending'
  | 'running'
  | 'partial_success'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'not_run'

/** Unit attached to an observed stage count. */
export type AcademicWorkflowProgressUnit = 'queries' | 'works' | 'papers' | 'batches' | 'questions' | 'report'

/** Complete current settlement of one workflow stage. */
export interface AcademicWorkflowProgressStageView {
  readonly status: AcademicWorkflowProgressStatus
  readonly startedAt: string | null
  readonly completedAt: string | null
  readonly completedItems: number
  readonly totalItems: number | null
  readonly unit: AcademicWorkflowProgressUnit | null
}

/** Complete fixed stage map carried by every workflow progress snapshot. */
export interface AcademicWorkflowProgressStages {
  readonly retrieval: AcademicWorkflowProgressStageView
  readonly screening: AcademicWorkflowProgressStageView
  readonly fulltext: AcademicWorkflowProgressStageView
  readonly extraction: AcademicWorkflowProgressStageView
  readonly analysis: AcademicWorkflowProgressStageView
  readonly report: AcademicWorkflowProgressStageView
}

/** Absolute observed totals carried by every workflow progress snapshot. */
export interface AcademicWorkflowProgressCounts {
  readonly completedQueries: number
  readonly totalQueries: number
  readonly discoveredRecords: number
  readonly deduplicatedWorks: number
  /** Work identities consolidated into another identity by exact-identifier bridges. */
  readonly mergedWorkIdentities: number
  /** Input records assigned to an existing work identity during ingestion. */
  readonly mergedVersionRecords: number
  /** Distinct version states retained by the current ingestion outcome. */
  readonly retainedWorkVersions: number
  /** Records retained separately after an unresolved fuzzy-identity match. */
  readonly suspectedDuplicateRecords: number
  readonly candidateWorks: number
  readonly completedPapers: number
  readonly totalPapers: number | null
  readonly includedPapers: number
  readonly availableFulltextPapers: number
  readonly validatedEvidenceRecords: number
  readonly rejectedEvidenceDrafts: number
  readonly completedQuestions: number
  readonly totalQuestions: number
}

/** Sanitized reason codes suitable for a later client projection. */
export type AcademicWorkflowProgressFailureCode = FailureCategory
  | 'cancelled'
  | 'incomplete_output'
  | 'output_limit'
  | 'invalid_output'

/** Concurrent work observed by the workflow. Unknown model-internal attempt facts remain null. */
export type AcademicWorkflowProgressActivity =
  | {
    readonly kind: 'query'
    readonly stage: 'retrieval'
    readonly queryIndex: number
    readonly queryCount: number
    readonly query: string
    readonly channels: readonly ('academic' | 'web_discovery')[]
    readonly startedAt: string
  }
  | {
    readonly kind: 'provider'
    readonly stage: 'retrieval'
    readonly queryIndex: number
    readonly queryCount: number
    readonly providerId: string
    readonly status: 'running' | 'success' | 'failed' | 'cancelled'
    readonly discoveredRecords: number | null
    readonly failureCode: AcademicWorkflowProgressFailureCode | null
    readonly startedAt: string
    readonly completedAt: string | null
  }
  | {
    readonly kind: 'screening'
    readonly stage: 'screening'
    readonly operation: 'deduplication' | 'eligibility'
    readonly startedAt: string
  }
  | {
    readonly kind: 'paper'
    readonly stage: 'fulltext' | 'extraction'
    readonly academicWorkId: AcademicWorkId
    readonly workVersionId: WorkVersionId
    readonly title: string | null
    readonly operation: 'fulltext_fetch' | 'fulltext_parse' | 'evidence_extract' | 'evidence_validate' | 'waiting_retry'
    readonly batchIndex: number | null
    readonly batchCount: number | null
    readonly attempt: number | null
    readonly maximumAttempts: number | null
    readonly lastFailure: AcademicWorkflowProgressFailureCode | null
    readonly validatedEvidenceRecords: number
    readonly rejectedEvidenceDrafts: number
    readonly startedAt: string
  }
  | {
    readonly kind: 'question'
    readonly stage: 'analysis'
    readonly questionIndex: number
    readonly questionCount: number
    readonly question: string
    readonly startedAt: string
  }
  | {
    readonly kind: 'report'
    readonly stage: 'report'
    readonly operation: 'synthesis' | 'evaluation' | 'rendering'
    readonly attempt: number | null
    readonly maximumAttempts: number | null
    readonly lastFailure: AcademicWorkflowProgressFailureCode | null
    readonly startedAt: string
  }

/** Latest workflow event represented by one complete progress snapshot. */
export interface AcademicWorkflowProgressEvent {
  readonly code:
    | 'run_started'
    | 'stage_started'
    | 'stage_updated'
    | 'stage_settled'
    | 'provider_updated'
    | 'paper_updated'
    | 'retry_scheduled'
    | 'run_completed'
    | 'run_cancelled'
  readonly occurredAt: string
  readonly stage: AcademicWorkflowProgressStage
  readonly academicWorkId: AcademicWorkId | null
  readonly workVersionId: WorkVersionId | null
  readonly providerId: string | null
  readonly failureCode: AcademicWorkflowProgressFailureCode | null
}

/** Complete run-local snapshot; later sequences replace earlier snapshots for the same run. */
export interface AcademicWorkflowProgressSnapshot {
  readonly schemaVersion: 1
  readonly retrievalRunId: RetrievalRunId
  readonly sequence: number
  readonly startedAt: string
  readonly updatedAt: string
  readonly elapsedMs: number
  readonly primaryStage: AcademicWorkflowProgressStage | null
  readonly activeStages: readonly AcademicWorkflowProgressStage[]
  readonly stages: AcademicWorkflowProgressStages
  readonly counts: AcademicWorkflowProgressCounts
  readonly activities: readonly AcademicWorkflowProgressActivity[]
  readonly latestEvent: AcademicWorkflowProgressEvent
}

/** Synchronous observer called after each workflow progress fact commits. */
export type AcademicWorkflowProgressObserver = (snapshot: AcademicWorkflowProgressSnapshot) => void

const stageOrder: readonly AcademicWorkflowProgressStage[] = [
  'retrieval', 'screening', 'fulltext', 'extraction', 'analysis', 'report',
]

type CountsPatch = Partial<AcademicWorkflowProgressCounts>

class ProgressPublisher {
  private sequence = -1
  private terminal = false
  private primaryStage: AcademicWorkflowProgressStage | null = 'retrieval'
  private readonly stages: Record<AcademicWorkflowProgressStage, AcademicWorkflowProgressStageView>
  private counts: AcademicWorkflowProgressCounts
  private readonly activities = new Map<string, AcademicWorkflowProgressActivity>()

  constructor(
    private readonly retrievalRunId: RetrievalRunId,
    private readonly startedAt: string,
    totalQueries: number,
    totalQuestions: number,
    private readonly now: () => string,
    private readonly observer: AcademicWorkflowProgressObserver | undefined,
  ) {
    this.stages = {
      retrieval: pending('queries', totalQueries),
      screening: pending('works', null),
      fulltext: pending('papers', null),
      extraction: pending('papers', null),
      analysis: pending('questions', totalQuestions),
      report: pending('report', 1),
    }
    this.counts = {
      completedQueries: 0,
      totalQueries,
      discoveredRecords: 0,
      deduplicatedWorks: 0,
      mergedWorkIdentities: 0,
      mergedVersionRecords: 0,
      retainedWorkVersions: 0,
      suspectedDuplicateRecords: 0,
      candidateWorks: 0,
      completedPapers: 0,
      totalPapers: null,
      includedPapers: 0,
      availableFulltextPapers: 0,
      validatedEvidenceRecords: 0,
      rejectedEvidenceDrafts: 0,
      completedQuestions: 0,
      totalQuestions,
    }
    this.emit('run_started', 'retrieval')
  }

  startStage(
    stage: AcademicWorkflowProgressStage,
    totalItems: number | null = this.stages[stage].totalItems,
    unit: AcademicWorkflowProgressUnit | null = this.stages[stage].unit,
  ): void {
    if (this.terminal || this.stages[stage].status === 'running') return
    const occurredAt = this.now()
    this.stages[stage] = { status: 'running', startedAt: occurredAt, completedAt: null,
      completedItems: this.stages[stage].completedItems, totalItems, unit }
    this.primaryStage = stage
    this.emit('stage_started', stage, null, null, occurredAt)
  }

  updateStage(
    stage: AcademicWorkflowProgressStage,
    completedItems: number,
    totalItems: number | null,
    counts: CountsPatch = {},
  ): void {
    if (this.terminal) return
    const current = this.stages[stage]
    this.stages[stage] = { ...current, completedItems, totalItems }
    this.counts = { ...this.counts, ...counts }
    this.primaryStage = stage
    this.emit('stage_updated', stage)
  }

  settleStage(
    stage: AcademicWorkflowProgressStage,
    status: Exclude<AcademicWorkflowProgressStatus, 'pending' | 'running'>,
    completedItems: number = this.stages[stage].completedItems,
    totalItems: number | null = this.stages[stage].totalItems,
    counts: CountsPatch = {},
    failureCode: AcademicWorkflowProgressFailureCode | null = null,
  ): void {
    if (this.terminal) return
    const current = this.stages[stage]
    this.stages[stage] = { ...current, status, completedAt: this.now(), completedItems, totalItems }
    this.counts = { ...this.counts, ...counts }
    this.removeStageActivities(stage)
    this.primaryStage = stage
    this.emit('stage_settled', stage, null, failureCode)
  }

  setActivity(key: string, activity: AcademicWorkflowProgressActivity): void {
    if (this.terminal) return
    this.activities.set(key, activity)
    this.primaryStage = activity.stage
    const paper = activity.kind === 'paper' ? activity : null
    const provider = activity.kind === 'provider' ? activity : null
    const code = paper !== null ? 'paper_updated' : provider !== null ? 'provider_updated' : 'stage_updated'
    this.emit(code, activity.stage, paper?.workVersionId ?? null,
      paper?.lastFailure ?? provider?.failureCode ?? null, this.now(),
      paper?.academicWorkId ?? null, provider?.providerId ?? null)
  }

  removeActivity(
    key: string,
    stage: AcademicWorkflowProgressStage,
    workVersionId: WorkVersionId | null = null,
    failureCode: AcademicWorkflowProgressFailureCode | null = null,
    academicWorkId: AcademicWorkId | null = null,
  ): void {
    if (this.terminal) return
    this.activities.delete(key)
    this.primaryStage = stage
    this.emit(workVersionId === null ? 'stage_updated' : 'paper_updated', stage, workVersionId, failureCode,
      this.now(), academicWorkId)
  }

  updateCounts(stage: AcademicWorkflowProgressStage, counts: CountsPatch): void {
    if (this.terminal) return
    this.counts = { ...this.counts, ...counts }
    this.primaryStage = stage
    this.emit('stage_updated', stage)
  }

  complete(stage: AcademicWorkflowProgressStage): void {
    if (this.terminal) return
    this.settlePendingAsNotRun()
    this.activities.clear()
    this.primaryStage = null
    this.emit('run_completed', stage)
    this.terminal = true
  }

  cancel(stage: AcademicWorkflowProgressStage): void {
    if (this.terminal) return
    const occurredAt = this.now()
    for (const name of stageOrder) {
      const current = this.stages[name]
      if (current.status === 'running') this.stages[name] = { ...current, status: 'cancelled', completedAt: occurredAt }
      else if (current.status === 'pending') this.stages[name] = { ...current, status: 'not_run', completedAt: occurredAt }
    }
    this.activities.clear()
    this.primaryStage = null
    this.emit('run_cancelled', stage, null, 'cancelled', occurredAt)
    this.terminal = true
  }

  private settlePendingAsNotRun(): void {
    const occurredAt = this.now()
    for (const stage of stageOrder) {
      const current = this.stages[stage]
      if (current.status === 'pending') this.stages[stage] = { ...current, status: 'not_run', completedAt: occurredAt }
    }
  }

  private removeStageActivities(stage: AcademicWorkflowProgressStage): void {
    for (const [key, activity] of this.activities) if (activity.stage === stage) this.activities.delete(key)
  }

  private emit(
    code: AcademicWorkflowProgressEvent['code'],
    stage: AcademicWorkflowProgressStage,
    workVersionId: WorkVersionId | null = null,
    failureCode: AcademicWorkflowProgressFailureCode | null = null,
    occurredAt: string = this.now(),
    academicWorkId: AcademicWorkId | null = null,
    providerId: string | null = null,
  ): void {
    if (this.observer === undefined) return
    const updatedAt = occurredAt
    const activeStages = stageOrder.filter(name => this.stages[name].status === 'running')
    const start = Date.parse(this.startedAt), updated = Date.parse(updatedAt)
    const snapshot: AcademicWorkflowProgressSnapshot = {
      schemaVersion: 1,
      retrievalRunId: this.retrievalRunId,
      sequence: ++this.sequence,
      startedAt: this.startedAt,
      updatedAt,
      elapsedMs: Number.isFinite(start) && Number.isFinite(updated) ? Math.max(0, updated - start) : 0,
      primaryStage: this.primaryStage,
      activeStages,
      stages: structuredClone(this.stages),
      counts: { ...this.counts },
      activities: [...this.activities.values()].map(activity => structuredClone(activity)),
      latestEvent: { code, occurredAt, stage, academicWorkId, workVersionId, providerId, failureCode },
    }
    try {
      this.observer(snapshot)
    } catch {
      // Progress is observational; a broken subscriber cannot change research settlement.
    }
  }
}

/**
 * Create one run-local progress publisher whose observer failures cannot interrupt research.
 * @param retrievalRunId Identity shared with the terminal RetrievalRun.
 * @param startedAt Observed start time of the research pass.
 * @param totalQueries Approved explicit query count.
 * @param totalQuestions Approved research-question count.
 * @param now Clock used by the owning workflow.
 * @param observer Optional synchronous snapshot consumer.
 * @returns Mutable publisher owned by exactly one workflow invocation.
 */
export function createAcademicWorkflowProgressPublisher(
  retrievalRunId: RetrievalRunId,
  startedAt: string,
  totalQueries: number,
  totalQuestions: number,
  now: () => string,
  observer?: AcademicWorkflowProgressObserver,
): ProgressPublisher {
  return new ProgressPublisher(retrievalRunId, startedAt, totalQueries, totalQuestions, now, observer)
}

function pending(
  unit: AcademicWorkflowProgressUnit | null,
  totalItems: number | null,
): AcademicWorkflowProgressStageView {
  return { status: 'pending', startedAt: null, completedAt: null, completedItems: 0, totalItems, unit }
}
