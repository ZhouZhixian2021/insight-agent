/** Prepare traceable cross-paper materials without search, model calls, or mutation. */
import type { EvidenceCard, EvidenceCardItem, EvidenceRecord } from '@deepseek-ai/dsh-academic-model'
import type { AnalysisInput, AnalysisSection, PreparationIssue, PreparedAnalysisInput, PreparedVersion } from './types.ts'

export type { AnalysisInput, AnalysisSection, PreparationIssue, PreparationIssueCode, PreparedAnalysisInput, PreparedVersion, PreparedWork } from './types.ts'
export { analyzeEvidence } from './analyze.ts'
export type { AnalysisResult } from './analyze.ts'

const sections: readonly AnalysisSection[] = ['researchQuestions', 'methods', 'datasets', 'metrics', 'findings', 'limitations']

function indexBy<T, K>(values: readonly T[], key: (value: T) => K): Map<K, T> {
  const index = new Map<K, T>()
  for (const value of values) {
    const id = key(value)
    if (index.has(id)) throw new Error(`Ambiguous duplicate input ID: ${String(id)}`)
    index.set(id, value)
  }
  return index
}

/**
 * Group valid evidence-card entries by work and actual content version.
 * Invalid relationships exclude an entire entry, preserving unrelated entries.
 * Missing values remain unchanged and produce limitations, never inferred values.
 * @param input Typed evidence batch; callers validate external JSON before calling.
 * @returns Accepted materials and located exclusions/limitations, in input order.
 * @throws Error when duplicate object IDs make references ambiguous.
 */
export function prepareAnalysisInput(input: AnalysisInput): PreparedAnalysisInput {
  const works = indexBy(input.academicWorks, value => value.academicWorkId)
  const versions = indexBy(input.workVersions, value => value.workVersionId)
  const records = indexBy(input.evidenceRecords, value => value.evidenceId)
  const locators = indexBy(input.sourceLocators, value => value.sourceLocatorId)
  const cards = indexBy(input.evidenceCards, value => value.evidenceCardId)
  const issues: PreparationIssue[] = []
  const accepted = new Map<EvidenceCard['academicWorkId'], Map<EvidenceCard['workVersionId'], PreparedVersion>>()

  for (const card of cards.values()) {
    const report = (issue: Omit<PreparationIssue, 'evidenceCardId'>): void => {
      issues.push({ evidenceCardId: card.evidenceCardId, ...issue })
    }
    const rejectCard = (code: PreparationIssue['code'], message: string): void => {
      report({ code, message, disposition: 'excluded', section: null, itemId: null, evidenceId: null, field: null })
    }
    const work = works.get(card.academicWorkId)
    const version = versions.get(card.workVersionId)
    if (!work) { rejectCard('missing_work', 'Card work is absent from the batch.'); continue }
    if (!version) { rejectCard('missing_version', 'Card content version is absent from the batch.'); continue }
    if (version.academicWorkId !== work.academicWorkId || !work.workVersionIds.includes(version.workVersionId)) {
      rejectCard('version_mismatch', 'Card version is not a registered version of this work.')
      continue
    }
    if (version.status === 'retracted' || version.versionType === 'retracted') {
      rejectCard('retracted_version', 'Retracted content is excluded from analysis input.')
      continue
    }

    const used = new Map<EvidenceRecord['evidenceId'], EvidenceRecord>()
    function filter<T extends EvidenceCardItem>(section: AnalysisSection, entries: readonly T[]): readonly T[] {
      const result: T[] = []
      for (const entry of entries) {
        const itemIssues: PreparationIssue[] = []
        const add = (code: PreparationIssue['code'], disposition: PreparationIssue['disposition'], message: string, evidenceId: EvidenceRecord['evidenceId'] | null = null, field: string | null = null): void => {
          itemIssues.push({
            code, disposition, message, evidenceCardId: card.evidenceCardId,
            section, itemId: entry.evidenceCardItemId, evidenceId, field,
          })
        }
        const supporting: EvidenceRecord[] = []
        for (const evidenceId of new Set(entry.evidenceIds)) {
          const record = records.get(evidenceId)
          if (!record) {
            add('missing_evidence', 'excluded', 'Referenced evidence is absent from the batch.', evidenceId)
            continue
          }
          supporting.push(record)
          if (record.academicWorkId !== card.academicWorkId || record.workVersionId !== card.workVersionId) {
            add('version_mismatch', 'excluded', 'Evidence and card refer to different works or versions.', evidenceId)
          }
          const locator = locators.get(record.sourceLocatorId)
          if (!locator) {
            add('missing_locator', 'excluded', 'Evidence source locator is absent from the batch.', evidenceId)
          } else {
            if (locator.workVersionId !== record.workVersionId) add('version_mismatch', 'excluded', 'Locator and evidence versions differ.', evidenceId)
            const level = locator.kind === 'provider_record' ? 'metadata' : locator.kind === 'abstract' ? 'abstract' : 'fulltext'
            if (record.level !== level) add('locator_level_mismatch', 'excluded', 'Evidence depth does not match its locator.', evidenceId)
          }
          const hashes = [record.contentHash.status === 'available' ? record.contentHash.value : null,
            version?.contentHash.status === 'available' ? version.contentHash.value : null, locator?.contentHash]
            .filter((hash): hash is string => hash != null)
          if (new Set(hashes).size > 1) add('hash_mismatch', 'excluded', 'Known content hashes disagree.', evidenceId)
          if (record.level === 'metadata') add('metadata_only', 'excluded', 'Metadata cannot support substantive card entries.', evidenceId)
          if (record.verbatimExcerpt.status !== 'available') add('unavailable_excerpt', 'limitation', 'Original excerpt is unavailable; text cannot be verified here.', evidenceId)
          if (record.contentHash.status !== 'available' || version?.contentHash.status !== 'available' || locator?.contentHash == null) add('unavailable_hash', 'limitation', 'Some content hashes are unavailable; content identity is not fully checked.', evidenceId)
        }
        if (supporting.length > 0 && supporting.every(record => record.level === 'abstract')) {
          add('abstract_only', 'limitation', 'Entry has abstract evidence only; full experimental detail is not verified.')
        }
        for (const [field, value] of Object.entries(entry) as [string, unknown][]) {
          if (typeof value === 'object' && value !== null && 'status' in value && value.status !== 'available') {
            add('unavailable_field', 'limitation', `Field is ${String(value.status)}; preserve its original availability.`, null, field)
          }
        }
        issues.push(...itemIssues)
        if (itemIssues.some(issue => issue.disposition === 'excluded')) continue
        result.push(entry)
        for (const record of supporting) used.set(record.evidenceId, record)
      }
      if (result.length === 0) report({ code: 'empty_section', disposition: 'limitation', section, itemId: null, evidenceId: null, field: section, message: 'No accepted entries in this section; this does not establish absence in the literature.' })
      return result
    }
    const prepared: EvidenceCard = {
      ...card,
      researchQuestions: filter('researchQuestions', card.researchQuestions),
      methods: filter('methods', card.methods),
      datasets: filter('datasets', card.datasets),
      metrics: filter('metrics', card.metrics),
      findings: filter('findings', card.findings),
      limitations: filter('limitations', card.limitations),
    }
    if (!sections.some(section => prepared[section].length > 0)) continue
    const workVersions = accepted.get(work.academicWorkId) ?? new Map<EvidenceCard['workVersionId'], PreparedVersion>()
    const previous = workVersions.get(version.workVersionId)
    const combinedRecords = [...(previous?.evidenceRecords ?? []), ...used.values()]
    const evidenceRecords = [...new Map(combinedRecords.map(record => [record.evidenceId, record])).values()]
    const usedLocatorIds = new Set(evidenceRecords.map(record => record.sourceLocatorId))
    const sourceLocators = [...locators.values()].filter(locator => usedLocatorIds.has(locator.sourceLocatorId))
    workVersions.set(version.workVersionId, { version, cards: [...(previous?.cards ?? []), prepared], evidenceRecords, sourceLocators })
    accepted.set(work.academicWorkId, workVersions)
  }
  return {
    status: accepted.size > 0 ? 'usable' : 'no_usable_input',
    works: [...works.values()].flatMap((work) => {
      const grouped = accepted.get(work.academicWorkId)
      return grouped ? [{ work, versions: [...grouped.values()] }] : []
    }),
    issues,
  }
}
