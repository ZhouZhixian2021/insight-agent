/** Validate source-grounded direction proposals from a bounded metadata survey. */
import { createHash } from 'node:crypto'
import { createIngestIndex, ingestWorks, metadataForVersion } from '@deepseek-ai/dsh-academic-ingestion'
import type { AcademicSourceSearchBatchResult } from '@deepseek-ai/dsh-academic-source'
import type { PublicationDateBasis, WorkVersionType } from '@deepseek-ai/dsh-academic-model'

/** Scholarly metadata retained for one deduplicated survey candidate. */
export interface DomainSurveyPaper {
  readonly workId: string
  readonly title: string
  readonly abstract: string | null
  readonly sourceProviders: readonly string[]
  readonly workVersionId?: string
  readonly versionType?: WorkVersionType
  readonly publicationDate?: string | null
  readonly sourceRecords?: readonly { readonly provider: string; readonly recordId: string }[]
}

/** An exact title or abstract passage supporting a proposed direction. */
export interface DomainDirectionSupport {
  readonly workId: string
  readonly field: 'title' | 'abstract'
  readonly quote: string
}

/** One candidate research direction and the papers from which it was inferred. */
export interface DomainSurveyDirection {
  readonly directionId: string
  readonly label: string
  readonly definition: string
  readonly supports: readonly DomainDirectionSupport[]
  readonly sourceProviders: readonly string[]
}

/** Bounded map of every reviewed candidate, including work that remains unclassified. */
export interface DomainSurveyMap {
  readonly schemaVersion: 1
  readonly directions: readonly DomainSurveyDirection[]
  readonly unclassifiedWorkIds: readonly string[]
}

/** Exact reviewed query and the discovery or independent omission-check pass that owns it. */
export interface DomainSurveyQuery {
  readonly expression: string
  readonly purpose: 'discovery' | 'omission_check'
  readonly roundIndex: number
}

/** Approved limits for metadata-only direction discovery. */
export interface DomainSurveyLimits {
  readonly maximumQueries: number
  readonly maximumQueriesPerRound: number
  readonly maximumCandidates: number
  readonly maximumResultsPerQuery: number
}

/** Executable corpus boundary reviewed alongside the query and result budgets. */
export interface DomainSurveySelectionPolicy {
  readonly startYear: number
  readonly endYear: number
  readonly dateBasis: PublicationDateBasis
  readonly includedVersionTypes: readonly WorkVersionType[]
}

/** Persistable result of a bounded survey; incomplete work remains visible. */
export interface DomainSurveyResult {
  readonly schemaVersion: 1
  readonly status: 'mapped' | 'incomplete'
  readonly queries: readonly DomainSurveyQuery[]
  readonly papers: readonly DomainSurveyPaper[]
  readonly map: DomainSurveyMap
  readonly limitations: readonly string[]
  readonly excludedByPolicy?: number
}

/** Model proposal plus any information lost during bounded recovery. */
export interface DomainSurveyProposal {
  readonly text: string
  readonly limitations: readonly string[]
}

/**
 * Search only reviewed expressions, deduplicate scholarly records, and validate the proposed map against those records.
 * @param queries Ordered reviewed expressions, including at least one omission-check query.
 * @param limits Approved total and per-query limits.
 * @param search Scholarly source operation; provider failures stay in the returned limitations.
 * @param propose Model or human mapper that receives only canonical scholarly metadata.
 * @param signal Cancellation forwarded to every operation.
 * @param selection Reviewed publication-date and version eligibility policy.
 * @returns The bounded map and explicit truncation or source failures.
 */
export async function runDomainSurvey(queries: readonly DomainSurveyQuery[], limits: DomainSurveyLimits,
  search: (query: string, maxResults: number, signal?: AbortSignal) => Promise<AcademicSourceSearchBatchResult>,
  propose: (papers: readonly DomainSurveyPaper[], signal?: AbortSignal) => Promise<string | DomainSurveyProposal>,
  signal?: AbortSignal, selection?: DomainSurveySelectionPolicy): Promise<DomainSurveyResult> {
  if (!Number.isSafeInteger(limits.maximumQueries) || limits.maximumQueries < 2
    || !Number.isSafeInteger(limits.maximumQueriesPerRound) || limits.maximumQueriesPerRound < 1
    || !Number.isSafeInteger(limits.maximumCandidates) || limits.maximumCandidates < 1
    || !Number.isSafeInteger(limits.maximumResultsPerQuery) || limits.maximumResultsPerQuery < 1
    || queries.length < 2 || queries.length > limits.maximumQueries
    || !queries.some(query => query.purpose === 'discovery')
    || !queries.some(query => query.purpose === 'omission_check')
    || queries.some(query => query.expression.trim() === '')
    || queries.some(query => !Number.isSafeInteger(query.roundIndex) || query.roundIndex < 1)
    || queries.some((query, index) => index > 0 && query.roundIndex < (queries[index - 1]?.roundIndex ?? 0))
    || new Set(queries.map(query => query.roundIndex)).size !== Math.max(...queries.map(query => query.roundIndex))
    || queries.some(query => queries.filter(other => other.roundIndex === query.roundIndex).length > limits.maximumQueriesPerRound)
    || new Set(queries.map(query => query.expression.trim())).size !== queries.length) {
    throw new RangeError('Domain survey requires distinct approved discovery and omission-check queries within positive limits.')
  }
  const limitations: string[] = []
  const records: AcademicSourceSearchBatchResult['works'][number][] = []
  const queryRecordKeys: Set<string>[] = []
  for (const [index, query] of queries.entries()) {
    signal?.throwIfAborted()
    try {
      const result = await search(query.expression.trim(), limits.maximumResultsPerQuery, signal)
      records.push(...result.works)
      queryRecordKeys.push(new Set(result.works.flatMap(item => item.workVersion.sourceRecords
        .map(record => JSON.stringify([record.provider, record.recordId])))))
      if (result.truncated) limitations.push(`Query ${index + 1} was truncated.`)
      for (const limit of result.limitations) limitations.push(`Query ${index + 1}: ${limit}`)
      for (const failure of result.batch.failures) {
        limitations.push(`Query ${index + 1}: ${failure.provider} ${failure.operation} failed.`)
      }
    } catch (cause: unknown) {
      signal?.throwIfAborted()
      queryRecordKeys.push(new Set())
      limitations.push(`Query ${index + 1} failed: ${cause instanceof Error ? cause.message : 'unknown error'}.`)
    }
  }
  const ingested = ingestWorks(createIngestIndex(), records)
  const versionIndex = new Map(ingested.versions.map(version => [version.workVersionId, version]))
  const eligible = ingested.works.flatMap((work) => {
    const versions = work.workVersionIds.map(id => versionIndex.get(id)).filter(version => version !== undefined)
    const version = versions.find(item => item.workVersionId === work.canonicalVersionId && matches(work, item, selection))
      ?? versions.find(item => matches(work, item, selection))
    return version === undefined ? [] : [{ work, version }]
  })
  const selected: typeof eligible = []
  const selectedIds = new Set<string>()
  const buckets = queryRecordKeys.map(keys => eligible.filter(({ work }) => work.workVersionIds.some(id =>
    versionIndex.get(id)?.sourceRecords.some(record => keys.has(JSON.stringify([record.provider, record.recordId]))) === true)))
  const offsets = buckets.map(() => 0)
  while (selected.length < limits.maximumCandidates) {
    let added = false
    for (const [index, bucket] of buckets.entries()) {
      while ((offsets[index] ?? 0) < bucket.length
        && selectedIds.has(String(bucket[offsets[index] ?? 0]?.work.academicWorkId))) {
        offsets[index] = (offsets[index] ?? 0) + 1
      }
      const next = bucket[offsets[index] ?? 0]
      if (next === undefined || selected.length >= limits.maximumCandidates) continue
      offsets[index] = (offsets[index] ?? 0) + 1
      selected.push(next)
      selectedIds.add(String(next.work.academicWorkId))
      added = true
    }
    if (!added) break
  }
  for (const item of eligible) {
    if (selected.length >= limits.maximumCandidates) break
    if (selectedIds.has(String(item.work.academicWorkId))) continue
    selected.push(item)
    selectedIds.add(String(item.work.academicWorkId))
  }
  if (selected.length === 0) limitations.push('No scholarly candidates were returned by the reviewed queries.')
  if (eligible.length > selected.length) limitations.push('The approved candidate limit truncated the survey.')
  const excludedByPolicy = ingested.works.length - eligible.length
  const papers: DomainSurveyPaper[] = selected.map(({ work, version }) => {
    const metadata = metadataForVersion(ingested.index, version)
    return { workId: String(work.academicWorkId), title: work.title,
      abstract: metadata.abstract.status === 'available' ? metadata.abstract.value.slice(0, 1_000) : null,
      sourceProviders: [...new Set(version.sourceRecords.map(record => record.provider))],
      workVersionId: String(version.workVersionId), versionType: version.versionType,
      publicationDate: version.releaseDate.status === 'available' ? version.releaseDate.value.iso : null,
      sourceRecords: version.sourceRecords.map(record => ({ provider: record.provider, recordId: record.recordId })) }
  })
  if (papers.length === 0) return { schemaVersion: 1, status: 'incomplete',
    queries: queries.map(query => ({ ...query, expression: query.expression.trim() })), papers,
    map: { schemaVersion: 1, directions: [], unclassifiedWorkIds: [] }, limitations, excludedByPolicy }
  const proposed = await propose(papers, signal)
  signal?.throwIfAborted()
  const map = parseDomainSurveyMap(typeof proposed === 'string' ? proposed : proposed.text, papers)
  if (typeof proposed !== 'string') limitations.push(...proposed.limitations)
  if (map.directions.length === 0) limitations.push('No source-grounded directions could be proposed from the candidates.')
  return { schemaVersion: 1, status: limitations.length === 0 ? 'mapped' : 'incomplete',
    queries: queries.map(query => ({ expression: query.expression.trim(), purpose: query.purpose,
      roundIndex: query.roundIndex })),
    papers, map, limitations, excludedByPolicy }
}

function matches(work: AcademicSourceSearchBatchResult['works'][number]['academicWork'],
  version: AcademicSourceSearchBatchResult['works'][number]['workVersion'],
  selection?: DomainSurveySelectionPolicy): boolean {
  if (selection === undefined) return true
  if (!selection.includedVersionTypes.includes(version.versionType)) return false
  const date = selection.dateBasis === 'first_public_release' ? work.firstPublicDate : version.releaseDate
  if (date.status !== 'available') return false
  const year = Number(date.value.iso.slice(0, 4))
  return Number.isInteger(year) && year >= selection.startYear && year <= selection.endYear
}

/**
 * Accept a model-proposed map only when every direction points to exact scholarly metadata and every paper is accounted for.
 * @param text Complete JSON response containing directions and unclassifiedWorkIds.
 * @param papers Deduplicated scholarly records supplied to the model.
 * @returns Verified direction map with stable identities and source providers.
 * @throws RangeError For malformed output, invented passages or paper identities, and unaccounted candidates.
 */
export function parseDomainSurveyMap(text: string, papers: readonly DomainSurveyPaper[]): DomainSurveyMap {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new RangeError('Domain survey output must be JSON.') }
  const root = object(value, 'domain survey')
  exactKeys(root, ['directions', 'unclassifiedWorkIds'], 'domain survey')
  const byId = new Map(papers.map(paper => [paper.workId, paper]))
  if (byId.size !== papers.length || papers.some(paper => paper.workId.trim() === '' || paper.title.trim() === '')) {
    throw new RangeError('Domain survey papers require unique identities and titles.')
  }
  if (!Array.isArray(root.directions) || !Array.isArray(root.unclassifiedWorkIds)) {
    throw new RangeError('Domain survey directions and unclassifiedWorkIds must be arrays.')
  }
  const labels = new Set<string>()
  const assigned = new Set<string>()
  const directions = root.directions.map((item: unknown, index: number): DomainSurveyDirection => {
    const direction = object(item, `direction ${index}`)
    exactKeys(direction, ['label', 'definition', 'supports'], `direction ${index}`)
    const label = nonEmpty(direction.label, `direction ${index} label`)
    const definition = nonEmpty(direction.definition, `direction ${index} definition`)
    const normalized = label.normalize('NFKC').trim().toLocaleLowerCase()
    if (labels.has(normalized)) throw new RangeError('Domain survey direction labels must be unique.')
    labels.add(normalized)
    if (!Array.isArray(direction.supports) || direction.supports.length === 0) {
      throw new RangeError(`Direction ${label} requires scholarly support.`)
    }
    const supports = direction.supports.map((item: unknown): DomainDirectionSupport => {
      const support = object(item, `direction ${label} support`)
      exactKeys(support, ['workId', 'field', 'quote'], `direction ${label} support`)
      const workId = nonEmpty(support.workId, 'support workId')
      const paper = byId.get(workId)
      if (paper === undefined) throw new RangeError(`Direction ${label} cites an unknown paper.`)
      if (support.field !== 'title' && support.field !== 'abstract') {
        throw new RangeError(`Direction ${label} has an invalid quote field.`)
      }
      const quote = nonEmpty(support.quote, 'support quote')
      const source = support.field === 'title' ? paper.title : paper.abstract
      if (source === null || !source.includes(quote)) {
        throw new RangeError(`Direction ${label} quotes text absent from scholarly metadata.`)
      }
      assigned.add(workId)
      return { workId, field: support.field, quote }
    })
    const sourceProviders = [...new Set(supports.flatMap(support => byId.get(support.workId)?.sourceProviders ?? []))]
    const directionId = createHash('sha256').update(JSON.stringify([normalized,
      [...new Set(supports.map(support => support.workId))].sort()])).digest('hex').slice(0, 16)
    return { directionId, label, definition, supports, sourceProviders }
  })
  const unclassifiedWorkIds = root.unclassifiedWorkIds.map((value: unknown) => nonEmpty(value, 'unclassified workId'))
  if (new Set(unclassifiedWorkIds).size !== unclassifiedWorkIds.length
    || unclassifiedWorkIds.some(workId => !byId.has(workId) || assigned.has(workId))
    || papers.some(paper => !assigned.has(paper.workId) && !unclassifiedWorkIds.includes(paper.workId))) {
    throw new RangeError('Domain survey must account for every paper exactly as classified or unclassified.')
  }
  return { schemaVersion: 1, directions, unclassifiedWorkIds }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RangeError(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) {
    throw new RangeError(`${label} has missing or unexpected fields.`)
  }
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new RangeError(`${label} must be a non-empty string.`)
  return value.trim()
}
