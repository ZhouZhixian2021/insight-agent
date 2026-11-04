/** Browser PDF acquisition from a previously observed paper link. */
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebError, type WebFetchResult } from '@deepseek-ai/dsh-web'
import { z } from 'zod'
import type { BrowserAcademicExecutor, BrowserAcademicOptions } from './types.ts'

const downloadResult = z.object({ url: z.url() })

/**
 * Click the observed PDF anchor, validate downloaded bytes, and remove temporary files.
 * @param execute Initiating Agent's serialized DSH browser operation.
 * @param landing Official paper page observed during search.
 * @param pdf PDF URL published by that page.
 * @param options Resolved navigation and accepted-byte limits.
 * @param signal Provider shutdown or caller cancellation.
 * @returns Validated PDF bytes; successful browser acquisition is represented as status 200.
 */
export async function downloadAcademicPdf(execute: BrowserAcademicExecutor, landing: string, pdf: string,
  options: BrowserAcademicOptions, signal: AbortSignal): Promise<WebFetchResult> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-academic-pdf-'))
  try {
    signal.throwIfAborted()
    const file = join(directory, 'paper.pdf')
    const input = JSON.stringify({ landing, pdf, file, timeout: options.operationTimeoutMs })
    const result = downloadResult.parse(await execute(`async (page) => {
      const input = ${input};
      const response = await page.goto(input.landing, { waitUntil: 'commit', timeout: input.timeout });
      if (!response || response.status() >= 400 || page.url() !== input.landing) throw new Error('Paper page is unavailable');
      await page.waitForFunction(pdf => Array.from(document.querySelectorAll('a[href]')).some(node => node.href === pdf),
        input.pdf, { timeout: input.timeout });
      const links = page.locator('a[href]');
      const index = await links.evaluateAll((nodes, url) => nodes.findIndex(node => node.href === url), input.pdf);
      if (index < 0) throw new Error('Observed PDF link is absent from the paper page');
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: input.timeout }),
        links.nth(index).click({ modifiers: ['Alt'], timeout: input.timeout })
      ]);
      const url = download.url();
      await download.saveAs(input.file);
      if (await download.failure()) throw new Error('PDF download failed');
      return { url };
    }`, signal))
    signal.throwIfAborted()
    const url = new URL(result.url)
    if (url.protocol !== 'https:' || url.username || url.password
      || !options.sites.some(site => site.pdfOrigins.includes(url.origin))) {
      throw new WebError('Browser PDF redirected outside configured origins.', 'ACADEMIC_BROWSER_PDF_ORIGIN')
    }
    const info = await stat(file)
    if (info.size > options.maximumPdfBytes) throw new WebError('Browser PDF exceeds maximumPdfBytes.', 'ACADEMIC_BROWSER_PDF_TOO_LARGE')
    const bytes = await readFile(file)
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new WebError('Browser download is not a PDF.', 'ACADEMIC_BROWSER_PDF_INVALID')
    // Chromium's Download API exposes completion and bytes, but not the origin HTTP status.
    return { ...result, statusCode: 200, body: { kind: 'pdf', content: bytes }, truncated: false }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
