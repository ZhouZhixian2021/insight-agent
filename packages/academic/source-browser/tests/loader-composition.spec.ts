import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AcademicSourceRuntime from '@deepseek-ai/dsh-academic-source'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import Web from '@deepseek-ai/dsh-web'
import * as browser from '../src/index.ts'

it('loads browser discovery through YAML, retains observed PDFs, and removes registration on unload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'academic-browser-loader-'))
  const ctx = new Context()
  const execute = vi.fn().mockResolvedValue({ isError: false, content: [{ type: 'text', text: '### Result\n'
    + JSON.stringify({ papers: [{ url: 'https://papers.example/paper/1', html:
      '<meta name=citation_title content="Observed Paper"><meta name=citation_author content="A. Author">'
      + '<meta name=citation_pdf_url content="https://files.example/real.pdf">' }], truncated: true }) }] })
  try {
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(Web)
    // Only the external browser connection and its opaque Agent identity are substituted.
    ctx.provide('browserUse', { providerName: 'playwright-mcp' } as never)
    ctx.provide('tools', { get: () => ({}), execute } as never)
    const file = join(root, 'cordis.yml')
    await writeFile(file, [
      "- name: '@deepseek-ai/dsh-academic-source'", '  config:', '    searchProviders: [browser]',
      "- name: '@deepseek-ai/dsh-academic-source-browser'", '  config:', '    sites:',
      '      - url: https://papers.example/search', '        scope: Configured test conference only.',
      '        inputSelector: "#query"', '        mode: submit', '        readySelector: "#results"',
      '        resultSelector: a.paper', '        paperUrlPattern: "^https://papers[.]example/paper/"',
      '        pdfOrigins: [https://files.example]', '',
    ].join('\n'))
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([['@deepseek-ai/dsh-academic-source', AcademicSourceRuntime],
      ['@deepseek-ai/dsh-academic-source-browser', browser]])
    const internal = ctx.loader.internal
    if (internal === undefined) throw new Error('Node module loader is unavailable')
    ctx.loader.internal = new Proxy(internal, { get(target, property, receiver) {
      if (property === 'import') return async (specifier: string) => {
        if (!modules.has(specifier)) throw new Error(`Unexpected import: ${specifier}`)
        return modules.get(specifier)
      }
      const value: unknown = Reflect.get(target, property, receiver)
      return value
    } })
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(file).href } })
    await ctx.loader.await()
    const academic = ctx.get('academicSource')
    const agents = ctx.get('agents')
    if (academic === undefined || agents === undefined) throw new Error('Loader did not mount Academic services')
    const result = await agents.withInitiator({} as never, () => academic.searchAll({ query: 'observed' }))
    expect({ providers: result.providers, status: result.batch.status, title: result.works[0]?.academicWork.title,
      truncated: result.truncated, fulltext: academic.resolveFullText(result.works[0]!.workVersion) }).toEqual({
      providers: ['browser'], status: 'success', title: 'Observed Paper', truncated: true,
      fulltext: { sourceProvider: 'browser', urls: ['https://files.example/real.pdf'] },
    })
    expect(result.limitations).toContain('Configured test conference only.')
    expect(execute).toHaveBeenCalledTimes(1)
    const discovery = await agents.withInitiator({} as never, () => ctx.web.search({ query: 'ordinary web search', maxResults: 1 }))
    expect(discovery).toMatchObject({ sources: [{ url: 'https://papers.example/paper/1', title: 'Observed Paper' }], truncated: true })
    expect(discovery.content).toContain('浏览器学术站内搜索。')
    expect(discovery.content).toContain('Configured test conference only.')
    expect(JSON.stringify(execute.mock.calls[1]?.[0])).toContain('ordinary web search')
    execute.mockImplementationOnce(async (request: { arguments: { code: string } }) => {
      const line = request.arguments.code.match(/const input = (.+);/)
      if (line?.[1] === undefined) throw new Error('Missing download settings')
      const input = JSON.parse(line[1]) as { file: string }
      await writeFile(input.file, '%PDF-browser download')
      return { isError: false, content: [{ type: 'text', text: '### Result\n'
        + JSON.stringify({ url: 'https://files.example/real.pdf' }) }] }
    })
    const fetched = await agents.withInitiator({} as never,
      () => ctx.web.fetch({ url: 'https://files.example/real.pdf' }, undefined, { providerId: 'browser' }))
    expect(fetched).toMatchObject({ statusCode: 200, body: { kind: 'pdf', content: Buffer.from('%PDF-browser download') } })
    const web = ctx.web
    await ctx.fiber.dispose()
    await expect(web.fetch({ url: 'https://files.example/real.pdf' }, undefined, { providerId: 'browser' }))
      .rejects.toMatchObject({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' })
    await expect(web.search({ query: 'ordinary web search' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_UNAVAILABLE' })
    await expect(academic.searchAll({ query: 'observed' })).rejects.toMatchObject({ code: 'ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING' })
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
