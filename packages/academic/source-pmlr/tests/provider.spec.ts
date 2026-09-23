import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AcademicSourceRuntime from '@deepseek-ai/dsh-academic-source'

import { parsePmlrCatalog, PmlrProvider } from '../src/index.ts'
import * as plugin from '../src/index.ts'

const CATALOG = `<h2>Volume 267: International Conference on Machine Learning, July 2025</h2>
<div class="paper"><p class="title">Robust Retrieval Models</p>
<p class="details">Alice Example, Bob Researcher; Proceedings of ICML, PMLR 267:1-20</p>
<p class="links"><a href="/v267/example25a.html">abs</a></p></div>`

afterEach(() => vi.unstubAllGlobals())

describe('PMLR provider', () => {
  it('rejects malformed configured catalog and paper ids', () => {
    const provider = new PmlrProvider(() => ({
      baseURL: 'https://proceedings.mlr.press', catalogUrls: ['bad-url'], maxCachedRecords: 1 }))
    expect(provider.available()).toBe(false)
    expect(provider.fullTextUrls('bad-id')).toEqual([])
  })

  it('parses, searches, normalizes, and resolves the canonical PDF URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(CATALOG)))
    const provider = new PmlrProvider(() => ({
      baseURL: 'https://proceedings.mlr.press',
      catalogUrls: ['https://proceedings.mlr.press/v267/'],
      maxCachedRecords: 100,
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

  it('verifies one paper with no catalog and uses its published PDF location', async () => {
    const pdf = 'https://raw.githubusercontent.com/mlresearch/v336/main/assets/applebaum26a/applebaum26a.pdf'
    const fetch = vi.fn(async () => new Response('<meta name="citation_title" content="Attribution Sets">'
      + '<meta name="citation_author" content="Lorne Applebaum">'
      + '<meta name="citation_publication_date" content="2026/06/29">'
      + '<meta name="citation_conference_title" content="COLT 2026">'
      + '<meta name="citation_abstract_html_url" content="https://proceedings.mlr.press/v336/applebaum26a.html">'
      + `<meta name="citation_pdf_url" content="${pdf}">`))
    vi.stubGlobal('fetch', fetch)
    const provider = new PmlrProvider(() => ({ baseURL: 'https://proceedings.mlr.press', catalogUrls: [], maxCachedRecords: 1 }))
    expect(provider.available()).toBe(false)
    const reference = { kind: 'provider_record' as const, provider: 'pmlr' as const,
      recordId: 'v336/applebaum26a', discoveryUrl: 'https://proceedings.mlr.press/v336/applebaum26a.html' }
    const work = await provider.verifyReference(reference)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(work?.academicWork).toMatchObject({ title: 'Attribution Sets', authors: ['Lorne Applebaum'] })
    expect(provider.fullTextUrls(reference.recordId)).toEqual([pdf])
  })

  it('does not accept a different PMLR abstract URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<meta name=citation_title content="Other">'
      + '<meta name=citation_author content="Alice">'
      + '<meta name=citation_abstract_html_url content="https://proceedings.mlr.press/v336/other.html">')))
    const provider = new PmlrProvider(() => ({ baseURL: 'https://proceedings.mlr.press', catalogUrls: [], maxCachedRecords: 1 }))
    await expect(provider.verifyReference({ kind: 'provider_record', provider: 'pmlr', recordId: 'v336/applebaum26a',
      discoveryUrl: 'https://proceedings.mlr.press/v336/applebaum26a.html' })).resolves.toBeNull()
  })

  it('rejects invalid references and treats a missing official record as absent', async () => {
    const provider = new PmlrProvider(() => ({
      baseURL: 'https://proceedings.mlr.press', catalogUrls: [], maxCachedRecords: 1 }))
    const fetch = vi.fn(async () => new Response('', { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    await expect(provider.verifyReference({ kind: 'provider_record', provider: 'pmlr', recordId: 'invalid',
      discoveryUrl: 'https://proceedings.mlr.press/v336/' })).rejects.toMatchObject({
      code: 'ACADEMIC_SOURCE_INVALID_REQUEST' })
    expect(fetch).not.toHaveBeenCalled()
    await expect(provider.verifyReference({ kind: 'provider_record', provider: 'pmlr', recordId: 'v336/applebaum26a',
      discoveryUrl: 'https://proceedings.mlr.press/v336/applebaum26a.html' })).resolves.toBeNull()
  })

  it('uses only safe published PDF URLs and evicts the oldest verified location', async () => {
    const pages = [
      ['v238/first24a', 'http://example.org/insecure.pdf'],
      ['v238/second24a', 'https://example.org/second.pdf'],
    ] as const
    const fetch = vi.fn(async (url: URL) => {
      const [recordId, pdf] = pages.find(([id]) => url.pathname === `/${id}.html`)!
      return new Response(`<meta name=citation_title content="Official Paper">
<meta name=citation_author content="Alice">
<meta name=citation_abstract_html_url content="https://proceedings.mlr.press/${recordId}.html">
<meta name=citation_pdf_url content="${pdf}">`)
    })
    vi.stubGlobal('fetch', fetch)
    const provider = new PmlrProvider(() => ({
      baseURL: 'https://proceedings.mlr.press', catalogUrls: [], maxCachedRecords: 1 }))
    for (const [recordId] of pages) {
      await expect(provider.verifyReference({ kind: 'provider_record', provider: 'pmlr', recordId,
        discoveryUrl: `https://proceedings.mlr.press/${recordId}.html` })).resolves.not.toBeNull()
      if (recordId === 'v238/first24a') expect(provider.fullTextUrls(recordId)).toEqual([])
    }
    expect(provider.fullTextUrls('v238/second24a')).toEqual(['https://example.org/second.pdf'])
    expect(provider.fullTextUrls('v238/first24a')).toEqual([
      'https://proceedings.mlr.press/v238/first24a/first24a.pdf',
    ])
  })

  it.each([null, 'not-a-url'] as const)('retains metadata without a usable PDF URL %s', async (pdf) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<meta name=citation_title content="Official Paper">'
      + '<meta name=citation_author content="Alice">'
      + '<meta name=citation_abstract_html_url content="https://proceedings.mlr.press/v238/example24a.html">'
      + (pdf === null ? '' : `<meta name=citation_pdf_url content="${pdf}">`))))
    const provider = new PmlrProvider(() => ({
      baseURL: 'https://proceedings.mlr.press', catalogUrls: [], maxCachedRecords: 1 }))
    const recordId = 'v238/example24a'
    await expect(provider.verifyReference({ kind: 'provider_record', provider: 'pmlr', recordId,
      discoveryUrl: 'https://proceedings.mlr.press/v238/example24a.html' })).resolves.not.toBeNull()
    expect(provider.fullTextUrls(recordId)).toEqual([])
  })
})

it('registers the PMLR verifier with defaults and validates its cache bound', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(AcademicSourceRuntime)
    for (const maxCachedRecords of [0, 1.5]) {
      expect(() => { plugin.apply(ctx, { maxCachedRecords }) }).toThrow(/positive safe integer/u)
    }
    plugin.apply(ctx, {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await expect(ctx.academicSource.verifyReference({ kind: 'provider_record', provider: 'pmlr',
      recordId: 'v238/example24a', discoveryUrl: 'https://proceedings.mlr.press/v238/example24a.html' },
    ['pmlr'])).resolves.toMatchObject({ status: 'failed', failure: { category: 'not_found' } })
  } finally { await ctx.fiber.dispose() }
})
