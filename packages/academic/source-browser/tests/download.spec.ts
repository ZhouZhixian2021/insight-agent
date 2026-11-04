import { access, writeFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { downloadAcademicPdf } from '../src/download.ts'
import { BrowserAcademicProvider } from '../src/provider.ts'
import type { BrowserAcademicOptions } from '../src/types.ts'

const options: BrowserAcademicOptions = {
  sites: [{ url: 'https://papers.example/search', scope: 'Fixture papers.', inputSelector: '#q', mode: 'submit',
    readySelector: '#results', resultSelector: 'a.paper', paperUrlPattern: '^https://papers[.]example/paper/',
    pdfOrigins: ['https://files.example'] }],
  maximumResults: 1, maximumCachedRecords: 1, operationTimeoutMs: 1000, maximumMetadataCharacters: 2000,
  maximumPdfBytes: 50, otherFetchProvider: 'http',
}
const landing = 'https://papers.example/paper/1'
const pdf = 'https://files.example/1.pdf'

describe('academic browser PDF acquisition', () => {
  it.each([
    { body: '%PDF-real bytes', url: pdf, limit: 50, code: null },
    { body: '<html>viewer</html>', url: pdf, limit: 50, code: 'ACADEMIC_BROWSER_PDF_INVALID' },
    { body: '%PDF-too large', url: pdf, limit: 5, code: 'ACADEMIC_BROWSER_PDF_TOO_LARGE' },
    { body: '%PDF-foreign', url: 'https://foreign.example/1.pdf', limit: 50, code: 'ACADEMIC_BROWSER_PDF_ORIGIN' },
  ])('validates completed downloads and always removes temporary files: $code', async ({ body, url, limit, code }) => {
    let file = ''
    const execute = vi.fn(async (script: string) => {
      const line = script.match(/const input = (.+);/)
      if (line?.[1] === undefined) throw new Error('Missing serialized download settings')
      const input = JSON.parse(line[1]) as { file: string; landing: string; pdf: string }
      expect(input).toMatchObject({ landing, pdf })
      file = input.file
      await writeFile(file, body)
      return { url, statusCode: 200 }
    })
    const operation = downloadAcademicPdf(execute, landing, pdf, { ...options, maximumPdfBytes: limit }, new AbortController().signal)
    if (code === null) expect(await operation).toMatchObject({ url: pdf, statusCode: 200, body: { kind: 'pdf', content: Buffer.from(body) } })
    else await expect(operation).rejects.toMatchObject({ code })
    await expect(access(file)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('routes other-source URLs to the configured provider without starting a browser', async () => {
    const execute = vi.fn()
    const otherFetch = vi.fn(async () => ({ url: pdf, statusCode: 200, body: { kind: 'pdf' as const, content: Buffer.from('%PDF-') }, truncated: false }))
    const provider = new BrowserAcademicProvider(options, execute, () => true, otherFetch)
    await expect(provider.fetch({ url: pdf })).resolves.toMatchObject({ statusCode: 200 })
    expect(otherFetch).toHaveBeenCalledOnce()
    expect(execute).not.toHaveBeenCalled()
    await provider.dispose()
    await expect(provider.fetch({ url: pdf })).rejects.toMatchObject({ code: 'ACADEMIC_BROWSER_PDF_ABORTED' })
    expect(otherFetch).toHaveBeenCalledOnce()
  })
})
