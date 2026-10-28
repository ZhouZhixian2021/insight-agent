/** Resumed and live Academic Research read state, folded from committed Session events. */
import { z } from 'zod'
import type { ZodType } from 'zod'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { AcademicSearchPlanEvent } from '@deepseek-ai/dsh-academic-workflow'
import type { AcademicBackgroundRunView } from './types.ts'
import { applyBackgroundRunProgress, applyBackgroundRunQ6Update } from './background-run.ts'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Approved plan, resumable run facts, enhancement selections, and latest background-run views. */
    academicResearch: AcademicResearchProjectionState
  }
}

/** The small approved-plan identity and source content consumed by plan validation. */
export interface AcademicApprovedPlanProjection {
  readonly identity: string
  readonly markdown: string
  readonly reviewedAt: string
}

type RecoveryEvent = SessionEvent<'academic/candidate-batch-decision'>
  | SessionEvent<'academic/candidate-batch-settlement'>
  | SessionEvent<'academic/run-settlement'>
  | SessionEvent<'academic/recovery-checkpoint'>

interface RecoveryRunProjection {
  readonly searchPlan: AcademicSearchPlanEvent | null
  readonly events: readonly RecoveryEvent[]
}

/** Serializable per-session state needed by the Academic Research controller. */
export interface AcademicResearchProjectionState {
  readonly sessionId: string
  readonly nativePlanCalls: Readonly<Record<string, string>>
  readonly latestApprovedPlan: AcademicApprovedPlanProjection | null
  readonly latestSearchPlan: AcademicSearchPlanEvent | null
  readonly recoveryRuns: Readonly<Record<string, RecoveryRunProjection>>
  readonly enhancedRunIds: readonly string[]
  readonly backgroundRunOrder: readonly string[]
  readonly backgroundRuns: Readonly<Record<string, AcademicBackgroundRunView>>
}

const jsonValue = z.json()
const stateSchema: ZodType<AcademicResearchProjectionState> = z.object({
  sessionId: z.string(),
  nativePlanCalls: z.record(z.string(), z.string()),
  latestApprovedPlan: z.object({
    identity: z.string(), markdown: z.string(), reviewedAt: z.string(),
  }).strict().nullable(),
  latestSearchPlan: jsonValue.nullable(),
  recoveryRuns: z.record(z.string(), z.object({
    searchPlan: jsonValue.nullable(), events: z.array(jsonValue),
  }).strict()),
  enhancedRunIds: z.array(z.string()),
  backgroundRunOrder: z.array(z.string()),
  backgroundRuns: z.record(z.string(), jsonValue),
}).strict() as unknown as ZodType<AcademicResearchProjectionState>

const EMPTY_STATE: AcademicResearchProjectionState = {
  sessionId: '', nativePlanCalls: {}, latestApprovedPlan: null, latestSearchPlan: null, recoveryRuns: {},
  enhancedRunIds: [], backgroundRunOrder: [], backgroundRuns: {},
}

/** The Academic Research host projection registered by its controller plugin. */
export const academicResearchProjectionDefinition: ProjectionDefinition<'academicResearch'> = {
  key: 'academicResearch',
  stateVersion: 3,
  stateSchema,
  init: header => ({ ...EMPTY_STATE, sessionId: String(header.id) }),
  apply: (state, event) => {
    switch (event.type) {
      case 'tool/call': {
        if (event.data.name !== 'exit_plan_mode') return state
        const markdown = planFromJsonArguments(event.data.arguments)
        if (markdown === undefined) return state
        return { ...state, nativePlanCalls: { ...state.nativePlanCalls, [String(event.data.callId)]: markdown } }
      }
      case 'tool/result': {
        const callId = String(event.data.message.toolCallId)
        const markdown = state.nativePlanCalls[callId]
        if (markdown === undefined) return state
        const meta = event.data.meta
        if (event.data.message.isError || !isRecord(meta) || meta.approved !== true) {
          return state
        }
        return { ...state,
          latestApprovedPlan: { identity: callId, markdown, reviewedAt: eventTime(event.time) } }
      }
      case 'tool/ptc-dispatch': {
        if (event.data.name !== 'exit_plan_mode' || event.data.isError
          || !isRecord(event.data.meta) || event.data.meta.approved !== true) return state
        const markdown = planFromUnknownArguments(event.data.arguments)
        if (markdown === undefined) return state
        return { ...state, latestApprovedPlan: {
          identity: String(event.data.subCallId), markdown, reviewedAt: eventTime(event.time),
        } }
      }
      case 'academic/search-plan':
        return { ...state, latestSearchPlan: event.data }
      case 'academic/candidate-batch-decision':
      case 'academic/candidate-batch-settlement':
      case 'academic/run-settlement':
      case 'academic/recovery-checkpoint': {
        const key = String(event.data.retrievalRunId)
        const current = state.recoveryRuns[key] ?? { searchPlan: state.latestSearchPlan, events: [] }
        return { ...state, recoveryRuns: { ...state.recoveryRuns,
          [key]: { ...current, events: [...current.events, event] } } }
      }
      case 'academic/evidence-enhancement-selection': {
        const key = String(event.data.retrievalRunId)
        if (state.enhancedRunIds.includes(key)) return state
        return { ...state, enhancedRunIds: [...state.enhancedRunIds, key] }
      }
      case 'academic/background-run-state': {
        if (event.data.sessionId !== state.sessionId) return state
        const key = event.data.backgroundRunId
        const backgroundRunOrder = state.backgroundRuns[key] === undefined
          ? [...state.backgroundRunOrder, key] : state.backgroundRunOrder
        return { ...state, backgroundRunOrder,
          backgroundRuns: { ...state.backgroundRuns, [key]: event.data } }
      }
      case 'academic/background-run-progress': {
        const key = event.data.backgroundRunId
        const view = applyBackgroundRunProgress(state.backgroundRuns[key], event.data)
        return { ...state, backgroundRuns: { ...state.backgroundRuns, [key]: view } }
      }
      case 'academic/background-run-q6-update': {
        const key = event.data.backgroundRunId
        const view = applyBackgroundRunQ6Update(state.backgroundRuns[key], event.data)
        return { ...state, backgroundRuns: { ...state.backgroundRuns, [key]: view } }
      }
      default:
        return state
    }
  },
}

/**
 * Read the already-restored projection for one Session.
 *
 * @param state - Projection state restored by the Session projection service.
 * @param session - Session that owns the projection.
 * @returns The projection state, or throws when the service did not restore it.
 */
export function requireAcademicResearchState(
  state: AcademicResearchProjectionState | undefined,
  session: Session,
): AcademicResearchProjectionState {
  if (state === undefined) throw new Error(`Academic Research projection is unavailable for Session ${session.id}`)
  return state
}

/**
 * Rebuild the exact minimal ordered event slice required by the recovery reducer.
 *
 * @param state - Projection state containing the retrieval run snapshot.
 * @param retrievalRunId - Run whose recovery events should be returned.
 * @returns The captured search plan followed by that run's relevant events.
 */
export function recoveryEventsOf(state: AcademicResearchProjectionState, retrievalRunId: string): readonly SessionEvent[] {
  const run = state.recoveryRuns[retrievalRunId]
  if (run === undefined) return []
  const plan: SessionEvent<'academic/search-plan'> | undefined = run.searchPlan === null ? undefined : {
    seq: SessionSeq(0), time: 0, type: 'academic/search-plan', data: run.searchPlan,
  }
  return [...plan === undefined ? [] : [plan], ...run.events]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function planFromJsonArguments(value: string): string | undefined {
  try { return planFromUnknownArguments(JSON.parse(value)) } catch { return undefined }
}

function planFromUnknownArguments(value: unknown): string | undefined {
  return isRecord(value) && typeof value.plan === 'string' ? value.plan : undefined
}

function eventTime(time: number): string {
  const value = new Date(time)
  if (Number.isNaN(value.valueOf())) throw new Error('the approved plan has an invalid review timestamp')
  return value.toISOString()
}
