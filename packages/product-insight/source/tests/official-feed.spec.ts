import { describe, expect, it } from 'vitest'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import { discoverOfficialLinks, parseAdvertisedFeeds, parseFeedItems, parseSitemapLocations } from '../src/official-feed.ts'

const fetched = (content: string, statusCode = 200): WebFetchResult => ({ url: 'https://example.com/',
  statusCode, body: { kind: 'html', content }, truncated: false })
const missing = (): WebFetchResult => fetched('', 404)

const atom = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">
<title><![CDATA[Example Newsroom]]></title>
<entry><updated><![CDATA[2026-11-17T16:59:36.179Z]]></updated><title><![CDATA[Example introduces M6]]></title>
<link href="https://example.com/news/2026/11/m6/"/><content><![CDATA[Press release.]]></content></entry>
<entry><updated><![CDATA[2026-11-10T08:00:00.000Z]]></updated><title>Example ships M6 Ultra</title>
<link rel="alternate" href="/news/2026/11/m6-ultra/"/></entry>
<entry><updated><![CDATA[2026-11-01T08:00:00.000Z]]></updated><title>Example ships M6 Ultra</title>
<link href="https://example.com/news/2026/11/m6-ultra/"/></entry>
</feed>`

const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Specifications</title><link>https://example.com/specs</link><pubDate>Mon, 16 Nov 2026 13:18:00 GMT</pubDate></item>
<item><title>Documentation</title><guid>https://example.com/docs</guid></item>
</channel></rss>`

describe('official feed parsing', () => {
  it('reads Atom entries through CDATA and resolves relative links', () => {
    expect(parseFeedItems(atom, 'https://example.com/newsroom/rss-feed.rss')).toEqual([
      { url: 'https://example.com/news/2026/11/m6/', title: 'Example introduces M6', publishedAt: '2026-11-17T16:59:36.179Z' },
      { url: 'https://example.com/news/2026/11/m6-ultra/', title: 'Example ships M6 Ultra', publishedAt: '2026-11-10T08:00:00.000Z' },
      { url: 'https://example.com/news/2026/11/m6-ultra/', title: 'Example ships M6 Ultra', publishedAt: '2026-11-01T08:00:00.000Z' },
    ])
  })
  it('reads RSS link text and falls back to the guid', () => {
    expect(parseFeedItems(rss, 'https://example.com/feed').map(item => item.url))
      .toEqual(['https://example.com/specs', 'https://example.com/docs'])
  })
  it('rejects non-HTTP links and credentials instead of passing them on', () => {
    const mixed = '<rss><item><link>javascript:alert(1)</link></item><item><link>https://user:key@example.com/a</link></item><item><link>ftp://example.com/b</link></item></rss>'
    expect(parseFeedItems(mixed, 'https://example.com/feed')).toEqual([])
  })
  it('keeps siblings readable after self-closing unknown elements', () => {
    const feed = '<feed><entry><updated>2026-11-17T00:00:00Z</updated><category term="UPDATE"/><title>Launch</title><link href="https://example.com/launch"/></entry></feed>'
    expect(parseFeedItems(feed, 'https://example.com/feed')).toEqual([
      { url: 'https://example.com/launch', title: 'Launch', publishedAt: '2026-11-17T00:00:00Z' },
    ])
  })
  it('advertises feed candidates from the page and ignores unrelated alternates', () => {
    const page = `<head><link rel="alternate" type="application/rss+xml" href="/feed">
      <link rel="alternate" type="application/atom+xml" href="https://example.com/atom.xml">
      <link rel="alternate" hreflang="de" href="/de"></head>`
    expect(parseAdvertisedFeeds(page, 'https://example.com/product')).toEqual([
      'https://example.com/feed', 'https://example.com/atom.xml',
    ])
  })
  it('reads sitemap locations and child sitemap entries', () => {
    const index = '<sitemapindex><sitemap><loc>https://example.com/pages.xml</loc></sitemap></sitemapindex>'
    expect(parseSitemapLocations(index, 'https://example.com/sitemap.xml')).toEqual(['https://example.com/pages.xml'])
    expect(parseSitemapLocations('<urlset><url><loc>/a</loc></url><url><loc>/b</loc></url></urlset>', 'https://example.com/sitemap.xml'))
      .toEqual(['https://example.com/a', 'https://example.com/b'])
  })
})

describe('official link discovery', () => {
  const options = { maximumLinks: 10, maximumProbes: 6 }

  it('prefers a feed advertised by the page and caps results by newest first', async () => {
    const requested: string[] = []
    const result = await discoverOfficialLinks('https://example.com/product', {
      ...options, maximumLinks: 2,
      fetch: async (url) => {
        requested.push(url)
        if (url === 'https://example.com/product') {
          return fetched('<link rel="alternate" type="application/rss+xml" href="/feed">')
        }
        return url === 'https://example.com/feed' ? fetched(atom) : missing()
      },
    })
    expect(requested).toEqual(['https://example.com/product', 'https://example.com/feed'])
    expect(result.links.map(link => link.url)).toEqual([
      'https://example.com/news/2026/11/m6/', 'https://example.com/news/2026/11/m6-ultra/',
    ])
    expect(result.notes[0]).toContain('2 条')
  })

  it('probes well-known feed paths when the page advertises nothing', async () => {
    const requested: string[] = []
    const result = await discoverOfficialLinks('https://example.com/product', {
      ...options,
      fetch: async (url) => {
        requested.push(url)
        return url === 'https://example.com/newsroom/rss-feed.rss' ? fetched(atom) : missing()
      },
    })
    expect(requested).toEqual([
      'https://example.com/product',
      'https://example.com/newsroom/rss-feed.rss',
    ])
    expect(result.links).toHaveLength(2)
  })

  it('falls back to the sitemap and expands one index level', async () => {
    const result = await discoverOfficialLinks('https://example.com/product', {
      ...options, maximumProbes: 8,
      fetch: async (url) => {
        if (url === 'https://example.com/sitemap.xml') {
          return fetched('<sitemapindex><sitemap><loc>https://example.com/pages.xml</loc></sitemap></sitemapindex>')
        }
        if (url === 'https://example.com/pages.xml') {
          return fetched('<urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>')
        }
        return missing()
      },
    })
    expect(result.links.map(link => link.url)).toEqual(['https://example.com/a', 'https://example.com/b'])
    expect(result.notes.at(-1)).toContain('站点地图')
  })

  it('falls through to the sitemap when the feed has no product post', async () => {
    const result = await discoverOfficialLinks('https://example.com/product', {
      ...options, maximumProbes: 8,
      accept: link => /m6/u.test(`${link.title ?? ''} ${link.url}`),
      fetch: async (url) => {
        if (url === 'https://example.com/newsroom/rss-feed.rss') {
          return fetched('<feed><entry><title>Company news</title><link href="https://example.com/news/company"/></entry></feed>')
        }
        if (url === 'https://example.com/sitemap.xml') {
          return fetched('<urlset><url><loc>https://example.com/2026/08/apple-introduces-m6</loc></url><url><loc>https://example.com/accessibility</loc></url></urlset>')
        }
        return missing()
      },
    })
    expect(result.links.map(link => link.url)).toEqual(['https://example.com/2026/08/apple-introduces-m6'])
    expect(result.notes.some(note => note.includes('0 条命中产品'))).toBe(true)
    expect(result.notes.at(-1)).toContain('命中 1 条')
  })

  it('spends no more requests than the caller budget and explains an empty result', async () => {
    let calls = 0
    const result = await discoverOfficialLinks('https://example.com/product', {
      ...options, maximumProbes: 3, maximumLinks: 5,
      fetch: async () => { calls += 1; return missing() },
    })
    expect(calls).toBe(3)
    expect(result.links).toEqual([])
    expect(result.notes.at(-1)).toContain('未提供订阅源或站点地图')
  })

  it('survives a transport failure without throwing', async () => {
    const result = await discoverOfficialLinks('https://example.com/product', {
      ...options, maximumProbes: 1, maximumLinks: 5,
      fetch: async () => { throw new Error('fetch failed') },
    })
    expect(result.links).toEqual([])
    expect(result.notes.some(note => note.includes('fetch failed'))).toBe(true)
  })

  it('rejects a URL that is not an official HTTP site', async () => {
    const result = await discoverOfficialLinks('not a url', {
      ...options, fetch: async () => { throw new Error('should not be requested') },
    })
    expect(result).toEqual({ links: [], notes: ['官方站点地址无效'] })
  })
})
