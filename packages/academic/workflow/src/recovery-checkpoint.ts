/** Durable, JSON-safe checkpoint captured at Academic batch boundaries. */
import type {
  AcademicCandidateRankingResult,
  AcademicWork,
  CandidateAssessment,
  ExtractionMethod,
  HybridSearchPlan,
  HybridSearchRound,
  ProviderFailure,
  ResearchQuestionCoverageResult,
  RetrievalRunId,
  WorkVersion,
  WorkVersionId,
} from '@deepseek-ai/dsh-academic-model'
import type { PaperEvidenceResult } from './types.ts'
import type { CandidateBatchPolicy } from './candidate-batches.ts'
import type { AcademicBatchDecisionEvent, AcademicBatchSettlementEvent } from './query-workflow.ts'

/** One selected candidate and exact version required to restart its full-text handoff. */
export interface AcademicRecoveryCandidateCheckpoint {
  readonly workVersionId: WorkVersionId
  readonly urls: readonly string[]
  readonly sourceProvider: string
  readonly extractionMethod: ExtractionMethod
  readonly hasHistoricalEvidence: boolean
  readonly version: WorkVersion
}

/** Search facts retained without raw Web response content. */
export interface AcademicRecoverySearchCheckpoint {
  readonly providers: readonly string[]
  readonly discoveredRecords: number
  readonly deduplicatedWorks: number
  readonly failures: readonly ProviderFailure[]
  readonly limitations: readonly string[]
  readonly truncated: boolean
}

/** Complete state needed to continue scheduling and paper processing after one durable boundary. */
export interface AcademicResearchRecoveryCheckpoint {
  readonly schemaVersion: 1
  readonly retrievalRunId: RetrievalRunId
  readonly startedAt: string
  readonly executedQueries: readonly string[]
  readonly search: AcademicRecoverySearchCheckpoint | null
  readonly works: readonly AcademicWork[]
  readonly versions: readonly WorkVersion[]
  readonly candidates: readonly AcademicRecoveryCandidateCheckpoint[]
  readonly plan: HybridSearchPlan
  readonly assessments: readonly CandidateAssessment[]
  readonly ranking: AcademicCandidateRankingResult
  readonly policy: CandidateBatchPolicy
  readonly rounds: readonly HybridSearchRound[]
  readonly decisions: readonly AcademicBatchDecisionEvent[]
  readonly settlements: readonly AcademicBatchSettlementEvent[]
  readonly coverage: ResearchQuestionCoverageResult | null
  readonly papers: readonly PaperEvidenceResult[]
  readonly paperFailures: readonly {
    readonly workVersionId: WorkVersionId
    readonly stage: 'fulltext' | 'extraction'
  }[]
  readonly providerFailures: readonly ProviderFailure[]
  readonly availableFulltextWorks: number
  readonly selectionTruncated: boolean
  readonly selectionLimitations: readonly string[]
  readonly scheduledWorkVersionIds: readonly WorkVersionId[]
  readonly completedBatchCount: number
  readonly consecutiveBatchesWithoutEvidence: number
  readonly completedSearchRounds: number
  /** Batch that must be retried as a unit; null at a settled boundary. */
  readonly pendingBatchIndex: number | null
}

/** Persist one immutable checkpoint; subscriber failure stops the owning workflow. */
export type AcademicRecoveryCheckpointObserver = (checkpoint: AcademicResearchRecoveryCheckpoint) => void
