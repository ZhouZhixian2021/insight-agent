/** Deterministic metadata filtering before full-text acquisition. */
import type { AcademicWork, PartialDate, ResearchBrief, WorkVersion } from '@deepseek-ai/dsh-academic-model'
import type { IngestOutcome } from '@deepseek-ai/dsh-academic-ingestion'
import type { PaperSelectionResult, SelectedPaper } from './pipeline-types.ts'

/** Provider-owned conversion from one accepted version to an acquirable paper. */
export type PaperCandidateResolver = (
  work: AcademicWork,
  version: WorkVersion,
) => Omit<SelectedPaper, 'workVersionId'> | null

/**
 * Select one canonical version per work using only deterministic brief fields.
 * Natural-language inclusion and exclusion rules remain for the full-text model review.
 * @param ingested - deduplicated works and versions from the current search pass.
 * @param brief - approved scope and result limits.
 * @param resolve - provider adapter that supplies full-text URLs and provenance.
 * @returns selected papers in search order and whether another eligible paper exceeded the approved limit.
 */
export function selectResearchPapers(
  ingested: IngestOutcome,
  brief: ResearchBrief,
  resolve: PaperCandidateResolver,
): PaperSelectionResult {
  const versions = new Map(ingested.versions.map(version => [version.workVersionId, version]))
  const selected: SelectedPaper[] = []
  for (const work of ingested.works) {
    const version = versions.get(work.canonicalVersionId)
    if (version === undefined || !eligible(work, version, brief)) continue
    const candidate = resolve(work, version)
    if (candidate === null || candidate.urls.length === 0) continue
    if (selected.length >= brief.stopConditions.maximumIncludedWorks) return { papers: selected, truncated: true }
    selected.push({ workVersionId: version.workVersionId, ...candidate })
  }
  return { papers: selected, truncated: false }
}

function eligible(work: AcademicWork, version: WorkVersion, brief: ResearchBrief): boolean {
  if (version.status === 'retracted' || version.versionType === 'retracted') return false
  if (work.publicationStatus.status === 'available' && work.publicationStatus.value === 'retracted') return false
  if (!brief.evidenceRequirements.allowPreprints && version.versionType === 'preprint') return false
  if (!brief.includedWorkTypes.includes(version.versionType)) return false
  const window = brief.publicationWindow
  if (window.start === null && window.end === null) return true
  const candidate = window.dateBasis === 'first_public_release' ? work.firstPublicDate : version.releaseDate
  if (candidate.status !== 'available') return false
  return overlaps(candidate.value, window.start, window.end)
}

function overlaps(candidate: PartialDate, start: PartialDate | null, end: PartialDate | null): boolean {
  const candidateBounds = dateBounds(candidate)
  if (start !== null && candidateBounds.end < dateBounds(start).start) return false
  if (end !== null && candidateBounds.start > dateBounds(end).end) return false
  return true
}

function dateBounds(date: PartialDate): { readonly start: string; readonly end: string } {
  switch (date.precision) {
    case 'year': return { start: `${date.iso}-01-01`, end: `${date.iso}-12-31` }
    case 'month': return { start: `${date.iso}-01`, end: `${date.iso}-31` }
    case 'day': return { start: date.iso, end: date.iso }
  }
}
