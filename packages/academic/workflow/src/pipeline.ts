/** Sequential draft orchestration; module dependencies point toward producer libraries. */
import { createRetrievalRunId, isExecutableResearchBrief, type AcademicWorkId,
  type ProviderFailure } from '@deepseek-ai/dsh-academic-model'
import type { AcademicSourceSearchBatchResult, AcademicSourceSearchRequest } from '@deepseek-ai/dsh-academic-source'
import { createIngestIndex, ingestWorks, type IngestOutcome } from '@deepseek-ai/dsh-academic-ingestion'
import { EvidenceError, fetchAcademicFullText } from '@deepseek-ai/dsh-academic-evidence'
import { prepareSynthesisInput, synthesisSections, synthesisAnalysis, SynthesisError } from '@deepseek-ai/dsh-academic-analysis'
import { generateReport } from '@deepseek-ai/dsh-academic-report'
import { extractPaperEvidence } from './paper.ts'
import { WorkflowLogError } from './model-errors.ts'
import { buildRetrievalRun, createPaperProviderFailure, evidenceRejectionLimitations,
  type RetrievalSearchObservation } from './retrieval-run.ts'
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
  synthesisSections(brief)
  const limits = brief.stopConditions
  if (limits.maximumSearchRounds < 1 || limits.maximumCandidateWorks < 1 || limits.maximumIncludedWorks < 1) {
    throw new Error('Research limits do not permit this pass.')
  }
  const searches = normalizeSearches(input.searches, limits.maximumSearchRounds)
  if (limits.maximumElapsedMinutes !== null) {
    const deadline = AbortSignal.timeout(limits.maximumElapsedMinutes * 60_000)
    signal = signal === undefined ? deadline : AbortSignal.any([signal, deadline])
  }
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
  let usableWorkIds: readonly AcademicWorkId[] = []
  const selectionLimitations: string[] = []
  const settle = (cancelled: boolean): DraftPipelineResult => ({
    status: cancelled ? 'cancelled' : 'completed',
    synthesis: { status: 'not_run', reasons: cancelled
      ? [signal?.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
        ? '达到计划时间上限；已保留完成的论文处理结果，未生成洞察报告。' : '研究已取消，未生成洞察报告。'] : [] },
    retrievalRun: buildRetrievalRun({ retrievalRunId, brief, startedAt, completedAt: adapters.now(), cancelled,
      queries: executedQueries, search, academicWorkIds, papers, paperFailures: failures,
      failures: providerFailures, availableFulltextWorks, selectionTruncated, selectionLimitations, includedWorkIds: usableWorkIds }),
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
  if (selection.truncated) selectionLimitations.push('候选选择器限制了可处理的论文范围。')
  if (signal?.aborted) return settle(true)
  if (selected.length > maxResults) throw new Error('Selection exceeds the approved candidate limit.')
  const versions = new Map(ingested.versions.map(version => [version.workVersionId, version]))
  const selectedWorks = new Set<string>()
  // Validate the whole selection before spending network or model work on any paper.
  const validated = selected.map((paper) => {
    const version = versions.get(paper.workVersionId)
    if (!version) throw new Error('Selection references a version outside this search pass.')
    if (selectedWorks.has(version.academicWorkId)) throw new Error('Select only one version per work.')
    if (version.status === 'retracted' || version.versionType === 'retracted'
      || !brief.includedWorkTypes.includes(version.versionType)
      || (!brief.evidenceRequirements.allowPreprints && version.versionType === 'preprint')) {
      throw new Error('Selected version is excluded by the research brief or retraction state.')
    }
    selectedWorks.add(version.academicWorkId)
    return { paper, version }
  })
  const evidenceAdmission = () => {
    const extracted = papers.filter(result => result.status === 'extracted' || result.status === 'partially_extracted')
    const successfulWorks = new Set(extracted.map(result => result.version.academicWorkId))
    const admission = prepareSynthesisInput({ schemaVersion: 1, synthetic: input.synthetic, brief, retrievalRunId,
      analysisInput: { academicWorks: ingested.works.filter(work => successfulWorks.has(work.academicWorkId)),
        workVersions: extracted.map(result => result.version),
        evidenceRecords: extracted.flatMap(result => result.evidence.evidenceRecords),
        evidenceCards: extracted.map(result => result.evidence.evidenceCard),
        sourceLocators: extracted.flatMap(result => result.evidence.sourceLocators) },
      coverageSummary: settle(false).retrievalRun.coverageSummary, sourceFailures: providerFailures })
    usableWorkIds = admission.usableWorkIds
    return admission
  }
  let attempted = 0
  for (const { paper, version } of validated) {
    if (signal?.aborted) return settle(true)
    const admission = evidenceAdmission()
    if (limits.stopWhenEvidenceRequirementsMet && admission.status === 'ready') {
      selectionTruncated = true
      selectionLimitations.push(`证据已达到计划数量要求，停止补选；已处理 ${attempted} 篇候选，剩余 ${validated.length - attempted} 篇未处理。`)
      break
    }
    if (admission.usableWorkIds.length >= limits.maximumIncludedWorks) {
      selectionTruncated = true
      selectionLimitations.push(`达到成功纳入上限 ${limits.maximumIncludedWorks} 篇，停止补选。`)
      break
    }
    attempted += 1
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
      evidenceAdmission()
      if (result.status === 'partially_extracted' || result.status === 'extraction_failed') {
        providerFailures.push(createPaperProviderFailure(paper, 'extraction',
          new EvidenceError('Some model drafts failed source verification.', 'EVIDENCE_DRAFTS_REJECTED')))
        if (result.status === 'extraction_failed') failures.push({ workVersionId: paper.workVersionId, stage: 'extraction' })
      }
    } catch (error: unknown) {
      if (error instanceof WorkflowLogError) throw error
      // Paper-local acquisition/extraction failures preserve other papers; cancellation is run-wide.
      if (signal?.aborted) return settle(true)
      failures.push({ workVersionId: paper.workVersionId, stage })
      providerFailures.push(createPaperProviderFailure(paper, stage, error))
    }
  }
  if (signal?.aborted) return settle(true)
  const admission = evidenceAdmission()
  if (attempted === validated.length && admission.status === 'blocked') {
    selectionLimitations.push(`本次可处理候选已用完（${attempted} 篇），证据仍不足；未自动扩展检索。`)
  }
  const assessedAt = adapters.now()
  const completed = settle(false)
  if (admission.status === 'blocked') return { ...completed, synthesis: { status: 'blocked', reasons: admission.reasons } }
  let draft
  try {
    draft = await adapters.synthesize({ ...admission.input, coverageSummary: completed.retrievalRun.coverageSummary }, signal)
  } catch (error: unknown) {
    if (error instanceof WorkflowLogError) throw error
    if (signal?.aborted) return settle(true)
    return { ...settle(false), synthesis: { status: 'failed', reasons: [error instanceof SynthesisError
      ? `${error.code}: ${error.message}` : '洞察模型调用失败；已保留检索与论文处理结果，请查看会话调用记录。'] } }
  }
  if (signal?.aborted) return settle(true)
  const synthesisReasons = draft.rejectedStatements.map(item =>
    `模型候选段落 ${item.statementIndex + 1} 未纳入报告：${item.code} — ${item.reason}`)
  if (draft.statements.length === 0) return { ...settle(false),
    synthesis: { status: 'failed', reasons: ['没有通过校验的洞察段落；已保留论文与证据。', ...synthesisReasons] } }
  const analysis = synthesisAnalysis(admission.input, draft, assessedAt)
  const limitations = [...admission.limitations, ...analysis.limitations,
    'Explicit queries only; no automatic query planning, retries or abstract fallback.',
    ...(search?.limitations ?? []),
    ...(search?.failures ?? []).map(failure => `Provider ${failure.provider} failed during ${failure.operation}.`),
    ...selectionLimitations,
    ...papers.filter(result => result.status === 'paused').map(result => `Paused version ${result.pause.workVersionId}: ${result.pause.reason}.`),
    ...papers.filter(result => result.status === 'excluded').map(result => `Excluded version ${result.exclusion.workVersionId}: ${result.exclusion.reason}`),
    ...failures.map(failure => `Version ${failure.workVersionId} failed during ${failure.stage}.`),
    ...evidenceRejectionLimitations(papers)]
  if (search?.truncated === true) limitations.push('Search coverage or the candidate bound truncated results; coverage is incomplete.')
  const report = generateReport({ brief, claims: analysis.claims, links: analysis.links,
    evidence: admission.input.analysisInput.evidenceRecords, versions: admission.input.analysisInput.workVersions,
    sourceLocators: admission.input.analysisInput.sourceLocators,
    works: admission.input.analysisInput.academicWorks, synthesis: draft, coverage: completed.retrievalRun.coverageSummary, reviews: [], assessedAt, limitations, mode: 'draft', synthetic: input.synthetic })
  return { ...settle(false), analysis, report, synthesis: {
    status: draft.rejectedStatements.length > 0 ? 'partial_success' : 'completed', reasons: synthesisReasons } }
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
