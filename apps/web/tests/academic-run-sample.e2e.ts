import { AcademicTraceRecorder } from '../../../packages/api/academic-research-controller/src/trace.ts'
import { academicTraceSpan } from '@deepseek-ai/dsh-academic-workflow'
import { academicTraceSpanId } from '@deepseek-ai/dsh-academic-model'
/** Real Loader, Session, Controller and browser preview using an approved synthetic plan. */
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { launchWebScaffold, seedSession } from './scaffold.ts'
import { sampleRun } from '../../../packages/client/ui-academic-research/tests/run-sample.ts'
import { newEnglishPage } from './support.ts'

describe('hybrid plan browser preview', () => {
  it('downloads standalone HTML and reads persisted Trace through the real Web Remote', async () => {
    const scaffold = await launchWebScaffold({})
    try {
      const value = { ...sampleRun(), q6: null }
      const id = await seedSession(scaffold, await readFile('snapshots/web/seeded-history/session.v2.jsonl', 'utf8'), value.sessionId)
      await scaffold.ctx.sessionController.rename({ sessionId: id, title: 'HTML and Trace acceptance' })
      const found = await scaffold.ctx.sessionController.resolveAgent(id)
      if ('error' in found) throw found.error
      const recorder = new AcademicTraceRecorder(found.agent.session, value.retrievalRun.retrievalRunId)
      const work = value.report.evidence[0]!
      const call = { ...academicTraceSpan('fixture-call', academicTraceSpanId(`paper:extraction:${work.workVersionId}`), 'call', 'extraction', 'evidence_extract'),
        academicWorkId: work.academicWorkId, workVersionId: work.workVersionId }
      recorder.observe(call)
      const attempt = { ...call, spanId: academicTraceSpanId('fixture-attempt'), parentSpanId: call.spanId, kind: 'attempt' as const, attemptIndex: 1 }
      recorder.observe(attempt); recorder.observe({ ...attempt, status: 'failed', failure: { code: 'timeout', phase: 'before_content', message: 'Observed deadline.' } })
      recorder.observe({ ...call, status: 'failed' }); recorder.settle('partial_success')
      const task = { schemaVersion: 1 as const, sessionId: id, backgroundRunId: 'trace-preview',
        researchBriefId: value.retrievalRun.researchBriefId, state: 'completed' as const,
        startedAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:01:00Z',
        retrievalRunId: value.retrievalRun.retrievalRunId, progress: null, q6: value.q6, result: value, error: null, cancelReason: null }
      found.agent.session.append('academic/background-run-state', task)
      await found.agent.ctx.sessions.flush(found.agent.session)
      const controller = scaffold.ctx.get('academicResearchController')!
      const plan = vi.spyOn(controller, 'plan').mockResolvedValue({ researchBriefId: task.researchBriefId, topic: 'HTML and Trace acceptance', questions: [], searches: [] })
      const browser = await chromium.launch({ channel: process.env.DSH_ACADEMIC_BROWSER_CHANNEL ?? 'chromium' })
      try {
        const page = await newEnglishPage(browser)
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        await page.getByText('Ungrouped', { exact: true }).click()
        await page.getByText('HTML and Trace acceptance', { exact: true }).click()
        await page.getByRole('button', { name: 'Academic research', exact: true }).click()
        const trace = page.getByRole('region', { name: 'Research call trace' })
        await trace.getByRole('button', { name: 'Read Trace', exact: true }).click()
        await trace.getByText('Operation identity: fixture-attempt', { exact: false }).waitFor()
        expect(await trace.innerText()).toContain('Actual attempts: 1')
        const downloadPromise = page.waitForEvent('download')
        await page.getByRole('button', { name: 'Download HTML', exact: true }).click()
        const download = await downloadPromise
        expect(download.suggestedFilename()).toBe('academic-report.html')
        const path = await download.path()
        const html = await readFile(path, 'utf8')
        expect(html).toContain('Content-Security-Policy')
        expect(html).toContain(value.report.evidence[0]!.evidenceId)
        expect(html).not.toContain('<script')
        const capture = process.env.DSH_ACADEMIC_CAPTURE_DIR
        if (capture !== undefined) {
          await mkdir(capture, { recursive: true })
          await page.screenshot({ path: join(capture, 'html-trace-web.png') })
          await download.saveAs(join(capture, 'academic-report.html'))
        }
        await page.reload({ waitUntil: 'load' })
        await page.getByRole('button', { name: 'Academic research', exact: true }).click()
        await page.getByRole('button', { name: 'Read Trace', exact: true }).click()
        await page.getByText('Operation identity: fixture-attempt', { exact: false }).waitFor()
        const persistence = found.agent.ctx.get('sessionPersistence')
        if (persistence === undefined) throw new Error('Session persistence fixture is required')
        await using reader = await persistence.open(id, 'read')
        expect((await reader.read()).some(event => event.type === 'academic/trace-v1')).toBe(true)
      } finally { plan.mockRestore(); await browser.close() }
    } finally { await scaffold.close() }
  })

  it('opens the Q6 fixed JSON demo, filters candidates and inspects coverage without starting research', async () => {
    const scaffold = await launchWebScaffold({})
    const controller = scaffold.ctx.get('academicResearchController')
    if (controller === undefined) { await scaffold.close(); throw new Error('Academic Controller is required') }
    const plan = vi.spyOn(controller, 'plan'), run = vi.spyOn(controller, 'startBackgroundRun')
    try {
      const browser = await chromium.launch({ channel: process.env.DSH_ACADEMIC_BROWSER_CHANNEL ?? 'chromium' })
      try {
        const page = await newEnglishPage(browser)
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        await page.getByRole('button', { name: 'Q6 read-only demo', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Q6 plan and candidate preview' })
        await dialog.waitFor()
        expect(await dialog.getByRole('note').innerText()).toContain('Fixed synthetic JSON')
        expect(await dialog.getByRole('button', { name: 'Start research from plan' }).count()).toBe(0)
        const capture = process.env.DSH_Q6_CAPTURE_DIR
        if (capture !== undefined) {
          await mkdir(capture, { recursive: true })
          await page.screenshot({ path: join(capture, 'q6-plan.png') })
        }
        await dialog.getByRole('button', { name: 'Candidate classification and queues', exact: true }).click()
        await dialog.getByRole('searchbox', { name: 'Search candidates' }).fill('work-version-candidate-b')
        await dialog.getByText('Inspect scores and provenance', { exact: true }).click()
        expect(await dialog.getByText('The provider adapter does not retain keywords.', { exact: false }).count()).toBe(1)
        expect(await dialog.getByRole('heading', { name: 'work-version-candidate-a', exact: true }).count()).toBe(0)
        if (capture !== undefined) await page.screenshot({ path: join(capture, 'q6-candidates.png') })
        await dialog.getByRole('button', { name: 'Evidence coverage by question', exact: true }).click()
        await dialog.getByRole('combobox', { name: 'Demo snapshot' }).selectOption('2')
        expect(await dialog.getByText('No independent empirical comparison is available.', { exact: true }).count()).toBe(1)
        expect(await dialog.getByRole('progressbar').count()).toBe(0)
        expect(await dialog.getByRole('region', { name: 'Funnel snapshots' }).innerText()).toMatchSnapshot()
        if (capture !== undefined) await page.screenshot({ path: join(capture, 'q6-coverage.png') })
        expect(plan).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled()
        await dialog.getByRole('button', { name: 'Run lifecycle preview', exact: true }).click()
        const lifecycle = dialog.getByRole('region', { name: 'Research run and stages' })
        expect(await lifecycle.getByText('Phase-one fixed JSON preview', { exact: false }).count()).toBe(1)
        expect(await lifecycle.getByRole('progressbar').count()).toBe(0)
        if (capture !== undefined) await page.screenshot({ path: join(capture, 'lifecycle-running.png') })
        await lifecycle.getByRole('button', { name: 'Disconnect preview', exact: true }).click()
        expect(await lifecycle.innerText()).toContain('Viewing disconnected; run state unchanged')
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        expect(await page.getByRole('dialog').count()).toBe(0)
        await page.getByRole('button', { name: 'Q6 read-only demo', exact: true }).click()
        expect(await lifecycle.innerText()).toContain('demo-running')
        await lifecycle.getByRole('combobox', { name: 'Demo run record' }).selectOption('demo-completed_with_limitations')
        await lifecycle.getByRole('button', { name: 'Download demo draft' }).waitFor()
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        await page.getByRole('button', { name: 'Q6 read-only demo', exact: true }).click()
        await lifecycle.getByRole('button', { name: 'Download demo draft' }).waitFor()
        if (capture !== undefined) await page.screenshot({ path: join(capture, 'lifecycle-reopened.png') })
        expect(plan).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled()
      } finally { await browser.close() }
    } finally { plan.mockRestore(); run.mockRestore(); await scaffold.close() }
  })
  it('shows the real prerequisite error for a Session without an approved plan', async () => {
    const scaffold = await launchWebScaffold({})
    try {
      const id = await seedSession(scaffold, await readFile('snapshots/web/seeded-history/session.v2.jsonl', 'utf8'), 'academic-no-plan')
      await scaffold.ctx.sessionController.rename({ sessionId: id, title: 'Academic prerequisite test' })
      const browser = await chromium.launch({ channel: process.env.DSH_ACADEMIC_BROWSER_CHANNEL ?? 'chromium' })
      try {
        const page = await newEnglishPage(browser)
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        await page.getByText('Ungrouped', { exact: true }).click()
        await page.getByText('Academic prerequisite test', { exact: true }).click()
        await page.getByRole('button', { name: 'Academic research', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Research run results' })
        await dialog.getByRole('alert').waitFor()
        expect(await dialog.getByRole('alert').innerText()).toContain('请先在当前会话完成研究计划审核')
        expect(await dialog.getByRole('textbox').count()).toBe(0)
        expect(await dialog.getByRole('button', { name: 'Start research from plan' }).count()).toBe(0)
        expect(await dialog.getByRole('progressbar').count()).toBe(0)
      } finally { await browser.close() }
    } finally { await scaffold.close() }
  })
  it('streams real workflow progress and a blocked result through Remote with controlled external sources', async () => {
    const scaffold = await launchWebScaffold({})
    try {
      const raw = await readFile('snapshots/sdk/academic-plan-chinese/session.v2.jsonl', 'utf8')
      const rows = raw.trim().split('\n').map(line => JSON.parse(line) as {
        type: string
        data?: {
          name?: string
          arguments?: string
          message?: { content: { toolCallId?: string; isError?: boolean; content?: unknown[] }[] }
        }
      })
      const call = rows.findLast(row => row.type === 'tool/call' && row.data?.name === 'exit_plan_mode')!
      const args = JSON.parse(call.data!.arguments!) as { plan: string }
      const match = /```academic-research-brief-json\s*([\s\S]*?)```/u.exec(args.plan)!
      const payload = JSON.parse(match[1]!) as { schemaVersion: number; searchPlan: { retrieval?: unknown }[] }
      payload.schemaVersion = 3
      for (const search of payload.searchPlan) search.retrieval = {
        channels: ['academic', 'web_discovery'], academicProviders: ['openalex', 'arxiv'],
        verificationProviders: ['openalex', 'arxiv', 'acl', 'pmlr', 'cvf'],
        maximumWebDiscoveryResults: 8, maximumReferenceVerifications: 5,
      }
      call.data!.arguments = JSON.stringify({ plan: args.plan.replace(match[1]!, `${JSON.stringify(payload)}\n`) })
      // The recorded fixture has no reviewer. Materialize an explicitly synthetic approval for this isolated Session.
      const approval = rows.findLast(row => row.type === 'tool/result')!.data!.message!.content[0]!
      approval.isError = false
      approval.content = [{ type: 'text', text: 'Synthetic test approval; no live research authorized.' }]
      const id = SessionId('academic-hybrid-preview')
      await seedSession(scaffold, rows.map(row => JSON.stringify(row)).join('\n'), id)
      await scaffold.ctx.sessionController.rename({ sessionId: id, title: 'Synthetic hybrid preview (no network)' })
      const resolved = await scaffold.ctx.sessionController.resolveAgent(id)
      if ('error' in resolved) throw resolved.error
      const source = resolved.agent.ctx.get('academicSource')
      const web = resolved.agent.ctx.get('web')
      if (source === undefined || web === undefined) throw new Error('Academic source and Web must be mounted by the real composition')
      let finishSearch!: () => void
      const searchGate = new Promise<void>((resolve) => { finishSearch = resolve })
      // Mock only external discovery; Controller, workflow, Session and transport remain real.
      const search = vi.spyOn(source, 'searchProviders').mockImplementation(async () => {
        await searchGate
        return { works: [], batch: { schemaVersion: 1, status: 'success', items: [], failures: [] },
          providers: ['openalex', 'arxiv'], discoveredRecords: 0, limitations: ['Synthetic empty-source browser test'], truncated: false }
      })
      const webSearch = vi.spyOn(web, 'search').mockResolvedValue({ sources: [], content: '', truncated: false })
      const controller = scaffold.ctx.get('academicResearchController')!
      const backgroundStart = vi.spyOn(controller, 'startBackgroundRun')
      const backgroundCancel = vi.spyOn(controller, 'cancelBackgroundRun')
      const browser = await chromium.launch({ channel: process.env.DSH_ACADEMIC_BROWSER_CHANNEL ?? 'chromium' })
      try {
        const page = await newEnglishPage(browser)
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        await page.getByRole('button', { name: 'Academic research', exact: true }).waitFor({ timeout: 30_000 })
        await page.getByText('Ungrouped', { exact: true }).click()
        await page.getByText('Synthetic hybrid preview (no network)', { exact: true }).click()
        await page.getByRole('button', { name: 'Academic research', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Research run results' })
        try {
          await dialog.getByRole('button', { name: 'Start research from plan' }).waitFor({ timeout: 10_000 })
        } catch (error) {
          throw new Error(await dialog.innerText(), { cause: error })
        }
        expect(await dialog.getByText('openalex, arxiv', { exact: true }).count()).toBeGreaterThan(0)
        expect(await dialog.getByText('openalex, arxiv, acl, pmlr, cvf', { exact: true }).count()).toBeGreaterThan(0)
        expect(await dialog.getByRole('textbox').count()).toBe(0)
        expect(await dialog.getByRole('progressbar').count()).toBe(0)
        const policies = dialog.getByRole('region', { name: 'Planned search directions' })
        expect(await policies.innerText()).toMatchSnapshot()
        const capture = process.env.DSH_ACADEMIC_CAPTURE_DIR
        if (capture !== undefined) {
          await mkdir(capture, { recursive: true })
          await page.screenshot({ path: join(capture, 'hybrid-plan.png') })
          await dialog.getByText('Executed query', { exact: true }).first().click()
          await page.screenshot({ path: join(capture, 'hybrid-query.png') })
        }
        await dialog.getByRole('button', { name: 'Start research from plan' }).click()
        const progress = dialog.getByRole('region', { name: 'Research progress' })
        try { await progress.waitFor({ timeout: 10_000 }) } catch (error) { throw new Error(await dialog.innerText(), { cause: error }) }
        expect(await progress.innerText()).toContain('retrieval augmented generation hallucination')
        expect(await dialog.getByRole('button', { name: 'Start research from plan' }).isDisabled()).toBe(true)
        if (capture !== undefined) await page.screenshot({ path: join(capture, 'live-running.png') })
        const records = await controller.listBackgroundRuns(id)
        expect(records).toHaveLength(1)
        const key = { sessionId: id, backgroundRunId: records[0]!.backgroundRunId }
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        expect((await controller.getBackgroundRun(key)).state).toBe('running')
        expect(backgroundCancel).not.toHaveBeenCalled()
        await page.reload({ waitUntil: 'load' })
        await page.getByRole('button', { name: 'Academic research', exact: true }).click()
        await dialog.getByText('Observing background task', { exact: true }).waitFor()
        expect(await dialog.innerText()).toContain(key.backgroundRunId)
        expect(backgroundStart).toHaveBeenCalledTimes(1)
        if (capture !== undefined) await page.screenshot({ path: join(capture, 'background-reopened.png') })
        finishSearch()
        await dialog.getByRole('heading', { name: 'Coverage', exact: true }).waitFor()
        const q6 = dialog.getByRole('region', { name: 'Q6 results for this research run' })
        await q6.waitFor()
        const evidenceCoverage = q6.getByRole('region', { name: 'Evidence coverage by question' })
        expect(await evidenceCoverage.innerText()).toContain('Uncovered')
        expect(await evidenceCoverage.innerText()).toContain('No entries')
        expect(await q6.getByRole('note').count()).toBe(0)
        // Q5 may issue a distinct gap query; the approved initial query must still run only once.
        expect(search.mock.calls.filter(([request]) => request.query === 'retrieval augmented generation hallucination')).toHaveLength(1)
        expect(webSearch).toHaveBeenCalledTimes(1)
        expect(await progress.innerText()).toContain('not run')
        expect(await dialog.getByRole('button', { name: 'Download Markdown' }).count()).toBe(0)
        expect(await dialog.getByRole('progressbar').count()).toBe(0)
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        await page.getByRole('button', { name: 'Academic research', exact: true }).click()
        await dialog.getByRole('heading', { name: 'Coverage', exact: true }).waitFor()
        expect(backgroundStart).toHaveBeenCalledTimes(1)
        expect(backgroundCancel).not.toHaveBeenCalled()
        if (capture !== undefined) {
          await progress.scrollIntoViewIfNeeded()
          await page.screenshot({ path: join(capture, 'live-settled.png') })
          await q6.scrollIntoViewIfNeeded()
          await page.screenshot({ path: join(capture, 'q6-live-coverage.png') })
        }
      } finally { finishSearch(); search.mockRestore(); webSearch.mockRestore(); await browser.close() }
    } finally { await scaffold.close() }
  })
})


describe('selected-paper enhancement browser flow', () => {
  it('submits one fixed paper once, reads persisted supplemental excerpts and retains its draft after reopen', async () => {
    const scaffold = await launchWebScaffold({})
    try {
      const value = sampleRun()
      const id = await seedSession(scaffold, await readFile('snapshots/web/seeded-history/session.v2.jsonl', 'utf8'), value.sessionId)
      await scaffold.ctx.sessionController.rename({ sessionId: id, title: 'Fixed enhancement preview' })
      const resolved = await scaffold.ctx.sessionController.resolveAgent(id)
      if ('error' in resolved) throw resolved.error
      const controller = scaffold.ctx.get('academicResearchController')!
      const task = { schemaVersion: 1 as const, sessionId: id, backgroundRunId: 'enhancement-preview',
        researchBriefId: value.retrievalRun.researchBriefId, state: 'completed' as const,
        startedAt: '2026-10-15T00:00:00Z', updatedAt: '2026-10-15T00:01:00Z',
        retrievalRunId: value.retrievalRun.retrievalRunId, progress: null, q6: value.q6, result: value, error: null, cancelReason: null }
      const mocks = [vi.spyOn(controller, 'listBackgroundRuns').mockResolvedValue([task]),
        vi.spyOn(controller, 'getBackgroundRun').mockResolvedValue(task),
        vi.spyOn(controller, 'plan').mockResolvedValue({ researchBriefId: task.researchBriefId,
          topic: 'Fixed enhancement preview', questions: [], searches: [] })]
      // Fixed model outcome only; the real Remote and Session history reader are exercised.
      const enhance = vi.spyOn(controller, 'enhanceEvidence').mockImplementation(async (request) => {
        const session = resolved.agent.session
        const selected = { schemaVersion: 1 as const, retrievalRunId: request.retrievalRunId,
          workVersionId: request.workVersionId, selectedAt: '2026-10-15T00:02:00Z' }
        session.append('academic/evidence-enhancement-selection', selected)
        const base = value.report.evidence[0]!
        const record = { ...base, evidenceId: 'fixed-supplemental-evidence' as typeof base.evidenceId,
          workVersionId: request.workVersionId, sourcedStatement: 'Fixed supplemental finding',
          verbatimExcerpt: { status: 'available' as const, value: 'Exact fixed supplemental excerpt' } }
        session.append('academic/evidence-fragment-verified', { purpose: 'enhancement',
          source: { ...record, contentHash: 'synthetic-hash' },
          fragment: { academicWorkId: record.academicWorkId, workVersionId: record.workVersionId,
            stage: 'extraction', attempt: 1, maximumAttempts: 1, maximumOutputTokens: 512,
            segmentIndex: 0, characterStart: 0, characterEnd: 32, fragmentIndex: 1 },
          evidence: { evidenceRecords: [record], sourceLocators: [], questionLinks: [], rejectedDrafts: [],
            evidenceCard: { schemaVersion: 1, evidenceCardId: 'supplement-card', academicWorkId: record.academicWorkId,
              workVersionId: record.workVersionId, researchQuestions: [], methods: [], datasets: [],
              metrics: [], findings: [], limitations: [] } },
        } as never)
        session.append('academic/evidence-enhancement-settlement', { ...selected, status: 'partial_success',
          completedAt: '2026-10-15T00:02:01Z', addedEvidenceRecords: 1, incompleteFragments: 1 })
        await resolved.agent.ctx.sessions.flush(session)
        return { ...request, status: 'partial_success', initialEvidenceRecords: 1, addedEvidenceRecords: 1, incompleteFragments: 1 }
      })
      mocks.push(enhance as never)
      const browser = await chromium.launch({ channel: process.env.DSH_ACADEMIC_BROWSER_CHANNEL ?? 'chromium' })
      try {
        const page = await newEnglishPage(browser)
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        await page.getByText('Ungrouped', { exact: true }).click()
        await page.getByText('Fixed enhancement preview', { exact: true }).click()
        await page.getByRole('button', { name: 'Academic research', exact: true }).click()
        const panel = page.getByRole('region', { name: 'Selected-paper evidence enhancement' })
        const select = panel.getByRole('combobox', { name: 'Enhancement paper' })
        await expect.poll(() => select.isEnabled()).toBe(true)
        const paper = value.papers.find(item => item.status === 'extracted' || item.status === 'partially_extracted')!
        await select.selectOption(paper.workVersionId)
        const capture = process.env.DSH_ACADEMIC_CAPTURE_DIR
        if (capture !== undefined) { await mkdir(capture, { recursive: true }); await panel.screenshot({ path: join(capture, 'enhancement-ready.png') }) }
        await panel.getByRole('button', { name: 'Enhance selected paper', exact: true }).click()
        await panel.getByText('Enhancement partially succeeded; verified additions were saved', { exact: true }).waitFor()
        await panel.getByText('fixed-supplemental-evidence', { exact: false }).click()
        expect(await panel.getByText('Exact fixed supplemental excerpt', { exact: true }).count()).toBe(1)
        expect(await panel.innerText()).toMatchSnapshot()
        expect(enhance).toHaveBeenCalledTimes(1)
        expect(await page.getByRole('button', { name: 'Download Markdown' }).count()).toBe(1)
        if (capture !== undefined) await panel.screenshot({ path: join(capture, 'enhancement-partial.png') })
        await page.getByRole('button', { name: 'Close', exact: true }).click()
        await page.getByRole('button', { name: 'Academic research', exact: true }).click()
        await panel.getByText('Enhancement partially succeeded; verified additions were saved', { exact: true }).waitFor()
        expect(await panel.getByRole('button', { name: 'Enhance selected paper', exact: true }).isDisabled()).toBe(true)
        expect(enhance).toHaveBeenCalledTimes(1)
        if (capture !== undefined) await panel.screenshot({ path: join(capture, 'enhancement-reopened.png') })
      } finally { await browser.close(); for (const mock of mocks) mock.mockRestore() }
    } finally { await scaffold.close() }
  })
})
