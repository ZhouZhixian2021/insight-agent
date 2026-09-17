/** Fixed Academic handoff UI through the shipped Web Loader composition, without model calls. */
import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'
import { launchWebScaffold } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

describe('academic run fixed-data viewer', () => {
  it('opens from the sidebar, separates statuses, shows evidence and cancels the sample', async () => {
    const scaffold = await launchWebScaffold({})
    try {
      const browser = await chromium.launch({ channel: process.env.DSH_ACADEMIC_BROWSER_CHANNEL ?? 'chromium' })
      try {
        const page = await newEnglishPage(browser)
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        await page.getByRole('button', { name: 'Academic research samples', exact: true }).click({ timeout: 30_000 })
        const dialog = page.getByRole('dialog', { name: 'Research run results' })
        await dialog.waitFor()
        expect(await dialog.getByText('Completed', { exact: true }).count()).toBe(1)
        expect(await dialog.getByText('Partial success', { exact: true }).count()).toBeGreaterThan(0)
        expect(await dialog.getByText('Review required', { exact: true }).count()).toBeGreaterThan(0)
        expect(await dialog.getByText('Per-provider counts are not supplied.', { exact: true }).count()).toBe(1)
        if (process.env.DSH_ACADEMIC_CAPTURE_PATH !== undefined) {
          await page.screenshot({ path: process.env.DSH_ACADEMIC_CAPTURE_PATH, fullPage: true })
        }
        await dialog.getByRole('link', { name: /^Evidence:/ }).click()
        expect(await dialog.locator('details[id^="academic-evidence-"]').getAttribute('open')).not.toBeNull()
        const download = page.waitForEvent('download')
        await dialog.getByRole('button', { name: 'Download Markdown' }).click()
        expect((await download).suggestedFilename()).toBe('academic-report.md')
        await dialog.getByRole('combobox').selectOption('running')
        expect(await dialog.getByRole('status').textContent()).toBe('Research running')
        expect(await dialog.getByRole('progressbar').count()).toBe(0)
        await dialog.getByRole('button', { name: 'Cancel sample run' }).click()
        expect(await dialog.getByText('Cancelled', { exact: true }).count()).toBeGreaterThan(0)
        expect(await dialog.getByRole('button', { name: 'Download Markdown' }).count()).toBe(0)
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        expect(await page.getByRole('dialog').count()).toBe(0)
      } finally { await browser.close() }
    } finally { await scaffold.close() }
  })
})
