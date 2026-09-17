/** Host Remote owner for one Session-backed Academic research pass. */
import { Context } from '@deepseek-ai/cordis'
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
import { researchBriefFromApprovedPlan } from './research-brief-plan.ts'
import type { AcademicResearchRunRequest, AcademicResearchRunValue } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `academicResearch` Remote namespace. */
    academicResearchController: AcademicResearchController
  }
}

/** Host service backing the generated `ctx.remote.academicResearch` namespace. */
export class AcademicResearchController extends TypertRemoteService {
  static inject = ['academicSource', 'sessionController', 'typert', 'web']

  /** @param ctx - Host context containing Session, Academic source, and Web fetch services. */
  constructor(ctx: Context) {
    super(ctx, 'academicResearchController', { namespace: 'academicResearch' })
  }

  /**
   * Run one multi-source research pass while the addressed Agent is idle.
   * @param request - search query, disclosure, and the Session containing the approved brief plan.
   * @param signal - Remote caller lifetime; disconnect or cancellation aborts the pass.
   * @returns completed or cancelled draft data with its observed retrieval run and durable Session identity.
   */
  @Remote('run')
  async run(request: AcademicResearchRunRequest, signal: AbortSignal): Promise<AcademicResearchRunValue> {
    const found = await this.ctx.sessionController.resolveAgent(request.sessionId)
    if ('error' in found) throw found.error
    const { agent } = found
    let brief
    try {
      brief = researchBriefFromApprovedPlan(String(request.sessionId), agent.session.snapshotEvents())
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
      ...selectedModel.maxTokens === undefined ? {} : { maxTokens: selectedModel.maxTokens } }
    const adapters: Omit<DraftPipelineAdapters, 'generator'> = {
      search: (search, operationSignal) => agent.ctx.academicSource.searchAll(search, operationSignal),
      selectPapers: (ingested, brief) => selectResearchPapers(ingested, brief, (_work, version) => {
        const fullText = agent.ctx.academicSource.resolveFullText(version)
        if (fullText === null) return null
        return { ...fullText,
          extractionMethod: { method: 'dsh-academic-evidence', methodVersion: '1' }, hasHistoricalEvidence: false }
      }),
      fetcher: (url, operationSignal) => agent.ctx.web.fetch({ url }, operationSignal),
      now: () => new Date().toISOString(),
    }
    let maintenance: Promise<AcademicResearchDraftResult>
    try {
      maintenance = agent.runMaintenance(agentSignal => runAcademicResearchDraft({
        ctx: agent.ctx,
        session: agent.session,
        model,
        input: { brief, search: { query: request.query,
          ...request.maxResults === undefined ? {} : { maxResults: request.maxResults } }, synthetic: request.synthetic },
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
  return { sessionId: result.sessionId, status: result.status, retrievalRun: result.retrievalRun,
    failures: result.failures.map(failure => ({ workVersionId: failure.workVersionId, stage: failure.stage })),
    papers: result.papers.map((paper) => {
      switch (paper.status) {
        case 'extracted': return { status: 'extracted', workVersionId: paper.version.workVersionId,
          evidenceCount: paper.evidence.evidenceRecords.length }
        case 'excluded': return { status: 'excluded', workVersionId: paper.exclusion.workVersionId,
          reason: paper.exclusion.reason }
        case 'paused': return { status: 'paused', workVersionId: paper.pause.workVersionId, reason: paper.pause.reason }
      }
    }),
    report: result.report }
}

export default AcademicResearchController
