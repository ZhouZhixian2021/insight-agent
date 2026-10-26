/** Live single-paper acceptance through the shipped Web composition; approval is a fixed test input. */
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type {} from '@deepseek-ai/dsh-api-academic-research-controller'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { launchWebScaffold, rawSessionLog, type WebScaffold } from '../../../../apps/web/tests/scaffold.ts'
import { REPO_ROOT } from '../../../../apps/web/tests/support.ts'
import { replayBackgroundRun } from '../src/background-run.ts'

it.skipIf(!process.env.DEEPSEEK_API_KEY)('retrieves, deduplicates, reviews and extracts a fixed arXiv paper',
  { timeout: 600_000, retry: 0 }, async () => {
    const artifactRoot = join(REPO_ROOT, '.artifacts', 'academic-single-paper')
    await mkdir(artifactRoot, { recursive: true })
    const artifacts = await mkdtemp(join(artifactRoot, 'run-'))
    const checkout = {
      directory: REPO_ROOT,
      branch: execFileSync('git', ['-C', REPO_ROOT, 'branch', '--show-current'], { encoding: 'utf8' }).trim(),
      commit: execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    }
    vi.stubEnv('DSH_SNAPSHOT', 'record')
    let scaffold: WebScaffold | undefined
    let sessionId: SessionId | undefined
    try {
      const patch = process.env.ACADEMIC_LIVE_PATCH
      scaffold = await launchWebScaffold({ agentPresets: { default: 'academic' },
        ...(patch === undefined ? {} : { extraOverlayPath: patch }) })
      scaffold.ctx.on('session/event', (_session, event) => {
        if (event.type === 'academic/candidate-semantic-review-result-v1'
          || event.type === 'academic/evidence-result' || event.type === 'academic/synthesis-result') {
          console.log(JSON.stringify({ event: event.type, status: event.data.status,
            ...('phase' in event.data ? { phase: event.data.phase } : {}) }))
        }
      })
      const metadata = { ...checkout, baseUrl: scaffold.baseUrl, workspace: scaffold.workspaceCwd,
        harnessHome: scaffold.harnessHome, persistenceRoot: scaffold.persistenceRoot,
        model: scaffold.ctx.agentDefaultModel.currentSelection(), overlay: patch ?? null }
      await writeFile(join(artifacts, 'environment.json'), JSON.stringify(metadata, null, 2) + '\n')
      console.log('Academic single-paper artifacts: ' + artifacts)
      const sample = await readFile(join(REPO_ROOT,
        'z-team_docs/interface-samples/academic-model-v1/academic-pe1-plan.sample.md'), 'utf8')
      const payload = JSON.parse(sample.match(/```academic-research-brief-json\s*\n([\s\S]*?)\n```/u)![1]!) as Record<string, unknown>
      const question = 'What neural architecture does Attention Is All You Need propose?'
      Object.assign(payload, {
        schemaVersion: 5, topic: 'Attention Is All You Need: architecture', aliases: ['Transformer'], questions: [question],
        publicationWindow: { start: null, end: null, dateBasis: 'first_public_release' },
        includedWorkTypes: ['preprint'], inclusionRules: ['The paper proposes the Transformer architecture.'], exclusionRules: [],
        candidateScreening: { questions: [{ question, concepts: [['Transformer', 'attention', 'self-attention']] }],
          methods: [['self-attention', 'Transformer']], evidence: [['machine translation', 'BLEU']], contributions: [] },
        searchPlan: ['"Attention Is All You Need" AND au:Vaswani', '"Attention Is All You Need" AND au:Shazeer'].map(query => ({
          query, purpose: 'Locate the same fixed paper by its title and two author constraints.', questions: [question],
          retrieval: { channels: ['academic'], academicProviders: ['arxiv'], verificationProviders: [],
            maximumWebDiscoveryResults: 0, maximumReferenceVerifications: 0 },
        })),
        evidenceRequirements: { minimumIncludedWorks: 1, targetIncludedWorks: 1, minimumFulltextWorks: 1,
          minimumEvidenceLevel: 'fulltext', requireLocatableEvidence: true, allowPreprints: true,
          insufficientEvidencePolicy: 'continue_with_warning' },
        reportRequirements: { language: 'zh-CN', targetLength: { unit: 'characters', minimum: null, maximum: null },
          requiredSections: ['scope_and_method', 'technology_overview', 'limitations', 'references', 'evidence_appendix'],
          citationStyle: 'numeric', includeEvidenceAppendix: true, includeMethodology: true,
          includeLimitations: true, includeResearchGaps: false },
        stopConditions: { maximumSearchRounds: 2, maximumCandidateWorks: 1, maximumIncludedWorks: 1,
          maximumElapsedMinutes: 8, saturationRounds: 1, stopWhenEvidenceRequirementsMet: true },
        assumptions: ['Single-paper acceptance; this does not establish cross-paper findings.'],
      })
      const plan = '# Fixed-paper architecture review\n\nRead the Transformer paper and retain locatable full-text evidence.\n\n'
        + '```academic-research-brief-json\n' + JSON.stringify(payload, null, 2) + '\n```'
      const created = await scaffold.ctx.sessionController.create({ cwd: scaffold.workspaceCwd, agentPreset: 'academic' })
      sessionId = created.sessionId
      const agent = scaffold.ctx.agents.get(sessionId)
      if (agent === undefined) throw new Error('No Academic Agent was created')
      const callId = ToolCallId('fixed-paper-approved-plan')
      const argumentsJson = JSON.stringify({ plan })
      agent.session.append('turn/start', { turn: 1 })
      agent.session.append('step/start', { turn: 1, step: 1 })
      agent.session.append('assistant/message', { turn: 1, step: 1,
        message: createAssistantMessage({ source: { provider: 'fixture', model: 'approved-plan' },
          content: [{ type: 'tool-call', id: callId, name: 'exit_plan_mode', arguments: argumentsJson }] }),
        stream: [{ type: 'tool-call-chunks', time0: Date.now(), index: 0, dt: [],
          id: callId, name: 'exit_plan_mode', args: [argumentsJson] }],
      }, { surfaceOp: 'append' })
      const approvalCall = agent.session.append('tool/call', { turn: 1, step: 1, callId,
        name: 'exit_plan_mode', arguments: argumentsJson })
      agent.session.append('tool/result', { turn: 1, step: 1,
        message: createToolResultMessage({ callId, content: [{ type: 'text', text: 'Approved fixed test plan.' }], isError: false }),
      }, { surfaceOp: 'append', sourceEventSeqs: [approvalCall.seq] })
      agent.session.append('step/end', { turn: 1, step: 1 })
      agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      expect(await scaffold.ctx.sessions.flush(agent.session)).toBe(true)
      {
        await using approvalReader = await scaffold.ctx.sessionPersistence.open(sessionId, 'read')
        expect((await approvalReader.read()).events.some(event => event.type === 'tool/result')).toBe(true)
      }
      const approved = await scaffold.ctx.academicResearchController.plan(sessionId)
      const controller = scaffold.ctx.academicResearchController
      const started = await controller.startBackgroundRun({ sessionId, researchBriefId: approved.researchBriefId,
        maxResults: 1, synthetic: false }, AbortSignal.timeout(480_000))
      const subscriber = new AbortController()
      const watch = controller.watchBackgroundRun(started, subscriber.signal)[Symbol.asyncIterator]()
      const first = await watch.next()
      if (first.done) throw new Error('Background subscription ended before its initial view')
      expect(first.value.state).toBe('running')
      subscriber.abort()
      await watch.return?.()
      await expect.poll(async () => (await controller.getBackgroundRun(started)).state,
        { timeout: 480_000, interval: 500 }).not.toBe('running')
      const settled = await controller.getBackgroundRun(started)
      expect(settled).toMatchObject({ state: 'completed', cancelReason: null })
      const result = settled.result
      if (result === null) throw new Error('Completed background run did not retain its result')
      await writeFile(join(artifacts, 'result.json'), JSON.stringify(result, null, 2) + '\n')
      expect(result.stages).toEqual({ search: 'success', fulltext: 'success', extraction: 'success' })
      expect(result.retrievalRun.coverageSummary.discoveredRecords).toBeGreaterThanOrEqual(2)
      expect(result.retrievalRun.coverageSummary.deduplicatedWorks).toBe(1)
      expect(result.papers).toHaveLength(1)
      expect(result.papers[0]?.status).toBe('extracted')
      const events = (await scaffold.ctx.sessionQuery.readSession(sessionId)).events
      const reviews = events.filter(event => event.type === 'academic/candidate-semantic-review-verified-v1')
      expect(reviews).toHaveLength(1)
      const synthesis = events.find(event => event.type === 'academic/synthesis-request')
      if (synthesis === undefined) throw new Error('No verified evidence reached synthesis; inspect result.json')
      const { evidenceRecords, sourceLocators } = synthesis.data.input.analysisInput
      expect(evidenceRecords.length).toBeGreaterThan(0)
      expect(evidenceRecords.length).toBeLessThanOrEqual(5)
      expect(new Set(evidenceRecords.map(record => record.workVersionId)))
        .toEqual(new Set([result.papers[0]!.workVersionId]))
      for (const record of evidenceRecords) {
        expect(record.level).toBe('fulltext')
        expect(record.verbatimExcerpt.status).toBe('available')
        expect(record.contentHash.status).toBe('available')
        expect(record.sourceUrl).toMatch(/^https:\/\/arxiv\.org\/(?:pdf|html)\/1706\.03762/u)
        const locator = sourceLocators.find(item => item.sourceLocatorId === record.sourceLocatorId)
        expect(locator?.workVersionId).toBe(record.workVersionId)
        expect(locator?.kind).not.toBe('provider_record')
      }
      expect(await scaffold.ctx.sessions.flush(agent.session)).toBe(true)
      await using reader = await scaffold.ctx.sessionPersistence.open(sessionId, 'read')
      const persisted = (await reader.read()).events
      expect(persisted.filter(event => event.type === 'academic/evidence-result').length).toBeGreaterThanOrEqual(2)
      expect(persisted.some(event => event.type === 'academic/run-settlement')).toBe(true)
      expect(replayBackgroundRun(sessionId, started.backgroundRunId, persisted)).toEqual(settled)
      await writeFile(join(artifacts, 'evidence.json'), JSON.stringify({ evidenceRecords, sourceLocators }, null, 2) + '\n')
    } finally {
      try {
        if (scaffold !== undefined && sessionId !== undefined) {
          const agent = scaffold.ctx.agents.get(sessionId)
          if (agent !== undefined) await writeFile(join(artifacts, 'session.v4.jsonl'), rawSessionLog(agent.session))
        }
      } finally {
        try { await scaffold?.close() } finally { vi.unstubAllEnvs() }
      }
    }
  })
