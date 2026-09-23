import { afterEach, describe, expect, it, vi } from 'vitest'

import { CvfProvider, parseCvfCatalog } from '../src/index.ts'

const CATALOG = `<dl>
  <dt class="ptitle"><a href="content/CVPR2026/html/Example_Paper_CVPR_2026_paper.html">Multimodal Retrieval</a></dt>
  <dd>Alice Example, Bob Researcher</dd><dd>CVPR, 2026</dd><dd>[pdf]</dd>
</dl>`

afterEach(() => vi.unstubAllGlobals())

describe('CVF provider', () => {
  it('rejects malformed configured catalog and paper URLs', () => {
    const provider = new CvfProvider(() => ({ catalogUrls: ['bad-url'] }))
    expect(provider.available()).toBe(false)
    expect(provider.fullTextUrls('bad-url')).toEqual([])
  })

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

  it('verifies one workshop paper without fetching a conference catalog', async () => {
    const url = 'https://openaccess.thecvf.com/content/CVPR2025W/MEIS/html/Chen_Multi-Agent_Systems_for_Robotic_Autonomy_with_LLMs_CVPRW_2025_paper.html'
    const pdf = url.replace('/html/', '/papers/').replace('.html', '.pdf')
    const fetch = vi.fn(async () => new Response('<meta name="citation_title" content="Multi-Agent Systems for Robotic Autonomy with LLMs">'
      + '<meta name="citation_author" content="Chen, Junhong">'
      + '<meta name="citation_publication_date" content="2025">'
      + '<meta name="citation_conference_title" content="CVPR Workshops">'
      + `<meta name="citation_pdf_url" content="${pdf}">`))
    vi.stubGlobal('fetch', fetch)
    const provider = new CvfProvider(() => ({ catalogUrls: [] }))
    expect(provider.available()).toBe(false)
    const work = await provider.verifyReference({ kind: 'provider_record', provider: 'cvf', recordId: url,
      discoveryUrl: url })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(work?.academicWork).toMatchObject({ title: 'Multi-Agent Systems for Robotic Autonomy with LLMs',
      authors: ['Chen, Junhong'] })
    expect(work?.workVersion.sourceRecords).toEqual([{ provider: 'cvf', recordId: url }])
  })

  it('rejects noncanonical CVF URLs before a network request', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const provider = new CvfProvider(() => ({ catalogUrls: [] }))
    const recordId = 'https://openaccess.thecvf.com:444/content/CVPR2025/html/Fake_paper.html'
    await expect(provider.verifyReference({ kind: 'provider_record', provider: 'cvf', recordId,
      discoveryUrl: recordId })).rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_INVALID_REQUEST' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('treats missing and mismatched official papers as absent', async () => {
    const url = 'https://openaccess.thecvf.com/content/CVPR2025/html/Example_paper.html'
    const provider = new CvfProvider(() => ({ catalogUrls: [] }))
    const reference = { kind: 'provider_record' as const, provider: 'cvf' as const, recordId: url, discoveryUrl: url }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await expect(provider.verifyReference(reference)).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<meta name=citation_title content="Other">'
      + '<meta name=citation_author content="Alice">'
      + '<meta name=citation_pdf_url content="https://openaccess.thecvf.com/other.pdf">')))
    await expect(provider.verifyReference(reference)).resolves.toBeNull()
  })
})
