import { describe, expect, it } from 'vitest'

import {
  createAcademicWorkId,
  createWorkVersionId,
  type AcademicWork,
  type Availability,
  type ExternalIdentifier,
  type PartialDate,
  type PublicationStatus,
  type WorkVersion,
  type WorkVersionType,
} from '@deepseek-ai/dsh-academic-model'

import {
  createIngestIndex,
  dedupKeys,
  ingestWorks,
  selectCanonicalVersion,
  type IngestRecord,
} from '../src/index.ts'

interface RecordSpec {
  readonly title: string
  readonly authors?: readonly string[]
  readonly doi?: string
  readonly openalexId?: string
  readonly arxivId?: string
  readonly year?: number
  readonly date?: string
  readonly type?: WorkVersionType
  readonly venue?: string
  readonly status?: WorkVersion['status']
}

function makeRecord(spec: RecordSpec): IngestRecord {
  const academicWorkId = createAcademicWorkId()
  const workVersionId = createWorkVersionId()

  const identifiers: ExternalIdentifier[] = []
  if (spec.doi !== undefined) identifiers.push({ kind: 'doi', normalizedValue: spec.doi, originalValue: spec.doi, sourceProvider: 'test' })
  if (spec.openalexId !== undefined) identifiers.push({ kind: 'openalex', normalizedValue: spec.openalexId, originalValue: spec.openalexId, sourceProvider: 'openalex' })
  if (spec.arxivId !== undefined) identifiers.push({ kind: 'arxiv', normalizedValue: spec.arxivId, originalValue: spec.arxivId, sourceProvider: 'arxiv' })

  const date: Availability<PartialDate> = spec.date !== undefined
    ? { status: 'available', value: { iso: spec.date, precision: 'day' } }
    : spec.year !== undefined
      ? { status: 'available', value: { iso: String(spec.year), precision: 'year' } }
      : { status: 'unknown', reason: 'no date' }

  const publicationStatus: Availability<PublicationStatus> = spec.type === 'version_of_record'
    ? { status: 'available', value: 'published' }
    : spec.type === 'preprint'
      ? { status: 'available', value: 'preprint' }
      : { status: 'unknown', reason: 'no mapping' }

  const academicWork: AcademicWork = {
    schemaVersion: 1,
    academicWorkId,
    title: spec.title,
    authors: [...(spec.authors ?? [])],
    externalIdentifiers: identifiers,
    workVersionIds: [workVersionId],
    canonicalVersionId: workVersionId,
    firstPublicDate: date,
    publicationStatus,
    venue: spec.venue !== undefined ? { status: 'available', value: spec.venue } : { status: 'unknown', reason: 'no venue' },
  }

  const workVersion: WorkVersion = {
    schemaVersion: 1,
    workVersionId,
    academicWorkId,
    versionType: spec.type ?? 'unknown',
    versionLabel: { status: 'unknown', reason: 'no label' },
    releaseDate: date,
    externalIdentifiers: [],
    sourceRecords: [],
    contentHash: { status: 'not_extracted' },
    supersedesWorkVersionId: null,
    status: spec.status ?? 'active',
  }

  return { academicWork, workVersion }
}

describe('dedupKeys', () => {
  it('derives exact keys from external identifiers and a fuzzy key from title/author/year', () => {
    const record = makeRecord({
      title: 'Joint Evaluation of RAG: A Survey',
      authors: ['Alice Example'],
      doi: '10.0000/example.1',
      year: 2024,
    })
    const keys = dedupKeys(record.academicWork)
    expect(keys.exact).toHaveLength(1)
    expect(keys.fuzzy).toBe('joint evaluation of rag a survey|alice example|2024')
  })

  it('returns a null fuzzy key when the title is empty', () => {
    const record = makeRecord({ title: '', year: 2024 })
    expect(dedupKeys(record.academicWork).fuzzy).toBeNull()
  })
})

describe('selectCanonicalVersion', () => {
  it('prefers a version of record over a preprint regardless of order', () => {
    const preprint = makeRecord({ title: 't', type: 'preprint', date: '2024-01-01' })
    const published = makeRecord({ title: 't', type: 'version_of_record', date: '2024-06-01' })
    const canonical = selectCanonicalVersion([preprint.workVersion, published.workVersion])
    expect(canonical).toBe(published.workVersion.workVersionId)
  })

  it('tie-breaks equal types by the later release date', () => {
    const earlier = makeRecord({ title: 't', type: 'preprint', date: '2024-01-01' })
    const later = makeRecord({ title: 't', type: 'preprint', date: '2024-06-01' })
    expect(selectCanonicalVersion([earlier.workVersion, later.workVersion])).toBe(later.workVersion.workVersionId)
  })
})

describe('ingestWorks', () => {
  it('starts a new work for a record with no collision', () => {
    const record = makeRecord({ title: 'A novel method', doi: '10.0000/a', year: 2024 })
    const outcome = ingestWorks(createIngestIndex(), [record])

    expect(outcome.works).toHaveLength(1)
    expect(outcome.versions).toHaveLength(1)
    expect(outcome.works[0]?.academicWorkId).not.toBe(record.academicWork.academicWorkId)
    expect(outcome.versions[0]?.academicWorkId).toBe(outcome.works[0]?.academicWorkId)
    expect(outcome.audit.entries).toEqual([{ kind: 'new_work', academicWorkId: outcome.works[0]?.academicWorkId }])
  })

  it('merges records that share a DOI into one work with a canonical published version', () => {
    const preprint = makeRecord({ title: 'RAG survey', authors: ['Alice'], doi: '10.0000/rag', type: 'preprint', date: '2024-01-01', openalexId: 'W1' })
    const published = makeRecord({ title: 'RAG survey', authors: ['Alice'], doi: '10.0000/rag', type: 'version_of_record', date: '2024-06-01', openalexId: 'W2' })

    const outcome = ingestWorks(createIngestIndex(), [preprint, published])

    expect(outcome.works).toHaveLength(1)
    const work = outcome.works[0] as AcademicWork
    expect(work.workVersionIds).toHaveLength(2)
    expect(work.canonicalVersionId).toBe(published.workVersion.workVersionId)
    expect(work.publicationStatus).toEqual({ status: 'available', value: 'published' })
    expect(work.externalIdentifiers).toHaveLength(3)
    expect(outcome.audit.entries.map(entry => entry.kind)).toEqual(['new_work', 'merged_version'])
  })

  it('flags a title/author/year match without a shared identifier as suspected, not merged', () => {
    const first = makeRecord({ title: 'Same title', authors: ['Alice'], year: 2024, openalexId: 'W1' })
    const second = makeRecord({ title: 'Same title', authors: ['Alice'], year: 2024, openalexId: 'W2' })

    const outcome = ingestWorks(createIngestIndex(), [first, second])

    expect(outcome.works).toHaveLength(1)
    expect(outcome.audit.entries).toEqual([
      { kind: 'new_work', academicWorkId: outcome.works[0]?.academicWorkId },
      {
        kind: 'suspected_duplicate',
        academicWorkId: second.academicWork.academicWorkId,
        existingAcademicWorkId: outcome.works[0]?.academicWorkId,
        reason: 'title/author/year matches an already-ingested work without a shared external identifier',
      },
    ])
  })

  it('keeps one work identity when the same record is re-ingested', () => {
    const record = makeRecord({ title: 'Idempotent', doi: '10.0000/idem', year: 2024 })
    const first = ingestWorks(createIngestIndex(), [record])
    const second = ingestWorks(first.index, [record])

    expect(second.works).toHaveLength(1)
    expect(second.versions).toHaveLength(1)
    expect(second.works[0]?.academicWorkId).toBe(first.works[0]?.academicWorkId)
    expect(second.audit.entries).toEqual([{
      kind: 'merged_version',
      academicWorkId: first.works[0]?.academicWorkId,
      workVersionId: record.workVersion.workVersionId,
    }])
  })
})
