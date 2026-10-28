/** Model extraction configuration and durable request/result payloads. */
import type { EvidenceExtractionInput, EvidenceExtractionResult, EvidenceFragmentAttempt, EvidenceFragmentPolicy,
  EvidenceGenerationRequest, EvidenceDraft } from '@deepseek-ai/dsh-academic-evidence'
import type { AssistantStreamRecord, FinishReason, LlmCallConfig, Message, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionSeq } from '@deepseek-ai/dsh-session'
import type { AcademicWorkflowProgressFailureCode } from './progress.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Complete request text remains readable without this producer.
     * The kind attributes the prompt and carries no execution control.
     * @persistenceAttribution
     */
    'academic-workflow': { kind: 'academic-workflow' }
  }
}

/** Approved natural-language rules applied to one fetched paper. */
export interface PaperScopeRules {
  readonly inclusionRules: readonly string[]
  readonly exclusionRules: readonly string[]
}

/** Model decision about whether one fetched paper belongs in the approved scope. */
export type PaperScopeDecision =
  | { readonly status: 'included'; readonly reason: string }
  | { readonly status: 'excluded'; readonly reason: string }
  | { readonly status: 'needs_more_context'; readonly reason: string }

/** One validated model response containing scope review and any extracted evidence. */
export interface PaperModelResponse {
  readonly scope: PaperScopeDecision
  readonly evidence: readonly EvidenceDraft[]
  /** Batches that settled without a validated response while other batches remained usable. */
  readonly incompleteBatchCount?: number
}

/** A's generator receives program-owned source metadata and optional progress without changing B's request interface. */
export type PaperEvidenceGenerator = (
  request: EvidenceGenerationRequest,
  source: EvidenceExtractionInput,
  scope: PaperScopeRules,
  onProgress?: PaperEvidenceProgressObserver,
) => Promise<PaperModelResponse>

/** Formal model route: scope review followed by already verified, incrementally saved fragments. */
export interface PaperVerifiedEvidenceResponse {
  readonly scope: PaperScopeDecision
  readonly evidence: EvidenceExtractionResult
  readonly incompleteFragmentCount: number
}

export type PaperVerifiedEvidenceGenerator = (
  source: EvidenceExtractionInput,
  scope: PaperScopeRules,
  onProgress?: PaperEvidenceProgressObserver,
  signal?: AbortSignal,
) => Promise<PaperVerifiedEvidenceResponse>

/** Saved source-verified fragment; local draft indexes are interpreted against this original range. */
export interface EvidenceFragmentVerifiedRecord {
  readonly source: EvidenceModelSource
  readonly fragment: EvidenceFragmentAttempt
  readonly evidence: EvidenceExtractionResult
  /** Present only for a user-selected, post-draft second-tier addition. */
  readonly purpose?: 'enhancement'
}

/** Complete paper-local extraction activity observed by A's workflow adapter. */
export interface PaperEvidenceProgressObservation {
  readonly operation: 'evidence_extract' | 'evidence_validate' | 'waiting_retry'
  readonly batchIndex: number | null
  readonly batchCount: number | null
  readonly attempt: number | null
  readonly maximumAttempts: number | null
  readonly lastFailure: AcademicWorkflowProgressFailureCode | null
  readonly validatedEvidenceRecords: number
  readonly rejectedEvidenceDrafts: number
}

/** Optional synchronous observer for A-owned model and source-validation progress. */
export type PaperEvidenceProgressObserver = (observation: PaperEvidenceProgressObservation) => void

/** Provider-neutral failures that one Academic model operation may retry. */
export type AcademicTransientFailureCode = 'TRANSPORT' | 'TIMEOUT'

/** Optional bounded recovery for transient provider failures. */
export interface AcademicTransientRetryPolicy {
  /** Exact provider-neutral failure codes eligible for another attempt. */
  readonly failureCodes: readonly AcademicTransientFailureCode[]
  /** Delay before the first retry; each later retry doubles it. */
  readonly initialDelayMs: number
}

/** Bounded recovery policy for one Academic model operation. */
export interface EvidenceModelPolicy {
  /** Total dispatch attempts. */
  readonly maxAttempts: number
  /** Maximum elapsed time for one dispatched attempt; omitted means no operation-local timeout. */
  readonly attemptTimeoutMs?: number
  /** Whether output-limit exhaustion may consume one recovery attempt. */
  readonly retryOutputLimit?: boolean
  /** Whether a complete synthesis response rejected by structural validation may consume another attempt. */
  readonly retryInvalidOutput?: boolean
  /** Transient failures eligible for delayed retry; omitted means none. */
  readonly transientRetry?: AcademicTransientRetryPolicy
}

/** Evidence extraction policy with deterministic batching and one bounded local-timeout split when maxAttempts exceeds one. */
export interface EvidenceExtractionModelPolicy extends EvidenceModelPolicy {
  /** Maximum distinct scope-review batches; omitted inspects only the first batch. */
  readonly scopeReviewMaximumBatches?: number
  /** Formal fragment extraction depth; omitted keeps complete extraction for existing callers. */
  readonly depth?: 'minimal' | 'complete'
  /** Approved aliases for each focus question, in Brief order; only prioritizes minimal-depth source ranges. */
  readonly questionTerms?: readonly (readonly string[])[]
  /** Maximum estimated input tokens sent in one evidence batch; omitted keeps one request per paper. */
  readonly inputBatchTokenLimit?: number
  /** Repeated source characters at adjacent split boundaries. */
  readonly inputBatchOverlapCharacters?: number
  /** Formal fragment limits; omitted uses conservative first-run defaults, then tune against a fixed real-paper cohort. */
  readonly fragmentPolicy?: EvidenceFragmentPolicy
}

/** Separate model recovery policies for paper extraction and final synthesis. */
export interface AcademicModelPolicies {
  /** Per-paper scope review and evidence extraction recovery. */
  readonly evidence: EvidenceExtractionModelPolicy
  /** One final evidence-to-report synthesis recovery. */
  readonly synthesis: EvidenceModelPolicy
}

/** Program-owned identity of the exact parsed content submitted for extraction. */
export type EvidenceModelSource = Pick<EvidenceExtractionInput,
  'academicWorkId' | 'workVersionId' | 'contentHash' | 'sourceProvider' | 'sourceUrl' | 'retrievedAt' | 'extractionMethod'>

/** Exact model-visible request and the heuristic admission decision, recorded before dispatch. */
export interface EvidenceModelRequest {
  readonly source: EvidenceModelSource
  /** Omitted historical records are combined scope-and-evidence requests. */
  readonly phase?: 'scope' | 'evidence'
  readonly fragment?: EvidenceFragmentAttempt
  readonly config: LlmCallConfig
  readonly messages: Message[]
  readonly estimatedInputTokens: number
  readonly contextWindow: number
  readonly outputTokens: number
  readonly attempt: number
  readonly maxAttempts: number
  readonly decision: 'dispatch' | 'skip_input_limit'
}

/** One settled model attempt; validated means JSON validation, not semantic approval. */
export interface EvidenceModelResult {
  readonly source: EvidenceModelSource
  /** Omitted historical records are combined scope-and-evidence results. */
  readonly phase?: 'scope' | 'evidence'
  readonly fragment?: EvidenceFragmentAttempt
  /** Null when preparation failed before an exact request could be recorded. */
  readonly requestSeq: SessionSeq | null
  readonly attempt: number
  readonly maxAttempts: number
  readonly status: 'validated' | 'failed' | 'cancelled' | 'skipped'
  /** Monotonic duration from attempt preparation through stream or failure settlement. */
  readonly elapsedMs?: number
  /** Time to the first text or reasoning chunk; absent when none arrived. */
  readonly firstContentElapsedMs?: number
  /** Coarse failure location, not a claim about which network hop failed. */
  readonly failurePhase?: 'prepare' | 'admission' | 'before_content' | 'after_content' | 'parse'
  /** Lossless compact chunks, including rejected tool calls and interrupted output. */
  readonly stream: readonly AssistantStreamRecord[]
  readonly finish?: FinishReason
  readonly usage?: TokenUsage
  readonly errorCode?: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Log-only academic extraction input and admission decision before model dispatch. */
    'academic/evidence-request': EvidenceModelRequest
    /** Log-only academic extraction settlement, including raw model output when available. */
    'academic/evidence-result': EvidenceModelResult
    /** Source-verified evidence committed before another fragment is dispatched. */
    'academic/evidence-fragment-verified': EvidenceFragmentVerifiedRecord
  }
}
