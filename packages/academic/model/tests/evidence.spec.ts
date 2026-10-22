import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, it } from 'vitest'

import {
  createEvidenceCardId,
  createEvidenceCardItemId,
  createEvidenceId,
  createEvidenceSnapshotId,
  createSourceLocatorId,
  type AcademicWorkId,
  type EvidenceCard,
  type EvidenceCardItemId,
  type EvidenceId,
  type EvidenceRecord,
  type EvidenceSnapshot,
  type ResearchBriefId,
  type SourceLocator,
  type SourceLocatorId,
  type WorkVersionId,
} from '../src/index.ts'

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

describe('academic evidence', () => {
  it('creates random identities for every evidence artifact', () => {
    expect(createEvidenceId()).toMatch(uuidPattern)
    expect(createEvidenceCardId()).toMatch(uuidPattern)
    expect(createEvidenceCardItemId()).toMatch(uuidPattern)
    expect(createSourceLocatorId()).toMatch(uuidPattern)
    expect(createEvidenceSnapshotId()).toMatch(uuidPattern)
  })

  it('binds evidence and all six card sections to one immutable version', () => {
    const academicWorkId = brandString<AcademicWorkId>('work-1')
    const workVersionId = brandString<WorkVersionId>('version-1')
    const evidenceId = brandString<EvidenceId>('evidence-1')
    const sourceLocatorId = brandString<SourceLocatorId>('locator-1')
    const itemId = brandString<EvidenceCardItemId>('item-1')
    const evidence: EvidenceRecord = {
      schemaVersion: 1,
      evidenceId,
      academicWorkId,
      workVersionId,
      level: 'fulltext',
      verbatimExcerpt: { status: 'available', value: 'Synthetic excerpt.' },
      sourcedStatement: 'The work reports a traceable result.',
      sourceLocatorId,
      sourceProvider: 'sample-provider',
      sourceUrl: 'https://example.invalid/work-1',
      retrievedAt: '2026-09-10T04:00:00Z',
      contentHash: { status: 'available', value: 'sha256:synthetic' },
      extractionMethod: { method: 'synthetic-parser', methodVersion: '1' },
      qualityNotes: [],
    }
    const card: EvidenceCard = {
      schemaVersion: 1,
      evidenceCardId: createEvidenceCardId(),
      academicWorkId,
      workVersionId,
      researchQuestions: [
        {
          evidenceCardItemId: itemId,
          statement: 'Which result is reported?',
          evidenceIds: [evidenceId],
          questionType: { status: 'available', value: 'descriptive' },
        },
      ],
      methods: [],
      datasets: [],
      metrics: [],
      findings: [],
      limitations: [],
    }

    expect(card.workVersionId).toBe(evidence.workVersionId)
    expect(Object.keys(card)).toEqual([
      'schemaVersion',
      'evidenceCardId',
      'academicWorkId',
      'workVersionId',
      'researchQuestions',
      'methods',
      'datasets',
      'metrics',
      'findings',
      'limitations',
    ])
  })

  it('distinguishes every source-locator variant', () => {
    const common = {
      sourceLocatorId: brandString<SourceLocatorId>('locator-1'),
      schemaVersion: 1 as const,
      workVersionId: brandString<WorkVersionId>('version-1'),
      contentHash: 'sha256:synthetic',
    }
    const locators: SourceLocator[] = [
      {
        ...common,
        kind: 'provider_record',
        provider: 'sample-provider',
        recordId: 'record-1',
        url: 'https://example.invalid/record-1',
      },
      { ...common, kind: 'abstract', characterStart: 0, characterEnd: 20 },
      {
        ...common,
        kind: 'page_section',
        sectionTitle: '3. Results',
        pdfPage: 4,
        printedPage: '2',
      },
      {
        ...common,
        kind: 'paragraph',
        sectionTitle: '3. Results',
        paragraphNumber: 2,
      },
      {
        ...common,
        kind: 'table',
        tableNumber: '1',
        title: 'Synthetic results',
        pdfPage: 5,
        printedPage: '3',
      },
      {
        ...common,
        kind: 'figure',
        figureNumber: '2',
        title: null,
        pdfPage: 6,
        printedPage: null,
      },
    ]

    expect(locators.map(locator => locator.kind)).toEqual([
      'provider_record',
      'abstract',
      'page_section',
      'paragraph',
      'table',
      'figure',
    ])
  })

  it('freezes the evidence identities used for one brief version', () => {
    const snapshot: EvidenceSnapshot = {
      schemaVersion: 1,
      evidenceSnapshotId: createEvidenceSnapshotId(),
      researchBriefId: brandString<ResearchBriefId>('brief-1'),
      researchBriefVersion: 2,
      evidenceItems: [
        {
          evidenceId: brandString<EvidenceId>('evidence-1'),
          academicWorkId: brandString<AcademicWorkId>('work-1'),
          workVersionId: brandString<WorkVersionId>('version-1'),
          contentHash: 'sha256:synthetic',
        },
      ],
      createdAt: '2026-09-10T04:00:00Z',
    }

    expect(snapshot.evidenceItems[0]?.workVersionId).toBe('version-1')
  })
})
