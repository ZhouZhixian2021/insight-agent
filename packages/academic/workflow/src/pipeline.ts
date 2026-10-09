/** Ordered searches and bounded concurrent paper processing before draft synthesis. */
import { createRetrievalRunId, isExecutableResearchBrief, targetIncludedWorks, type AcademicWorkId,
  type AcademicCandidateRankingResult, type EvidenceRecord, type HybridSearchRound, type ProviderFailure,
  type ResearchBrief, type ResearchQuestionCoverageResult,
  type WorkVersion, type WorkVersionId } from '@deepseek-ai/dsh-academic-model'
import type { AcademicSourceProviderObservation, AcademicSourceSearchRequest } from '@deepseek-ai/dsh-academic-source'
import { createIngestIndex, ingestWorks, summarizeIngestAudit, type IngestOutcome } from '@deepseek-ai/dsh-academic-ingestion'
import { EvidenceError, fetchAcademicFullText, type AcademicFullTextObservation } from '@deepseek-ai/dsh-academic-evidence'
import { prepareSynthesisInput, synthesisSections, synthesisAnalysis, SynthesisError } from '@deepseek-ai/dsh-academic-analysis'
import { generateReport } from '@deepseek-ai/dsh-academic-report'
import { extractPaperEvidence } from './paper.ts'
import { WorkflowLogError } from './model-errors.ts'
import { researchRetrievalDisclosure } from './report-disclosure.ts'
import { buildRetrievalRun, createPaperProviderFailure, evidenceRejectionLimitations,
  type RetrievalSearchObservation } from './retrieval-run.ts'
import type { PaperEvidenceResult } from './types.ts'
import type { PaperEvidenceProgressObservation } from './model-types.ts'
import type { HybridSearchProgressObservation } from './hybrid-search.ts'
import { MAX_DRAFT_SEARCH_QUERIES } from './pipeline-types.ts'
import { collectHybridRun, type HybridRunObservation } from './hybrid-run.ts'
import type { DraftPipelineAdapters, DraftPipelineInput, DraftPipelineResult, DraftPipelineSearch, DraftSearchResult,
  PaperProcessingFailure,
  CandidateScheduling, PaperSelectionResult, ReplenishedCandidates, SelectedPaper } from './pipeline-types.ts'
import { createAcademicWorkflowProgressPublisher, type AcademicWorkflowProgressFailureCode,
  type AcademicWorkflowProgressStage,
  type AcademicWorkflowProgressStatus } from './progress.ts'
import { planCandidateBatch } from './candidate-batches.ts'
import type { AcademicBatchDecisionEvent, AcademicBatchSettlementEvent,
  AcademicQueryWorkflowObservation } from './query-workflow.ts'

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
  const paperConcurrency = input.paperConcurrency ?? 1
  if (!Number.isSafeInteger(paperConcurrency) || paperConcurrency < 1) {
    throw new Error('Paper concurrency must be a positive safe integer.')
  }
  if (!isExecutableResearchBrief(brief)) throw new Error('Current research brief requires approval.')
  synthesisSections(brief)
  const limits = brief.stopConditions
  const includedWorkTarget = targetIncludedWorks(brief)
  if (limits.maximumSearchRounds < 1 || limits.maximumCandidateWorks < 1 || limits.maximumIncludedWorks < 1) {
    throw new Error('Research limits do not permit this pass.')
  }
  const searches = normalizeSearches(input.searches)
  if (limits.maximumElapsedMinutes !== null) {
    const deadline = AbortSignal.timeout(limits.maximumElapsedMinutes * 60_000)
    signal = signal === undefined ? deadline : AbortSignal.any([signal, deadline])
  }
  const maxResults = sharedCandidateLimit(searches, limits.maximumCandidateWorks)
  const retrievalRunId = createRetrievalRunId()
  const startedAt = adapters.now()
  const progress = createAcademicWorkflowProgressPublisher(retrievalRunId, startedAt, searches.length,
    brief.questions.length, adapters.now, adapters.onProgress)
  let latestStage: AcademicWorkflowProgressStage = 'retrieval'
  const papers: PaperEvidenceResult[] = []
  const admittedEvidence: EvidenceRecord[] = []
  const failures: PaperProcessingFailure[] = []
  const providerFailures: ProviderFailure[] = []
  const executedQueries: string[] = []
  const searchResults: (DraftSearchResult & { readonly query: string })[] = []
  let hybridSearch: HybridRunObservation | undefined
  let search: RetrievalSearchObservation | null = null
  let ingested = ingestWorks(createIngestIndex(), [])
  let academicWorkIds: readonly AcademicWorkId[] = []
  let availableFulltextWorks = 0
  let selectionTruncated = false
  let usableWorkIds: readonly AcademicWorkId[] = []
  const selectionLimitations: string[] = []
  let queryWorkflow: AcademicQueryWorkflowObservation | undefined
  const publishQueryWorkflow = (
    value: Omit<AcademicQueryWorkflowObservation, 'sequence' | 'observedAt'>,
  ): void => {
    queryWorkflow = { ...value, sequence: (queryWorkflow?.sequence ?? -1) + 1, observedAt: adapters.now() }
    try {
      adapters.onQueryWorkflow?.(structuredClone(queryWorkflow))
    } catch {
      // Query-workflow observation is read-only; a broken subscriber cannot change research settlement.
    }
  }
  const updateQueryWorkflow = (
    value: Partial<Omit<AcademicQueryWorkflowObservation, 'schemaVersion' | 'retrievalRunId' | 'sequence' | 'observedAt'>>,
  ): void => {
    if (queryWorkflow === undefined) return
    publishQueryWorkflow({ ...queryWorkflow, ...value })
  }
  const settle = (cancelled: boolean): DraftPipelineResult => ({
    completedSearchQueries: searchResults.map(result => result.query),
    ...hybridSearch === undefined ? {} : { hybridSearch },
    ...queryWorkflow === undefined ? {} : { queryWorkflow },
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
  const cancel = (): DraftPipelineResult => {
    updateQueryWorkflow({ status: 'cancelled' })
    progress.cancel(latestStage)
    return settle(true)
  }
  if (signal?.aborted) return cancel()
  progress.startStage('retrieval', searches.length, 'queries')
  for (const [queryOffset, request] of searches.entries()) {
    executedQueries.push(request.query)
    const queryKey = `query:${queryOffset}`
    progress.setActivity(queryKey, { kind: 'query', stage: 'retrieval', queryIndex: queryOffset + 1,
      queryCount: searches.length, query: request.query, channels: request.channels, startedAt: adapters.now() })
    const providerStartedAt = new Map<string, string>()
    const observeProvider = (observation: AcademicSourceProviderObservation): void => {
      const activityKey = `${queryKey}:provider:${observation.provider}`
      const observedAt = adapters.now()
      if (observation.phase === 'started') providerStartedAt.set(observation.provider, observedAt)
      const status = observation.phase === 'started' ? 'running' : observation.settlement ?? 'failed'
      const failureCode = status === 'failed' ? observation.category ?? 'unknown'
        : status === 'cancelled' ? 'cancelled' : null
      progress.setActivity(activityKey, {
        kind: 'provider',
        stage: 'retrieval',
        queryIndex: queryOffset + 1,
        queryCount: searches.length,
        providerId: observation.provider,
        operation: 'academic_search',
        status,
        itemIndex: null,
        itemCount: null,
        discoveredRecords: observation.phase === 'settled' ? observation.works : null,
        failureCode,
        startedAt: providerStartedAt.get(observation.provider) ?? observedAt,
        completedAt: observation.phase === 'settled' ? observedAt : null,
      })
    }
    const hybridStartedAt = new Map<string, string>()
    const observeHybrid = (observation: HybridSearchProgressObservation): void => {
      const item = observation.itemIndex === null ? 'aggregate' : String(observation.itemIndex)
      const activityKey = `${queryKey}:hybrid:${observation.operation}:${item}`
      const observedAt = adapters.now()
      if (observation.phase === 'started') hybridStartedAt.set(activityKey, observedAt)
      progress.setActivity(activityKey, {
        kind: 'provider',
        stage: 'retrieval',
        queryIndex: queryOffset + 1,
        queryCount: searches.length,
        providerId: observation.providerId,
        operation: observation.operation,
        status: observation.status,
        itemIndex: observation.itemIndex,
        itemCount: observation.itemCount,
        discoveredRecords: observation.discoveredRecords,
        failureCode: observation.failureCode,
        startedAt: hybridStartedAt.get(activityKey) ?? observedAt,
        completedAt: observation.phase === 'settled' ? observedAt : null,
      })
    }
    let result: DraftSearchResult
    try {
      result = await adapters.search({ query: request.query, maxResults }, signal, observeProvider, observeHybrid)
    } catch (error: unknown) {
      if (signal?.aborted) {
        selectionLimitations.push(`Search query ${executedQueries.length} was interrupted; its unsettled hybrid observations are not included.`)
        return cancel()
      }
      progress.removeActivity(queryKey, 'retrieval', null, progressFailure(error))
      progress.settleStage('retrieval', 'failed', searchResults.length, searches.length, {}, progressFailure(error))
      throw error
    }
    searchResults.push({ ...result, query: request.query })
    providerFailures.push(...result.batch.failures)
    const aggregate = aggregateSearches(searchResults)
    hybridSearch = aggregate.hybridSearch
    search = aggregate.search
    ingested = aggregate.ingested
    progress.removeActivity(queryKey, 'retrieval')
    progress.updateStage('retrieval', searchResults.length, searches.length, {
      completedQueries: searchResults.length,
      discoveredRecords: search.discoveredRecords,
      deduplicatedWorks: search.deduplicatedWorks,
      ...summarizeIngestAudit(ingested),
    })
    if (signal?.aborted) return cancel()
  }
  progress.settleStage('retrieval', progressSettlement(executedQueries.length > 0,
    search?.discoveredRecords ?? 0, providerFailures.length), searchResults.length, searches.length)
  latestStage = 'screening'
  progress.startStage('screening', ingested.works.length, 'works')
  progress.setActivity('screening', { kind: 'screening', stage: 'screening', operation: 'eligibility', startedAt: adapters.now() })
  let selection: PaperSelectionResult
  try {
    selection = adapters.selectPapers(ingested, { ...brief,
      stopConditions: { ...limits, maximumCandidateWorks: maxResults } })
  } catch (error: unknown) {
    progress.settleStage('screening', 'failed', 0, ingested.works.length, {}, progressFailure(error))
    throw error
  }
  const selected = selection.papers
  const candidateScheduling = selection.candidateScheduling
  if (candidateScheduling !== undefined) {
    const completedAt = adapters.now()
    publishQueryWorkflow({
      schemaVersion: 1,
      retrievalRunId,
      status: 'running',
      plan: candidateScheduling.plan,
      works: ingested.works,
      versions: ingested.versions,
      assessments: candidateScheduling.assessments,
      ranking: candidateScheduling.ranking,
      rounds: completedRounds(candidateScheduling.plan, startedAt, completedAt,
        providerFailures.length === 0 ? 'success' : ingested.works.length === 0 ? 'failed' : 'partial_success'),
      decisions: [],
      settlements: [],
      coverage: null,
      stopDecision: null,
      limitations: [],
    })
  }
  selectionTruncated = selection.truncated
  if (selection.truncated) selectionLimitations.push('候选选择器限制了可处理的论文范围。')
  if (signal?.aborted) return cancel()
  if (selected.length > maxResults) throw new Error('Selection exceeds the approved candidate limit.')
  const versions = new Map(ingested.versions.map(version => [version.workVersionId, version]))
  const selectedWorks = new Set<string>()
  // Validate the whole selection before spending network or model work on any paper.
  let validated: { readonly paper: SelectedPaper; readonly version: WorkVersion }[]
  try {
    validated = reconcileSelectedPapers(selected, versions, selectedWorks, brief)
  } catch (error: unknown) {
    progress.settleStage('screening', 'failed', 0, ingested.works.length, {}, progressFailure(error))
    throw error
  }
  academicWorkIds = validated.map(item => item.version.academicWorkId)
  let plannedPapers = Math.min(validated.length, limits.maximumIncludedWorks)
  progress.settleStage('screening', 'success', ingested.works.length, ingested.works.length, {
    candidateWorks: validated.length,
    totalPapers: plannedPapers,
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
  const paperAbort = new AbortController()
  const paperSignal = signal === undefined ? paperAbort.signal : AbortSignal.any([signal, paperAbort.signal])
  const workTitles = new Map(ingested.works.map(work => [work.academicWorkId, work.title]))
  let fatal: WorkflowLogError | undefined
  let observedFulltextSettlements = 0
  let observedAvailableFulltext = 0
  let observedExtractionSettlements = 0
  let observedCompletedPapers = 0
  let observedEvidenceRecords = 0
  let observedRejectedDrafts = 0
  const processPaper = async ({ paper, version }: typeof validated[number]) => {
    let fulltext = false
    let stage: PaperProcessingFailure['stage'] = 'fulltext'
    const activityKey = `paper:${paper.workVersionId}`
    const title = workTitles.get(version.academicWorkId) ?? null
    let fulltextAttemptStartedAt = adapters.now()
    latestStage = 'fulltext'
    progress.startStage('fulltext', plannedPapers, 'papers')
    progress.setActivity(activityKey, { kind: 'paper', stage: 'fulltext', academicWorkId: version.academicWorkId,
      workVersionId: paper.workVersionId, title, operation: 'fulltext_fetch', batchIndex: null, batchCount: null,
      attempt: paper.urls.length === 0 ? null : 1, maximumAttempts: paper.urls.length,
      lastFailure: null, validatedEvidenceRecords: 0, rejectedEvidenceDrafts: 0, startedAt: fulltextAttemptStartedAt })
    const observeFulltext = (observation: AcademicFullTextObservation): void => {
      const observedAt = adapters.now()
      if (observation.phase === 'started') fulltextAttemptStartedAt = observedAt
      const failure = observation.settlement === 'failed' ? observation.category ?? 'unknown'
        : observation.settlement === 'cancelled' ? 'cancelled' : null
      const operation = observation.phase === 'started' ? 'fulltext_fetch'
        : observation.settlement === 'success' ? 'fulltext_parse'
          : observation.settlement === 'failed' && observation.candidateIndex < observation.candidateCount
            ? 'waiting_retry' : 'fulltext_fetch'
      progress.setActivity(activityKey, { kind: 'paper', stage: 'fulltext', academicWorkId: version.academicWorkId,
        workVersionId: paper.workVersionId, title, operation, batchIndex: null, batchCount: null,
        attempt: observation.candidateIndex, maximumAttempts: observation.candidateCount, lastFailure: failure,
        validatedEvidenceRecords: 0, rejectedEvidenceDrafts: 0, startedAt: fulltextAttemptStartedAt })
    }
    try {
      const parsed = await fetchAcademicFullText({ ...paper, academicWorkId: version.academicWorkId,
        retrievedAt: adapters.now(), focusQuestions: brief.questions }, adapters.fetcher, paperSignal, observeFulltext)
      fulltext = true
      observedFulltextSettlements += 1
      observedAvailableFulltext += 1
      progress.updateStage('fulltext', observedFulltextSettlements, plannedPapers, {
        availableFulltextPapers: observedAvailableFulltext,
      })
      if (paperSignal.aborted) return { fulltext }
      stage = 'extraction'
      latestStage = 'extraction'
      progress.startStage('extraction', plannedPapers, 'papers')
      const extractionStartedAt = adapters.now()
      progress.setActivity(activityKey, { kind: 'paper', stage: 'extraction', academicWorkId: version.academicWorkId,
        workVersionId: paper.workVersionId, title, operation: 'evidence_extract', batchIndex: null, batchCount: null, attempt: null, maximumAttempts: null,
        lastFailure: null, validatedEvidenceRecords: 0, rejectedEvidenceDrafts: 0, startedAt: extractionStartedAt })
      let observedBatchIndex: number | null = null
      let observedBatchCount: number | null = null
      const observeEvidence = (observation: PaperEvidenceProgressObservation): void => {
        if (observation.batchIndex !== null) observedBatchIndex = observation.batchIndex
        if (observation.batchCount !== null) observedBatchCount = observation.batchCount
        progress.setActivity(activityKey, { kind: 'paper', stage: 'extraction', academicWorkId: version.academicWorkId,
          workVersionId: paper.workVersionId, title, operation: observation.operation,
          batchIndex: observedBatchIndex, batchCount: observedBatchCount, attempt: observation.attempt,
          maximumAttempts: observation.maximumAttempts, lastFailure: observation.lastFailure,
          validatedEvidenceRecords: observation.validatedEvidenceRecords,
          rejectedEvidenceDrafts: observation.rejectedEvidenceDrafts, startedAt: extractionStartedAt })
      }
      const result = await extractPaperEvidence(version, parsed, paper.hasHistoricalEvidence, adapters.generator,
        { inclusionRules: brief.inclusionRules, exclusionRules: brief.exclusionRules }, paperSignal, observeEvidence)
      observedExtractionSettlements += 1
      observedCompletedPapers += 1
      const evidenceRecords = result.status === 'extracted' || result.status === 'partially_extracted'
        || result.status === 'extraction_failed' ? result.evidence.evidenceRecords.length : 0
      const rejectedDrafts = result.status === 'extracted' || result.status === 'partially_extracted'
        || result.status === 'extraction_failed' ? result.evidence.rejectedDrafts.length : 0
      observedEvidenceRecords += evidenceRecords
      observedRejectedDrafts += rejectedDrafts
      progress.updateStage('extraction', observedExtractionSettlements, plannedPapers, {
        completedPapers: observedCompletedPapers,
        validatedEvidenceRecords: observedEvidenceRecords,
        rejectedEvidenceDrafts: observedRejectedDrafts,
      })
      const resultFailure = result.status === 'partially_extracted' || result.status === 'extraction_failed'
        ? 'parse_failed' : null
      progress.removeActivity(activityKey, 'extraction', paper.workVersionId, resultFailure, version.academicWorkId)
      return { fulltext, result }
    } catch (error: unknown) {
      if (error instanceof WorkflowLogError) {
        fatal ??= error
        paperAbort.abort(error)
      }
      if (paperSignal.aborted) return { fulltext }
      const providerFailure = createPaperProviderFailure(paper, stage, error)
      observedCompletedPapers += 1
      if (stage === 'fulltext') {
        observedFulltextSettlements += 1
        progress.updateStage('fulltext', observedFulltextSettlements, plannedPapers, {
          completedPapers: observedCompletedPapers,
        })
      } else {
        observedExtractionSettlements += 1
        progress.updateStage('extraction', observedExtractionSettlements, plannedPapers, {
          completedPapers: observedCompletedPapers,
        })
      }
      progress.removeActivity(activityKey, stage, paper.workVersionId, providerFailure.category, version.academicWorkId)
      return { fulltext, failure: { workVersionId: paper.workVersionId, stage }, providerFailure }
    }
  }
  const collect = (paper: typeof validated[number]['paper'], outcome: Awaited<ReturnType<typeof processPaper>>) => {
    if (outcome.fulltext) availableFulltextWorks += 1
    if (outcome.failure) failures.push(outcome.failure)
    if (outcome.providerFailure) providerFailures.push(outcome.providerFailure)
    if (outcome.result) {
      papers.push(outcome.result)
      if (outcome.result.status === 'extracted' || outcome.result.status === 'partially_extracted') {
        // Capture source-checked extraction before an analysis adapter receives the working evidence graph.
        admittedEvidence.push(...structuredClone(outcome.result.evidence.evidenceRecords))
      }
      if (outcome.result.status === 'partially_extracted' || outcome.result.status === 'extraction_failed') {
        providerFailures.push(createPaperProviderFailure(paper, 'extraction',
          new EvidenceError('Some model drafts failed source verification.', 'EVIDENCE_DRAFTS_REJECTED')))
        if (outcome.result.status === 'extraction_failed') failures.push({ workVersionId: paper.workVersionId, stage: 'extraction' })
      }
    }
    evidenceAdmission()
    progress.updateCounts('extraction', {
      includedPapers: usableWorkIds.length,
      validatedEvidenceRecords: admittedEvidence.length,
      rejectedEvidenceDrafts: papers.reduce((sum, result) => sum + (
        result.status === 'extracted' || result.status === 'partially_extracted' || result.status === 'extraction_failed'
          ? result.evidence.rejectedDrafts.length : 0), 0),
    })
  }
  let attempted = 0
  let stopped = false
  const processGroup = async (group: readonly typeof validated[number][]) => {
    const pending: { paper: typeof validated[number]['paper']; done: ReturnType<typeof processPaper> }[] = []
    let offset = 0
    try {
      while (offset < group.length || pending.length > 0) {
        while (!paperSignal.aborted && offset < group.length && pending.length < paperConcurrency
          && usableWorkIds.length + pending.length < limits.maximumIncludedWorks) {
          const candidate = group[offset++]
          if (candidate === undefined) break
          attempted += 1
          pending.push({ paper: candidate.paper, done: processPaper(candidate) })
        }
        const next = pending.shift()
        if (!next) break
        collect(next.paper, await next.done)
      }
    } catch (error: unknown) {
      paperAbort.abort(error)
      await Promise.all(pending.map(item => item.done))
      throw error
    }
  }
  try {
    if (candidateScheduling === undefined) {
      const pending: { paper: typeof validated[number]['paper']; done: ReturnType<typeof processPaper> }[] = []
      try {
        while (attempted < validated.length || pending.length > 0) {
          const admission = evidenceAdmission()
          if (!stopped && attempted < validated.length && !paperSignal.aborted) {
            if (limits.stopWhenEvidenceRequirementsMet && admission.status === 'ready'
              && usableWorkIds.length >= includedWorkTarget) {
              stopped = true
              selectionTruncated = true
              selectionLimitations.push(`证据已达到计划数量要求，停止补选；已${paperConcurrency === 1 ? '处理' : '启动'} ${attempted} 篇候选，剩余 ${validated.length - attempted} 篇未处理。`)
            } else if (usableWorkIds.length >= limits.maximumIncludedWorks) {
              stopped = true
              selectionTruncated = true
              selectionLimitations.push(`达到成功纳入上限 ${limits.maximumIncludedWorks} 篇，停止补选。`)
            }
          }
          // Every unsettled candidate reserves an inclusion slot; completion order cannot change selection.
          while (!stopped && !paperSignal.aborted && attempted < validated.length
            && pending.length < paperConcurrency && usableWorkIds.length + pending.length < limits.maximumIncludedWorks) {
            const candidate = validated[attempted++]
            if (candidate === undefined) break
            pending.push({ paper: candidate.paper, done: processPaper(candidate) })
          }
          const next = pending.shift()
          if (!next) break
          collect(next.paper, await next.done)
        }
      } finally {
        if (pending.length > 0) {
          paperAbort.abort()
          await Promise.all(pending.map(item => item.done))
        }
      }
    } else {
      let scheduling: CandidateScheduling = candidateScheduling
      const byVersion = new Map(validated.map(candidate => [candidate.paper.workVersionId, candidate]))
      const scheduled: WorkVersionId[] = []
      let completedBatchCount = 0
      let consecutiveBatchesWithoutEvidence = 0
      // Multiple approved query directions make up the same initial search round. Count
      // completed rounds from the plan, never from the number of executed expressions.
      let completedSearchRounds = Math.max(...scheduling.plan.queries.map(query => query.roundIndex))
      while (!paperSignal.aborted) {
        const coverage = rankedCoverage(brief, scheduling.ranking, papers,
          evidenceAdmission().status === 'ready', scheduling.policy.minimumQuestionSupportingWorks,
          adapters.now())
        updateQueryWorkflow({
          plan: scheduling.plan,
          works: ingested.works,
          versions: ingested.versions,
          assessments: scheduling.assessments,
          ranking: scheduling.ranking,
          coverage,
        })
        const decision = planCandidateBatch({ brief, plan: scheduling.plan,
          ranking: scheduling.ranking, coverage, policy: scheduling.policy,
          scheduledWorkVersionIds: scheduled, completedBatchCount, consecutiveBatchesWithoutEvidence,
          includedWorks: usableWorkIds.length, completedSearchRounds,
          cancelled: false, elapsedTimeLimitReached: false, reviewRequired: false })
        const decisionEvent: AcademicBatchDecisionEvent = {
          retrievalRunId,
          batchIndex: decision.action === 'schedule_batch' ? decision.batch.batchIndex : null,
          action: decision.action,
          workVersionIds: decision.action === 'schedule_batch' ? decision.batch.workVersionIds : [],
          searchQuestions: decision.searchQuestions,
          reason: decision.action === 'schedule_batch' ? decision.batch.reason : decision.stop.reason,
        }
        adapters.onSettlement?.({ kind: 'batch-decision', event: decisionEvent })
        updateQueryWorkflow({ decisions: [...(queryWorkflow?.decisions ?? []), decisionEvent] })
        if (decision.action === 'stop') {
          stopped = true
          if (decision.stop.reason !== 'target_and_coverage_met') selectionTruncated = true
          selectionLimitations.push(...decision.stop.details)
          updateQueryWorkflow({ status: 'settled', stopDecision: decision.stop,
            limitations: [...(queryWorkflow?.limitations ?? []), ...decision.stop.details] })
          break
        }
        if (decision.action === 'search_evidence_gap') {
          const replenish = adapters.replenishCandidates
          const nextRoundIndex = completedSearchRounds + 1
          if (replenish === undefined || nextRoundIndex > scheduling.plan.maximumSearchRounds) {
            stopped = true
            selectionTruncated = true
            const limitation = `现有排序候选无法补足 ${decision.searchQuestions.length} 个研究问题；需要执行下一轮证据缺口补检。`
            selectionLimitations.push(limitation)
            updateQueryWorkflow({ status: 'settled', limitations: [...(queryWorkflow?.limitations ?? []), limitation] })
            break
          }
          let replenished: ReplenishedCandidates
          const roundStartedAt = adapters.now()
          try {
            replenished = await replenish(scheduling, ingested, coverage, nextRoundIndex, paperSignal)
          } catch (error: unknown) {
            if (signal?.aborted) return cancel()
            if (error instanceof WorkflowLogError) throw error
            stopped = true
            selectionTruncated = true
            const limitation = `证据缺口补检第 ${nextRoundIndex} 轮失败，停止选文。`
            selectionLimitations.push(limitation)
            updateQueryWorkflow({ status: 'settled', rounds: [...(queryWorkflow?.rounds ?? []), {
              roundIndex: nextRoundIndex, purpose: 'evidence_gap', searchQueryIds: [], status: 'failed',
              startedAt: roundStartedAt, completedAt: adapters.now(),
            }], limitations: [...(queryWorkflow?.limitations ?? []), limitation] })
            break
          }
          scheduling = replenished.scheduling
          ingested = replenished.ingested
          completedSearchRounds = nextRoundIndex
          updateQueryWorkflow({
            plan: scheduling.plan,
            works: ingested.works,
            versions: ingested.versions,
            assessments: scheduling.assessments,
            ranking: scheduling.ranking,
            rounds: [...(queryWorkflow?.rounds ?? []), roundFromPlan(scheduling.plan, nextRoundIndex,
              roundStartedAt, adapters.now(), 'success')],
          })
          for (const version of replenished.ingested.versions) {
            if (!versions.has(version.workVersionId)) versions.set(version.workVersionId, version)
          }
          for (const work of replenished.ingested.works) {
            if (!workTitles.has(work.academicWorkId)) workTitles.set(work.academicWorkId, work.title)
          }
          const appended = reconcileSelectedPapers(replenished.papers, versions, selectedWorks, brief)
          validated = [...validated, ...appended]
          academicWorkIds = validated.map(item => item.version.academicWorkId)
          plannedPapers = Math.min(validated.length, limits.maximumIncludedWorks)
          for (const candidate of appended) byVersion.set(candidate.paper.workVersionId, candidate)
          continue
        }
        const group = decision.batch.workVersionIds.map((workVersionId) => {
          const candidate = byVersion.get(workVersionId)
          if (candidate === undefined) throw new Error('Scheduled candidate has no selected full-text handoff.')
          return candidate
        })
        scheduled.push(...decision.batch.workVersionIds)
        const evidenceBefore = admittedEvidence.length
        await processGroup(group)
        completedBatchCount += 1
        consecutiveBatchesWithoutEvidence = admittedEvidence.length === evidenceBefore
          ? consecutiveBatchesWithoutEvidence + 1 : 0
        const settlementEvent: AcademicBatchSettlementEvent = {
          retrievalRunId, batchIndex: decision.batch.batchIndex, admittedEvidence: admittedEvidence.length,
          completedAt: adapters.now(),
        }
        adapters.onSettlement?.({ kind: 'batch-settlement', event: settlementEvent })
        updateQueryWorkflow({ settlements: [...(queryWorkflow?.settlements ?? []), settlementEvent] })
        if (fatal !== undefined) break
      }
    }
  } finally {
    paperAbort.abort()
  }
  if (fatal) {
    progress.settleStage('fulltext', progressSettlement(attempted > 0, availableFulltextWorks,
      failures.filter(failure => failure.stage === 'fulltext').length), observedFulltextSettlements, attempted)
    progress.settleStage('extraction', 'failed', observedExtractionSettlements, attempted, {}, 'unknown')
    throw fatal
  }
  if (signal?.aborted) return cancel()
  const admission = evidenceAdmission()
  const fulltextFailures = failures.filter(failure => failure.stage === 'fulltext').length
  const extractionFailures = failures.filter(failure => failure.stage === 'extraction').length
    + papers.filter(paper => paper.status === 'paused' || paper.status === 'partially_extracted').length
  const extractionSuccesses = papers.filter(paper => paper.status === 'extracted'
    || paper.status === 'partially_extracted' || paper.status === 'excluded').length
  progress.settleStage('fulltext', progressSettlement(attempted > 0, availableFulltextWorks, fulltextFailures),
    observedFulltextSettlements, attempted, { totalPapers: attempted, availableFulltextPapers: availableFulltextWorks })
  progress.settleStage('extraction', progressSettlement(availableFulltextWorks > 0, extractionSuccesses, extractionFailures),
    observedExtractionSettlements, attempted, { completedPapers: observedCompletedPapers, totalPapers: attempted,
      includedPapers: usableWorkIds.length, validatedEvidenceRecords: admittedEvidence.length,
      rejectedEvidenceDrafts: observedRejectedDrafts })
  if (attempted === validated.length && admission.status !== 'ready') {
    selectionLimitations.push(`本次可处理候选已用完（${attempted} 篇），证据仍不足；未自动扩展检索。`)
  }
  const assessedAt = adapters.now()
  const completed = settle(false)
  if (admission.status === 'blocked') {
    progress.settleStage('analysis', 'not_run')
    progress.settleStage('report', 'not_run')
    progress.complete('analysis')
    return { ...completed, synthesis: { status: 'blocked', reasons: admission.reasons } }
  }
  latestStage = 'analysis'
  progress.startStage('analysis', brief.questions.length, 'questions')
  for (const [questionOffset, question] of brief.questions.entries()) {
    progress.setActivity(`question:${questionOffset}`, { kind: 'question', stage: 'analysis',
      questionIndex: questionOffset + 1, questionCount: brief.questions.length, question, startedAt: adapters.now() })
  }
  let draft
  try {
    draft = await adapters.synthesize({ ...admission.input, coverageSummary: completed.retrievalRun.coverageSummary }, signal)
  } catch (error: unknown) {
    if (error instanceof WorkflowLogError) {
      progress.settleStage('analysis', 'failed', 0, brief.questions.length, {}, progressFailure(error))
      throw error
    }
    if (signal?.aborted) return cancel()
    progress.settleStage('analysis', 'failed', 0, brief.questions.length, {}, progressFailure(error))
    progress.settleStage('report', 'not_run')
    progress.complete('analysis')
    return { ...settle(false), synthesis: { status: 'failed', reasons: [error instanceof SynthesisError
      ? `${error.code}: ${error.message}` : '洞察模型调用失败；已保留检索与论文处理结果，请查看会话调用记录。'] } }
  }
  if (signal?.aborted) return cancel()
  const synthesisReasons = [...(admission.status === 'ready_with_warning'
    ? ['证据未达到 Plan 数量要求；按 continue_with_warning 生成有限草稿，不代表正式交付通过。', ...admission.limitations] : []),
  ...draft.rejectedStatements.map(item => `模型候选段落 ${item.statementIndex + 1} 未纳入报告：${item.code} — ${item.reason}`)]
  if (draft.statements.length === 0) {
    progress.settleStage('analysis', 'failed', brief.questions.length, brief.questions.length,
      { completedQuestions: brief.questions.length }, 'invalid_output')
    progress.settleStage('report', 'not_run')
    progress.complete('analysis')
    return { ...settle(false),
      synthesis: { status: 'failed', reasons: ['没有通过校验的洞察段落；已保留论文与证据。', ...synthesisReasons] } }
  }
  let analysis
  try {
    analysis = synthesisAnalysis(admission.input, draft, assessedAt)
  } catch (error: unknown) {
    progress.settleStage('analysis', 'failed', brief.questions.length, brief.questions.length,
      { completedQuestions: brief.questions.length }, progressFailure(error))
    throw error
  }
  const analysisPartial = admission.status === 'ready_with_warning' || draft.rejectedStatements.length > 0
  progress.settleStage('analysis', analysisPartial ? 'partial_success' : 'success', brief.questions.length,
    brief.questions.length, { completedQuestions: brief.questions.length })
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
  latestStage = 'report'
  progress.startStage('report', 1, 'report')
  const reportStartedAt = adapters.now()
  let report
  try {
    report = generateReport({ brief, claims: analysis.claims, links: analysis.links,
      admittedEvidence, retrievalDisclosure: researchRetrievalDisclosure(completed.retrievalRun, brief, hybridSearch, maxResults),
      evidence: admission.input.analysisInput.evidenceRecords, versions: admission.input.analysisInput.workVersions,
      sourceLocators: admission.input.analysisInput.sourceLocators,
      works: admission.input.analysisInput.academicWorks, synthesis: draft, coverage: completed.retrievalRun.coverageSummary, reviews: [], assessedAt, limitations, mode: 'draft', synthetic: input.synthetic }, (operation) => {
      progress.setActivity('report', { kind: 'report', stage: 'report', operation, attempt: null,
        maximumAttempts: null, lastFailure: null, startedAt: reportStartedAt })
    })
  } catch (error: unknown) {
    progress.settleStage('report', 'failed', 0, 1, {}, progressFailure(error))
    throw error
  }
  progress.settleStage('report', 'success', 1, 1)
  progress.complete('report')
  return { ...settle(false), analysis, report, synthesis: {
    status: admission.status === 'ready_with_warning' || draft.rejectedStatements.length > 0 ? 'partial_success' : 'completed', reasons: synthesisReasons } }
}

function completedRounds(
  plan: CandidateScheduling['plan'],
  startedAt: string,
  completedAt: string,
  status: HybridSearchRound['status'],
): readonly HybridSearchRound[] {
  return [...new Set(plan.queries.map(query => query.roundIndex))]
    .map(roundIndex => roundFromPlan(plan, roundIndex, startedAt, completedAt, status))
}

function roundFromPlan(
  plan: CandidateScheduling['plan'],
  roundIndex: number,
  startedAt: string,
  completedAt: string,
  status: HybridSearchRound['status'],
): HybridSearchRound {
  const queries = plan.queries.filter(query => query.roundIndex === roundIndex)
  return {
    roundIndex,
    purpose: queries[0]?.purpose ?? 'evidence_gap',
    searchQueryIds: queries.map(query => query.searchQueryId),
    status,
    startedAt,
    completedAt,
  }
}

/** Normalize caller-owned queries once and enforce the hard per-round query bound. */
function normalizeSearches(searches: readonly DraftPipelineSearch[]): readonly DraftPipelineSearch[] {
  const normalized: DraftPipelineSearch[] = []
  const queries = new Set<string>()
  for (const request of searches) {
    if (typeof request.query !== 'string' || request.query.trim().length === 0) {
      throw new Error('Each search query must be a non-empty string.')
    }
    const query = request.query.trim()
    if (queries.has(query)) continue
    queries.add(query)
    normalized.push({ query, channels: [...request.channels],
      ...request.maxResults === undefined ? {} : { maxResults: request.maxResults } })
  }
  if (normalized.length === 0) throw new Error('At least one search query is required.')
  if (normalized.length > MAX_DRAFT_SEARCH_QUERIES) {
    throw new Error(`Search query count exceeds the approved bound of ${MAX_DRAFT_SEARCH_QUERIES}.`)
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

/** Merge completed query batches fairly, deduplicate exact identities, retain all returned works for eligibility screening. */
function aggregateSearches(
  results: readonly (DraftSearchResult & { readonly query: string })[],
): {
  readonly ingested: IngestOutcome
  readonly search: RetrievalSearchObservation
  readonly hybridSearch: HybridRunObservation | undefined
} {
  const records = roundRobin(results.map(result => result.batch.items))
  const complete = ingestWorks(createIngestIndex(), records)
  const limitations = unique(results.flatMap(result => result.limitations))
  return {
    hybridSearch: collectHybridRun(results, complete),
    ingested: complete,
    search: {
      providers: unique(results.flatMap(result => result.providers)),
      discoveredRecords: results.reduce((sum, result) => sum + result.discoveredRecords, 0),
      deduplicatedWorks: complete.works.length,
      failures: results.flatMap(result => result.batch.failures),
      limitations,
      truncated: results.some(result => result.truncated),
    },
  }
}

/** Interleave query batches so an earlier query cannot consume the global candidate bound alone. */
/* jscpd:ignore-start -- workflow query ordering and source provider ordering belong to separate packages. */
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
/* jscpd:ignore-end */

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

/** Validate selected papers against the approved brief and one-version-per-work invariant, mutating the seen set. */
function reconcileSelectedPapers(
  papers: readonly SelectedPaper[],
  versions: ReadonlyMap<WorkVersionId, WorkVersion>,
  selectedWorks: Set<string>,
  brief: ResearchBrief,
): { readonly paper: SelectedPaper; readonly version: WorkVersion }[] {
  return papers.map((paper) => {
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
}

/** Build conservative batch-to-batch coverage from validated evidence and reviewed candidate-question links. */
function rankedCoverage(
  brief: ResearchBrief,
  ranking: AcademicCandidateRankingResult,
  papers: readonly PaperEvidenceResult[],
  evidenceRequirementsMet: boolean,
  minimumQuestionSupportingWorks: number,
  assessedAt: string,
): ResearchQuestionCoverageResult {
  const evaluations = new Map(ranking.evaluations.map(evaluation => [evaluation.workVersionId, evaluation]))
  const evidencePapers = papers.flatMap((paper) => {
    if (paper.status !== 'extracted' && paper.status !== 'partially_extracted') return []
    if (paper.evidence.evidenceRecords.length === 0) return []
    return [{ paper, evaluation: evaluations.get(paper.version.workVersionId) }]
  })
  const questions = brief.questions.map((question) => {
    const supporting = evidencePapers.filter(item => item.evaluation?.matchedQuestions.includes(question) === true)
    const supportingWorkIds = unique(supporting.map(item => item.paper.version.academicWorkId))
    const evidenceIds = unique(supporting.flatMap(item => item.paper.evidence.evidenceRecords.map(record => record.evidenceId)))
    const status = supportingWorkIds.length === 0 ? 'uncovered' as const
      : supportingWorkIds.length >= minimumQuestionSupportingWorks ? 'covered' as const : 'partial' as const
    return { question, status, supportingWorkIds, evidenceIds,
      gaps: status === 'covered' ? [] : [question] }
  })
  return { schemaVersion: 1, researchBriefId: brief.researchBriefId,
    researchBriefVersion: brief.version, assessedAt, questions, evidenceRequirementsMet,
    allQuestionsCovered: questions.every(question => question.status === 'covered') }
}

function progressSettlement(
  ran: boolean,
  successes: number,
  failures: number,
): Exclude<AcademicWorkflowProgressStatus, 'pending' | 'running'> {
  if (!ran) return 'not_run'
  if (failures > 0) return successes > 0 ? 'partial_success' : 'failed'
  return 'success'
}

function progressFailure(error: unknown): AcademicWorkflowProgressFailureCode {
  if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout'
  if (error instanceof EvidenceError) {
    if (error.code.includes('TIMEOUT')) return 'timeout'
    if (error.code.includes('INCOMPLETE')) return 'incomplete_output'
    if (error.code.includes('INPUT_TOO_LARGE') || error.code.includes('BUDGET')) return 'invalid_request'
    if (error.code.includes('EXCERPT') || error.code.includes('DRAFT')) return 'parse_failed'
    if (error.code.includes('UNEXPECTED') || error.code.includes('INVALID')) return 'invalid_output'
  }
  if (error instanceof SynthesisError && error.code.includes('INVALID')) return 'invalid_output'
  return 'unknown'
}
