/** Recorded Academic plan revision, approval, and durable background dispatch through the shipped Web preset. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, expect, it, onTestFailed, vi, type MockInstance } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-api-academic-research-controller'
import type {} from '@deepseek-ai/dsh-session-query'
import type { AcademicSourceRuntime } from '@deepseek-ai/dsh-academic-source'
import { createBatchResult } from '@deepseek-ai/dsh-academic-model'
import { parseSessionLog } from '@deepseek-ai/dsh-llm-replay'
import { researchPlanFromApprovedPlan, validateAcademicPlan } from '../../../packages/api/academic-research-controller/src/research-brief-plan.ts'
import {
  acknowledgeReloadConnectionLoss, assertReplaySession, captureStableAria, compareOrRefreshGolden,
  fixtureUserPrompts, launchWebScaffold, recordFixture, watchConsole, webSnapshotMode,
  type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const MODE = webSnapshotMode()
const DIRECTORY = fileURLToPath(new URL('../../../snapshots/web/academic-plan-review', import.meta.url))
const FIXTURE = join(DIRECTORY, 'session.v4.jsonl')
const EXPECTED = DIRECTORY
const SKILL_ROOT = fileURLToPath(new URL('../../../packages/bundle/web-app/presets/academic/skills/academic-insight-report', import.meta.url))
const SIDECARS = ['snapshot.yml', 'system-prompt.expected.md', 'tool-schemas.expected.json'] as const
let replayDirectory: string | undefined
let replayFixture: string

/** Relocate only this scenario's shipped skill paths, including JSON-encoded tool arguments. */
function skillFixturePaths(text: string, materialize: boolean): string {
  for (const [path, name] of [[join(SKILL_ROOT, 'references', 'research-brief.md'), 'academicBriefPath'],
    [SKILL_ROOT, 'academicSkillRoot']] as const) {
    const encoded = JSON.stringify(path).slice(1, -1)
    for (const [value, token] of [[JSON.stringify(encoded).slice(1, -1), '{{' + name + 'Json}}'],
      [encoded, '{{' + name + '}}']] as const) {
      text = text.split(materialize ? token : value).join(materialize ? value : token)
    }
  }
  return text
}
const REVISION = '只纳入 2023 年及以后发表的论文，请同步调整研究范围正文和执行字段，其他约定保持不变。'
let scaffold: WebScaffold
let browser: Browser
let page: Page
let search: MockInstance<AcademicSourceRuntime['searchProviders']>
let webSearch: MockInstance<typeof scaffold.ctx.web.search>
let tripwire: ReturnType<typeof watchConsole>
const searching = Promise.withResolvers<undefined>()
const releaseSearch = Promise.withResolvers<undefined>()

beforeAll(async () => {
  replayFixture = FIXTURE
  if (MODE !== 'record') {
    replayDirectory = await mkdtemp(join(tmpdir(), 'dsh-academic-plan-replay-'))
    replayFixture = join(replayDirectory, 'session.v4.jsonl')
    const canonical = await readFile(FIXTURE, 'utf8')
    const materialized = skillFixturePaths(canonical, true)
    expect(skillFixturePaths(materialized, false)).toBe(canonical)
    await writeFile(replayFixture, materialized)
    for (const name of SIDECARS) await writeFile(join(replayDirectory, name), await readFile(join(DIRECTORY, name)))
  }
  const recorded = MODE === 'record' ? undefined : parseSessionLog(await readFile(FIXTURE, 'utf8'))
    .find(event => event.type === 'request/header')?.data.header.config
  if (MODE !== 'record' && recorded === undefined) throw new Error('Academic fixture has no model selection')
  scaffold = await launchWebScaffold({
    agentPresets: { default: 'academic' },
    ...(recorded === undefined ? {} : {
      replayFixture, paceMs: 0, compareReplaySession: false,
      replayProviders: [{ id: recorded.provider, name: recorded.provider,
        models: [{ id: recorded.model, contextWindow: 262_144 }] }],
    }),
  })
  if (recorded !== undefined) await scaffold.ctx.agentDefaultModel.saveSelection(recorded)
  search = vi.spyOn(scaffold.ctx.academicSource, 'searchProviders').mockImplementation(async (_request, providers, signal, observe) => {
    for (const provider of providers) observe?.({
      provider, phase: 'started', settlement: null, category: null, works: 0, truncated: false,
    })
    searching.resolve(undefined)
    await releaseSearch.promise
    signal?.throwIfAborted()
    for (const provider of providers) observe?.({
      provider, phase: 'settled', settlement: 'success', category: null, works: 0, truncated: false,
    })
    return { works: [], truncated: false, providers, discoveredRecords: 0,
      batch: createBatchResult([], []), limitations: ['Scenario source returns no papers.'] }
  })
  webSearch = vi.spyOn(scaffold.ctx.web, 'search').mockResolvedValue({ sources: [], content: '', truncated: false })
  browser = await chromium.launch()
  page = await newEnglishPage(browser)
  await page.addInitScript(() => {
    const NativeURL = globalThis.URL
    globalThis.URL = class extends NativeURL {
      override get hostname() {
        return this.protocol === 'dsh-resource:' ? '' : super.hostname
      }
    }
  })
  await page.emulateMedia({ colorScheme: 'light' })
  tripwire = watchConsole(page)
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  await connectFreshWorkspace(page, scaffold.workspaceCwd)
}, 120_000)

afterAll(async () => {
  releaseSearch.resolve(undefined)
  try { await browser?.close() } finally {
    try { await scaffold?.close() } finally {
      search?.mockRestore()
      webSearch?.mockRestore()
      if (replayDirectory !== undefined) await rm(replayDirectory, { recursive: true, force: true })
    }
  }
})

/** Retain the current UI and scenario identity while replacing its browser document. */
async function reopenResearch(): Promise<void> {
  const warningStart = tripwire.warnings.length
  await page.reload({ waitUntil: 'load' })
  await page.getByRole('button', { name: 'Academic research', exact: true }).waitFor({ timeout: 15_000 })
  acknowledgeReloadConnectionLoss(tripwire, warningStart)
  await page.getByRole('button', { name: 'Academic research', exact: true }).click()
}

it('revises and approves an Academic plan, then recovers the same background run after refresh', async () => {
  onTestFailed(() => saveFailureShot(page, 'web-e2e-academic-plan-review'))
  let task: string
  if (MODE === 'record') {
    const source = await readFile(fileURLToPath(new URL('../../../z-team_docs/interface-samples/academic-model-v1/academic-pe1-plan.sample.md', import.meta.url)), 'utf8')
    const payload = JSON.parse(source.match(/```academic-research-brief-json\s*\n([\s\S]*?)\n```/u)![1]!) as {
      searchPlan: { retrieval: {
        channels: string[]
        academicProviders: string[]
        verificationProviders: string[]
        maximumWebDiscoveryResults: number
        maximumReferenceVerifications: number
      } }[]
    }
    for (const query of payload.searchPlan) {
      query.retrieval.channels = ['academic']
      query.retrieval.academicProviders = ['arxiv']
      query.retrieval.verificationProviders = []
      query.retrieval.maximumWebDiscoveryResults = 0
      query.retrieval.maximumReferenceVerifications = 0
    }
    const plan = source.replace(/(```academic-research-brief-json\s*\n)[\s\S]*?(\n```)/u,
      (_match, begin: string, end: string) => begin + JSON.stringify(payload, null, 2) + end)
    task = '请生成一份学术研究计划并提交 exit_plan_mode 等待我审核。本次不执行检索，不写文件，不给研究结论。'
      + '按学术预设加载必要技能与模板，使用以下已整理计划作为依据；正文与执行信息必须一致。'
      + '收到修改意见后更新计划并再次提交，批准后仅回复“计划已批准”并停止。\n\n' + plan
  } else {
    const prompts = fixtureUserPrompts(await readFile(FIXTURE, 'utf8'))
    expect(prompts).toHaveLength(1)
    task = prompts[0]!
  }
  expect(await page.getByRole('button', { name: 'Academic insight', exact: true }).isVisible()).toBe(true)
  const settled = scaffold.whenTurnSettled(MODE === 'record' ? 480_000 : 60_000)
  const input = page.locator('[data-composer-input]').first()
  await input.fill(task)
  await input.press('Enter')
  const card = page.locator('[data-plan-review-key]')
  await card.waitFor({ timeout: MODE === 'record' ? 240_000 : 30_000 })
  const firstKey = await card.getAttribute('data-plan-review-key')
  expect(search).not.toHaveBeenCalled()
  const preview = page.locator('[data-plan-preview]')
  await preview.waitFor({ state: 'visible' })
  expect(await preview.locator('details').getAttribute('open')).toBeNull()
  if (MODE !== 'record') await compareOrRefreshGolden(join(EXPECTED, 'preview.expected.md'),
    await captureStableAria(page, '[data-plan-preview]', scaffold.workspaceCwd), MODE)
  await preview.getByText('Execution details', { exact: true }).click()
  expect(await preview.locator('pre').isVisible()).toBe(true)
  await preview.getByText('Execution details', { exact: true }).click()
  await card.getByRole('button', { name: 'Request changes', exact: true }).click()
  await card.getByRole('textbox', { name: 'Requested changes', exact: true }).fill(REVISION)
  expect(await card.getByRole('button', { name: 'Approve', exact: true }).isEnabled()).toBe(false)
  if (MODE !== 'record') await compareOrRefreshGolden(join(EXPECTED, 'revision.expected.md'),
    await captureStableAria(page, '[data-plan-review-key]', scaffold.workspaceCwd), MODE)
  const artifacts = fileURLToPath(new URL('../../../.artifacts/', import.meta.url))
  await mkdir(artifacts, { recursive: true })
  await page.screenshot({ path: join(artifacts, 'u2-academic-revision-light.png') })
  await page.locator('[data-sidebar-right-toggle]').click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => page.locator('body').getAttribute('data-ds-dark-theme')).not.toBeNull()
  for (const control of [
    card.getByRole('textbox', { name: 'Requested changes', exact: true }),
    card.getByRole('button', { name: 'Send feedback', exact: true }),
    card.getByRole('button', { name: 'Back to review', exact: true }),
    card.getByRole('button', { name: 'Approve', exact: true }),
  ]) {
    const box = await control.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  }
  await page.screenshot({ path: join(artifacts, 'u2-academic-revision-dark-mobile.png') })
  await page.setViewportSize({ width: 1680, height: 1000 })
  await page.emulateMedia({ colorScheme: 'light' })
  await card.getByRole('button', { name: 'Send feedback', exact: true }).click()
  await expect.poll(() => card.getAttribute('data-plan-review-key'),
    { timeout: MODE === 'record' ? 240_000 : 30_000 }).not.toBe(firstKey)
  await card.waitFor({ state: 'visible' })
  expect(search).not.toHaveBeenCalled()
  await card.getByRole('button', { name: 'Approve', exact: true }).click()
  const sessionId: SessionId = await settled
  const agent = scaffold.ctx.agents.get(sessionId)
  if (agent === undefined) throw new Error('Academic Session was not retained')
  expect(agent.session.header.agentPreset).toBe('academic')
  const observation = await scaffold.ctx.sessionQuery.readSession(sessionId)
  const calls = observation.events.filter(event => event.type === 'tool/call' && event.data.name === 'exit_plan_mode')
  expect(calls).toHaveLength(2)
  for (const event of calls) {
    if (event.type !== 'tool/call') continue
    validateAcademicPlan((JSON.parse(event.data.arguments) as { plan: string }).plan)
  }
  expect(researchPlanFromApprovedPlan(sessionId, observation.events).brief.publicationWindow.start?.iso).toBe('2023')
  const approved = await scaffold.ctx.academicResearchController.plan(sessionId)
  expect(search).not.toHaveBeenCalled()
  expect(approved.researchBriefId).toContain(calls[1]!.type === 'tool/call' ? calls[1]!.data.callId : '')
  // The recorded Session ends at approval; background state is asserted independently below.
  if (MODE === 'record') {
    await recordFixture(scaffold, sessionId, FIXTURE)
    await writeFile(FIXTURE, skillFixturePaths(await readFile(FIXTURE, 'utf8'), false))
  } else {
    await assertReplaySession([agent.session], replayFixture, MODE, scaffold.baseUrl, scaffold.harnessHome)
    if (MODE === 'refresh') {
      await writeFile(FIXTURE, skillFixturePaths(await readFile(replayFixture, 'utf8'), false))
      for (const name of SIDECARS) await writeFile(join(DIRECTORY, name), await readFile(join(replayDirectory!, name)))
    }
  }
  await page.getByRole('button', { name: 'Academic research', exact: true }).click()
  await page.getByRole('button', { name: 'Start research from plan', exact: true }).click()
  await searching.promise
  const [running] = await scaffold.ctx.academicResearchController.listBackgroundRuns(sessionId)
  expect(running?.state).toBe('running')
  if (running === undefined) throw new Error('No background run was saved')
  await reopenResearch()
  const live = page.getByRole('region', { name: 'Background task', exact: true })
  await live.getByText(running.backgroundRunId, { exact: false }).waitFor()
  expect(await page.getByRole('button', { name: 'Start research from plan', exact: true }).isEnabled()).toBe(false)
  releaseSearch.resolve(undefined)
  await expect.poll(async () => (await scaffold.ctx.academicResearchController.getBackgroundRun(running)).state,
    { timeout: 30_000 }).toBe('completed')
  await reopenResearch()
  await page.getByRole('region', { name: 'Background task', exact: true }).getByText(running.backgroundRunId, { exact: false }).waitFor()
  const saved = await scaffold.ctx.academicResearchController.getBackgroundRun(running)
  expect(saved.result?.report).toBeNull()
  expect(saved.cancelReason).toBeNull()
  expect(saved.progress).not.toBeNull()
  const final = await scaffold.ctx.sessionQuery.readSession(sessionId)
  const starts = final.events.filter(event => event.type === 'academic/background-run-state' && event.data.state === 'running')
  expect(new Set(starts.map(event => event.type === 'academic/background-run-state' ? event.data.backgroundRunId : ''))).toEqual(new Set([running.backgroundRunId]))
  expect(await scaffold.ctx.sessions.flush(agent.session)).toBe(true)
  await using persisted = await scaffold.ctx.sessionPersistence.open(sessionId, 'read')
  const persistedEvents = (await persisted.read()).events
  expect(persistedEvents.some(event => event.type === 'academic/background-run-state' && event.data.state === 'completed')).toBe(true)
  expect(tripwire.pageErrors).toEqual([])
}, 600_000)
