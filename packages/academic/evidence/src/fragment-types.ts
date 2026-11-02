/** Caller-owned controls and facts for incremental paper extraction. */
import type { AcademicWorkId, WorkVersionId } from '@deepseek-ai/dsh-academic-model'
import type { EvidenceDraft, EvidenceExtractionResult, EvidenceGenerationRequest } from './types.ts'

/** Explicit extraction limits; total calls per initial fragment cannot exceed maximumAttempts. */
export interface EvidenceFragmentPolicy {
  readonly maximumCharacters: number
  readonly minimumCharacters: number
  readonly overlapCharacters: number
  readonly maximumAttempts: number
  /** Extraction-stage output cap that the model adapter must apply and record. */
  readonly maximumOutputTokens: number
  /** Transport-only backoff; doubles per attempt within one initial fragment. */
  readonly initialRetryDelayMs: number
  /** Complete-depth ranges dispatched at once; one keeps the previous serial order, minimal depth always stays serial. */
  readonly maximumConcurrentDispatches: number
  /**
   * Dispatches a paper receives at least, when it packs that many ranges.
   *
   * A short introduction-only source still deserves a look; the whole-paper cap and {@link callBudgetFraction} bound
   * the upper end.
   */
  readonly minimumCalls?: number
  /**
   * Share of a paper's packed ranges the dispatch budget may reach before the whole-paper cap applies.
   *
   * The budget scales with the paper: a 34-range paper reads further than a 6-range one instead of both stopping at
   * the same count. An omitted value spends the whole-paper cap.
   */
  readonly callBudgetFraction?: number
  /**
   * Consecutive dispatches that yield no evidence record before the rest of the paper is left unread.
   *
   * A paper whose later sections are tables, captions or reference lists returns nothing while still costing a
   * model call each; stopping keeps that budget for other papers. Zero disables the stop.
   */
  readonly emptyDispatchStopAfter?: number
}

/** One original parsed-source UTF-16 range inside a model-visible fragment. */
export interface EvidenceFragmentSourceRange {
  readonly segmentIndex: number
  readonly characterStart: number
  readonly characterEnd: number
}

/** Original source offsets; draft segmentIndex addresses the fragment's ordered sourceRanges. */
export interface EvidenceFragmentRange extends EvidenceFragmentSourceRange {
  /** One-based original packed group identity; minimal priority may dispatch groups out of order. */
  readonly fragmentIndex: number
  /** Present when one request packs adjacent source segments; the first entry matches the top-level range. */
  readonly sourceRanges?: readonly EvidenceFragmentSourceRange[]
}

/** Paper identity and exact source range for one dispatched extraction attempt. */
export interface EvidenceFragmentAttempt extends EvidenceFragmentRange {
  readonly academicWorkId: AcademicWorkId
  readonly workVersionId: WorkVersionId
  readonly stage: 'extraction'
  readonly attempt: number
  readonly maximumAttempts: number
  readonly maximumOutputTokens: number
}

/** Caller-classified model failures eligible for local recovery. */
export type EvidenceFragmentFailureCategory = 'timeout' | 'transport' | 'parse_failed' | 'incomplete_output'

/** Failed attempt with its original error, including provider request identity when the adapter supplies it. */
export interface EvidenceFragmentFailure extends EvidenceFragmentAttempt {
  readonly category: EvidenceFragmentFailureCategory
  readonly error: unknown
  /** Paper-local signal for the caller's temporary concurrency reduction; a successful fragment resets it. */
  readonly consecutiveTransientFailures: number
}

/** Model and persistence stay caller-owned; unclassified failures stop the operation. */
export interface EvidenceFragmentOptions {
  /** Optional whole-paper generator-call cap, including retry attempts. Scope review is separate. */
  readonly maximumCalls?: number
  readonly policy: EvidenceFragmentPolicy
  /** Optional approved lexical hints per focus question, in the same order; used only for dispatch priority. */
  readonly questionTerms?: readonly (readonly string[])[]
  /**
   * Relative dispatch priority per focus question, in the same order as `questionTerms`.
   *
   * The caller raises a question's weight while it still lacks evidence, so one paper's later dispatches serve a
   * starved question instead of repeating the question that already filled the run's evidence. Omitted weights split
   * the budget evenly.
   */
  readonly questionWeights?: readonly number[]
  /** Make one model attempt, validate its JSON, apply the output cap and log the original source range; do not retry internally. */
  readonly generator: (request: EvidenceGenerationRequest, attempt: EvidenceFragmentAttempt) => Promise<readonly EvidenceDraft[]>
  /** Map only recoverable model errors; return null for cancellation, logging or programming failures. */
  readonly classifyFailure: (error: unknown) => EvidenceFragmentFailureCategory | null
  /** Commit each verified fragment before another dispatch; failures reject extraction. */
  readonly onVerified: (attempt: EvidenceFragmentAttempt, evidence: EvidenceExtractionResult) => Promise<void>
  /** Informational notification; exceptions do not affect extraction. */
  readonly onFailure?: (failure: EvidenceFragmentFailure) => void
}

/** Verified paper evidence and ranges left incomplete by attempt exhaustion, the minimum size or the minimal evidence cap. */
export interface EvidenceFragmentResult {
  readonly evidence: EvidenceExtractionResult
  readonly failures: readonly EvidenceFragmentFailure[]
  readonly incompleteFragments: readonly EvidenceFragmentRange[]
}
