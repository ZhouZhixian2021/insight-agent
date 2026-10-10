/** Host Remote owner for one Session-backed Academic research pass. */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import {
  runAcademicResearchDraft,
  reconstructAcademicResearchRecoveryState,
  type AcademicResearchDraftResult,
  type AcademicResearchRecoveryCheckpoint,
  type AcademicQueryWorkflowObserver,
  type AcademicSearchPlanEvent,
  type AcademicSettlementObserver,
  type AcademicWorkflowProgressObserver,
  type DraftPipelineAdapters,
} from '@deepseek-ai/dsh-academic-workflow'
import type { HybridSearchPlan } from '@deepseek-ai/dsh-academic-model'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-web'
import { researchPlanFromApprovedPlan } from './research-brief-plan.ts'
import { approvedPaperAdapters, type GapRoundPolicy } from './search.ts'
import { hybridRetrievalView } from './hybrid-view.ts'
import * as academicPlanValidation from './plan-validation.ts'
import { AcademicResearchRunQueue } from './run-stream.ts'
import { academicQ6Projection } from './q6-projection.ts'
import type {
  AcademicResearchRunFrame, AcademicResearchRunRequest, AcademicResearchRunValue, AcademicResearchStageStatus,
  AcademicResearchPlanView,
} from './types.ts'

export type * from './types.ts'
export { academicQ6Projection } from './q6-projection.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `academicResearch` Remote namespace. */
    academicResearchController: AcademicResearchController
  }
}

/** Academic research deployment policy. */
export interface Config {
  /** Maximum concurrent papers per research run. Defaults to 3. */
  readonly paperConcurrency?: number
  /** Web fetch provider used for raw Academic full text. Defaults to `http`. */
  readonly fulltextFetchProvider?: string
  /** Output-token reserve used when the Session model selection omits one. Defaults to 16,384. */
  readonly extractionMaxTokens?: number
  /** Total model attempts per paper. Output-limit, connection, and timeout failures may retry. Defaults to 2. */
  readonly extractionMaxAttempts?: number
  /** Delay before retrying a transient evidence extraction failure. Defaults to 10,000 ms. */
  readonly extractionRetryInitialDelayMs?: number
  /** Maximum estimated input tokens in one evidence batch. Defaults to 12,000. */
  readonly extractionBatchMaxInputTokens?: number
  /** Repeated source characters at adjacent long-segment boundaries. Defaults to 512. */
  readonly extractionBatchOverlapCharacters?: number
  /** Maximum elapsed time for one evidence model attempt. Defaults to 120,000 ms. */
  readonly extractionAttemptTimeoutMs?: number
  /** Total final synthesis attempts, including transport, timeout, output-limit, and invalid-output recovery. Defaults to 3. */
  readonly synthesisMaxAttempts?: number
  /** Delay before the first transient synthesis retry. Later delays double. Defaults to 1,000 ms. */
  readonly synthesisRetryInitialDelayMs?: number
  /** Maximum P0 candidates scheduled in the first ranked full-text batch. Defaults to 8. */
  readonly initialCandidateBatchSize?: number
  /** Maximum candidates scheduled to address observed question gaps. Defaults to 4. */
  readonly evidenceGapCandidateBatchSize?: number
  /** Maximum candidates scheduled when the inclusion target is still unmet. Defaults to 4. */
  readonly replenishmentCandidateBatchSize?: number
  /** Independent evidence-bearing works required to cover one question. Defaults to 1. */
  readonly minimumQuestionSupportingWorks?: number
  /** Maximum queries generated in one evidence-gap replenishment round. Defaults to 4. */
  readonly gapRoundMaximumQueriesPerRound?: number
  /** Maximum Academic results per gap-round query. Defaults to 20. */
  readonly gapRoundMaximumAcademicResultsPerQuery?: number
}

/** Host service backing the generated `ctx.remote.academicResearch` namespace. */
export class AcademicResearchController extends TypertRemoteService {
  static inject = ['academicSource', 'sessionController', 'typert', 'web']

  static Config: z<Config> = z.object({
    paperConcurrency: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(3),
    fulltextFetchProvider: z.string().default('http'),
    extractionMaxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(16_384),
    extractionMaxAttempts: z.number().step(1).min(1).max(2).default(2),
    extractionRetryInitialDelayMs: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(10_000),
    extractionBatchMaxInputTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(12_000),
    extractionBatchOverlapCharacters: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(512),
    extractionAttemptTimeoutMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(120_000),
    synthesisMaxAttempts: z.number().step(1).min(1).max(3).default(3),
    synthesisRetryInitialDelayMs: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(1_000),
    initialCandidateBatchSize: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(8),
    evidenceGapCandidateBatchSize: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(4),
    replenishmentCandidateBatchSize: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(4),
    minimumQuestionSupportingWorks: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(1),
    gapRoundMaximumQueriesPerRound: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(4),
    gapRoundMaximumAcademicResultsPerQuery: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(20),
  })

  private readonly fulltextFetchProvider: string
  private readonly paperConcurrency: number
  private readonly extractionMaxTokens: number
  private readonly extractionMaxAttempts: number
  private readonly extractionRetryInitialDelayMs: number
  private readonly extractionBatchMaxInputTokens: number
  private readonly extractionBatchOverlapCharacters: number
  private readonly extractionAttemptTimeoutMs: number
  private readonly synthesisMaxAttempts: number
  private readonly synthesisRetryInitialDelayMs: number
  private readonly candidateBatchPolicy: import('@deepseek-ai/dsh-academic-workflow').CandidateBatchPolicy
  private readonly gapRoundPolicy: GapRoundPolicy

  /**
   * @param ctx - Host context containing Session, Academic source, and Web fetch services.
   * @param config - deployment policy for Academic full-text retrieval.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'academicResearchController', { namespace: 'academicResearch' })
    this.paperConcurrency = config.paperConcurrency ?? 3
    this.fulltextFetchProvider = config.fulltextFetchProvider ?? 'http'
    this.extractionMaxTokens = config.extractionMaxTokens ?? 16_384
    this.extractionMaxAttempts = config.extractionMaxAttempts ?? 2
    this.extractionRetryInitialDelayMs = config.extractionRetryInitialDelayMs ?? 10_000
    this.extractionBatchMaxInputTokens = config.extractionBatchMaxInputTokens ?? 12_000
    this.extractionBatchOverlapCharacters = config.extractionBatchOverlapCharacters ?? 512
    this.extractionAttemptTimeoutMs = config.extractionAttemptTimeoutMs ?? 120_000
    this.synthesisMaxAttempts = config.synthesisMaxAttempts ?? 3
    this.synthesisRetryInitialDelayMs = config.synthesisRetryInitialDelayMs ?? 1_000
    this.candidateBatchPolicy = {
      initialBatchSize: config.initialCandidateBatchSize ?? 8,
      evidenceGapBatchSize: config.evidenceGapCandidateBatchSize ?? 4,
      replenishmentBatchSize: config.replenishmentCandidateBatchSize ?? 4,
      minimumQuestionSupportingWorks: config.minimumQuestionSupportingWorks ?? 1,
    }
    this.gapRoundPolicy = {
      maximumQueriesPerRound: config.gapRoundMaximumQueriesPerRound ?? 4,
      maximumAcademicResultsPerQuery: config.gapRoundMaximumAcademicResultsPerQuery ?? 20,
    }
    ctx.plugin(academicPlanValidation)
  }

  /**
   * Preview the latest approved plan without starting retrieval or calling a model.
   * @param sessionId Session whose research plan the user wants to execute.
   * @returns Chinese research intent, search directions, and the approval identity to pass to run.
   */
  @Remote('plan')
  async plan(sessionId: AcademicResearchRunRequest['sessionId']): Promise<AcademicResearchPlanView> {
    const found = await this.ctx.sessionController.resolveAgent(sessionId)
    if ('error' in found) throw found.error
    try {
      const { brief, searches } = researchPlanFromApprovedPlan(String(sessionId), found.agent.session.snapshotEvents())
      if (searches === undefined) throw new Error('当前已批准计划缺少检索方案，请在聊天中让系统补齐计划并重新审核，无需填写检索词。')
      return { researchBriefId: brief.researchBriefId, topic: brief.topic, questions: brief.questions, searches }
    } catch (cause: unknown) {
      throw new RemoteError('gateway/bad-request', cause instanceof Error ? cause.message : '无法读取研究计划，请先完成计划审核。', {}, { cause })
    }
  }

  /**
   * Run one multi-source research pass while the addressed Agent is idle.
   * @param request - previewed approval identity, disclosure, and the Session containing the plan.
   * @param signal - Remote caller lifetime; disconnect or cancellation aborts the pass.
   * @returns completed or cancelled draft data with its observed retrieval run and durable Session identity.
   */
  @Remote('run')
  async run(request: AcademicResearchRunRequest, signal: AbortSignal): Promise<AcademicResearchRunValue> {
    return runValue(await this.execute(request, signal))
  }

  /**
   * Stream complete workflow progress snapshots followed by one final result.
   * @param request - previewed approval identity, disclosure, and the Session containing the plan.
   * @param signal - Remote caller lifetime; disconnect or cancellation aborts this one pass.
   * @returns ordered progress frames and at most one terminal result frame.
   */
  @Remote({ mode: 'stream' })
  runStream(request: AcademicResearchRunRequest, signal: AbortSignal): AsyncIterable<AcademicResearchRunFrame> {
    return this.streamRun(request, signal)
  }

  private async *streamRun(
    request: AcademicResearchRunRequest,
    signal: AbortSignal,
  ): AsyncIterable<AcademicResearchRunFrame> {
    signal.throwIfAborted()
    const queue = new AcademicResearchRunQueue()
    const consumer = new AbortController()
    const operationSignal = AbortSignal.any([signal, consumer.signal])
    const onProgress: AcademicWorkflowProgressObserver = (progress) => {
      queue.push({ type: 'progress', progress: { ...progress, sessionId: request.sessionId } })
    }
    const onQueryWorkflow: AcademicQueryWorkflowObserver = (observation) => {
      queue.push({ type: 'q6', projection: academicQ6Projection(request.sessionId, observation) })
    }
    const operation = this.execute(request, operationSignal, onProgress, onQueryWorkflow)
    void operation.then((result) => {
      const value = runValue(result)
      queue.push({ type: 'result', retrievalRunId: value.retrievalRun.retrievalRunId, value })
      queue.close()
    }, (cause: unknown) => { queue.fail(cause) })
    try {
      yield* queue.read(signal)
    } finally {
      consumer.abort(new Error('Academic research stream consumer ended'))
      await operation.catch(() => undefined)
    }
  }

  private async execute(
    request: AcademicResearchRunRequest,
    signal: AbortSignal,
    onProgress?: AcademicWorkflowProgressObserver,
    onQueryWorkflow?: AcademicQueryWorkflowObserver,
  ): Promise<AcademicResearchDraftResult> {
    const found = await this.ctx.sessionController.resolveAgent(request.sessionId)
    if ('error' in found) throw found.error
    const { agent } = found
    const academicSource = agent.ctx.get('academicSource')
    if (academicSource === undefined) {
      throw new RemoteError('gateway/internal', 'Academic research is unavailable: the Session has no academicSource service', {})
    }
    const web = agent.ctx.get('web')
    if (web === undefined) {
      throw new RemoteError('gateway/internal', 'Academic research is unavailable: the Session has no web service', {})
    }
    let brief
    let searches
    let candidateScreening
    try {
      const approved = researchPlanFromApprovedPlan(String(request.sessionId), agent.session.snapshotEvents())
      brief = approved.brief
      searches = approved.searches
      candidateScreening = approved.candidateScreening
      if (searches === undefined) throw new Error('当前已批准计划缺少检索方案，请在聊天中让系统补齐计划并重新审核，无需填写检索词。')
      if (brief.researchBriefId !== request.researchBriefId) throw new Error('研究计划已更新，请重新打开学术研究，确认最新计划后再开始。')
    } catch (cause: unknown) {
      throw new RemoteError('gateway/bad-request', cause instanceof Error ? cause.message : 'invalid Academic Research Brief', {},
        { cause })
    }
    let recovery: AcademicResearchRecoveryCheckpoint | undefined
    if (request.resumeRetrievalRunId !== undefined) {
      const reconstructed = reconstructAcademicResearchRecoveryState(agent.session.snapshotEvents(), {
        retrievalRunId: request.resumeRetrievalRunId,
        researchBriefId: brief.researchBriefId,
        researchBriefVersion: brief.version,
      })
      if (reconstructed.status === 'failed') {
        throw new RemoteError('gateway/bad-request',
          `无法恢复学术研究：${reconstructed.failure.code} — ${reconstructed.failure.reason}`, {})
      }
      if (reconstructed.status !== 'resumable') {
        throw new RemoteError('gateway/bad-request', `学术研究已${reconstructed.status === 'completed' ? '完成' : '取消'}，无需恢复。`, {})
      }
      if (reconstructed.input.checkpoint === null) {
        throw new RemoteError('gateway/bad-request',
          '无法恢复学术研究：candidate_state_missing — 该历史运行没有可执行候选检查点，请开始一次新的研究运行。', {})
      }
      recovery = reconstructed.input.checkpoint
    }
    const selectedModel = agent.session.requestHeader()?.config ?? agent.options
    if (selectedModel.provider === undefined || selectedModel.model === undefined) {
      throw new RemoteError('gateway/bad-request', 'the Session has no selected model', {})
    }
    const model: LlmCallConfig = { provider: selectedModel.provider, model: selectedModel.model,
      ...selectedModel.reasoningEffort === undefined ? {} : { reasoningEffort: selectedModel.reasoningEffort },
      maxTokens: selectedModel.maxTokens ?? this.extractionMaxTokens }
    const onSettlement: AcademicSettlementObserver = (fact) => {
      if (fact.kind === 'batch-decision') {
        agent.session.append('academic/candidate-batch-decision', fact.event)
      } else {
        agent.session.append('academic/candidate-batch-settlement', fact.event)
      }
    }
    const adapters: Omit<DraftPipelineAdapters, 'generator' | 'synthesize'> = {
      ...approvedPaperAdapters(brief, searches, academicSource, web, this.candidateBatchPolicy, this.gapRoundPolicy,
        recovery === undefined ? plan => agent.session.append('academic/search-plan', searchPlanEvent(plan)) : undefined,
        candidateScreening),
      fetcher: (url, operationSignal) => web.fetch(
        { url }, operationSignal, { providerId: this.fulltextFetchProvider },
      ),
      now: () => new Date().toISOString(),
      onSettlement,
      onRecoveryCheckpoint: checkpoint => agent.session.append('academic/recovery-checkpoint', checkpoint),
      ...(onProgress === undefined ? {} : { onProgress }),
      ...(onQueryWorkflow === undefined ? {} : { onQueryWorkflow }),
    }
    let maintenance: Promise<AcademicResearchDraftResult>
    try {
      maintenance = agent.runMaintenance(agentSignal => runAcademicResearchDraft({
        ctx: agent.ctx,
        session: agent.session,
        model,
        modelPolicies: {
          evidence: { maxAttempts: this.extractionMaxAttempts, retryOutputLimit: true,
            inputBatchTokenLimit: this.extractionBatchMaxInputTokens,
            inputBatchOverlapCharacters: this.extractionBatchOverlapCharacters,
            attemptTimeoutMs: this.extractionAttemptTimeoutMs,
            transientRetry: { failureCodes: ['TRANSPORT', 'TIMEOUT'], initialDelayMs: this.extractionRetryInitialDelayMs } },
          synthesis: { maxAttempts: this.synthesisMaxAttempts, retryOutputLimit: true, retryInvalidOutput: true,
            transientRetry: { failureCodes: ['TRANSPORT', 'TIMEOUT'], initialDelayMs: this.synthesisRetryInitialDelayMs } },
        },
        input: { brief, paperConcurrency: this.paperConcurrency, searches: searches.map(search => ({ query: search.query,
          channels: search.retrieval?.channels ?? ['academic'],
          ...request.maxResults === undefined ? {} : { maxResults: request.maxResults } })), synthetic: request.synthetic,
        ...(recovery === undefined ? {} : { recovery }) },
        adapters,
        signal: AbortSignal.any([signal, agentSignal]),
      }))
    } catch (cause: unknown) {
      throw new RemoteError('session/agent-busy', `session "${request.sessionId}" already has active work`,
        { reason: 'academic research requires an idle Session' }, { cause })
    }
    const result = await maintenance
    agent.session.append('academic/run-settlement', {
      retrievalRunId: result.retrievalRun.retrievalRunId,
      status: result.status,
      completedAt: new Date().toISOString(),
    })
    return result
  }
}

/** Project one approved plan into its durable search-plan event payload. */
function searchPlanEvent(plan: HybridSearchPlan): AcademicSearchPlanEvent {
  return {
    schemaVersion: 1,
    researchBriefId: plan.researchBriefId,
    researchBriefVersion: plan.researchBriefVersion,
    maximumSearchRounds: plan.maximumSearchRounds,
    queries: plan.queries.map(query => ({
      searchQueryId: query.searchQueryId,
      kind: query.kind,
      expression: query.expression,
      purpose: query.purpose,
      questions: query.questions,
      roundIndex: query.roundIndex,
      providers: query.kind === 'academic' ? query.providers : [],
      maximumResults: query.kind === 'web_discovery' || query.kind === 'site_restricted' ? query.maximumResults : null,
      siteHost: query.kind === 'site_restricted' ? query.siteHost : null,
    })),
  }
}

function runValue(result: AcademicResearchDraftResult): AcademicResearchRunValue {
  const searchFailures = result.retrievalRun.failures.filter(failure =>
    ['search', 'web_search', 'verify_reference'].includes(failure.operation)).length
  const fulltextFailures = result.failures.filter(failure => failure.stage === 'fulltext').length
    + result.retrievalRun.failures.filter(failure => failure.operation === 'resolve_fulltext').length
  const extractionFailures = result.failures.filter(failure => failure.stage === 'extraction').length
    + result.papers.filter(paper => paper.status === 'paused' || paper.status === 'partially_extracted').length
  const extractionSuccesses = result.papers.filter(paper => paper.status === 'extracted'
    || paper.status === 'partially_extracted' || paper.status === 'excluded').length
  const incompleteSearch = result.completedSearchQueries !== undefined
    && result.completedSearchQueries.length < result.retrievalRun.queries.length
  return { sessionId: result.sessionId, status: result.status, synthesis: result.synthesis,
    q6: result.queryWorkflow === undefined ? null : academicQ6Projection(result.sessionId, result.queryWorkflow),
    ...result.hybridSearch === undefined ? {} : { hybridRetrieval: hybridRetrievalView(result.hybridSearch) },
    stages: {
      search: incompleteSearch ? result.completedSearchQueries.length === 0 ? 'not_run' : 'partial_success'
        : settleStage(result.retrievalRun.queries.length > 0,
          result.retrievalRun.coverageSummary.discoveredRecords, searchFailures),
      fulltext: settleStage(result.retrievalRun.coverageSummary.availableFulltextWorks + fulltextFailures > 0,
        result.retrievalRun.coverageSummary.availableFulltextWorks, fulltextFailures),
      extraction: settleStage(result.retrievalRun.coverageSummary.availableFulltextWorks > 0,
        extractionSuccesses, extractionFailures),
    },
    retrievalRun: result.retrievalRun,
    failures: result.failures.map(failure => ({ workVersionId: failure.workVersionId, stage: failure.stage })),
    papers: result.papers.map((paper) => {
      switch (paper.status) {
        case 'extracted':
        case 'partially_extracted':
        case 'extraction_failed': return { status: paper.status, workVersionId: paper.version.workVersionId,
          evidenceCount: paper.evidence.evidenceRecords.length,
          rejectedDrafts: paper.evidence.rejectedDrafts.map(rejection => ({ ...rejection })) }
        case 'excluded': return { status: 'excluded', workVersionId: paper.exclusion.workVersionId,
          reason: paper.exclusion.reason }
        case 'paused': return { status: 'paused', workVersionId: paper.pause.workVersionId, reason: paper.pause.reason }
      }
    }),
    report: result.report }
}

function settleStage(ran: boolean, successes: number, failures: number): AcademicResearchStageStatus {
  if (!ran) return 'not_run'
  if (failures > 0) return successes > 0 ? 'partial_success' : 'failed'
  return 'success'
}

export default AcademicResearchController
