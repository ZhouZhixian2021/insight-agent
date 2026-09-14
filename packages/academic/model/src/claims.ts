/** Cross-paper conclusions and their evidence relations; analysis and semantic review belong to consumers. */
import type {
  ClaimAssessmentId,
  ClaimEvidenceLinkId,
  ClaimId,
  EvidenceId,
  EvidenceSnapshot,
} from './types.ts'

/** The kind of conclusion, not its evidentiary support or confidence. */
export type ClaimCategory = 'consensus' | 'trend' | 'comparison' | 'disagreement' | 'research_gap' | 'limitation'

/** Explained confidence levels, not calibrated probabilities. */
export type ClaimConfidence = 'high' | 'medium' | 'low' | 'insufficient'

/** Stored validity; consumers must still check the current evidence before use. */
export type ClaimValidity = 'current' | 'stale'

/** One conclusion and the immutable evidence used to form it; reanalysis creates a new record. */
export interface ClaimRecord {
  readonly schemaVersion: 1
  readonly claimId: ClaimId
  readonly text: string
  readonly category: ClaimCategory
  readonly scope: string
  readonly uncertainty: string | null
  readonly confidence: ClaimConfidence
  /** Non-empty reasons explain the grade without treating it as a probability. */
  readonly confidenceReasons: readonly [string, ...string[]]
  readonly evidenceSnapshot: EvidenceSnapshot
  readonly validity: ClaimValidity
}

/** Background provides context and cannot by itself prove a conclusion. */
export type ClaimEvidenceRelation = 'supports' | 'contradicts' | 'background'

/** One of a claim's evidence links; consumers retain opposing evidence and validate referenced identities. */
export interface ClaimEvidenceLink {
  readonly schemaVersion: 1
  readonly claimEvidenceLinkId: ClaimEvidenceLinkId
  readonly claimId: ClaimId
  readonly evidenceId: EvidenceId
  readonly relation: ClaimEvidenceRelation
  readonly rationale: string
}

/** Unsupported means checked evidence does not support the claim; insufficient means a determination is unavailable. */
export type ClaimAssessmentStatus = 'supported' | 'partially_supported' | 'contradicted' | 'unsupported' | 'insufficient'

/** A consumer-produced review of one claim; the shared model does not perform semantic assessment. */
export interface ClaimAssessment {
  readonly schemaVersion: 1
  readonly claimAssessmentId: ClaimAssessmentId
  readonly claimId: ClaimId
  readonly status: ClaimAssessmentStatus
  readonly reason: string
  readonly method: string
  readonly methodVersion: string
  readonly assessedEvidenceIds: readonly EvidenceId[]
  /** Complete UTC ISO 8601 assessment time. */
  readonly assessedAt: string
}

/** Consumer-time check; unverifiable does not claim that the evidence has changed. */
export type ClaimFreshnessStatus = 'current' | 'stale' | 'unverifiable'

/** Freshness alone never establishes semantic support or authorizes a report. */
export interface ClaimFreshnessCheck {
  readonly status: ClaimFreshnessStatus
  readonly reasons: readonly string[]
}
