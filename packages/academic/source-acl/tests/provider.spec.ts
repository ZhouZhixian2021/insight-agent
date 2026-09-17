import { afterEach, describe, expect, it, vi } from 'vitest'

import { AclProvider, parseAclCatalog } from '../src/index.ts'

const CATALOG = '<p><a class=align-middle href=/2025.acl-long.42/>Evidence-Grounded Language Models</a></p>'

afterEach(() => vi.unstubAllGlobals())

describe('ACL provider', () => {
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
})
