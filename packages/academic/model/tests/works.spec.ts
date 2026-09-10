import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  createAcademicWorkId,
  createWorkVersionId,
  externalIdentifierDedupKey,
  type AcademicWork,
  type AcademicWorkId,
  type ExternalIdentifier,
  type WorkVersion,
  type WorkVersionId,
} from '../src/index.ts'

describe('academic works', () => {
  it('keeps work and version identities distinct', () => {
    expectTypeOf<AcademicWorkId>().not.toEqualTypeOf<WorkVersionId>()
    expect(createAcademicWorkId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
    expect(createWorkVersionId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
  })

  it('represents one work with an immutable canonical version', () => {
    const academicWorkId = brandString<AcademicWorkId>('work-1')
    const workVersionId = brandString<WorkVersionId>('version-1')
    const work: AcademicWork = {
      schemaVersion: 1,
      academicWorkId,
      title: 'Synthetic academic work',
      authors: ['Example Author'],
      externalIdentifiers: [],
      workVersionIds: [workVersionId],
      canonicalVersionId: workVersionId,
      firstPublicDate: {
        status: 'available',
        value: { iso: '2026-09', precision: 'month' },
      },
      publicationStatus: { status: 'available', value: 'preprint' },
      venue: { status: 'unknown', reason: 'provider omitted the venue' },
    }
    const version: WorkVersion = {
      schemaVersion: 1,
      workVersionId,
      academicWorkId,
      versionType: 'preprint',
      versionLabel: { status: 'available', value: 'v1' },
      releaseDate: {
        status: 'available',
        value: { iso: '2026-09', precision: 'month' },
      },
      externalIdentifiers: [],
      sourceRecords: [{ provider: 'sample-provider', recordId: 'record-1' }],
      contentHash: { status: 'not_extracted' },
      supersedesWorkVersionId: null,
      status: 'active',
    }

    expect(work.canonicalVersionId).toBe(version.workVersionId)
  })

  it('deduplicates only by kind and caller-normalized value', () => {
    const first: ExternalIdentifier = {
      kind: 'doi',
      normalizedValue: '10.1234/example',
      originalValue: 'https://doi.org/10.1234/EXAMPLE',
      sourceProvider: 'provider-a',
    }
    const same: ExternalIdentifier = {
      ...first,
      originalValue: 'doi:10.1234/example',
      sourceProvider: 'provider-b',
    }
    const differentKind: ExternalIdentifier = { ...same, kind: 'provider_record' }
    const differentlyNormalized: ExternalIdentifier = {
      ...same,
      normalizedValue: '10.1234/EXAMPLE',
    }

    expect(externalIdentifierDedupKey(first)).toBe(externalIdentifierDedupKey(same))
    expect(externalIdentifierDedupKey(first)).not.toBe(
      externalIdentifierDedupKey(differentKind),
    )
    expect(externalIdentifierDedupKey(first)).not.toBe(
      externalIdentifierDedupKey(differentlyNormalized),
    )
  })
})
