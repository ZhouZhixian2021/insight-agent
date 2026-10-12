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
}

/** Original parsed-source UTF-16 offsets; fragments use zero-based local draft segmentIndex 0. */
export interface EvidenceFragmentRange {
  readonly fragmentIndex: number
  readonly segmentIndex: number
  readonly characterStart: number
  readonly characterEnd: number
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
  readonly policy: EvidenceFragmentPolicy
  /** Make one model attempt, validate its JSON, apply the output cap and log the original source range; do not retry internally. */
  readonly generator: (request: EvidenceGenerationRequest, attempt: EvidenceFragmentAttempt) => Promise<readonly EvidenceDraft[]>
  /** Map only recoverable model errors; return null for cancellation, logging or programming failures. */
  readonly classifyFailure: (error: unknown) => EvidenceFragmentFailureCategory | null
  /** Commit each verified fragment before another dispatch; failures reject extraction. */
  readonly onVerified: (attempt: EvidenceFragmentAttempt, evidence: EvidenceExtractionResult) => Promise<void>
  /** Informational notification; exceptions do not affect extraction. */
  readonly onFailure?: (failure: EvidenceFragmentFailure) => void
}

/** Verified paper evidence and exact ranges that exhausted their initial fragment's call budget. */
export interface EvidenceFragmentResult {
  readonly evidence: EvidenceExtractionResult
  readonly failures: readonly EvidenceFragmentFailure[]
  readonly incompleteFragments: readonly EvidenceFragmentRange[]
}
