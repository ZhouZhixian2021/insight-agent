import { describe, expect, it } from 'vitest'
import { BING_NEWS_MARKET, discoverNewsLinks, newsFeedUrl } from '../src/news-feed.ts'
import type { OfficialLink } from '../src/official-feed.ts'

const item = (title: string, url: string, date = 'Tue, 18 Nov 2026 08:00:00 GMT') =>
  `<item><title>${title}</title><link>${url}</link><pubDate>${date}</pubDate></item>`

const feed = (...items: string[]) =>
  `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>Bing News</title>${items.join('')}</channel></rss>`

const accepts = (link: OfficialLink) => /m6/iu.test(`${link.title ?? ''} ${link.url}`)

describe('news feed', () => {
  it('builds the RSS URL for the market that returned relevant items', () => {
    const url = new URL(newsFeedUrl('Apple M6 chip'))
    expect(url.origin + url.pathname).toBe('https://www.bing.com/news/search')
    expect(url.searchParams.get('q')).toBe('Apple M6 chip')
    expect(url.searchParams.get('format')).toBe('rss')
    expect(url.searchParams.get('setmkt')).toBe(BING_NEWS_MARKET)
    expect(url.searchParams.get('setlang')).toBe('en')
  })

  it('keeps accepted items with their publication date', async () => {
    const result = await discoverNewsLinks('Apple M6', accepts, { maximumLinks: 6,
      read: async () => feed(item('MacBook Pro M6 review', 'https://review.test/m6-pro'),
        item('Wallpaper of the day', 'https://example.test/wallpaper')) })
    expect(result.links).toMatchObject([{ url: 'https://review.test/m6-pro', title: 'MacBook Pro M6 review',
      publishedAt: 'Tue, 18 Nov 2026 08:00:00 GMT' }])
  })

  it('filters before applying the link bound', async () => {
    const general = Array.from({ length: 8 }, (_, index) =>
      item(`Daily briefing ${index}`, `https://news.test/briefing-${index}`))
    const result = await discoverNewsLinks('Apple M6', accepts, { maximumLinks: 1,
      read: async () => feed(...general, item('iMac M6 hands-on', 'https://review.test/imac-m6')) })
    expect(result.links.map(link => link.url)).toEqual(['https://review.test/imac-m6'])
  })

  it('collapses repeated links inside one feed', async () => {
    const result = await discoverNewsLinks('Apple M6', accepts, { maximumLinks: 6,
      read: async () => feed(item('M6 review', 'https://review.test/m6'), item('M6 review again', 'https://review.test/m6')) })
    expect(result.links).toHaveLength(1)
  })

  it('reports the URL it read and skips an empty query', async () => {
    const read = async () => feed(item('M6 review', 'https://review.test/m6'))
    expect((await discoverNewsLinks('Apple M6', accepts, { maximumLinks: 6, read })).attempted)
      .toEqual([newsFeedUrl('Apple M6')])
    expect(await discoverNewsLinks('   ', accepts, { maximumLinks: 6, read })).toEqual({ links: [], attempted: [] })
  })

  it('fails when the transport returns no document', async () => {
    await expect(discoverNewsLinks('Apple M6', accepts, { maximumLinks: 6, read: async () => undefined }))
      .rejects.toThrow('News feed returned no document.')
  })

  it('rejects a bound that cannot retain a link', async () => {
    await expect(discoverNewsLinks('Apple M6', accepts, { maximumLinks: 0, read: async () => feed() }))
      .rejects.toThrow('maximumLinks must be a positive integer')
  })
})
