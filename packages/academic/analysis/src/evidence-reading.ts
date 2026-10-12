/** Evidence-card roles and exact source duplicates guide reading, not semantic approval. */
import type { AcademicSynthesisInput } from './synthesis-types.ts'
import type { AnalysisSection } from './types.ts'

const sections: readonly AnalysisSection[] = ['researchQuestions', 'methods', 'datasets', 'metrics', 'findings', 'limitations']

/**
 * Index supplied evidence without assigning question relevance or changing source records.
 * @param input Admitted evidence and its producer-owned card sections.
 * @returns Card-role references and groups with identical version, locator, source, hash and exact excerpt.
 */
export function evidenceReadingGuide(input: AcademicSynthesisInput) {
  const records = input.analysisInput.evidenceRecords
  const groups = new Map<string, typeof records[number][]>()
  for (const record of records) {
    const key = record.verbatimExcerpt.status === 'available' && record.contentHash.status === 'available'
      ? JSON.stringify([record.academicWorkId, record.workVersionId, record.sourceLocatorId, record.sourceProvider,
        record.sourceUrl, record.level, record.contentHash.value, record.verbatimExcerpt.value])
      : JSON.stringify([record.evidenceId])
    const group = groups.get(key) ?? []
    group.push(record); groups.set(key, group)
  }
  return {
    evidenceRoles: records.map(record => ({ evidenceId: record.evidenceId,
      academicWorkId: record.academicWorkId, workVersionId: record.workVersionId,
      cardSections: sections.filter(section => input.analysisInput.evidenceCards.some(card =>
        card.academicWorkId === record.academicWorkId && card.workVersionId === record.workVersionId
        && card[section].some(item => item.evidenceIds.includes(record.evidenceId)))) })),
    identicalSourceGroups: [...groups.values()].filter(group => group.length > 1).map(group => group.map(record => record.evidenceId)),
  }
}

/**
 * Keep conditions and measurement context when output-limit recovery omits full card records.
 * @param input Admitted card entries, including explicit unavailable fields.
 * @returns Original per-version entries without repeated card identity metadata.
 */
export function comparisonContext(input: AcademicSynthesisInput) {
  return input.analysisInput.evidenceCards.map(card => ({ academicWorkId: card.academicWorkId, workVersionId: card.workVersionId,
    researchQuestions: card.researchQuestions, methods: card.methods, datasets: card.datasets,
    metrics: card.metrics, findings: card.findings, limitations: card.limitations }))
}
