/** Host Remote owner for one Session-backed Academic research pass. */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import {
  runAcademicResearchDraft,
  selectResearchPapers,
  type AcademicResearchDraftResult,
  type DraftPipelineAdapters,
} from '@deepseek-ai/dsh-academic-workflow'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-web'
import { researchPlanFromApprovedPlan } from './research-brief-plan.ts'
import { approvedSearchAdapter } from './search.ts'
import { hybridRetrievalView } from './hybrid-view.ts'
import * as academicPlanValidation from './plan-validation.ts'
import type {
  AcademicResearchRunRequest, AcademicResearchRunValue, AcademicResearchStageStatus, AcademicResearchPlanView,
} from './types.ts'

export type * from './types.ts'

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
  /** Total model attempts per paper. Only output-limit exhaustion is retried. Defaults to 2. */
  readonly extractionMaxAttempts?: number
}

/** Host service backing the generated `ctx.remote.academicResearch` namespace. */
export class AcademicResearchController extends TypertRemoteService {
  static inject = ['academicSource', 'sessionController', 'typert', 'web']

  static Config: z<Config> = z.object({
    paperConcurrency: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(3),
    fulltextFetchProvider: z.string().default('http'),
    extractionMaxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(16_384),
    extractionMaxAttempts: z.number().step(1).min(1).max(2).default(2),
  })

  private readonly fulltextFetchProvider: string
  private readonly paperConcurrency: number
  private readonly extractionMaxTokens: number
  private readonly extractionMaxAttempts: number

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
    try {
      const approved = researchPlanFromApprovedPlan(String(request.sessionId), agent.session.snapshotEvents())
      brief = approved.brief
      searches = approved.searches
      if (searches === undefined) throw new Error('当前已批准计划缺少检索方案，请在聊天中让系统补齐计划并重新审核，无需填写检索词。')
      if (brief.researchBriefId !== request.researchBriefId) throw new Error('研究计划已更新，请重新打开学术研究，确认最新计划后再开始。')
    } catch (cause: unknown) {
      throw new RemoteError('gateway/bad-request', cause instanceof Error ? cause.message : 'invalid Academic Research Brief', {},
        { cause })
    }
    const selectedModel = agent.session.requestHeader()?.config ?? agent.options
    if (selectedModel.provider === undefined || selectedModel.model === undefined) {
      throw new RemoteError('gateway/bad-request', 'the Session has no selected model', {})
    }
    const model: LlmCallConfig = { provider: selectedModel.provider, model: selectedModel.model,
      ...selectedModel.reasoningEffort === undefined ? {} : { reasoningEffort: selectedModel.reasoningEffort },
      maxTokens: selectedModel.maxTokens ?? this.extractionMaxTokens }
    const adapters: Omit<DraftPipelineAdapters, 'generator' | 'synthesize'> = {
      search: approvedSearchAdapter(searches, academicSource, web),
      selectPapers: (ingested, brief) => selectResearchPapers(ingested, brief, (_work, version) => {
        const fullText = academicSource.resolveFullText(version)
        if (fullText === null) return null
        return { ...fullText,
          extractionMethod: { method: 'dsh-academic-evidence', methodVersion: '1' }, hasHistoricalEvidence: false }
      }),
      fetcher: (url, operationSignal) => web.fetch(
        { url }, operationSignal, { providerId: this.fulltextFetchProvider },
      ),
      now: () => new Date().toISOString(),
    }
    let maintenance: Promise<AcademicResearchDraftResult>
    try {
      maintenance = agent.runMaintenance(agentSignal => runAcademicResearchDraft({
        ctx: agent.ctx,
        session: agent.session,
        model,
        modelPolicy: { maxAttempts: this.extractionMaxAttempts },
        input: { brief, paperConcurrency: this.paperConcurrency, searches: searches.map(search => ({ query: search.query,
          ...request.maxResults === undefined ? {} : { maxResults: request.maxResults } })), synthetic: request.synthetic },
        adapters,
        signal: AbortSignal.any([signal, agentSignal]),
      }))
    } catch (cause: unknown) {
      throw new RemoteError('session/agent-busy', `session "${request.sessionId}" already has active work`,
        { reason: 'academic research requires an idle Session' }, { cause })
    }
    return runValue(await maintenance)
  }
}

function runValue(result: AcademicResearchDraftResult): AcademicResearchRunValue {
  const searchFailures = result.retrievalRun.failures.filter(failure =>
    ['search', 'web_search', 'verify_reference'].includes(failure.operation)).length
  const fulltextFailures = result.failures.filter(failure => failure.stage === 'fulltext').length
  const extractionFailures = result.failures.filter(failure => failure.stage === 'extraction').length
    + result.papers.filter(paper => paper.status === 'paused' || paper.status === 'partially_extracted').length
  const extractionSuccesses = result.papers.filter(paper => paper.status === 'extracted'
    || paper.status === 'partially_extracted' || paper.status === 'excluded').length
  const incompleteSearch = result.completedSearchQueries !== undefined
    && result.completedSearchQueries.length < result.retrievalRun.queries.length
  return { sessionId: result.sessionId, status: result.status, synthesis: result.synthesis,
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
