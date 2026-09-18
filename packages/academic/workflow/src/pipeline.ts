/** Sequential draft orchestration; module dependencies point toward producer libraries. */
import { createRetrievalRunId, isExecutableResearchBrief, type AcademicWorkId,
  type ProviderFailure } from '@deepseek-ai/dsh-academic-model'
import type { AcademicSourceSearchBatchResult, AcademicSourceSearchRequest } from '@deepseek-ai/dsh-academic-source'
import { createIngestIndex, ingestWorks, type IngestOutcome } from '@deepseek-ai/dsh-academic-ingestion'
import { fetchAcademicFullText } from '@deepseek-ai/dsh-academic-evidence'
import { analyzeEvidence } from '@deepseek-ai/dsh-academic-analysis'
import { generateReport } from '@deepseek-ai/dsh-academic-report'
import { extractPaperEvidence } from './paper.ts'
import { WorkflowLogError } from './model-errors.ts'
import { buildRetrievalRun, createPaperProviderFailure, type RetrievalSearchObservation } from './retrieval-run.ts'
import type { PaperEvidenceResult } from './types.ts'
import { MAX_DRAFT_SEARCH_QUERIES } from './pipeline-types.ts'
import type { DraftPipelineAdapters, DraftPipelineInput, DraftPipelineResult, PaperProcessingFailure } from './pipeline-types.ts'

/**
 * Search, reconcile, acquire and extract papers before analyzing and evaluating a draft.
 * Scope and explicit query planning remain caller-owned; this pass executes the approved order.
 * @param input Approved brief, ordered search requests and explicit synthetic-data disclosure.
 * @param adapters Existing source/web/model adapters, scope selector and clock.
 * @param signal Caller-owned cancellation and elapsed-time budget.
 * @returns Draft, paper outcomes, and one terminal retrieval record; cancellation retains observations without a report.
 * @throws Rejects unapproved input, invalid query bounds or selection, search failure, logging failure, or downstream programming errors.
 */
export async function runResearchDraft(
  input: DraftPipelineInput,
  adapters: DraftPipelineAdapters,
  signal?: AbortSignal,
): Promise<DraftPipelineResult> {
  const { brief } = input
  if (!isExecutableResearchBrief(brief)) throw new Error('Current research brief requires approval.')
  const limits = brief.stopConditions
  if (limits.maximumSearchRounds < 1 || limits.maximumCandidateWorks < 1 || limits.maximumIncludedWorks < 1) {
    throw new Error('Research limits do not permit this pass.')
  }
  const searches = normalizeSearches(input.searches, limits.maximumSearchRounds)
  const maxResults = sharedCandidateLimit(searches, limits.maximumCandidateWorks)
  const retrievalRunId = createRetrievalRunId()
  const startedAt = adapters.now()
  const papers: PaperEvidenceResult[] = []
  const failures: PaperProcessingFailure[] = []
  const providerFailures: ProviderFailure[] = []
  const executedQueries: string[] = []
  const searchResults: AcademicSourceSearchBatchResult[] = []
  let search: RetrievalSearchObservation | null = null
  let ingested = ingestWorks(createIngestIndex(), [])
  let academicWorkIds: readonly AcademicWorkId[] = []
  let availableFulltextWorks = 0
  let selectionTruncated = false
  const settle = (cancelled: boolean): DraftPipelineResult => ({
    status: cancelled ? 'cancelled' : 'completed',
    retrievalRun: buildRetrievalRun({ retrievalRunId, brief, startedAt, completedAt: adapters.now(), cancelled,
      queries: executedQueries, search, academicWorkIds, papers, paperFailures: failures,
      failures: providerFailures, availableFulltextWorks, selectionTruncated }),
    papers,
    failures,
    analysis: null,
    report: null,
  })
  if (signal?.aborted) return settle(true)
  for (const request of searches) {
    executedQueries.push(request.query)
    let result: AcademicSourceSearchBatchResult
    try {
      result = await adapters.search({ ...request, maxResults }, signal)
    } catch (error: unknown) {
      if (signal?.aborted) return settle(true)
      throw error
    }
    searchResults.push(result)
    providerFailures.push(...result.batch.failures)
    const aggregate = aggregateSearches(searchResults, maxResults)
    search = aggregate.search
    ingested = aggregate.ingested
    academicWorkIds = ingested.works.map(work => work.academicWorkId)
    if (signal?.aborted) return settle(true)
  }
  const selection = adapters.selectPapers(ingested, brief)
  const selected = selection.papers
  selectionTruncated = selection.truncated
  if (signal?.aborted) return settle(true)
  if (selected.length > limits.maximumIncludedWorks) throw new Error('Selection exceeds the approved work limit.')
  const versions = new Map(ingested.versions.map(version => [version.workVersionId, version]))
  const selectedWorks = new Set<string>()
  // Validate the whole selection before spending network or model work on any paper.
  const validated = selected.map((paper) => {
    const version = versions.get(paper.workVersionId)
    if (!version) throw new Error('Selection references a version outside this search pass.')
    if (selectedWorks.has(version.academicWorkId)) throw new Error('Select only one version per work.')
    if (version.status === 'retracted' || version.versionType === 'retracted'
      || (!brief.evidenceRequirements.allowPreprints && version.versionType === 'preprint')) {
      throw new Error('Selected version is excluded by the research brief or retraction state.')
    }
    selectedWorks.add(version.academicWorkId)
    return { paper, version }
  })
  for (const { paper, version } of validated) {
    if (signal?.aborted) return settle(true)
    let stage: PaperProcessingFailure['stage'] = 'fulltext'
    try {
      const parsed = await fetchAcademicFullText({ ...paper, academicWorkId: version.academicWorkId,
        retrievedAt: adapters.now(), focusQuestions: brief.questions }, adapters.fetcher, signal)
      availableFulltextWorks += 1
      if (signal?.aborted) return settle(true)
      stage = 'extraction'
      const result = await extractPaperEvidence(version, parsed, paper.hasHistoricalEvidence, adapters.generator,
        { inclusionRules: brief.inclusionRules, exclusionRules: brief.exclusionRules }, signal)
      papers.push(result)
    } catch (error: unknown) {
      if (error instanceof WorkflowLogError) throw error
      // Paper-local acquisition/extraction failures preserve other papers; cancellation is run-wide.
      if (signal?.aborted) return settle(true)
      failures.push({ workVersionId: paper.workVersionId, stage })
      providerFailures.push(createPaperProviderFailure(paper, stage))
    }
  }
  if (signal?.aborted) return settle(true)
  const extracted = papers.filter(result => result.status === 'extracted')
  const successfulWorks = new Set(extracted.map(result => result.version.academicWorkId))
  const source = { academicWorks: ingested.works.filter(work => successfulWorks.has(work.academicWorkId)),
    workVersions: extracted.map(result => result.version),
    evidenceRecords: extracted.flatMap(result => result.evidence.evidenceRecords),
    evidenceCards: extracted.map(result => result.evidence.evidenceCard),
    sourceLocators: extracted.flatMap(result => result.evidence.sourceLocators) }
  const assessedAt = adapters.now()
  const analysis = analyzeEvidence(source, brief, assessedAt)
  const limitations = [...analysis.limitations,
    'Explicit queries only; no automatic query planning, retries or abstract fallback.',
    ...(search?.limitations ?? []),
    ...(search?.failures ?? []).map(failure => `Provider ${failure.provider} failed during ${failure.operation}.`),
    ...selectionTruncated ? [`The approved included-work bound stopped selection at ${limits.maximumIncludedWorks}.`] : [],
    ...papers.filter(result => result.status === 'paused').map(result => `Paused version ${result.pause.workVersionId}: ${result.pause.reason}.`),
    ...papers.filter(result => result.status === 'excluded').map(result => `Excluded version ${result.exclusion.workVersionId}: ${result.exclusion.reason}`),
    ...failures.map(failure => `Version ${failure.workVersionId} failed during ${failure.stage}.`)]
  if (search?.truncated === true) limitations.push('Search coverage or the candidate bound truncated results; coverage is incomplete.')
  const report = generateReport({ brief, claims: analysis.claims, links: analysis.links,
    evidence: source.evidenceRecords, versions: source.workVersions, sourceLocators: source.sourceLocators,
    works: source.academicWorks, reviews: [], assessedAt, limitations, mode: 'draft', synthetic: input.synthetic })
  const completed = settle(false)
  return { ...completed, analysis, report }
}

/** Normalize caller-owned queries once and enforce both the hard and approved round bounds. */
function normalizeSearches(
  searches: readonly AcademicSourceSearchRequest[],
  approvedMaximumRounds: number,
): readonly AcademicSourceSearchRequest[] {
  const normalized: AcademicSourceSearchRequest[] = []
  const queries = new Set<string>()
  for (const request of searches) {
    if (typeof request.query !== 'string' || request.query.trim().length === 0) {
      throw new Error('Each search query must be a non-empty string.')
    }
    const query = request.query.trim()
    if (queries.has(query)) continue
    queries.add(query)
    normalized.push({ query, ...request.maxResults === undefined ? {} : { maxResults: request.maxResults } })
  }
  if (normalized.length === 0) throw new Error('At least one search query is required.')
  const maximum = Math.min(MAX_DRAFT_SEARCH_QUERIES, approvedMaximumRounds)
  if (normalized.length > maximum) {
    throw new Error(`Search query count exceeds the approved bound of ${maximum}.`)
  }
  return normalized
}

/** Resolve one global candidate-work cap and validate every caller-supplied bound before search. */
function sharedCandidateLimit(searches: readonly AcademicSourceSearchRequest[], approvedMaximum: number): number {
  const bounds = searches.flatMap((request) => {
    if (request.maxResults === undefined) return []
    if (!Number.isSafeInteger(request.maxResults) || request.maxResults < 1) {
      throw new Error('Search limit must be a positive integer.')
    }
    return [request.maxResults]
  })
  return Math.min(approvedMaximum, ...bounds)
}

/** Merge completed query batches fairly, deduplicate exact identities, then apply the global work cap. */
function aggregateSearches(
  results: readonly AcademicSourceSearchBatchResult[],
  maxResults: number,
): { readonly ingested: IngestOutcome; readonly search: RetrievalSearchObservation } {
  const records = roundRobin(results.map(result => result.batch.items))
  const complete = ingestWorks(createIngestIndex(), records)
  const candidateTruncated = complete.works.length > maxResults
  const ingested = candidateTruncated ? retainFirstWorks(complete, maxResults) : complete
  const limitations = unique(results.flatMap(result => result.limitations))
  if (candidateTruncated) {
    limitations.push(`The approved candidate-work bound retained ${maxResults} of ${complete.works.length} deduplicated works.`)
  }
  return {
    ingested,
    search: {
      providers: unique(results.flatMap(result => result.providers)),
      discoveredRecords: results.reduce((sum, result) => sum + result.discoveredRecords, 0),
      deduplicatedWorks: complete.works.length,
      failures: results.flatMap(result => result.batch.failures),
      limitations,
      truncated: candidateTruncated || results.some(result => result.truncated),
    },
  }
}

/** Rebuild a self-consistent ingestion outcome from the first retained deduplicated work identities. */
function retainFirstWorks(outcome: IngestOutcome, maximum: number): IngestOutcome {
  const retained = new Set(outcome.works.slice(0, maximum).map(work => work.academicWorkId))
  const records = [...outcome.index.records]
    .filter(([academicWorkId]) => retained.has(academicWorkId))
    .flatMap(([, workRecords]) => workRecords)
  return ingestWorks(createIngestIndex(), records)
}

/** Interleave query batches so an earlier query cannot consume the global candidate bound alone. */
function roundRobin<T>(groups: readonly (readonly T[])[]): T[] {
  const merged: T[] = []
  const length = Math.max(0, ...groups.map(group => group.length))
  for (let index = 0; index < length; index++) {
    for (const group of groups) {
      const item = group[index]
      if (item !== undefined) merged.push(item)
    }
  }
  return merged
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}
