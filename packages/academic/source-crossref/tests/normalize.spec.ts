import { describe, expect, it } from 'vitest'

import { normalizeCrossrefWork, type CrossrefRawWork } from '../src/index.ts'

const journalArticle: CrossrefRawWork = {
  DOI: '10.0000/Example.RAG.2025.001',
  title: ['Joint evaluation of retrieval and generation'],
  author: [
    { given: 'Alice', family: 'Example' },
    { name: 'Bob Researcher' },
    {},
  ],
  published: { 'date-parts': [[2025, 2, 10]] },
  type: 'journal-article',
  'container-title': ['Example Journal'],
}

const preprint: CrossrefRawWork = {
  DOI: '10.0000/preprint.2024.001',
  title: ['Traceable abstract-level evaluation'],
  author: [{ given: 'Carol', family: 'Scientist' }],
  published: { 'date-parts': [[2024]] },
  type: 'posted-content',
}

describe('normalizeCrossrefWork', () => {
  it('translates a journal article with authors, date, and venue', () => {
    const { academicWork, workVersion } = normalizeCrossrefWork(journalArticle)

    expect(academicWork.title).toBe('Joint evaluation of retrieval and generation')
    expect(academicWork.authors).toEqual(['Alice Example', 'Bob Researcher'])
    expect(academicWork.externalIdentifiers).toEqual([{
      kind: 'doi',
      normalizedValue: '10.0000/example.rag.2025.001',
      originalValue: '10.0000/Example.RAG.2025.001',
      sourceProvider: 'crossref',
    }])
    expect(academicWork.firstPublicDate).toEqual({
      status: 'available',
      value: { iso: '2025-02-10', precision: 'day' },
    })
    expect(academicWork.publicationStatus).toEqual({ status: 'available', value: 'published' })
    expect(academicWork.venue).toEqual({ status: 'available', value: 'Example Journal' })
    expect(workVersion.versionType).toBe('version_of_record')
    expect(workVersion.sourceRecords).toEqual([{ provider: 'crossref', recordId: '10.0000/Example.RAG.2025.001' }])
  })

  it('translates a posted-content preprint at year precision', () => {
    const { academicWork, workVersion } = normalizeCrossrefWork(preprint)

    expect(academicWork.firstPublicDate).toEqual({
      status: 'available',
      value: { iso: '2024', precision: 'year' },
    })
    expect(academicWork.publicationStatus).toEqual({ status: 'available', value: 'preprint' })
    expect(workVersion.versionType).toBe('preprint')
  })
})
