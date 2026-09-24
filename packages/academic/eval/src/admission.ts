/** Compare cited evidence with the producer's admitted paper evidence. */
import type { EvidenceRecord } from '@deepseek-ai/dsh-academic-model'

/**
 * Match immutable evidence to a trusted extraction batch, never to Web search text.
 * @param record Evidence presented for assessment.
 * @param admitted Original evidence extracted from direct or scholarly-verified papers.
 * @returns Whether identity, content and provenance match an admitted record exactly.
 */
export function matchesAdmittedEvidence(record: EvidenceRecord, admitted: readonly EvidenceRecord[]): boolean {
  const matches = admitted.filter(item => item.evidenceId === record.evidenceId)
  const original = matches.length === 1 ? matches[0] : undefined
  if (original === undefined) return false
  return original.academicWorkId === record.academicWorkId && original.workVersionId === record.workVersionId
    && original.sourceLocatorId === record.sourceLocatorId && original.level === record.level
    && original.sourceProvider === record.sourceProvider && original.sourceUrl === record.sourceUrl
    && original.retrievedAt === record.retrievedAt && original.sourcedStatement === record.sourcedStatement
    && original.contentHash.status === 'available' && record.contentHash.status === 'available'
    && original.contentHash.value === record.contentHash.value
    && original.verbatimExcerpt.status === 'available' && record.verbatimExcerpt.status === 'available'
    && original.verbatimExcerpt.value === record.verbatimExcerpt.value
    && original.extractionMethod.method === record.extractionMethod.method
    && original.extractionMethod.methodVersion === record.extractionMethod.methodVersion
}
