/**
 * Source-locator construction: mints one `SourceLocator` variant from its construction input,
 * defaulting optional fields to `null` and validating that a full-text locator carries a
 * non-negative position or page.
 * @module @deepseek-ai/dsh-academic-evidence/locator
 */

import { createSourceLocatorId } from '@deepseek-ai/dsh-academic-model'
import type { SourceLocator } from '@deepseek-ai/dsh-academic-model'

import { EvidenceError } from './types.ts'
import type { SourceLocatorInput } from './types.ts'

/**
 * Builds a source locator from its construction input, minting the locator identity and
 * setting `schemaVersion`. Optional `contentHash`, `printedPage`, `sectionTitle`, `title`,
 * and `pdfPage` default to `null`; a full-text locator with a negative page or character
 * range is rejected.
 *
 * @param input - the locator's kind-specific fields.
 * @returns the built locator with a fresh identity.
 */
export function createSourceLocator(input: SourceLocatorInput): SourceLocator {
  const sourceLocatorId = createSourceLocatorId()
  const contentHash = input.contentHash ?? null
  switch (input.kind) {
    case 'provider_record':
      return {
        kind: 'provider_record',
        sourceLocatorId,
        schemaVersion: 1,
        workVersionId: input.workVersionId,
        contentHash,
        provider: input.provider,
        recordId: input.recordId,
        url: input.url,
      }
    case 'abstract':
      assertNonNegative('characterStart', input.characterStart)
      assertNonNegative('characterEnd', input.characterEnd)
      return {
        kind: 'abstract',
        sourceLocatorId,
        schemaVersion: 1,
        workVersionId: input.workVersionId,
        contentHash,
        characterStart: input.characterStart,
        characterEnd: input.characterEnd,
      }
    case 'page_section':
      assertNonNegative('pdfPage', input.pdfPage)
      return {
        kind: 'page_section',
        sourceLocatorId,
        schemaVersion: 1,
        workVersionId: input.workVersionId,
        contentHash,
        sectionTitle: input.sectionTitle,
        pdfPage: input.pdfPage,
        printedPage: input.printedPage ?? null,
      }
    case 'paragraph':
      assertNonNegative('paragraphNumber', input.paragraphNumber)
      return {
        kind: 'paragraph',
        sourceLocatorId,
        schemaVersion: 1,
        workVersionId: input.workVersionId,
        contentHash,
        sectionTitle: input.sectionTitle ?? null,
        paragraphNumber: input.paragraphNumber,
      }
    case 'table':
      return {
        kind: 'table',
        sourceLocatorId,
        schemaVersion: 1,
        workVersionId: input.workVersionId,
        contentHash,
        tableNumber: input.tableNumber,
        title: input.title ?? null,
        pdfPage: input.pdfPage ?? null,
        printedPage: input.printedPage ?? null,
      }
    case 'figure':
      return {
        kind: 'figure',
        sourceLocatorId,
        schemaVersion: 1,
        workVersionId: input.workVersionId,
        contentHash,
        figureNumber: input.figureNumber,
        title: input.title ?? null,
        pdfPage: input.pdfPage ?? null,
        printedPage: input.printedPage ?? null,
      }
  }
}

/** Rejects a negative position or page with a stable validation code. */
function assertNonNegative(field: string, value: number): void {
  if (value < 0) {
    throw new EvidenceError(`source locator field "${field}" must be non-negative`, 'EVIDENCE_INVALID_LOCATOR')
  }
}
