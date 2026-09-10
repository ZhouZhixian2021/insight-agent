import { brandString } from '@deepseek-ai/dsh-brand'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'

import type {
  AcademicWorkId,
  EvidenceCardId,
  EvidenceCardItemId,
  EvidenceId,
  EvidenceSnapshotId,
  ResearchBriefId,
  SourceLocatorId,
  WorkVersionId,
} from './types.ts'

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
