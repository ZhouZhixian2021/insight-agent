/** Host Remote owner for one Session-backed Academic research pass. */
import { isDeepStrictEqual } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import {
  runAcademicResearchDraft,
  runAcademicEvidenceEnhancement,
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
import { fetchAcademicFullText } from '@deepseek-ai/dsh-academic-evidence'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-web'
import { researchPlanFromApproval } from './research-brief-plan.ts'
import { approvedPaperAdapters, type GapRoundPolicy } from './search.ts'
import { createModelCandidateReviewer, recordCandidateReviewSelection } from './candidate-review-model.ts'
import { approvedEvidenceQuestionTerms } from './candidate-screening.ts'
import { hybridRetrievalView } from './hybrid-view.ts'
import * as academicPlanValidation from './plan-validation.ts'
import { AcademicResearchRunQueue } from './run-stream.ts'
import { academicQ6Projection } from './q6-projection.ts'
import { AcademicBackgroundRuns, backgroundRunFromProjection, backgroundRunsFromProjection } from './background-run.ts'
import {
  academicResearchProjectionDefinition,
  recoveryEventsOf,
  requireAcademicResearchState,
} from './academic-research-projection.ts'
import type {
  AcademicResearchRunFrame, AcademicResearchRunRequest, AcademicResearchRunValue, AcademicResearchStageStatus,
  AcademicResearchPlanView, AcademicBackgroundRunKey, AcademicBackgroundRunCancelRequest, AcademicBackgroundRunView,
  AcademicBackgroundRunSummary,
  AcademicEvidenceEnhancementRequest, AcademicEvidenceEnhancementView,
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
  /** Final synthesis output-token reserve when the Session omits one. Defaults to 32,768. */
  readonly synthesisMaxTokens?: number
  /** Attempts per model input; a locally timed-out evidence input may split into two recovery inputs. Defaults to 2. */
  readonly extractionMaxAttempts?: number
  /** Delay before retrying a transient evidence extraction failure. Defaults to 10,000 ms. */
  readonly extractionRetryInitialDelayMs?: number
  /** Maximum estimated input tokens in one evidence batch. Defaults to 12,000. */
  readonly extractionBatchMaxInputTokens?: number
  /** Repeated source characters at adjacent long-segment boundaries. Defaults to 512. */
  readonly extractionBatchOverlapCharacters?: number
  /** Maximum elapsed time for one scope or evidence model attempt. Defaults to 150,000 ms. */
  readonly extractionAttemptTimeoutMs?: number
  /** Output-token reserve for one candidate metadata review. Defaults to 8,192. */
  readonly candidateReviewMaxTokens?: number
  /** Maximum elapsed time for one candidate metadata review. Defaults to 150,000 ms. */
  readonly candidateReviewAttemptTimeoutMs?: number
  /** Total semantic reviews across initial and evidence-gap rounds, independent of the Plan candidate limit. Defaults to 8. */
  readonly candidateReviewMaximumWorks?: number
  /** Simultaneous candidate model reviews; choose 1 or 2. Defaults to 1. */
  readonly candidateReviewConcurrency?: number
  /** Raw Academic records retained per initial query before eligibility screening. Defaults to 100. */
  readonly initialSearchMaximumAcademicResultsPerQuery?: number
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
  /** Total wall-clock bound for one selected paper's second-tier pass. Defaults to 180,000 ms. */
  readonly enhancementMaximumElapsedMs?: number
  /** Per-fragment model timeout during second-tier extraction. Defaults to 60,000 ms. */
  readonly enhancementAttemptTimeoutMs?: number
  /** Maximum output tokens per second-tier fragment. Defaults to 8,192. */
  readonly enhancementMaxTokens?: number
}

/** Host service backing the generated `ctx.remote.academicResearch` namespace. */
export class AcademicResearchController extends TypertRemoteService {
  static inject = ['academicSource', 'sessionController', 'sessionProjections', 'typert', 'web']

  static Config: z<Config> = z.object({
    paperConcurrency: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(3),
    fulltextFetchProvider: z.string().default('http'),
    extractionMaxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(16_384),
    synthesisMaxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(32_768),
    extractionMaxAttempts: z.number().step(1).min(1).max(2).default(2),
    extractionRetryInitialDelayMs: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(10_000),
    extractionBatchMaxInputTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(12_000),
    extractionBatchOverlapCharacters: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(512),
    extractionAttemptTimeoutMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(150_000),
    candidateReviewMaxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(8_192),
    candidateReviewAttemptTimeoutMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(150_000),
    candidateReviewMaximumWorks: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(8),
    candidateReviewConcurrency: z.number().step(1).min(1).max(2).default(1),
    initialSearchMaximumAcademicResultsPerQuery: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(100),
    synthesisMaxAttempts: z.number().step(1).min(1).max(3).default(3),
    synthesisRetryInitialDelayMs: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(1_000),
    initialCandidateBatchSize: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(8),
    evidenceGapCandidateBatchSize: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(4),
    replenishmentCandidateBatchSize: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(4),
    minimumQuestionSupportingWorks: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(1),
    gapRoundMaximumQueriesPerRound: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(4),
    gapRoundMaximumAcademicResultsPerQuery: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(20),
    enhancementMaximumElapsedMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(180_000),
    enhancementAttemptTimeoutMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(60_000),
    enhancementMaxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(8_192),
  })

  private readonly fulltextFetchProvider: string
  private readonly paperConcurrency: number
  private readonly extractionMaxTokens: number
  private readonly synthesisMaxTokens: number
  private readonly extractionMaxAttempts: number
  private readonly extractionRetryInitialDelayMs: number
  private readonly extractionBatchMaxInputTokens: number
  private readonly extractionBatchOverlapCharacters: number
  private readonly extractionAttemptTimeoutMs: number
  private readonly candidateReviewMaxTokens: number
  private readonly candidateReviewAttemptTimeoutMs: number
  private readonly candidateReviewMaximumWorks: number
  private readonly candidateReviewConcurrency: number
  private readonly initialSearchMaximumAcademicResultsPerQuery: number
  private readonly synthesisMaxAttempts: number
  private readonly synthesisRetryInitialDelayMs: number
  private readonly enhancementMaximumElapsedMs: number
  private readonly enhancementAttemptTimeoutMs: number
  private readonly enhancementMaxTokens: number
  private readonly candidateBatchPolicy: import('@deepseek-ai/dsh-academic-workflow').CandidateBatchPolicy
  private readonly gapRoundPolicy: GapRoundPolicy
  private readonly backgroundRuns = new AcademicBackgroundRuns()

  /**
   * @param ctx - Host context containing Session, Academic source, and Web fetch services.
   * @param config - deployment policy for Academic full-text retrieval.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'academicResearchController', { namespace: 'academicResearch' })
    this.paperConcurrency = config.paperConcurrency ?? 3
    this.fulltextFetchProvider = config.fulltextFetchProvider ?? 'http'
    this.extractionMaxTokens = config.extractionMaxTokens ?? 16_384
    this.synthesisMaxTokens = config.synthesisMaxTokens ?? 32_768
    this.extractionMaxAttempts = config.extractionMaxAttempts ?? 2
    this.extractionRetryInitialDelayMs = config.extractionRetryInitialDelayMs ?? 10_000
    this.extractionBatchMaxInputTokens = config.extractionBatchMaxInputTokens ?? 12_000
    this.extractionBatchOverlapCharacters = config.extractionBatchOverlapCharacters ?? 512
    this.extractionAttemptTimeoutMs = config.extractionAttemptTimeoutMs ?? 150_000
    this.candidateReviewMaxTokens = config.candidateReviewMaxTokens ?? 8_192
    this.candidateReviewAttemptTimeoutMs = config.candidateReviewAttemptTimeoutMs ?? 150_000
    this.candidateReviewMaximumWorks = config.candidateReviewMaximumWorks ?? 8
    this.candidateReviewConcurrency = config.candidateReviewConcurrency ?? 1
    this.initialSearchMaximumAcademicResultsPerQuery = config.initialSearchMaximumAcademicResultsPerQuery ?? 100
    this.synthesisMaxAttempts = config.synthesisMaxAttempts ?? 3
    this.synthesisRetryInitialDelayMs = config.synthesisRetryInitialDelayMs ?? 1_000
    this.enhancementMaximumElapsedMs = config.enhancementMaximumElapsedMs ?? 180_000
    this.enhancementAttemptTimeoutMs = config.enhancementAttemptTimeoutMs ?? 60_000
    this.enhancementMaxTokens = config.enhancementMaxTokens ?? 8_192
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
    ctx.sessionProjections.register(academicResearchProjectionDefinition)
    ctx.plugin(academicPlanValidation)
    ctx.effect(() => async () => { await this.backgroundRuns.dispose() }, 'academicResearchController.backgroundRuns')
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
      const { brief, searches } = this.approvedPlan(String(sessionId), found.agent.session)
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
   * Enhance one user-selected paper after its first-tier draft has settled.
   * @param request Completed run and selected paper identity.
   * @param signal Caller lifetime; cancellation preserves the original report and committed fragments.
   * @returns Separate evidence counts; this operation does not revise or approve the original report.
   */
  @Remote('enhanceEvidence')
  async enhanceEvidence(request: AcademicEvidenceEnhancementRequest,
    signal: AbortSignal): Promise<AcademicEvidenceEnhancementView> {
    signal.throwIfAborted()
    const found = await this.ctx.sessionController.resolveAgent(request.sessionId)
    if ('error' in found) throw found.error
    const { agent } = found
    const projection = this.projection(agent.session)
    const approved = this.approvedPlan(String(request.sessionId), agent.session)
    const history = reconstructAcademicResearchRecoveryState(recoveryEventsOf(projection,
      String(request.retrievalRunId)), {
      retrievalRunId: request.retrievalRunId, researchBriefId: approved.brief.researchBriefId,
      researchBriefVersion: approved.brief.version,
    })
    if (history.status !== 'completed' || history.input.checkpoint === null) {
      throw new RemoteError('gateway/bad-request', '只能补充已完成、且保留论文检查点的当前研究。', {})
    }
    const checkpoint = history.input.checkpoint
    const candidate = checkpoint.candidates.find(item => item.workVersionId === request.workVersionId)
    const paper = checkpoint.papers.find(item => (item.status === 'extracted' || item.status === 'partially_extracted')
      && item.version.workVersionId === request.workVersionId)
    if (candidate === undefined || paper === undefined || paper.status === 'paused' || paper.status === 'excluded'
      || paper.evidence.evidenceRecords.length === 0 || candidate.urls.length === 0) {
      throw new RemoteError('gateway/bad-request', '所选论文没有可补充的一级原文证据。', {})
    }
    const web = agent.ctx.get('web')
    if (!web) throw new RemoteError('gateway/internal', 'Academic Web fetch service is unavailable.', {})
    const selectedModel = agent.session.requestHeader()?.config ?? agent.options
    if (selectedModel.provider === undefined || selectedModel.model === undefined) {
      throw new RemoteError('gateway/bad-request', 'the Session has no selected model', {})
    }
    const model: LlmCallConfig = { provider: selectedModel.provider, model: selectedModel.model,
      ...selectedModel.reasoningEffort === undefined ? {} : { reasoningEffort: selectedModel.reasoningEffort },
      maxTokens: Math.min(selectedModel.maxTokens ?? this.enhancementMaxTokens, this.enhancementMaxTokens) }
    return agent.runMaintenance(async (agentSignal) => {
      const operationSignal = AbortSignal.any([signal, agentSignal,
        AbortSignal.timeout(this.enhancementMaximumElapsedMs)])
      if (this.projection(agent.session).enhancedRunIds.includes(String(request.retrievalRunId))) {
        throw new RemoteError('gateway/bad-request', '本轮已经选择一篇论文进行二级补充。', {})
      }
      const source = await fetchAcademicFullText({ academicWorkId: paper.version.academicWorkId,
        workVersionId: request.workVersionId, urls: candidate.urls, sourceProvider: candidate.sourceProvider,
        extractionMethod: candidate.extractionMethod, focusQuestions: approved.brief.questions,
        retrievedAt: new Date().toISOString() },
      (url, fetchSignal) => web.fetch({ url }, fetchSignal, { providerId: this.fulltextFetchProvider }), operationSignal)
      if (paper.version.contentHash.status !== 'available' || source.contentHash !== paper.version.contentHash.value) {
        throw new RemoteError('gateway/bad-request', '论文正文与一级证据的内容哈希不一致，未启动二级抽取。', {})
      }
      const selectedAt = new Date().toISOString()
      const selection = { schemaVersion: 1 as const, retrievalRunId: request.retrievalRunId,
        workVersionId: request.workVersionId, selectedAt }
      await persistAcademicEvent(agent.ctx, agent.session,
        agent.session.append('academic/evidence-enhancement-selection', selection))
      const settle = async (status: 'completed' | 'partial_success' | 'failed' | 'cancelled',
        addedEvidenceRecords: number, incompleteFragments: number) => {
        await persistAcademicEvent(agent.ctx, agent.session,
          agent.session.append('academic/evidence-enhancement-settlement', { ...selection, status,
            completedAt: new Date().toISOString(), addedEvidenceRecords, incompleteFragments }))
      }
      try {
        const result = await runAcademicEvidenceEnhancement({ ctx: agent.ctx, session: agent.session,
          model, source, initial: paper.evidence, signal: operationSignal,
          policy: { depth: 'complete', maxAttempts: 1, attemptTimeoutMs: this.enhancementAttemptTimeoutMs } })
        const addedEvidenceRecords = result.evidence.evidenceRecords.length - paper.evidence.evidenceRecords.length
        const incompleteFragments = result.incompleteFragments.length
        const status = incompleteFragments > 0 ? 'partial_success' : 'completed'
        await settle(status, addedEvidenceRecords, incompleteFragments)
        return { ...request, status, initialEvidenceRecords: paper.evidence.evidenceRecords.length,
          addedEvidenceRecords, incompleteFragments }
      } catch (cause: unknown) {
        await settle(operationSignal.aborted ? 'cancelled' : 'failed', 0, 0)
        throw cause
      }
    })
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

  /**
   * Start a Session-owned research task whose lifetime does not depend on the browser connection.
   * @param request Approved plan identity and bounded run options.
   * @param signal Caller lifetime used only before admission; disconnect after admission leaves the task running.
   * @returns Persisted initial state and its independent background run ID.
   */
  @Remote('startBackgroundRun')
  async startBackgroundRun(request: AcademicResearchRunRequest, signal: AbortSignal): Promise<AcademicBackgroundRunView> {
    signal.throwIfAborted()
    const found = await this.ctx.sessionController.resolveAgent(request.sessionId)
    if ('error' in found) throw found.error
    const approved = this.approvedPlan(String(request.sessionId), found.agent.session)
    if (approved.searches === undefined || approved.brief.researchBriefId !== request.researchBriefId) {
      throw new RemoteError('gateway/bad-request', '研究计划已更新或缺少检索方案，请重新打开学术研究确认计划。', {})
    }
    if (this.backgroundRuns.hasActiveSession(request.sessionId)) {
      throw new RemoteError('session/agent-busy', '当前会话已有正在运行的学术研究。',
        { reason: 'academic research already has an active background run' })
    }
    signal.throwIfAborted()
    const persist = (view: AcademicBackgroundRunView) => {
      found.agent.session.append('academic/background-run-state', view)
    }
    return this.backgroundRuns.start({ sessionId: request.sessionId, researchBriefId: request.researchBriefId,
      startedAt: new Date().toISOString() }, persist, (taskSignal, update) => this.execute(request, taskSignal,
      (progress) => { update({ retrievalRunId: progress.retrievalRunId,
        progress: { ...progress, sessionId: request.sessionId } }) },
      (observation) => { update({ retrievalRunId: observation.retrievalRunId,
        q6: academicQ6Projection(request.sessionId, observation) }) }).then(runValue))
  }

  /**
   * Read the latest Session-owned task state, including after a host restart.
   * @param key Session and background run identity.
   * @returns Latest durable state; an unclosed task from a previous host is marked interrupted.
   */
  @Remote('getBackgroundRun')
  async getBackgroundRun(key: AcademicBackgroundRunKey): Promise<AcademicBackgroundRunView> {
    const active = this.backgroundRuns.get(key.sessionId, key.backgroundRunId)
    if (active !== undefined) return active
    const found = await this.ctx.sessionController.resolveAgent(key.sessionId)
    if ('error' in found) throw found.error
    const projection = this.projection(found.agent.session)
    const view = backgroundRunFromProjection(key.sessionId, key.backgroundRunId,
      projection.backgroundRuns[key.backgroundRunId])
    if (view === undefined) throw new RemoteError('gateway/bad-request', '找不到当前会话的学术研究运行记录。', {})
    return view
  }

  /**
   * Find this Session's recent task IDs after a page refresh or reconnection.
   * @param sessionId Owning Session identity.
   * @returns At most 20 small discovery rows, oldest first, with live tasks overriding persisted snapshots.
   */
  @Remote('listBackgroundRuns')
  async listBackgroundRuns(sessionId: AcademicResearchRunRequest['sessionId']): Promise<readonly AcademicBackgroundRunSummary[]> {
    const found = await this.ctx.sessionController.resolveAgent(sessionId)
    if ('error' in found) throw found.error
    const projection = this.projection(found.agent.session)
    return backgroundRunsFromProjection(sessionId, projection.backgroundRunOrder,
      projection.backgroundRuns).slice(-20).map((saved) => {
      const { schemaVersion, backgroundRunId, researchBriefId, state, startedAt, updatedAt, retrievalRunId, cancelReason } =
        this.backgroundRuns.get(sessionId, saved.backgroundRunId) ?? saved
      return { schemaVersion, sessionId, backgroundRunId, researchBriefId, state, startedAt, updatedAt, retrievalRunId, cancelReason }
    })
  }

  /**
   * Subscribe to a task without taking ownership of its lifetime.
   * @param key Session and background run identity.
   * @param signal Subscriber lifetime; disconnect only ends this subscription.
   * @returns Current view followed by live updates, or one terminal/recovered view.
   */
  @Remote({ mode: 'stream' })
  async *watchBackgroundRun(key: AcademicBackgroundRunKey, signal: AbortSignal): AsyncIterable<AcademicBackgroundRunView> {
    const active = this.backgroundRuns.get(key.sessionId, key.backgroundRunId)
    if (active !== undefined) {
      let observed = false
      for await (const view of this.backgroundRuns.watch(key.sessionId, key.backgroundRunId, signal)) {
        observed = true
        yield view
      }
      if (observed || signal.aborted) return
    }
    signal.throwIfAborted()
    yield await this.getBackgroundRun(key)
  }

  /**
   * Explicitly cancel an active task; closing a viewer never calls this method.
   * @param request Session-owned run identity and user cancellation reason.
   * @returns Latest state, including the durable cancellation intent.
   */
  @Remote('cancelBackgroundRun')
  async cancelBackgroundRun(request: AcademicBackgroundRunCancelRequest): Promise<AcademicBackgroundRunView> {
    const found = await this.ctx.sessionController.resolveAgent(request.sessionId)
    if ('error' in found) throw found.error
    const active = this.backgroundRuns.cancel(request.sessionId, request.backgroundRunId,
      view => found.agent.session.append('academic/background-run-state', view))
    return active ?? this.getBackgroundRun(request)
  }

  private projection(session: Session) {
    return requireAcademicResearchState(
      this.ctx.sessionProjections.stateOf(session, 'academicResearch'), session,
    )
  }

  private approvedPlan(sessionId: string, session: Session) {
    const approved = this.projection(session).latestApprovedPlan
    if (approved === null) throw new Error('请先在当前会话完成研究计划审核。')
    return researchPlanFromApproval(sessionId, approved)
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
      const approved = this.approvedPlan(String(request.sessionId), agent.session)
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
      const reconstructed = reconstructAcademicResearchRecoveryState(recoveryEventsOf(this.projection(agent.session),
        String(request.resumeRetrievalRunId)), {
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
    const synthesisModel: LlmCallConfig = { ...model,
      maxTokens: selectedModel.maxTokens ?? this.synthesisMaxTokens }
    const questionTerms = approvedEvidenceQuestionTerms(brief.questions, candidateScreening)
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
        candidateScreening,
        candidateScreening === undefined ? undefined : createModelCandidateReviewer(agent.ctx, agent.session, model,
          { maxTokens: this.candidateReviewMaxTokens, attemptTimeoutMs: this.candidateReviewAttemptTimeoutMs }),
        this.initialSearchMaximumAcademicResultsPerQuery, this.candidateReviewMaximumWorks,
        { concurrency: this.candidateReviewConcurrency,
          recordSelection: (selection, roundIndex) => recordCandidateReviewSelection(agent.ctx, agent.session, {
            researchBriefId: brief.researchBriefId, researchBriefVersion: brief.version, roundIndex, selection,
          }) }),
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
        synthesisModel,
        modelPolicies: {
          evidence: { depth: 'minimal', maxAttempts: this.extractionMaxAttempts, retryOutputLimit: true,
            ...(questionTerms === undefined ? {} : { questionTerms }),
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

async function persistAcademicEvent(ctx: Context, session: Session, event: SessionEvent): Promise<void> {
  const sessions = ctx.get('sessions'), persistence = ctx.get('sessionPersistence')
  if (!sessions || !persistence || !await sessions.flush(session)) {
    throw new Error('Academic enhancement requires durable Session persistence.')
  }
  await using reader = await persistence.open(session.id, 'read')
  const [stored] = (await reader.read(event.seq, 1)).events
  if (!isDeepStrictEqual(stored, event)) throw new Error('Academic enhancement event was not retained by Session storage.')
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
