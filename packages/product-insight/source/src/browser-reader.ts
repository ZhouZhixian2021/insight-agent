/** Anonymous browser rendering whose network requests all pass through the guarded HTTP reader. */
import { addAbortListener } from 'node:events'
import { chromium } from 'playwright-core'
import { WebError, type WebFetchResult } from '@deepseek-ai/dsh-web'

/** Deployment limits for one isolated, read-only browser page. */
export interface BrowserReadOptions {
  readonly channel: string
  readonly timeoutMs: number
  readonly maximumCharacters: number
  readonly maximumRequests: number
  readonly minimumTextCharacters: number
}

/**
 * Render a public page with GET-only, guarded requests and an ephemeral browser profile.
 * @param url - Selected page URL; cross-origin main-frame navigation is rejected.
 * @param initial - Already acquired HTML, reused without a second initial request.
 * @param fetch - Guarded anonymous HTTP reader, also used for scripts and JSON.
 * @param options - Browser channel and explicit resource limits.
 * @param signal - Cancels navigation, active HTTP reads and the owned browser.
 * @returns Rendered HTML; unreadable, challenged or oversized pages fail explicitly.
 */
export async function readProductBrowserPage(url: string, initial: WebFetchResult,
  fetch: (url: string, signal: AbortSignal) => Promise<WebFetchResult>, options: BrowserReadOptions,
  signal?: AbortSignal): Promise<WebFetchResult> {
  const timeout = AbortSignal.timeout(options.timeoutMs)
  const active = signal ? AbortSignal.any([signal, timeout]) : timeout
  active.throwIfAborted()
  const browser = await chromium.launch({ channel: options.channel, headless: true, timeout: options.timeoutMs })
  const abort = addAbortListener(active, () => { void browser.close().catch(() => { /* Final cleanup awaits closure. */ }) })
  const pending = new Set<Promise<void>>()
  try {
    active.throwIfAborted()
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false })
    await context.routeWebSocket('**/*', route => route.close())
    let requests = 0
    let resourceFailure: Error | undefined
    await context.route('**/*', (route) => {
      const work = (async () => {
        const request = route.request()
        try {
          active.throwIfAborted()
          if (request.method() !== 'GET' || ['image', 'media', 'font'].includes(request.resourceType())) {
            await route.abort(); return
          }
          if (++requests > options.maximumRequests) throw new WebError('浏览器读取超过资源请求上限。', 'WEB_PROVIDER_LIMIT')
          if (request.isNavigationRequest() && new URL(request.url()).origin !== new URL(url).origin) {
            throw new WebError('网页跳转到其他来源，需要重新核对网址。', 'WEB_REDIRECT_BLOCKED')
          }
          const result = request.url() === url ? initial : await fetch(request.url(), active)
          if (result.truncated) throw new WebError('浏览器资源不完整。', 'WEB_FETCH_TOO_LARGE')
          if (result.body.kind === 'pdf') { await route.abort(); return }
          const contentType = result.body.kind === 'html' ? 'text/html; charset=utf-8'
            : request.resourceType() === 'script' ? 'text/javascript; charset=utf-8'
              : request.resourceType() === 'stylesheet' ? 'text/css; charset=utf-8' : 'application/json; charset=utf-8'
          await route.fulfill({ status: result.statusCode, contentType, body: result.body.content })
        } catch (error) {
          resourceFailure ??= error instanceof Error ? error : new Error(String(error))
          await route.abort().catch(() => { /* Browser closure already cancels the intercepted request. */ })
        }
      })()
      pending.add(work)
      void work.finally(() => pending.delete(work))
      return work
    })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: options.timeoutMs })
    await page.waitForFunction(`document.body && document.body.innerText.trim().length >= ${options.minimumTextCharacters}`,
      undefined, { timeout: options.timeoutMs })
    active.throwIfAborted()
    if (resourceFailure) throw resourceFailure
    const visibleText = await page.locator('body').innerText()
    if (/verify you are human|checking your browser|captcha|请完成验证/iu.test(visibleText)) {
      throw new WebError('网页要求人工验证，未将验证页面作为证据。', 'WEB_PROVIDER_CHALLENGE')
    }
    const content = await page.content()
    if (content.length > options.maximumCharacters) throw new WebError('浏览器正文超过获取上限。', 'WEB_FETCH_TOO_LARGE')
    return { url: page.url(), statusCode: initial.statusCode, body: { kind: 'html', content }, truncated: false }
  } finally {
    abort[Symbol.dispose]()
    await browser.close()
    await Promise.allSettled(pending)
  }
}
