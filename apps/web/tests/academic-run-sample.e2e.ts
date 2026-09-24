/** Real Loader, Session, Controller and browser preview using an approved synthetic plan. */
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { launchWebScaffold, seedSession } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

describe('hybrid plan browser preview', () => {
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
  it('shows approved channels and budgets through the real Remote without starting research', async () => {
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
          await dialog.getByRole('button', { name: 'Close', exact: true }).click()
          await page.screenshot({ path: join(capture, 'hybrid-closed.png') })
        }
      } finally { await browser.close() }
    } finally { await scaffold.close() }
  })
})
