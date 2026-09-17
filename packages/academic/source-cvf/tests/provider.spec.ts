import { afterEach, describe, expect, it, vi } from 'vitest'

import { CvfProvider, parseCvfCatalog } from '../src/index.ts'

const CATALOG = `<dl>
  <dt class="ptitle"><a href="content/CVPR2026/html/Example_Paper_CVPR_2026_paper.html">Multimodal Retrieval</a></dt>
  <dd>Alice Example, Bob Researcher</dd><dd>CVPR, 2026</dd><dd>[pdf]</dd>
</dl>`

afterEach(() => vi.unstubAllGlobals())

describe('CVF provider', () => {
  it('parses, searches, normalizes, and resolves the official PDF URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(CATALOG)))
    const provider = new CvfProvider(() => ({ catalogUrls: ['https://openaccess.thecvf.com/CVPR2026?day=all'] }))
    const result = await provider.search({ query: 'multimodal retrieval', maxResults: 2 })

    expect(parseCvfCatalog(CATALOG, new URL('https://openaccess.thecvf.com/CVPR2026?day=all'))[0]?.authors)
      .toEqual(['Alice Example', 'Bob Researcher'])
    expect(result.works[0]?.academicWork).toMatchObject({ title: 'Multimodal Retrieval', publicationStatus: { value: 'published' } })
    expect(provider.fullTextUrls(result.works[0]!.workVersion.sourceRecords[0]!.recordId)).toEqual([
      'https://openaccess.thecvf.com/content/CVPR2026/papers/Example_Paper_CVPR_2026_paper.pdf',
    ])
  })
})
