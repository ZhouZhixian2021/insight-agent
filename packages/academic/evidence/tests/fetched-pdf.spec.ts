import { describe, expect, it, vi } from 'vitest'

import { createAcademicWorkId, createWorkVersionId } from '@deepseek-ai/dsh-academic-model'

import {
  fetchAcademicFullText,
  prepareFetchedAcademicPdf,
  type FetchedAcademicFullTextInput,
} from '../src/index.ts'

const base: Omit<FetchedAcademicFullTextInput, 'fetched'> = {
  academicWorkId: createAcademicWorkId(),
  workVersionId: createWorkVersionId(),
  sourceProvider: 'arxiv',
  retrievedAt: '2026-09-14T00:00:00Z',
  extractionMethod: { method: 'pdfjs', methodVersion: '6.3.289' },
}

function onePagePdf(text: string): Uint8Array {
  const escaped = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object) => {
    const offset = Buffer.byteLength(body, 'latin1')
    body += object
    return offset
  })
  const xref = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\n`
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(body, 'latin1'))
}

function fetched(content: Uint8Array): FetchedAcademicFullTextInput['fetched'] {
  return { url: 'https://arxiv.org/pdf/2406.12345v1', statusCode: 200, body: { kind: 'pdf', content }, truncated: false }
}

describe('academic PDF full text', () => {
  it('extracts page-located text and falls back from unavailable arXiv HTML to PDF', async () => {
    const pdf = onePagePdf('Methods and results from the arXiv PDF.')
    const direct = await prepareFetchedAcademicPdf({ ...base, fetched: fetched(pdf) })
    expect(direct.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(direct.segments).toEqual([{
      text: 'Methods and results from the arXiv PDF.',
      locator: { kind: 'page_section', sectionTitle: 'PDF page 1', pdfPage: 1 },
    }])

    const fetcher = vi.fn(async (url: string) => url.includes('/html/')
      ? { url, statusCode: 404, body: { kind: 'html' as const, content: 'not found' }, truncated: false }
      : fetched(pdf))
    const result = await fetchAcademicFullText({
      ...base,
      urls: ['https://arxiv.org/html/2406.12345v1', 'https://arxiv.org/pdf/2406.12345v1'],
    }, fetcher)
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://arxiv.org/html/2406.12345v1',
      'https://arxiv.org/pdf/2406.12345v1',
    ])
    expect(result.segments).toEqual(direct.segments)
  })

  it('rejects invalid, truncated, and textless PDFs', async () => {
    await expect(prepareFetchedAcademicPdf({ ...base, fetched: fetched(new Uint8Array([1, 2, 3])) }))
      .rejects.toThrow(expect.objectContaining({ code: 'EVIDENCE_PDF_PARSE_FAILED' }))
    await expect(prepareFetchedAcademicPdf({ ...base, fetched: { ...fetched(onePagePdf('x')), truncated: true } }))
      .rejects.toThrow(expect.objectContaining({ code: 'EVIDENCE_FETCH_TRUNCATED' }))
    await expect(prepareFetchedAcademicPdf({ ...base, fetched: fetched(onePagePdf('')) }))
      .rejects.toThrow(expect.objectContaining({ code: 'EVIDENCE_FULLTEXT_UNCONFIRMED' }))
    await expect(prepareFetchedAcademicPdf({ ...base, fetched: { ...fetched(onePagePdf('x')), statusCode: 404 } }))
      .rejects.toThrow(expect.objectContaining({ code: 'EVIDENCE_FETCH_STATUS' }))
    await expect(prepareFetchedAcademicPdf({
      ...base,
      fetched: { ...fetched(onePagePdf('x')), body: { kind: 'text', content: 'not pdf' } },
    })).rejects.toThrow(expect.objectContaining({ code: 'EVIDENCE_FETCH_BODY_UNSUPPORTED' }))
  })

  it('rejects empty candidates and reports the last candidate failure', async () => {
    await expect(fetchAcademicFullText({ ...base, urls: [] }, vi.fn()))
      .rejects.toThrow(expect.objectContaining({ code: 'EVIDENCE_FULLTEXT_UNCONFIRMED' }))
    await expect(fetchAcademicFullText({ ...base, urls: ['https://arxiv.org/html/x'] }, async url => ({
      url, statusCode: 404, body: { kind: 'html', content: 'not found' }, truncated: false,
    })))
      .rejects.toThrow(expect.objectContaining({ code: 'EVIDENCE_FETCH_STATUS' }))
  })
})
