/** Recovery contract and pure Session-event reconstruction for Academic research continuation. */
import type {
  ResearchBriefId,
  ResearchQuestionCoverageResult,
  RetrievalRunId,
  WorkVersionId,
} from '@deepseek-ai/dsh-academic-model'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { AcademicSearchPlanEvent } from './settlement-events.ts'
import type { AcademicBatchDecisionEvent, AcademicBatchSettlementEvent } from './query-workflow.ts'
import type { AcademicResearchRecoveryCheckpoint } from './recovery-checkpoint.ts'

/** One batch whose scheduling decision and settlement have both been committed. */
export interface AcademicCompletedBatchRecoveryState {
  /** One-based batch number from the matching scheduling decision and settlement. */
  readonly batchIndex: number
  /** Candidate versions processed by this batch, in the original decision order. */
  readonly workVersionIds: readonly WorkVersionId[]
  /** Cumulative admitted evidence count when the batch settled. */
  readonly admittedEvidence: number
  /** ISO timestamp copied from the committed batch settlement. */
  readonly completedAt: string
}

/** One scheduled candidate that has no matching committed batch settlement yet. */
export interface AcademicPendingCandidateRecoveryState {
  /** One-based batch number of the unfinished scheduling decision. */
  readonly batchIndex: number
  /** Candidate version to continue processing. */
  readonly workVersionId: WorkVersionId
}

/** Validated, normalized input that a later continuation executor may resume. */
export interface AcademicResearchRecoveryInput {
  readonly retrievalRunId: RetrievalRunId
  readonly researchBriefId: ResearchBriefId
  readonly researchBriefVersion: number
  /** Approved plan bound to this run; query identities and expressions must be reused. */
  readonly searchPlan: AcademicSearchPlanEvent
  /** Settled batches ordered by ascending batch number. */
  readonly completedBatches: readonly AcademicCompletedBatchRecoveryState[]
  /** Unsettled candidates ordered first by batch number, then by decision order. */
  readonly pendingCandidates: readonly AcademicPendingCandidateRecoveryState[]
  /** Latest committed question coverage, or null when the event history contains none. */
  readonly coverage: ResearchQuestionCoverageResult | null
  /** Latest executable batch checkpoint; null for historical runs recorded before A-S3. */
  readonly checkpoint: AcademicResearchRecoveryCheckpoint | null
}

/** Exact run and approved Brief identity requested from one complete Session event log. */
export interface AcademicResearchRecoveryTarget {
  readonly retrievalRunId: RetrievalRunId
  readonly researchBriefId: ResearchBriefId
  readonly researchBriefVersion: number
}

/** Stable reason codes for rejecting or failing one recovery attempt. */
export type AcademicResearchRecoveryFailureCode =
  | 'session_in_use'
  | 'persistence_unavailable'
  | 'unsupported_schema_version'
  | 'search_plan_missing'
  | 'brief_identity_mismatch'
  | 'brief_version_mismatch'
  | 'run_identity_mismatch'
  | 'batch_history_inconsistent'
  | 'candidate_state_missing'

/** Sanitized recovery failure suitable for logs and browser presentation. */
export interface AcademicResearchRecoveryFailure {
  readonly code: AcademicResearchRecoveryFailureCode
  /** Human-readable explanation without raw model responses or source documents. */
  readonly reason: string
}

/** Recovery state reconstructed before any Academic research continuation is attempted. */
export type AcademicResearchRecoveryState =
  | {
    readonly schemaVersion: 1
    readonly status: 'resumable'
    readonly input: AcademicResearchRecoveryInput
    readonly failure: null
  }
  | {
    readonly schemaVersion: 1
    readonly status: 'completed' | 'cancelled'
    readonly input: AcademicResearchRecoveryInput
    readonly failure: null
  }
  | {
    readonly schemaVersion: 1
    readonly status: 'failed'
    readonly input: null
    readonly failure: AcademicResearchRecoveryFailure
  }

/**
 * Reconstruct one Academic research run without mutating or taking ownership of its Session.
 * @param events Complete Session log in persisted sequence order.
 * @param target Exact run and approved Brief identity to reconstruct.
 * @returns Resumable, terminal, or failed recovery state with no network or model work.
 */
export function reconstructAcademicResearchRecoveryState(
  events: readonly SessionEvent[],
  target: AcademicResearchRecoveryTarget,
): AcademicResearchRecoveryState {
  const relevant = events.flatMap((event, index) => isTargetRunEvent(event, target.retrievalRunId)
    ? [{ event, index }] : [])
  const firstRunEvent = relevant[0]
  if (firstRunEvent === undefined) return failed('run_identity_mismatch', 'Session history has no facts for the requested run.')
  const firstRunEventIndex = firstRunEvent.index
  const planEntry = events.slice(0, firstRunEventIndex).findLast(event => event.type === 'academic/search-plan')
  if (planEntry === undefined) return failed('search_plan_missing', 'No approved search plan precedes the requested run.')
  const plan = planEntry.data
  const planSchemaVersion = (plan as { readonly schemaVersion: unknown }).schemaVersion
  if (planSchemaVersion !== 1) {
    return failed('unsupported_schema_version', `Unsupported Academic search-plan schema version: ${String(planSchemaVersion)}.`)
  }
  if (plan.researchBriefId !== target.researchBriefId) {
    return failed('brief_identity_mismatch', 'The approved search plan belongs to a different ResearchBrief.')
  }
  if (plan.researchBriefVersion !== target.researchBriefVersion) {
    return failed('brief_version_mismatch', 'The approved search plan belongs to a different ResearchBrief version.')
  }
  const decisions = relevant.flatMap(({ event, index }) => event.type === 'academic/candidate-batch-decision'
    ? [{ value: event.data, index }] : [])
  const settlements = relevant.flatMap(({ event, index }) => event.type === 'academic/candidate-batch-settlement'
    ? [{ value: event.data, index }] : [])
  const terminals = relevant.flatMap(({ event, index }) => event.type === 'academic/run-settlement'
    ? [{ value: event.data, index }] : [])
  const checkpoints = relevant.flatMap(({ event, index }) => event.type === 'academic/recovery-checkpoint'
    ? [{ value: event.data, index }] : [])
  const committedCoverage = settlements.flatMap(item => item.value.coverage === undefined
    ? [] : [item.value.coverage])
  if (committedCoverage.some(coverage => coverage.researchBriefId !== target.researchBriefId)) {
    return failed('brief_identity_mismatch', 'Committed question coverage belongs to a different ResearchBrief.')
  }
  if (committedCoverage.some(coverage => coverage.researchBriefVersion !== target.researchBriefVersion)) {
    return failed('brief_version_mismatch', 'Committed question coverage belongs to a different ResearchBrief version.')
  }
  const validation = validateRunHistory(decisions, settlements, terminals)
  if (validation !== null) return failed('batch_history_inconsistent', validation)
  const settledByBatch = new Map(settlements.map(item => [item.value.batchIndex, item.value]))
  const scheduled = decisions.filter((item): item is ScheduledDecision => item.value.action === 'schedule_batch')
  const completedBatches = scheduled.flatMap(({ value }) => {
    const settlement = settledByBatch.get(value.batchIndex)
    return settlement === undefined ? [] : [{ batchIndex: value.batchIndex, workVersionIds: value.workVersionIds,
      admittedEvidence: settlement.admittedEvidence, completedAt: settlement.completedAt }]
  })
  const pendingCandidates = scheduled.flatMap(({ value }) => settledByBatch.has(value.batchIndex)
    ? [] : value.workVersionIds.map(workVersionId => ({ batchIndex: value.batchIndex, workVersionId })))
  const checkpoint = checkpoints.at(-1)?.value ?? null
  if (checkpoint !== null) {
    const checkpointFailure = validateCheckpoint(checkpoint, target, plan, completedBatches, pendingCandidates)
    if (checkpointFailure !== null) return checkpointFailure
  }
  const input: AcademicResearchRecoveryInput = {
    retrievalRunId: target.retrievalRunId,
    researchBriefId: target.researchBriefId,
    researchBriefVersion: target.researchBriefVersion,
    searchPlan: plan,
    completedBatches,
    pendingCandidates,
    coverage: settlements.findLast(item => item.value.coverage !== undefined)?.value.coverage ?? null,
    checkpoint,
  }
  const terminal = terminals[0]?.value
  return terminal === undefined
    ? { schemaVersion: 1, status: 'resumable', input, failure: null }
    : { schemaVersion: 1, status: terminal.status, input, failure: null }
}

function validateCheckpoint(
  checkpoint: AcademicResearchRecoveryCheckpoint,
  target: AcademicResearchRecoveryTarget,
  plan: AcademicSearchPlanEvent,
  completedBatches: readonly AcademicCompletedBatchRecoveryState[],
  pendingCandidates: readonly AcademicPendingCandidateRecoveryState[],
): AcademicResearchRecoveryState | null {
  if ((checkpoint as { readonly schemaVersion: unknown }).schemaVersion !== 1) {
    return failed('unsupported_schema_version', 'The latest Academic recovery checkpoint uses an unsupported schema version.')
  }
  if (checkpoint.retrievalRunId !== target.retrievalRunId) {
    return failed('run_identity_mismatch', 'The latest Academic recovery checkpoint belongs to another run.')
  }
  if (checkpoint.plan.researchBriefId !== target.researchBriefId) {
    return failed('brief_identity_mismatch', 'The latest Academic recovery checkpoint belongs to another ResearchBrief.')
  }
  if (checkpoint.plan.researchBriefVersion !== target.researchBriefVersion) {
    return failed('brief_version_mismatch', 'The latest Academic recovery checkpoint belongs to another ResearchBrief version.')
  }
  const eventQueries = plan.queries.map(query => [query.searchQueryId, query.expression])
  const checkpointQueries = checkpoint.plan.queries.slice(0, plan.queries.length)
    .map(query => [query.searchQueryId, query.expression])
  if (JSON.stringify(eventQueries) !== JSON.stringify(checkpointQueries)) {
    return failed('candidate_state_missing', 'The latest checkpoint does not match the approved persisted search plan.')
  }
  const pendingBatchIndex = pendingCandidates[0]?.batchIndex ?? null
  if (checkpoint.completedBatchCount !== completedBatches.length
    || checkpoint.pendingBatchIndex !== pendingBatchIndex) {
    return failed('candidate_state_missing', 'The latest checkpoint does not match committed batch boundaries.')
  }
  const candidateIds = new Set(checkpoint.candidates.map(candidate => candidate.workVersionId))
  if (checkpoint.scheduledWorkVersionIds.some(workVersionId => !candidateIds.has(workVersionId))
    || pendingCandidates.some(candidate => !candidateIds.has(candidate.workVersionId))) {
    return failed('candidate_state_missing', 'The latest checkpoint is missing a scheduled candidate payload.')
  }
  if (checkpoint.coverage !== null && (checkpoint.coverage.researchBriefId !== target.researchBriefId
    || checkpoint.coverage.researchBriefVersion !== target.researchBriefVersion)) {
    return failed('brief_identity_mismatch', 'The latest checkpoint coverage belongs to another ResearchBrief version.')
  }
  return null
}

type Indexed<T> = { readonly value: T; readonly index: number }
type ScheduledDecision = Indexed<AcademicBatchDecisionEvent & {
  readonly action: 'schedule_batch'
  readonly batchIndex: number
}>

function isTargetRunEvent(event: SessionEvent, retrievalRunId: RetrievalRunId): boolean {
  return (event.type === 'academic/candidate-batch-decision'
    || event.type === 'academic/candidate-batch-settlement'
    || event.type === 'academic/run-settlement'
    || event.type === 'academic/recovery-checkpoint')
    && event.data.retrievalRunId === retrievalRunId
}

function validateRunHistory(
  decisions: readonly Indexed<AcademicBatchDecisionEvent>[],
  settlements: readonly Indexed<AcademicBatchSettlementEvent>[],
  terminals: readonly Indexed<SessionEvent<'academic/run-settlement'>['data']>[],
): string | null {
  if (terminals.length > 1) return 'The requested run has more than one terminal settlement.'
  const terminal = terminals[0]
  if (terminal !== undefined && [...decisions, ...settlements].some(item => item.index > terminal.index)) {
    return 'The requested run contains batch facts after its terminal settlement.'
  }
  const scheduled = new Map<number, Indexed<AcademicBatchDecisionEvent>>()
  const scheduledVersions = new Set<WorkVersionId>()
  const stopDecisions = decisions.filter(item => item.value.action === 'stop')
  if (stopDecisions.length > 1) return 'The requested run has more than one stop decision.'
  const stopDecision = stopDecisions[0]
  if (stopDecision !== undefined && decisions.some(item => item.index > stopDecision.index)) {
    return 'The requested run contains another batch decision after its stop decision.'
  }
  for (const item of decisions) {
    const { value } = item
    if (value.action !== 'schedule_batch') {
      if (value.batchIndex !== null || value.workVersionIds.length > 0) {
        return 'A non-scheduling decision contains a batch number or candidate versions.'
      }
      continue
    }
    if (value.batchIndex === null || !Number.isSafeInteger(value.batchIndex) || value.batchIndex < 1
      || value.workVersionIds.length === 0 || scheduled.has(value.batchIndex)) {
      return 'A scheduled batch has an invalid or repeated batch identity.'
    }
    for (const workVersionId of value.workVersionIds) {
      if (scheduledVersions.has(workVersionId)) return 'A candidate version is scheduled more than once.'
      scheduledVersions.add(workVersionId)
    }
    scheduled.set(value.batchIndex, item)
  }
  const settled = new Set<number>()
  let previousBatchIndex = 0
  let previousAdmittedEvidence = 0
  for (const item of settlements) {
    const { value } = item
    const decision = scheduled.get(value.batchIndex)
    if (decision === undefined || decision.index > item.index || settled.has(value.batchIndex)
      || !Number.isSafeInteger(value.admittedEvidence) || value.admittedEvidence < 0) {
      return 'A batch settlement is invalid, repeated, or has no preceding scheduling decision.'
    }
    if (value.batchIndex <= previousBatchIndex || value.admittedEvidence < previousAdmittedEvidence) {
      return 'Batch settlements are out of order or their cumulative evidence count decreases.'
    }
    settled.add(value.batchIndex)
    previousBatchIndex = value.batchIndex
    previousAdmittedEvidence = value.admittedEvidence
  }
  const ordered = [...scheduled.keys()].sort((left, right) => left - right)
  if (ordered.some((batchIndex, index) => batchIndex !== index + 1)) {
    return 'Scheduled batch numbers are not contiguous from one.'
  }
  const pending = ordered.filter(batchIndex => !settled.has(batchIndex))
  if (pending.length > 1 || (pending[0] !== undefined && pending[0] !== ordered.at(-1))) {
    return 'Only the final scheduled batch may remain unsettled.'
  }
  if (terminals[0]?.value.status === 'completed' && pending.length > 0) {
    return 'A completed run still contains an unsettled scheduled batch.'
  }
  return null
}

function failed(
  code: AcademicResearchRecoveryFailureCode,
  reason: string,
): AcademicResearchRecoveryState {
  return { schemaVersion: 1, status: 'failed', input: null, failure: { code, reason } }
}
