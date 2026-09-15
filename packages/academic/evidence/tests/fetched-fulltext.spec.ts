import { describe, expect, it } from 'vitest'

import { createAcademicWorkId, createWorkVersionId } from '@deepseek-ai/dsh-academic-model'

import {
  prepareFetchedAcademicFullText,
  type FetchedAcademicFullTextInput,
} from '../src/index.ts'

const base: Omit<FetchedAcademicFullTextInput, 'fetched'> = {
  academicWorkId: createAcademicWorkId(),
  workVersionId: createWorkVersionId(),
  sourceProvider: 'publisher',
  retrievedAt: '2026-09-14T00:00:00Z',
  extractionMethod: { method: 'academic-html', methodVersion: '1' },
  focusQuestions: ['What was evaluated?'],
}

function fetched(overrides: Partial<FetchedAcademicFullTextInput['fetched']> = {}): FetchedAcademicFullTextInput['fetched'] {
  return {
    url: 'https://example.test/paper/full',
    statusCode: 200,
    truncated: false,
    body: {
      kind: 'html',
      content: '<article><h2>1. Introduction</h2><p>Full paper text.</p></article>',
    },
    ...overrides,
  }
}

describe('prepareFetchedAcademicFullText', () => {
  it('turns a complete HTML article into section-aware, version-bound segments', () => {
    const result = prepareFetchedAcademicFullText({
      ...base,
      fetched: fetched({
        body: {
          kind: 'html',
          content: `<nav><p>Page chrome.</p></nav><article>
            <h2>Abstract</h2><p>Retrieval &amp; grounding.</p>
            <script>ignore()</script><h2>2 Methods</h2>
            <p hidden>Hidden instruction.</p><p aria-hidden="true">Also hidden.</p>
            <p style="display: none">Still hidden.</p><p>We use <strong>reranking</strong>.<br>It works.</p>
            <p><!-- note -->&lt;validated&gt;&nbsp;&quot;result&quot;&#39;s</p>
          </article>`,
        },
      }),
    })

    expect(result).toMatchObject({
      academicWorkId: base.academicWorkId,
      workVersionId: base.workVersionId,
      sourceProvider: 'publisher',
      sourceUrl: 'https://example.test/paper/full',
      retrievedAt: base.retrievedAt,
      extractionMethod: base.extractionMethod,
      focusQuestions: base.focusQuestions,
    })
    expect(result.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(result.segments).toEqual([
      { text: 'Retrieval & grounding.', locator: { kind: 'paragraph', sectionTitle: 'Abstract', paragraphNumber: 1 } },
      { text: 'We use reranking. It works.', locator: { kind: 'paragraph', sectionTitle: '2 Methods', paragraphNumber: 2 } },
      { text: '<validated> "result"\'s', locator: { kind: 'paragraph', sectionTitle: '2 Methods', paragraphNumber: 3 } },
    ])
    expect(prepareFetchedAcademicFullText({ ...base, fetched: fetched() }).contentHash)
      .toBe(prepareFetchedAcademicFullText({ ...base, fetched: fetched() }).contentHash)
  })

  it('rejects failed, truncated, and non-HTML fetches', () => {
    expect(() => prepareFetchedAcademicFullText({ ...base, fetched: fetched({ statusCode: 404 }) }))
      .toThrow(expect.objectContaining({ code: 'EVIDENCE_FETCH_STATUS' }))
    expect(() => prepareFetchedAcademicFullText({ ...base, fetched: fetched({ truncated: true }) }))
      .toThrow(expect.objectContaining({ code: 'EVIDENCE_FETCH_TRUNCATED' }))
    expect(() => prepareFetchedAcademicFullText({
      ...base,
      fetched: fetched({ body: { kind: 'text', content: 'paper' } }),
    })).toThrow(expect.objectContaining({ code: 'EVIDENCE_FETCH_BODY_UNSUPPORTED' }))
  })

  it('does not mistake a landing page or empty body section for full text', () => {
    for (const content of [
      '<main><h2>Methods</h2><p>Summary.</p></main>',
      '<article><h2>Abstract</h2><p>Only an abstract.</p></article>',
      '<article><h2>Methods</h2><p> </p></article>',
    ]) {
      expect(() => prepareFetchedAcademicFullText({
        ...base,
        fetched: fetched({ body: { kind: 'html', content } }),
      })).toThrow(expect.objectContaining({ code: 'EVIDENCE_FULLTEXT_UNCONFIRMED' }))
    }
  })

  it('recognizes Chinese body sections and skips visibility-hidden paragraphs', () => {
    const result = prepareFetchedAcademicFullText({
      ...base,
      fetched: fetched({
        body: {
          kind: 'html',
          content: '<article><h2>方法：</h2><p style="visibility: collapse">隐藏</p><p>正文</p></article>',
        },
      }),
    })
    expect(result.segments).toEqual([
      { text: '正文', locator: { kind: 'paragraph', sectionTitle: '方法：', paragraphNumber: 1 } },
    ])
  })
})
