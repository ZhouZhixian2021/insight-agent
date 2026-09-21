/** Host Remote owner for one Session-backed Academic research pass. */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import {
  MAX_DRAFT_SEARCH_QUERIES,
  runAcademicResearchDraft,
  selectResearchPapers,
  type AcademicResearchDraftResult,
  type DraftPipelineAdapters,
} from '@deepseek-ai/dsh-academic-workflow'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-web'
import { researchBriefFromApprovedPlan } from './research-brief-plan.ts'
import * as academicPlanValidation from './plan-validation.ts'
import type {
  AcademicResearchRunRequest, AcademicResearchRunValue, AcademicResearchStageStatus,
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
    fulltextFetchProvider: z.string().default('http'),
    extractionMaxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(16_384),
    extractionMaxAttempts: z.number().step(1).min(1).max(2).default(2),
  })

  private readonly fulltextFetchProvider: string
  private readonly extractionMaxTokens: number
  private readonly extractionMaxAttempts: number

  /**
   * @param ctx - Host context containing Session, Academic source, and Web fetch services.
   * @param config - deployment policy for Academic full-text retrieval.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'academicResearchController', { namespace: 'academicResearch' })
    this.fulltextFetchProvider = config.fulltextFetchProvider ?? 'http'
    this.extractionMaxTokens = config.extractionMaxTokens ?? 16_384
    this.extractionMaxAttempts = config.extractionMaxAttempts ?? 2
    ctx.plugin(academicPlanValidation)
  }

  /**
   * Run one multi-source research pass while the addressed Agent is idle.
   * @param request - one to three newline-separated queries, disclosure, and the Session containing the approved brief plan.
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
    try {
      brief = researchBriefFromApprovedPlan(String(request.sessionId), agent.session.snapshotEvents())
    } catch (cause: unknown) {
      throw new RemoteError('gateway/bad-request', cause instanceof Error ? cause.message : 'invalid Academic Research Brief', {},
        { cause })
    }
    let queries: readonly string[]
    try {
      queries = parseResearchQueries(request.query, brief.stopConditions.maximumSearchRounds)
    } catch (cause: unknown) {
      throw new RemoteError('gateway/bad-request', cause instanceof Error ? cause.message : 'invalid Academic search queries', {},
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
      search: (search, operationSignal) => academicSource.searchAll(search, operationSignal),
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
        input: { brief, searches: queries.map(query => ({ query,
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

/** Parse one browser string into ordered, non-empty, distinct queries without changing the Remote shape. */
function parseResearchQueries(value: string, approvedMaximumRounds: number): readonly string[] {
  if (typeof value !== 'string') throw new Error('Academic search queries must be a string.')
  const queries = [...new Set(value.split(/\r?\n/u).map(query => query.trim()).filter(query => query.length > 0))]
  if (queries.length === 0) throw new Error('At least one Academic search query is required.')
  const maximum = Math.min(MAX_DRAFT_SEARCH_QUERIES, approvedMaximumRounds)
  if (queries.length > maximum) throw new Error(`Academic search query count exceeds the approved bound of ${maximum}.`)
  return queries
}

function runValue(result: AcademicResearchDraftResult): AcademicResearchRunValue {
  const searchFailures = result.retrievalRun.failures.filter(failure => failure.operation === 'search').length
  const fulltextFailures = result.failures.filter(failure => failure.stage === 'fulltext').length
  const extractionFailures = result.failures.filter(failure => failure.stage === 'extraction').length
    + result.papers.filter(paper => paper.status === 'paused' || paper.status === 'partially_extracted').length
  const extractionSuccesses = result.papers.filter(paper => paper.status === 'extracted'
    || paper.status === 'partially_extracted' || paper.status === 'excluded').length
  return { sessionId: result.sessionId, status: result.status, synthesis: result.synthesis,
    stages: {
      search: settleStage(result.retrievalRun.queries.length > 0,
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
