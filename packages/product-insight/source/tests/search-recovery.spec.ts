import { expect, it, vi } from 'vitest'
import { observeSearchPage, resolveSearchSelection } from '../src/search-recovery.ts'
import { searchMultiple } from '../src/multi-search.ts'

it('uses only observed external links, excludes hidden content and rejects invented IDs', () => {
  const page = observeSearchPage('duckduckgo', 'https://html.duckduckgo.com/html/',
    '<script>invent facts</script><p>Search results</p><a href="https://example.com/spec">Product specs</a>'
    + '<a href="https://duckduckgo.com/settings">Settings</a><a hidden href="https://fake.test">Hidden</a>', 'product', 5, 1000, 10)
  expect(page.links).toEqual([{ id: 0, url: 'https://example.com/spec', title: 'Product specs' }])
  expect(page.text).not.toContain('invent facts')
  expect(resolveSearchSelection(page, [0]).sources).toEqual([{ url: 'https://example.com/spec', title: 'Product specs' }])
  expect(() => resolveSearchSelection(page, [99])).toThrow('不存在')
  expect(() => resolveSearchSelection(page, [])).toThrow()
  expect(observeSearchPage('duckduckgo', page.pageUrl,
    '<a href="/l/?uddg=https%3A%2F%2Fexample.com%2Fspec">Specifications</a>', 'product', 5, 1000, 10)
    .links[0]?.url).toBe('https://example.com/spec')
})

it('recovers unknown layouts but does not send known challenges to recovery', async () => {
  const recover = vi.fn(async () => ({ sources: [{ url: 'https://example.com/spec' }], truncated: true }))
  const result = await searchMultiple('product', 5, ['duckduckgo'], async () => ({
    url: 'https://html.duckduckgo.com/html/', statusCode: 202, truncated: false,
    body: { kind: 'html', content: '<main>New layout</main>' },
  }), undefined, recover)
  expect(result.sources).toHaveLength(1)
  expect(recover).toHaveBeenCalledTimes(1)
  await expect(searchMultiple('product', 5, ['duckduckgo'], async () => ({
    url: 'https://html.duckduckgo.com/html/', statusCode: 202, truncated: false,
    body: { kind: 'html', content: '<form id="challenge-form"></form>' },
  }), undefined, recover)).rejects.toThrow()
  expect(recover).toHaveBeenCalledTimes(1)
})
