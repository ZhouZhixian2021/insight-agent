import { afterEach, describe, expect, it, vi } from 'vitest'

import { parsePmlrCatalog, PmlrProvider } from '../src/index.ts'

const CATALOG = `<h2>Volume 267: International Conference on Machine Learning, July 2025</h2>
<div class="paper"><p class="title">Robust Retrieval Models</p>
<p class="details">Alice Example, Bob Researcher; Proceedings of ICML, PMLR 267:1-20</p>
<p class="links"><a href="/v267/example25a.html">abs</a></p></div>`

afterEach(() => vi.unstubAllGlobals())

describe('PMLR provider', () => {
  it('parses, searches, normalizes, and resolves the canonical PDF URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(CATALOG)))
    const provider = new PmlrProvider(() => ({
      baseURL: 'https://proceedings.mlr.press',
      catalogUrls: ['https://proceedings.mlr.press/v267/'],
    }))
    const result = await provider.search({ query: 'robust retrieval' })

    expect(parsePmlrCatalog(CATALOG, new URL('https://proceedings.mlr.press/v267/'))[0]).toMatchObject({
      recordId: 'v267/example25a', year: '2025', venue: 'Proceedings of ICML',
    })
    expect(result.works[0]?.academicWork.authors).toEqual(['Alice Example', 'Bob Researcher'])
    expect(provider.fullTextUrls('v267/example25a')).toEqual([
      'https://proceedings.mlr.press/v267/example25a/example25a.pdf',
    ])
  })
})
