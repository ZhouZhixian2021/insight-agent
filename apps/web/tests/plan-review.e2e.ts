// Web e2e scenario: the plan-review takeover. The shipped composition mounts
// plan mode and its client seat, so `/plan <task>` enters plan mode for real
// and the recorded turn ends on exit_plan_mode blocking against the live
// userInteraction seam. The composer is then occupied by the plan decision
// card — not the generic question flow — and approving it through the card
// completes the turn with the approval in the log.
// Replay is deterministic: the plan content arrives from replayed chunks, the
// review wait is real, and the approve click is the test's own gesture (the
// turn cannot complete without it, in record and replay alike).
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  assertFixtureInventory, captureExpandedTurnProcessAria, captureStableAria,
  compareOrRefreshGolden, fixtureUserPrompts, seedSession,
  launchWebScaffold, recordFixture, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('../../../snapshots/web/plan-review', import.meta.url))
const FIXTURE = join(SNAPSHOT_DIR, 'session.v2.jsonl')
// The waiting golden owns the decision card; the approved golden owns the
// transcript the approval leaves behind — the state the card cannot see.
const REVIEW_EXPECTED = join(SNAPSHOT_DIR, 'review.expected.md')
const SIDEBAR_EXPECTED = join(SNAPSHOT_DIR, 'sidebar.expected.md')
const APPROVED_EXPECTED = join(SNAPSHOT_DIR, 'approved.expected.md')
const APPROVED_EXPANDED_EXPECTED = join(SNAPSHOT_DIR, 'approved-expanded.expected.md')
const MODE = webSnapshotMode()

// One command line: /plan enters plan mode and submits the rest as the turn's
// message. The task is deliberately self-contained (nothing to explore in a
// fresh workspace) so the recorded turn is a plan and its review, and the
// approved continuation is one word.
const TASK = 'Plan a small change: add a --greeting flag to a CLI. Do not read or write any files. '
  + 'Call exit_plan_mode with a short plan of at most five bullet points. '
  + 'Once the plan is approved, reply with the single word DONE and stop.'
const LINE = `/plan ${TASK}`

describe('web e2e: plan review takeover round trip', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  const sessionEvents: SessionEvent[] = []

  beforeAll(async () => {
    scaffold = await launchWebScaffold(MODE === 'record' ? {} : { replayFixture: FIXTURE, paceMs: 15, compareReplaySession: true })
    scaffold.ctx.on('session/event', (_session, event: SessionEvent) => { sessionEvents.push(event) })
    browser = await chromium.launch()
    // English page: the decision copy is the surface under test, and the
    // golden pins one language.
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('reviews the plan on a decision card and approves through it', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-plan-review'))
    if (MODE !== 'record') {
      expect(fixtureUserPrompts(await readFile(FIXTURE, 'utf8'))).toEqual([TASK])
    }
    const input = page.locator('[data-composer-input]').first()
    await input.waitFor({ timeout: 10_000 })
    const settled = scaffold.whenTurnSettled(MODE === 'record' ? 180_000 : 30_000)
    await input.fill(LINE)
    await input.press('Enter')

    // The card takes over the input area while exit_plan_mode blocks. Its
    // presence is a STABLE waiting state (it stays until answered), so a plain
    // waitFor is race-free.
    const card = page.locator('[data-plan-review-key]')
    await card.waitFor({ timeout: MODE === 'record' ? 120_000 : 30_000 })
    // The plan-review request must NOT land on the generic question flow.
    expect(await page.locator('[data-question-key]').count()).toBe(0)
    await expect.poll(() => card.getByText('Plan review').count(), { timeout: 10_000 }).toBeGreaterThan(0)

    const selectedRow = page.locator('[role="treeitem"][aria-selected="true"]')
    await expect.poll(() => selectedRow.locator('[data-state="warning"]').count(), { timeout: 10_000 }).toBe(1)
    await expect.poll(() => selectedRow.getByText('Plan awaiting review', { exact: true }).count(), { timeout: 10_000 }).toBe(1)

    if (MODE !== 'record') {
      const snapshot = await captureStableAria(page, '[data-plan-review-key]', scaffold.workspaceCwd)
      await compareOrRefreshGolden(REVIEW_EXPECTED, snapshot, MODE)
      const sidebar = await captureStableAria(page, '[role="treeitem"][aria-selected="true"]', scaffold.workspaceCwd)
      await compareOrRefreshGolden(SIDEBAR_EXPECTED, sidebar, MODE)
    }

    await card.getByRole('button', { name: 'Approve' }).click()

    const sessionId = await settled
    if (MODE === 'record') {
      await recordFixture(scaffold, sessionId, FIXTURE)
      return
    }
    // World state: the approval reached the tool, and plan mode is left behind.
    const results = sessionEvents.filter(e => e.type === 'tool/result')
    expect(JSON.stringify(results.at(-1))).toContain('Plan approved')
    await expect.poll(() => page.getByText('DONE', { exact: true }).count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
    // Card gone; regular input restored.
    expect(await page.locator('[data-plan-review-key]').count()).toBe(0)
    expect(await selectedRow.locator('[data-state="warning"]').count()).toBe(0)
    await expect.poll(() => page.locator('[data-composer-input]').first().isEnabled(), { timeout: 10_000 }).toBe(true)
    const snapshot = await captureStableAria(page, '[class*="centerCol"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(APPROVED_EXPECTED, snapshot, MODE)
    const expanded = await captureExpandedTurnProcessAria(
      page,
      '[class*="centerCol"]',
      scaffold.workspaceCwd,
    )
    await compareOrRefreshGolden(APPROVED_EXPANDED_EXPECTED, expanded, MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 200_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, [
      'session.v2.jsonl', 'review.expected.md', 'sidebar.expected.md',
      'approved.expected.md', 'approved-expanded.expected.md',
    ])
  })
})


describe('academic concise approval browser flow', () => {
  it('revises the fixed academic plan through the real question service without editing execution JSON', async () => {
    const scaffold = await launchWebScaffold({})
    const abort = new AbortController()
    try {
      const id = await seedSession(scaffold, await readFile('snapshots/web/seeded-history/session.v2.jsonl', 'utf8'), 'concise-plan-review')
      await scaffold.ctx.sessionController.rename({ sessionId: id, title: 'Concise academic review' })
      const browser = await chromium.launch({ channel: process.env.DSH_ACADEMIC_BROWSER_CHANNEL ?? 'chromium' })
      try {
        const page = await newEnglishPage(browser, 900)
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        await page.getByText('Ungrouped', { exact: true }).click()
        await page.getByText('Concise academic review', { exact: true }).click()
        await page.locator('[data-composer-input]').first().waitFor()
        const agent = scaffold.ctx.agents.roots().find(item => item.session.id === id)
        if (agent === undefined) throw new Error('Selected session must have a live root agent')
        const plan = await readFile('z-team_docs/interface-samples/academic-model-v1/academic-pe1-plan.sample.md', 'utf8')
        const request = (detail: string) => scaffold.ctx.userQuestions.ask({ agent, signal: abort.signal,
          questions: [{ id: 'plan-review', question: 'Review this research plan', detail,
            options: [{ label: 'Approve' }, { label: 'Keep planning' }], intent: { kind: 'plan-review', approve: 'Approve' } }] })
        const response = request(plan)
        void response.catch(() => {})
        const card = page.locator('[data-plan-review-key]')
        await card.waitFor()
        expect(await card.locator('details').getAttribute('open')).toBeNull()
        expect(await card.innerText()).toContain('研究范围：')
        const capture = process.env.DSH_ACADEMIC_CAPTURE_DIR
        if (capture !== undefined) {
          await mkdir(capture, { recursive: true })
          await page.screenshot({ path: join(capture, 'concise-review.png') })
        }
        await card.getByRole('button', { name: 'Revise plan', exact: true }).click()
        await card.getByRole('textbox', { name: 'Revise the research plan' }).fill('不纳入预印本。\n保留未回答问题的说明。')
        expect(await card.getByRole('button', { name: 'Approve', exact: true }).isDisabled()).toBe(true)
        if (capture !== undefined) await page.screenshot({ path: join(capture, 'concise-revision.png') })
        await card.getByRole('button', { name: 'Request a revised plan' }).click()
        expect(await response).toEqual({ answers: [{ id: 'plan-review', selected: [], custom: '不纳入预印本。\n保留未回答问题的说明。' }] })
        await card.waitFor({ state: 'detached' })
        // The second request is a fixed revised plan, not a claim of real-model regeneration.
        const revised = request(plan.replace('允许预印本', '不纳入预印本').replace('"allowPreprints": true', '"allowPreprints": false')
          .replace('"preprint", ', ''))
        void revised.catch(() => {})
        await card.waitFor()
        expect(await card.getByRole('textbox').count()).toBe(0)
        expect(await card.innerText()).toContain('不纳入预印本')
        if (capture !== undefined) await page.screenshot({ path: join(capture, 'concise-revised.png') })
        await card.getByRole('button', { name: 'Approve', exact: true }).click()
        expect(await revised).toEqual({ answers: [{ id: 'plan-review', selected: ['Approve'] }] })
      } finally { abort.abort(); await browser.close() }
    } finally { abort.abort(); await scaffold.close() }
  })
})
