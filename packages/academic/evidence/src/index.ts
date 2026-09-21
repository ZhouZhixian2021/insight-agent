/**
 * Academic evidence: fetches and prepares HTML/PDF full text and constructs source locators, evidence records,
 * and evidence cards with fresh identities and level-locator validation. Network and model
 * routing plus durable request logging stay in the caller's workflow.
 * @module @deepseek-ai/dsh-academic-evidence
 */

export { createSourceLocator } from './locator.ts'
export { createEvidenceRecord } from './record.ts'
export { createEvidenceCard } from './card.ts'
export { extractEvidenceFromContent } from './extract.ts'
export { prepareFetchedAcademicFullText } from './fetched-fulltext.ts'
export { prepareFetchedAcademicPdf } from './fetched-pdf.ts'
export { fetchAcademicFullText } from './fetch-fulltext.ts'
export { EvidenceError } from './types.ts'
export type {
  EvidenceCardInput,
  EvidenceCardItemDraft,
  EvidenceContentLocatorInput,
  EvidenceContentSegment,
  EvidenceDraft,
  EvidenceDraftRejection,
  EvidenceExtractionInput,
  EvidenceExtractionResult,
  AcademicWebFetchResult,
  AcademicFullTextFetchInput,
  AcademicWebFetcher,
  FetchedAcademicFullTextInput,
  EvidenceGenerationRequest,
  EvidenceGenerator,
  EvidenceRecordInput,
  SourceLocatorInput,
} from './types.ts'
