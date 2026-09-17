/** Sequential draft orchestration; module dependencies point toward producer libraries. */
import { createRetrievalRunId, isExecutableResearchBrief, type AcademicWorkId,
  type ProviderFailure } from '@deepseek-ai/dsh-academic-model'
import type { AcademicSourceSearchBatchResult } from '@deepseek-ai/dsh-academic-source'
import { createIngestIndex, ingestWorks } from '@deepseek-ai/dsh-academic-ingestion'
import { fetchAcademicFullText } from '@deepseek-ai/dsh-academic-evidence'
import { analyzeEvidence } from '@deepseek-ai/dsh-academic-analysis'
import { generateReport } from '@deepseek-ai/dsh-academic-report'
import { extractPaperEvidence } from './paper.ts'
import { WorkflowLogError } from './model-errors.ts'
import { buildRetrievalRun, createPaperProviderFailure } from './retrieval-run.ts'
import type { PaperEvidenceResult } from './types.ts'
import type { DraftPipelineAdapters, DraftPipelineInput, DraftPipelineResult, PaperProcessingFailure } from './pipeline-types.ts'

/**
 * Search, reconcile, acquire and extract papers before analyzing and evaluating a draft.
 * Scope selection is explicit; this pass neither plans queries nor grants semantic approval.
 * @param input Approved brief, one search request and explicit synthetic-data disclosure.
 * @param adapters Existing source/web/model adapters, scope selector and clock.
 * @param signal Caller-owned cancellation and elapsed-time budget.
 * @returns Draft, paper outcomes, and one terminal retrieval record; cancellation retains observations without a report.
 * @throws Rejects unapproved input, invalid selection, search failure, logging failure or downstream programming errors.
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
  const retrievalRunId = createRetrievalRunId()
  const startedAt = adapters.now()
  const papers: PaperEvidenceResult[] = []
  const failures: PaperProcessingFailure[] = []
  const providerFailures: ProviderFailure[] = []
  let search: AcademicSourceSearchBatchResult | null = null
  let queryExecuted = false
  let academicWorkIds: readonly AcademicWorkId[] = []
  let availableFulltextWorks = 0
  let selectionTruncated = false
  const settle = (cancelled: boolean): DraftPipelineResult => ({
    status: cancelled ? 'cancelled' : 'completed',
    retrievalRun: buildRetrievalRun({ retrievalRunId, brief, startedAt, completedAt: adapters.now(), cancelled,
      query: input.search.query, queryExecuted, search, academicWorkIds, papers, paperFailures: failures,
      failures: providerFailures, availableFulltextWorks, selectionTruncated }),
    papers,
    failures,
    analysis: null,
    report: null,
  })
  if (signal?.aborted) return settle(true)
  const maxResults = Math.min(input.search.maxResults ?? limits.maximumCandidateWorks, limits.maximumCandidateWorks)
  if (!Number.isSafeInteger(maxResults) || maxResults < 1) throw new Error('Search limit must be a positive integer.')
  queryExecuted = true
  try {
    search = await adapters.search({ ...input.search, maxResults }, signal)
  } catch (error: unknown) {
    if (signal?.aborted) return settle(true)
    throw error
  }
  providerFailures.push(...search.batch.failures)
  if (signal?.aborted) return settle(true)
  const ingested = ingestWorks(createIngestIndex(), search.batch.items.slice(0, maxResults))
  academicWorkIds = ingested.works.map(work => work.academicWorkId)
  const selection = adapters.selectPapers(ingested, brief)
  const selected = selection.papers
  selectionTruncated = selection.truncated
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
  const limitations = [...analysis.limitations, 'Single search pass; no automatic scope planning, retries or abstract fallback.',
    ...search.limitations,
    ...search.batch.failures.map(failure => `Provider ${failure.provider} failed during ${failure.operation}.`),
    ...selectionTruncated ? [`The approved included-work bound stopped selection at ${limits.maximumIncludedWorks}.`] : [],
    ...papers.filter(result => result.status === 'paused').map(result => `Paused version ${result.pause.workVersionId}: ${result.pause.reason}.`),
    ...papers.filter(result => result.status === 'excluded').map(result => `Excluded version ${result.exclusion.workVersionId}: ${result.exclusion.reason}`),
    ...failures.map(failure => `Version ${failure.workVersionId} failed during ${failure.stage}.`)]
  if (search.truncated || search.works.length > maxResults) limitations.push('Search results were truncated; coverage is incomplete.')
  const report = generateReport({ brief, claims: analysis.claims, links: analysis.links,
    evidence: source.evidenceRecords, versions: source.workVersions, sourceLocators: source.sourceLocators,
    works: source.academicWorks, reviews: [], assessedAt, limitations, mode: 'draft', synthetic: input.synthetic })
  const completed = settle(false)
  return { ...completed, analysis, report }
}
