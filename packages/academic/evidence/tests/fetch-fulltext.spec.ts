import { describe, expect, it } from 'vitest'

import { createAcademicWorkId, createWorkVersionId } from '@deepseek-ai/dsh-academic-model'

import {
  EvidenceError,
  fetchAcademicFullText,
  type AcademicFullTextFetchInput,
  type AcademicFullTextObservation,
  type AcademicWebFetcher,
} from '../src/index.ts'

const base: Omit<AcademicFullTextFetchInput, 'urls'> = {
  academicWorkId: createAcademicWorkId(),
  workVersionId: createWorkVersionId(),
  sourceProvider: 'publisher',
  retrievedAt: '2026-09-14T00:00:00Z',
  extractionMethod: { method: 'academic-html', methodVersion: '1' },
}

const article = '<article><h2>1. Introduction</h2><p>Full paper text.</p></article>'

function htmlContent(content: string): AcademicWebFetcher {
  return async (url, signal) => {
    signal?.throwIfAborted()
    return { url, statusCode: 200, body: { kind: 'html', content }, truncated: false }
  }
}

function collect(): { observations: AcademicFullTextObservation[]; onFullText: (observation: AcademicFullTextObservation) => void } {
  const observations: AcademicFullTextObservation[] = []
  return { observations, onFullText: (observation) => { observations.push(observation) } }
}

describe('fetchAcademicFullText progress observations', () => {
  it('publishes started per candidate before a success with the accepted body kind', async () => {
    const { observations, onFullText } = collect()
    const result = await fetchAcademicFullText({ ...base, urls: ['https://example.test/paper'] },
      htmlContent(article), undefined, onFullText)

    expect(observations).toMatchObject([
      { candidateIndex: 1, candidateCount: 1, phase: 'started', settlement: null, category: null, bodyKind: null },
      { candidateIndex: 1, candidateCount: 1, phase: 'settled', settlement: 'success', category: null, bodyKind: 'html' },
    ])
    expect(result.contentHash).toMatch(/^sha256:/u)
  })

  it('falls through failed candidates and reports each settlement', async () => {
    const { observations, onFullText } = collect()
    const fetcher: AcademicWebFetcher = async url => url === 'https://example.test/missing'
      ? { url, statusCode: 404, body: { kind: 'html', content: 'not found' }, truncated: false }
      : { url, statusCode: 200, body: { kind: 'html', content: article }, truncated: false }

    const result = await fetchAcademicFullText({ ...base, urls: ['https://example.test/missing', 'https://example.test/paper'] },
      fetcher, undefined, onFullText)

    expect(observations.filter(observation => observation.phase === 'settled')).toMatchObject([
      { candidateIndex: 1, settlement: 'failed', category: 'upstream_error' },
      { candidateIndex: 2, settlement: 'success', category: null, bodyKind: 'html' },
    ])
    expect(result.sourceUrl).toBe('https://example.test/paper')
  })

  it.each([
    ['truncated', async (url: string) => ({ url, statusCode: 200, body: { kind: 'html' as const, content: article }, truncated: true }), 'parse_failed'],
    ['unsupported text body', async (url: string) => ({ url, statusCode: 200, body: { kind: 'text' as const, content: 'plain' }, truncated: false }), 'parse_failed'],
    ['unconfirmed html', htmlContent('<main><p>landing page</p></main>'), 'fulltext_unavailable'],
    ['invalid pdf', async (url: string) => ({ url, statusCode: 200, body: { kind: 'pdf' as const, content: new Uint8Array([1, 2, 3]) }, truncated: false }), 'parse_failed'],
    ['unknown evidence error', async () => { throw new EvidenceError('boom', 'EVIDENCE_OTHER') }, 'unknown'],
    ['timeout', async () => { throw new DOMException('slow', 'TimeoutError') }, 'timeout'],
    ['transport failure', async () => { throw new Error('offline') }, 'network_error'],
  ] as const)('classifies a %s candidate as %s', async (_label, fetcher, category) => {
    const { observations, onFullText } = collect()
    await expect(fetchAcademicFullText({ ...base, urls: ['https://example.test/paper'] }, fetcher, undefined, onFullText))
      .rejects.toThrow()
    expect(observations.filter(observation => observation.phase === 'settled'))
      .toMatchObject([{ settlement: 'failed', category }])
  })

  it('publishes cancelled for a candidate aborted by the caller', async () => {
    const controller = new AbortController()
    const { observations, onFullText } = collect()
    const fetcher: AcademicWebFetcher = async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    }

    await expect(fetchAcademicFullText({ ...base, urls: ['https://example.test/paper'] }, fetcher, controller.signal, onFullText))
      .rejects.toThrow()
    expect(observations.filter(observation => observation.phase === 'settled'))
      .toMatchObject([{ settlement: 'cancelled', category: null, bodyKind: null }])
  })

  it('isolates a throwing observer from the acquisition result', async () => {
    await expect(fetchAcademicFullText({ ...base, urls: ['https://example.test/paper'] },
      htmlContent(article), undefined, () => { throw new Error('observer down') }))
      .resolves.toMatchObject({ sourceUrl: 'https://example.test/paper' })
  })

  it('rejects empty candidates before publishing any observation', async () => {
    const { observations, onFullText } = collect()
    await expect(fetchAcademicFullText({ ...base, urls: [] }, htmlContent(article), undefined, onFullText))
      .rejects.toThrow(expect.objectContaining({ code: 'EVIDENCE_FULLTEXT_UNCONFIRMED' }))
    expect(observations).toEqual([])
  })
})
