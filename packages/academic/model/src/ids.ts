import { brandString } from '@deepseek-ai/dsh-brand'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'

import type {
  AcademicWorkId,
  ClaimId,
  ClaimEvidenceLinkId,
  ClaimAssessmentId,
  EvidenceCardId,
  EvidenceCardItemId,
  EvidenceId,
  EvidenceSnapshotId,
  FailureId,
  ResearchBriefId,
  RetrievalRunId,
  SourceLocatorId,
  WorkVersionId,
} from './types.ts'

/** Creates an identity for a new analysis conclusion.
 * @returns A new claim identity; reanalysis does not overwrite the old claim.
 */
export function createClaimId(): ClaimId {
  return brandString<ClaimId>(randomUUID())
}

/** Creates an identity for one claim-to-evidence relationship.
 * @returns A new claim-evidence-link identity.
 */
export function createClaimEvidenceLinkId(): ClaimEvidenceLinkId {
  return brandString<ClaimEvidenceLinkId>(randomUUID())
}

/** Creates an identity for one assessment of a claim.
 * @returns A new claim-assessment identity.
 */
export function createClaimAssessmentId(): ClaimAssessmentId {
  return brandString<ClaimAssessmentId>(randomUUID())
}

/**
 * Creates a random identity shared by a failure record and failed field values.
 * @returns A new failure identity, independent of provider messages or credentials.
 */
export function createFailureId(): FailureId {
  return brandString<FailureId>(randomUUID())
}

/**
 * Creates a random identity for one retrieval run, distinct from its research brief.
 * @returns A new retrieval-run identity.
 */
export function createRetrievalRunId(): RetrievalRunId {
  return brandString<RetrievalRunId>(randomUUID())
}

/**
 * Creates a random internal identity for one academic work.
 *
 * @returns A new academic-work identity.
 */
export function createAcademicWorkId(): AcademicWorkId {
  return brandString<AcademicWorkId>(randomUUID())
}

/**
 * Creates a random internal identity for one immutable work version.
 *
 * @returns A new work-version identity.
 */
export function createWorkVersionId(): WorkVersionId {
  return brandString<WorkVersionId>(randomUUID())
}

/**
 * Creates a random internal identity shared by all versions of one research brief.
 *
 * @returns A new research-brief identity.
 */
export function createResearchBriefId(): ResearchBriefId {
  return brandString<ResearchBriefId>(randomUUID())
}

/**
 * Creates a random internal identity for one evidence record.
 *
 * @returns A new evidence-record identity.
 */
export function createEvidenceId(): EvidenceId {
  return brandString<EvidenceId>(randomUUID())
}

/**
 * Creates a random internal identity for one evidence card.
 *
 * @returns A new evidence-card identity.
 */
export function createEvidenceCardId(): EvidenceCardId {
  return brandString<EvidenceCardId>(randomUUID())
}

/**
 * Creates a random internal identity for one evidence-card item.
 *
 * @returns A new identity for one evidence-card item.
 */
export function createEvidenceCardItemId(): EvidenceCardItemId {
  return brandString<EvidenceCardItemId>(randomUUID())
}

/**
 * Creates a random internal identity for one source locator.
 *
 * @returns A new source-locator identity.
 */
export function createSourceLocatorId(): SourceLocatorId {
  return brandString<SourceLocatorId>(randomUUID())
}

/**
 * Creates a random internal identity for one immutable evidence snapshot.
 *
 * @returns A new immutable evidence-snapshot identity.
 */
export function createEvidenceSnapshotId(): EvidenceSnapshotId {
  return brandString<EvidenceSnapshotId>(randomUUID())
}
