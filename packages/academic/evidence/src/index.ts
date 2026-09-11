/**
 * Academic evidence: constructs source locators, evidence records, and evidence cards with
 * fresh identities and level-locator validation. It is a library, not a Cordis service or
 * plugin; extraction that fills these records from retrieved material belongs to a later
 * model-facing increment.
 * @module @deepseek-ai/dsh-academic-evidence
 */

export { createSourceLocator } from './locator.ts'
export { createEvidenceRecord } from './record.ts'
export { createEvidenceCard } from './card.ts'
export { EvidenceError } from './types.ts'
export type {
  EvidenceCardInput,
  EvidenceRecordInput,
  SourceLocatorInput,
} from './types.ts'
