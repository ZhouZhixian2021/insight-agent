import { expect, it } from 'vitest'
import { readProductBrowserPage } from '../src/browser-reader.ts'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'

// Opt-in local browser verification: every page request is a fixed response, without external network or model calls.
it.skipIf(!process.env.PRODUCT_BROWSER_TEST)('reads JavaScript-rendered evidence and settles cancellation', async () => {
  const url = 'https://example.com/product'
  const initial: WebFetchResult = { url, statusCode: 200, truncated: false,
    body: { kind: 'html', content: '<html><body><main id="content"></main><script src="/product.js"></script></body></html>' } }
  const options = { channel: process.platform === 'win32' ? 'msedge' : 'chrome', timeoutMs: 10000,
    maximumCharacters: 10000, maximumRequests: 10, minimumTextCharacters: 20 }
  const rendered = await readProductBrowserPage(url, initial, async resource => ({ url: resource,
    statusCode: 200, truncated: false, body: { kind: 'text', content: 'document.getElementById("content").textContent = "Example version 2 supports offline export."' } }), options)
  expect(rendered.body.kind === 'html' && rendered.body.content).toContain('<main id="content">Example version 2 supports offline export.</main>')
  const controller = new AbortController()
  const pending = readProductBrowserPage(url, initial, async (resource) => {
    controller.abort(new Error('cancelled by user'))
    return { ...initial, url: resource }
  }, options, controller.signal)
  await expect(pending).rejects.toThrow()
}, 30000)
