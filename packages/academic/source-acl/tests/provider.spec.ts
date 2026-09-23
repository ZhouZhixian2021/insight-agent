import { afterEach, describe, expect, it, vi } from 'vitest'

import { AclProvider, parseAclCatalog } from '../src/index.ts'

const CATALOG = '<p><a class=align-middle href=/2025.acl-long.42/>Evidence-Grounded Language Models</a></p>'

afterEach(() => vi.unstubAllGlobals())

describe('ACL provider', () => {
  it('rejects malformed configured catalog URLs', () => {
    const provider = new AclProvider(() => ({
      baseURL: 'https://aclanthology.org', catalogUrls: ['https://aclanthology.org/2025.acl-long/', 'bad-url'] }))
    expect(provider.available()).toBe(false)
  })

  it('parses, searches, normalizes, and resolves the official PDF URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(CATALOG)))
    const provider = new AclProvider(() => ({
      baseURL: 'https://aclanthology.org',
      catalogUrls: ['https://aclanthology.org/2025.acl-long/'],
    }))
    const result = await provider.search({ query: 'evidence grounded' })

    expect(parseAclCatalog(CATALOG)[0]).toMatchObject({ recordId: '2025.acl-long.42', venue: 'ACL' })
    expect(result.works[0]?.academicWork.externalIdentifiers).toContainEqual(expect.objectContaining({
      kind: 'doi', normalizedValue: '10.18653/v1/2025.acl-long.42',
    }))
    expect(provider.fullTextUrls('2025.acl-long.42')).toEqual([
      'https://aclanthology.org/2025.acl-long.42.pdf',
    ])
  })

  it('verifies one paper without fetching a volume catalog', async () => {
    const fetch = vi.fn(async (_url: URL) => new Response('<meta name=citation_title content="Official ACL Paper">'
      + '<meta name=citation_author content="Alice Example">'
      + '<meta name=citation_publication_date content="2024/8">'
      + '<meta name=citation_conference_title content="ACL 2024">'
      + '<meta name=citation_doi content="10.18653/v1/2024.acl-long.1">'
      + '<meta name=citation_pdf_url content="https://aclanthology.org/2024.acl-long.1.pdf">'))
    vi.stubGlobal('fetch', fetch)
    const provider = new AclProvider(() => ({ baseURL: 'https://aclanthology.org', catalogUrls: [] }))
    expect(provider.available()).toBe(false)
    const reference = { kind: 'provider_record' as const, provider: 'acl' as const,
      recordId: '2024.acl-long.1', discoveryUrl: 'https://aclanthology.org/2024.acl-long.1/' }
    const work = await provider.verifyReference(reference)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((fetch.mock.calls[0]?.[0] as URL).href).toBe(reference.discoveryUrl)
    expect(work?.academicWork).toMatchObject({ title: 'Official ACL Paper', authors: ['Alice Example'] })
    expect(work?.academicWork.externalIdentifiers).toContainEqual(expect.objectContaining({ kind: 'doi' }))
    expect(work?.workVersion.sourceRecords).toEqual([{ provider: 'acl', recordId: reference.recordId }])
  })

  it('rejects a missing or mismatched official ACL record', async () => {
    const provider = new AclProvider(() => ({ baseURL: 'https://aclanthology.org', catalogUrls: [] }))
    const reference = { kind: 'provider_record' as const, provider: 'acl' as const,
      recordId: '2024.acl-long.1', discoveryUrl: 'https://aclanthology.org/2024.acl-long.1/' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await expect(provider.verifyReference(reference)).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<meta name=citation_title content="Other Paper">'
      + '<meta name=citation_author content="Alice">'
      + '<meta name=citation_pdf_url content="https://aclanthology.org/2024.acl-long.2.pdf">')))
    await expect(provider.verifyReference(reference)).resolves.toBeNull()
  })

  it('keeps upstream rate limits and incomplete citation metadata distinct', async () => {
    const provider = new AclProvider(() => ({ baseURL: 'https://aclanthology.org', catalogUrls: [] }))
    const reference = { kind: 'provider_record' as const, provider: 'acl' as const,
      recordId: '2024.acl-long.1', discoveryUrl: 'https://aclanthology.org/2024.acl-long.1/' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })))
    await expect(provider.verifyReference(reference)).rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_RATE_LIMIT' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<meta name=citation_title content="Missing authors">')))
    await expect(provider.verifyReference(reference)).rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_PARSE_ERROR' })
  })

  it.each([
    { kind: 'provider_record', provider: 'acl', recordId: 'volume-only',
      discoveryUrl: 'https://aclanthology.org/volume-only/' },
    { kind: 'provider_record', provider: 'pmlr', recordId: '2024.acl-long.1',
      discoveryUrl: 'https://aclanthology.org/2024.acl-long.1/' },
    { kind: 'doi', normalizedValue: '10.18653/v1/2024.acl-long.1',
      originalValue: '10.18653/v1/2024.acl-long.1', discoveryUrl: 'https://doi.org/10.18653/v1/2024.acl-long.1' },
  ] as const)('rejects a non-ACL paper reference before fetching', async (reference) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const provider = new AclProvider(() => ({ baseURL: 'https://aclanthology.org', catalogUrls: [] }))
    await expect(provider.verifyReference(reference)).rejects.toMatchObject({
      code: 'ACADEMIC_SOURCE_INVALID_REQUEST' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
