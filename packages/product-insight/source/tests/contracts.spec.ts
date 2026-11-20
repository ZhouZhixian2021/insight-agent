import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import { parseFeedItems } from '../src/official-feed.ts'
import { parseSearchResults } from '../src/multi-search.ts'

/**
 * Parser contracts over responses captured from the live sources.
 *
 * These run without a network so a layout change shows up as a failing test
 * instead of a silent drop in candidates. Refresh a fixture by fetching the
 * endpoint again and replacing the file; the assertions only require the
 * structure every successful answer carries.
 */
const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

const html = (url: string, content: string): WebFetchResult =>
  ({ url, statusCode: 200, truncated: false, body: { kind: 'html', content } })

describe('captured source contracts', () => {
  it('reads the news feed entry structure', () => {
    const links = parseFeedItems(fixture('bing-news.xml'), 'https://www.bing.com/news/search')
    expect(links.length).toBeGreaterThan(2)
    for (const link of links) {
      expect(link.url.startsWith('http')).toBe(true)
      expect((link.title ?? '').trim().length).toBeGreaterThan(0)
    }
  })

  it('reads the search result card structure', () => {
    const result = parseSearchResults('duckduckgo', html('https://html.duckduckgo.com/html/', fixture('duckduckgo.html')), 30)
    expect(result.sources.length).toBeGreaterThan(2)
    for (const source of result.sources) {
      expect(source.url.startsWith('http')).toBe(true)
      expect((source.title ?? '').trim().length).toBeGreaterThan(0)
    }
  })

  it('keeps the captured pages free of promoted filler', () => {
    const result = parseSearchResults('duckduckgo', html('https://html.duckduckgo.com/html/', fixture('duckduckgo.html')), 30)
    expect(result.sources.some(source => /bing\.com\/aclk|doubleclick/iu.test(source.url))).toBe(false)
  })
})
