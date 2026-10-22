/** Synthetic records with fixed IDs; no real-paper claims or network access. */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { AcademicWork, AcademicWorkId, EvidenceCard, EvidenceCardId, EvidenceCardItemId, EvidenceId, EvidenceRecord, SourceLocator, SourceLocatorId, WorkVersion, WorkVersionId } from '@deepseek-ai/dsh-academic-model'
import type { AnalysisInput } from '../src/index.ts'

/**
 * Build one deterministic, traceable method-and-metric sample.
 * @param key Unique suffix for a synthetic work and its records.
 * @returns Independently editable records for one paper version.
 */
export function paper(key: string): {
  work: AcademicWork
  version: WorkVersion
  record: EvidenceRecord
  locator: SourceLocator
  card: EvidenceCard
} {
  const academicWorkId = brandString<AcademicWorkId>(`work-${key}`)
  const workVersionId = brandString<WorkVersionId>(`version-${key}`)
  const evidenceId = brandString<EvidenceId>(`evidence-${key}`)
  const sourceLocatorId = brandString<SourceLocatorId>(`locator-${key}`)
  const hash = `sha256:synthetic-${key}`
  return {
    work: { schemaVersion: 1, academicWorkId, title: `Synthetic paper ${key}`, authors: ['Example'], externalIdentifiers: [], workVersionIds: [workVersionId], canonicalVersionId: workVersionId, firstPublicDate: { status: 'available', value: { iso: '2026', precision: 'year' } }, publicationStatus: { status: 'available', value: 'preprint' }, venue: { status: 'unknown', reason: 'Synthetic fixture' } },
    version: { schemaVersion: 1, workVersionId, academicWorkId, versionType: 'preprint', versionLabel: { status: 'available', value: 'v1' }, releaseDate: { status: 'available', value: { iso: '2026', precision: 'year' } }, externalIdentifiers: [], sourceRecords: [], contentHash: { status: 'available', value: hash }, supersedesWorkVersionId: null, status: 'active' },
    locator: { schemaVersion: 1, sourceLocatorId, workVersionId, contentHash: hash, kind: 'paragraph', paragraphNumber: 1, sectionTitle: 'Results' },
    record: { schemaVersion: 1, evidenceId, academicWorkId, workVersionId, level: 'fulltext', verbatimExcerpt: { status: 'available', value: 'Synthetic method scores 85 percent on the test split.' }, sourcedStatement: 'Synthetic method result.', sourceLocatorId, sourceProvider: 'fixture', sourceUrl: 'https://example.invalid/paper', retrievedAt: '2026-09-14T00:00:00Z', contentHash: { status: 'available', value: hash }, extractionMethod: { method: 'fixture', methodVersion: '1' }, qualityNotes: [] },
    card: {
      schemaVersion: 1, evidenceCardId: brandString<EvidenceCardId>(`card-${key}`), academicWorkId, workVersionId,
      researchQuestions: [],
      methods: [{ evidenceCardItemId: brandString<EvidenceCardItemId>(`method-${key}`), statement: 'Uses synthetic method.', evidenceIds: [evidenceId], methodName: { status: 'available', value: 'Synthetic method' }, methodRole: { status: 'available', value: 'proposed' } }],
      datasets: [{ evidenceCardItemId: brandString<EvidenceCardItemId>(`dataset-${key}`), statement: 'Uses synthetic test split.', evidenceIds: [evidenceId], datasetName: { status: 'available', value: 'Synthetic dataset' }, version: { status: 'available', value: '1' }, split: { status: 'available', value: 'test' }, scale: { status: 'available', value: '100 examples' } }],
      metrics: [{ evidenceCardItemId: brandString<EvidenceCardItemId>(`metric-${key}`), statement: 'Scores 85 percent.', evidenceIds: [evidenceId], metricName: { status: 'available', value: 'accuracy' }, value: { status: 'available', value: 85 }, unit: { status: 'available', value: '%' }, direction: { status: 'available', value: 'higher_better' }, evaluationContext: { status: 'available', value: 'Synthetic dataset v1 test split' } }],
      findings: [], limitations: [],
    },
  }
}

/**
 * Assemble typed producer records without generating derived fields.
 * @param papers Synthetic records included in the batch.
 * @returns Input accepted by the analysis preparation function.
 */
export function batch(...papers: ReturnType<typeof paper>[]): AnalysisInput {
  return {
    academicWorks: papers.map(p => p.work), workVersions: papers.map(p => p.version),
    evidenceRecords: papers.map(p => p.record), evidenceCards: papers.map(p => p.card), sourceLocators: papers.map(p => p.locator),
  }
}
