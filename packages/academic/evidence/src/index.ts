/**
 * Academic evidence: constructs source locators, evidence records, and evidence cards with
 * fresh identities and level-locator validation. Its single-paper extraction pipeline keeps
 * model routing and durable request logging in the caller's workflow.
 * @module @deepseek-ai/dsh-academic-evidence
 */

export { createSourceLocator } from './locator.ts'
export { createEvidenceRecord } from './record.ts'
export { createEvidenceCard } from './card.ts'
export { extractEvidenceFromContent } from './extract.ts'
export { EvidenceError } from './types.ts'
export type {
  EvidenceCardInput,
  EvidenceCardItemDraft,
  EvidenceContentLocatorInput,
  EvidenceContentSegment,
  EvidenceDraft,
  EvidenceExtractionInput,
  EvidenceExtractionResult,
  EvidenceGenerationRequest,
  EvidenceGenerator,
  EvidenceRecordInput,
  SourceLocatorInput,
} from './types.ts'
