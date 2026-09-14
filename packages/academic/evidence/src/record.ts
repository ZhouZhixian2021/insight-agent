/**
 * Evidence-record construction: mints the identity and enforces the invariant the type
 * system cannot express — a record's level must match its locator kind, and its statement and
 * provenance fields must not be empty.
 * @module @deepseek-ai/dsh-academic-evidence/record
 */

import { createEvidenceId } from '@deepseek-ai/dsh-academic-model'
import type { EvidenceLevel, EvidenceRecord, SourceLocator } from '@deepseek-ai/dsh-academic-model'

import { EvidenceError } from './types.ts'
import type { EvidenceRecordInput } from './types.ts'

/** Locator kinds a record may carry at each evidence level. */
const LOCATOR_KINDS_BY_LEVEL: Readonly<Record<EvidenceLevel, readonly SourceLocator['kind'][]>> = {
  metadata: ['provider_record'],
  abstract: ['abstract'],
  fulltext: ['page_section', 'paragraph', 'table', 'figure'],
}

/**
 * Builds an evidence record, minting its identity and validating the level-locator pairing
 * and the non-empty statement and provenance fields. The record references the caller-built
 * locator by id.
 *
 * @param input - the record's fields plus its already-built locator.
 * @returns the built evidence record with a fresh identity.
 */
export function createEvidenceRecord(input: EvidenceRecordInput): EvidenceRecord {
  assertLevelMatchesLocator(input.level, input.sourceLocator)
  assertNonEmpty('sourcedStatement', input.sourcedStatement)
  assertNonEmpty('sourceProvider', input.sourceProvider)
  assertNonEmpty('sourceUrl', input.sourceUrl)
  assertNonEmpty('retrievedAt', input.retrievedAt)
  return {
    schemaVersion: 1,
    evidenceId: createEvidenceId(),
    academicWorkId: input.academicWorkId,
    workVersionId: input.workVersionId,
    level: input.level,
    sourcedStatement: input.sourcedStatement,
    sourceLocatorId: input.sourceLocator.sourceLocatorId,
    verbatimExcerpt: input.verbatimExcerpt,
    sourceProvider: input.sourceProvider,
    sourceUrl: input.sourceUrl,
    retrievedAt: input.retrievedAt,
    contentHash: input.contentHash,
    extractionMethod: input.extractionMethod,
    qualityNotes: [...(input.qualityNotes ?? [])],
  }
}

/** Rejects a level-locator pairing the type system cannot rule out. */
function assertLevelMatchesLocator(level: EvidenceLevel, locator: SourceLocator): void {
  const allowed = LOCATOR_KINDS_BY_LEVEL[level]
  if (!allowed.includes(locator.kind)) {
    throw new EvidenceError(
      `a ${level} evidence record must carry a ${allowed.join('/')} locator, not ${locator.kind}`,
      'EVIDENCE_LEVEL_LOCATOR_MISMATCH',
    )
  }
}

/** Rejects an empty provenance or statement field with a stable validation code. */
function assertNonEmpty(field: string, value: string): void {
  if (value.trim().length === 0) {
    throw new EvidenceError(`evidence record field "${field}" must not be empty`, 'EVIDENCE_EMPTY_FIELD')
  }
}
