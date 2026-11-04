import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { academicBrowserScript } from '../src/script.ts'
import { Config } from '../src/index.ts'
import type { BrowserAcademicSite } from '../src/types.ts'

it('opens ACL landing pages for PDF search hits and excludes off-site links', async () => {
  const sites = JSON.parse(await readFile(new URL('../examples/sites.json', import.meta.url), 'utf8')) as BrowserAcademicSite[]
  const options = Config({ sites, maximumResults: 3, maximumCachedRecords: 10, operationTimeoutMs: 1000,
    maximumMetadataCharacters: 2000, maximumPdfBytes: 1000, otherFetchProvider: 'http' })
  const site = options.sites[0]!
  const urls = ['2025.findings-acl.997', '2026.findings-acl.1916', '2026.acl-long.1454']
    .map(id => `https://aclanthology.org/${id}.pdf`)
  expect(urls.every(url => !new RegExp(site.paperUrlPattern).test(url))).toBe(true)
  class Anchor {
    constructor(readonly href: string) {}
    getClientRects() { return [1] }
  }
  const visited: string[] = []
  const locator = { fill: async () => {}, press: async () => {}, filter() { return this },
    first() { return this }, waitFor: async () => {} }
  const page = {
    goto: async (url: string) => { visited.push(url); return null },
    url: () => visited.at(-1)!, locator: () => locator, waitForNavigation: async () => null,
    evaluate: async (fn: (input?: unknown) => unknown, input?: unknown) => input === undefined ? '<meta name=citation_title content=Paper>' : fn(input),
  }
  const execute = runInNewContext(`(${academicBrowserScript(site, 'LLM inference serving', 3, options)})`, {
    HTMLAnchorElement: Anchor, URL, getComputedStyle: () => ({ visibility: 'visible' }),
    document: { querySelectorAll: (selector: string) => selector === site.resultSelector
      ? [...urls, 'https://attacker.example/paper.pdf'].map(url => new Anchor(url)) : [] },
  }) as (page: unknown) => Promise<{ papers: { url: string }[] }>
  const result = await execute(page)
  expect(result.papers.map(paper => paper.url)).toEqual(urls.map(url => url.replace(/\.pdf$/, '/')))
  expect(visited).toEqual([site.url, ...result.papers.map(paper => paper.url)])
  expect(options.sites[1]?.resultUrlRewrite).toBeUndefined()
})
