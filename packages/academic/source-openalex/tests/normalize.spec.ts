import { describe, expect, it } from 'vitest'

import { normalizeOpenAlexWork, type OpenAlexRawWork } from '../src/index.ts'

const fullArticleRecord: OpenAlexRawWork = {
  id: 'https://openalex.org/W2111111111',
  doi: 'https://doi.org/10.0000/Example.RAG.2025.001',
  display_name: 'Joint evaluation of retrieval and generation',
  authorships: [
    { author: { display_name: 'Example Author A' } },
    { author: { display_name: null } },
  ],
  publication_year: 2025,
  publication_date: '2025-02-10',
  type: 'article',
  is_retracted: false,
  primary_location: { source: { display_name: 'Example Conference' } },
}

const preprintRecord: OpenAlexRawWork = {
  id: 'https://openalex.org/W2222222222',
  doi: null,
  display_name: 'Traceable abstract-level evaluation',
  authorships: [{ author: { display_name: 'Example Author B' } }],
  publication_year: 2024,
  publication_date: null,
  type: 'preprint',
  is_retracted: null,
  primary_location: null,
}

const retractedRecord: OpenAlexRawWork = {
  id: 'https://openalex.org/W3333333333',
  doi: null,
  display_name: 'Retracted domain benchmark overview',
  authorships: [{ author: { display_name: 'Example Author C' } }],
  publication_year: null,
  publication_date: null,
  type: 'book-chapter',
  is_retracted: true,
  primary_location: { source: null },
}

const untypedRecord: OpenAlexRawWork = {
  id: 'https://openalex.org/W4444444444',
  doi: null,
  display_name: 'Untyped metadata record',
  authorships: [],
  publication_year: null,
  publication_date: null,
  type: null,
  is_retracted: null,
  primary_location: { source: { display_name: null } },
}

describe('normalizeOpenAlexWork', () => {
  it('translates a published article record with DOI and venue', () => {
    const { academicWork, workVersion } = normalizeOpenAlexWork(fullArticleRecord)

    expect(academicWork.title).toBe('Joint evaluation of retrieval and generation')
    expect(academicWork.authors).toEqual(['Example Author A'])
    expect(academicWork.externalIdentifiers).toEqual([
      {
        kind: 'openalex',
        normalizedValue: 'W2111111111',
        originalValue: 'https://openalex.org/W2111111111',
        sourceProvider: 'openalex',
      },
      {
        kind: 'doi',
        normalizedValue: '10.0000/example.rag.2025.001',
        originalValue: 'https://doi.org/10.0000/Example.RAG.2025.001',
        sourceProvider: 'openalex',
      },
    ])
    expect(academicWork.workVersionIds).toEqual([workVersion.workVersionId])
    expect(academicWork.canonicalVersionId).toBe(workVersion.workVersionId)
    expect(academicWork.firstPublicDate).toEqual({
      status: 'available',
      value: { iso: '2025-02-10', precision: 'day' },
    })
    expect(academicWork.publicationStatus).toEqual({ status: 'available', value: 'published' })
    expect(academicWork.venue).toEqual({ status: 'available', value: 'Example Conference' })
    expect(workVersion.academicWorkId).toBe(academicWork.academicWorkId)
    expect(workVersion.versionType).toBe('version_of_record')
    expect(workVersion.releaseDate).toEqual(academicWork.firstPublicDate)
    expect(workVersion.sourceRecords).toEqual([
      { provider: 'openalex', recordId: 'https://openalex.org/W2111111111' },
    ])
    expect(workVersion.status).toBe('active')
    expect(workVersion.supersedesWorkVersionId).toBeNull()
  })

  it('translates a preprint record without DOI at year precision', () => {
    const { academicWork, workVersion } = normalizeOpenAlexWork(preprintRecord)

    expect(academicWork.externalIdentifiers).toHaveLength(1)
    expect(academicWork.firstPublicDate).toEqual({
      status: 'available',
      value: { iso: '2024', precision: 'year' },
    })
    expect(academicWork.publicationStatus).toEqual({ status: 'available', value: 'preprint' })
    expect(academicWork.venue).toEqual({
      status: 'unknown',
      reason: 'OpenAlex record names no primary venue.',
    })
    expect(workVersion.versionType).toBe('preprint')
  })

  it('marks a retracted record retracted regardless of its listed type', () => {
    const { academicWork, workVersion } = normalizeOpenAlexWork(retractedRecord)

    expect(academicWork.publicationStatus).toEqual({ status: 'available', value: 'retracted' })
    expect(academicWork.firstPublicDate).toEqual({
      status: 'unknown',
      reason: 'OpenAlex record carries no publication date or year.',
    })
    expect(workVersion.versionType).toBe('retracted')
    expect(workVersion.status).toBe('retracted')
  })

  it('reports unknown status and version type for unmapped records', () => {
    const { academicWork, workVersion } = normalizeOpenAlexWork(untypedRecord)

    expect(academicWork.authors).toEqual([])
    expect(academicWork.publicationStatus).toEqual({
      status: 'unknown',
      reason: 'OpenAlex record type has no publication-status mapping.',
    })
    expect(workVersion.versionType).toBe('unknown')
  })
})
