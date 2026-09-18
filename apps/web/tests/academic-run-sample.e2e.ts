/** Real Web entry and Academic Remote validation, without external model calls. */
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { launchWebScaffold, seedSession } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

describe('academic research Remote entry', () => {
  it('uses the selected Session and shows the real Controller prerequisite error', async () => {
    const scaffold = await launchWebScaffold({})
    try {
      const id = SessionId('academic-web-live-session')
      await seedSession(scaffold, await readFile(new URL('../../../snapshots/web/seeded-history/session.v2.jsonl', import.meta.url), 'utf8'), id)
      await scaffold.ctx.sessionController.rename({ sessionId: id, title: 'Academic Remote test session' })
      const browser = await chromium.launch({ channel: process.env.DSH_ACADEMIC_BROWSER_CHANNEL ?? 'chromium' })
      try {
        const page = await newEnglishPage(browser)
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        await page.getByRole('button', { name: 'Academic research', exact: true }).waitFor({ timeout: 30_000 })
        await page.getByText('Ungrouped', { exact: true }).click()
        await page.getByText('Academic Remote test session', { exact: true }).click({ timeout: 30_000 })
        await page.getByRole('button', { name: 'Academic research', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Research run results' })
        await dialog.waitFor()
        expect(await dialog.getByRole('combobox').count()).toBe(0)
        const queries = 'Attention Is All You Need\nBERT Pre-training of Deep Bidirectional Transformers'
        const queryBox = dialog.getByRole('textbox', { name: 'Research query' })
        await queryBox.fill(queries)
        expect(await queryBox.evaluate(element => element.tagName)).toBe('TEXTAREA')
        expect(await queryBox.inputValue()).toBe(queries)
        expect(await dialog.getByText('One query per line, up to three, subject to the approved research plan.', { exact: true }).count()).toBe(1)
        await dialog.getByRole('button', { name: 'Start research' }).click()
        await dialog.getByRole('alert').waitFor()
        expect(await dialog.getByRole('alert').textContent()).toContain('no approved Academic Research Brief plan')
        expect(await dialog.getByText('Completed', { exact: true }).count()).toBe(0)
        expect(await dialog.getByRole('progressbar').count()).toBe(0)
        if (process.env.DSH_ACADEMIC_CAPTURE_PATH !== undefined) {
          await page.screenshot({ path: process.env.DSH_ACADEMIC_CAPTURE_PATH, fullPage: true })
        }
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        expect(await page.getByRole('dialog').count()).toBe(0)
      } finally { await browser.close() }
    } finally { await scaffold.close() }
  })
})
