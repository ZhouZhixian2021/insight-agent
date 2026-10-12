/** Producer-owned bibliography and safe stable links; no metadata is inferred. */
import type { AcademicWork, EvidenceRecord, WorkVersion, Availability } from '@deepseek-ai/dsh-academic-model'
import { escapeMarkdown } from './markdown.ts'

/** Existing report input records needed for the direction-level presentation. */
export interface ReportMetadata {
  readonly works: readonly AcademicWork[]
  readonly versions: readonly WorkVersion[]
  readonly reportDate: string
}

/**
 * Preserve the producer's available value or its explicit absence.
 * @param field Bibliographic availability, without guessed values.
 * @returns Plain text suitable for escaping at the report renderer.
 */
export function bibliographyValue<T>(field: Availability<T>): string {
  if (field.status === 'available') return String(field.value)
  return 'reason' in field && field.reason ? `未提供（${field.reason}）` : '未提供'
}

/**
 * Choose a stable DOI/arXiv link or an existing safe scholarly source URL.
 * @param work Source-owner work identity.
 * @param versions Supplied versions of this work.
 * @param evidence Supplied evidence; source URLs are fallback links, not identity proof.
 * @returns A safe Markdown autolink or a missing-link notice.
 */
export function scholarlyLink(work: AcademicWork, versions: readonly WorkVersion[], evidence: readonly EvidenceRecord[]): string {
  const identifiers = [...versions.filter(version => version.workVersionId === work.canonicalVersionId)
    .flatMap(version => version.externalIdentifiers), ...work.externalIdentifiers]
  const doi = identifiers.find(id => id.kind === 'doi'), arxiv = identifiers.find(id => id.kind === 'arxiv')
  if (doi !== undefined) return `<https://doi.org/${doi.normalizedValue.split('/').map(encodeURIComponent).join('/')}>`
  if (arxiv !== undefined) return `<https://arxiv.org/abs/${encodeURIComponent(arxiv.normalizedValue)}>`
  for (const record of evidence.filter(record => record.academicWorkId === work.academicWorkId)) {
    let url: URL
    try { url = new URL(record.sourceUrl) } catch { continue }
    if (['http:', 'https:'].includes(url.protocol) && url.username === '' && url.password === '') {
      return `<${url.href.replace(/[<>\s]/gu, encodeURIComponent)}>`
    }
  }
  return '稳定链接未提供'
}

/**
 * Describe actual evidence versions independently of the canonical citation version.
 * @param work Bibliographic work identity.
 * @param metadata Producer versions and report date.
 * @param evidence Original records for this report.
 * @returns Chinese metadata with date precision and missing values retained.
 */
export function workBibliography(work: AcademicWork, metadata: ReportMetadata, evidence: readonly EvidenceRecord[]): string {
  const used = metadata.versions.filter(version => evidence.some(record => record.academicWorkId === work.academicWorkId
    && record.workVersionId === version.workVersionId))
  const dates = used.map(version => version.releaseDate.status === 'available' ? version.releaseDate.value.iso : '日期未提供')
  const status = work.publicationStatus.status === 'available' ? { preprint: '预印本', accepted: '已录用',
    published: '正式发表', corrected: '已更正', retracted: '已撤回', unknown: '状态未确认' }[work.publicationStatus.value]
    : bibliographyValue(work.publicationStatus)
  const first = work.firstPublicDate.status === 'available' ? work.firstPublicDate.value.iso : '未提供'
  return `${escapeMarkdown(work.title)} — ${escapeMarkdown(work.authors.length === 0 ? '作者未提供' : work.authors.join(', '))}；`
    + `场所：${escapeMarkdown(bibliographyValue(work.venue))}；首次公开：${escapeMarkdown(first)}；`
    + `发表状态：${escapeMarkdown(status)}；`
    + `实际证据版本：${escapeMarkdown(used.map(version => version.workVersionId).join(', ') || '未提供')}；`
    + `版本日期：${escapeMarkdown(dates.join(', ') || '未提供')}；正式引用版本：${escapeMarkdown(work.canonicalVersionId)}；`
    + scholarlyLink(work, metadata.versions, evidence)
}
