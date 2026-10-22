import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AcademicSourceRuntime from '@deepseek-ai/dsh-academic-source'
import * as openalex from '../src/index.ts'

it('loads discovery through YAML and returns real batch and full-text output without touching catalogs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'academic-openalex-loader-'))
  const ctx = new Context()
  try {
    const file = join(root, 'cordis.yml')
    await writeFile(file, [
      "- name: '@deepseek-ai/dsh-academic-source'",
      '  config:', '    searchProviders: [openalex]', '    searchTimeoutMs: 1000',
      "- name: '@deepseek-ai/dsh-academic-source-openalex'",
      '  config:', "    publicationYears: '2017-2020'", '    maxResults: 5',
      '',
    ].join('\n'))
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([['@deepseek-ai/dsh-academic-source', AcademicSourceRuntime],
      ['@deepseek-ai/dsh-academic-source-openalex', openalex]])
    ctx.loader.internal = { version: 'v2', async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected import: ${specifier}`)
      return modules.get(specifier)
    } } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(file).href } })
    await ctx.loader.await()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ meta: { count: 1 }, results: [{
      id: 'https://openalex.org/W2963341956', title: 'BERT', authorships: [{ author: { display_name: 'Jacob Devlin' } }],
      doi: 'https://doi.org/10.18653/v1/n19-1423', publication_date: '2019-06-01', type: 'conference-paper',
      primary_location: { version: 'publishedVersion' }, locations: [],
    }] }))))
    const result = await ctx.academicSource.searchAll({ query: 'BERT', maxResults: 5 })
    expect({ providers: result.providers, status: result.batch.status, count: result.discoveredRecords,
      truncated: result.truncated, title: result.works[0]?.academicWork.title,
      fulltext: ctx.academicSource.resolveFullText(result.works[0]!.workVersion) }).toMatchInlineSnapshot(`
        {
          "count": 1,
          "fulltext": {
            "sourceProvider": "openalex",
            "urls": [
              "https://aclanthology.org/N19-1423.pdf",
            ],
          },
          "providers": [
            "openalex",
          ],
          "status": "success",
          "title": "BERT",
          "truncated": false,
        }
      `)
    expect(result.limitations.some(line => line.includes('2017-2020'))).toBe(true)
  } finally {
    vi.unstubAllGlobals()
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
