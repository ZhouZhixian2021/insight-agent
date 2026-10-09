/** Durable Q5 scheduling settlement facts and the approved search-plan event. */
import type { ResearchBriefId, RetrievalRunId, SearchQueryId } from '@deepseek-ai/dsh-academic-model'
import type { AcademicBatchDecisionEvent, AcademicBatchSettlementEvent } from './query-workflow.ts'

/** One stable search-query identity persisted with the approved plan so a resumed run reuses it. */
export interface AcademicSearchPlanQueryEvent {
  /** Stable query identity generated when the reviewed plan was first converted. */
  readonly searchQueryId: SearchQueryId
  readonly kind: 'academic' | 'web_discovery' | 'site_restricted'
  readonly expression: string
  readonly purpose: string
  readonly questions: readonly string[]
  readonly roundIndex: number
  readonly providers: readonly string[]
  /** Present only for Web queries. */
  readonly maximumResults: number | null
  /** Present only for site-restricted queries. */
  readonly siteHost: string | null
}

/** Approved search plan persisted once per run; recovery reuses these query identities across restarts. */
export interface AcademicSearchPlanEvent {
  readonly schemaVersion: 1
  readonly researchBriefId: ResearchBriefId
  readonly researchBriefVersion: number
  readonly maximumSearchRounds: number
  readonly queries: readonly AcademicSearchPlanQueryEvent[]
}

/** Terminal settlement of one research run. */
export interface AcademicRunSettlementEvent {
  readonly retrievalRunId: RetrievalRunId
  readonly status: 'completed' | 'cancelled'
  readonly completedAt: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Log-only approved search plan with stable query identities for cross-restart recovery. */
    'academic/search-plan': AcademicSearchPlanEvent
    /** Log-only Q5 scheduling decision (schedule, gap round, or stop). */
    'academic/candidate-batch-decision': AcademicBatchDecisionEvent
    /** Log-only Q5 batch settlement after one batch finishes processing. */
    'academic/candidate-batch-settlement': AcademicBatchSettlementEvent
    /** Log-only terminal settlement of one research run. */
    'academic/run-settlement': AcademicRunSettlementEvent
  }
}

/** Settlement facts emitted by the Q5 loop; the caller owns durable persistence. */
export type AcademicSettlementFact =
  | { readonly kind: 'batch-decision'; readonly event: AcademicBatchDecisionEvent }
  | { readonly kind: 'batch-settlement'; readonly event: AcademicBatchSettlementEvent }

/** Observe Q5 scheduling decisions and batch settlements; subscriber failures do not interrupt research. */
export type AcademicSettlementObserver = (fact: AcademicSettlementFact) => void
