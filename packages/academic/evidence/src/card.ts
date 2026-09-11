/**
 * Evidence-card construction: mints the card and item identities and validates that every
 * section item states a non-empty statement and cites at least one supporting evidence id.
 * @module @deepseek-ai/dsh-academic-evidence/card
 */

import { createEvidenceCardId, createEvidenceCardItemId } from '@deepseek-ai/dsh-academic-model'
import type { EvidenceCard, EvidenceCardItem } from '@deepseek-ai/dsh-academic-model'

import { EvidenceError } from './types.ts'
import type { EvidenceCardInput } from './types.ts'

/**
 * Builds an evidence card from its six sections, minting the card identity and one item
 * identity per entry, and validating that each item has a non-empty statement and at least
 * one supporting evidence id.
 *
 * @param input - the card's work/version binding and six section entry lists.
 * @returns the built card with fresh identities.
 */
export function createEvidenceCard(input: EvidenceCardInput): EvidenceCard {
  const evidenceCardId = createEvidenceCardId()
  return {
    schemaVersion: 1,
    evidenceCardId,
    academicWorkId: input.academicWorkId,
    workVersionId: input.workVersionId,
    researchQuestions: input.researchQuestions.map(item => withItemId(item, createEvidenceCardItemId())),
    methods: input.methods.map(item => withItemId(item, createEvidenceCardItemId())),
    datasets: input.datasets.map(item => withItemId(item, createEvidenceCardItemId())),
    metrics: input.metrics.map(item => withItemId(item, createEvidenceCardItemId())),
    findings: input.findings.map(item => withItemId(item, createEvidenceCardItemId())),
    limitations: input.limitations.map(item => withItemId(item, createEvidenceCardItemId())),
  }
}

/** Mints an item identity, validating the item's non-empty statement. */
function withItemId<T extends Omit<EvidenceCardItem, 'evidenceCardItemId'>>(
  item: T,
  evidenceCardItemId: ReturnType<typeof createEvidenceCardItemId>,
): T & EvidenceCardItem {
  if (item.statement.trim().length === 0) {
    throw new EvidenceError('evidence card item "statement" must not be empty', 'EVIDENCE_EMPTY_ITEM_STATEMENT')
  }
  return { ...item, evidenceCardItemId }
}
