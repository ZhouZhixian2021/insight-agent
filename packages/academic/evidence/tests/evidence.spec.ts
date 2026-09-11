import { describe, expect, it } from 'vitest'

import {
  createAcademicWorkId,
  createEvidenceId,
  createWorkVersionId,
  type SourceLocator,
} from '@deepseek-ai/dsh-academic-model'

import {
  EvidenceError,
  createEvidenceCard,
  createEvidenceRecord,
  createSourceLocator,
} from '../src/index.ts'

const academicWorkId = createAcademicWorkId()
const workVersionId = createWorkVersionId()
const extractionMethod = { method: 'test', methodVersion: '1' }

describe('createSourceLocator', () => {
  it('builds a provider-record locator with a fresh id', () => {
    const locator = createSourceLocator({
      kind: 'provider_record',
      workVersionId,
      provider: 'openalex',
      recordId: 'W1',
      url: 'https://openalex.org/W1',
    })
    if (locator.kind !== 'provider_record') throw new Error('unexpected locator kind')
    expect(locator.sourceLocatorId).not.toBe('')
    expect(locator.schemaVersion).toBe(1)
    expect(locator.contentHash).toBeNull()
    expect(locator.url).toBe('https://openalex.org/W1')
  })

  it('builds a paragraph locator with defaulted optional fields', () => {
    const locator = createSourceLocator({ kind: 'paragraph', workVersionId, paragraphNumber: 3 })
    if (locator.kind !== 'paragraph') throw new Error('unexpected locator kind')
    expect(locator.sectionTitle).toBeNull()
    expect(locator.paragraphNumber).toBe(3)
  })

  it('rejects a negative character range', () => {
    expect(() => createSourceLocator({ kind: 'abstract', workVersionId, characterStart: -1, characterEnd: 5 }))
      .toThrow(expect.objectContaining({ code: 'EVIDENCE_INVALID_LOCATOR' }))
  })
})

describe('createEvidenceRecord', () => {
  function locator(kind: SourceLocator['kind']): SourceLocator {
    switch (kind) {
      case 'provider_record': return createSourceLocator({ kind, workVersionId, provider: 'openalex', recordId: 'W1', url: 'https://openalex.org/W1' })
      case 'abstract': return createSourceLocator({ kind, workVersionId, characterStart: 0, characterEnd: 10 })
      case 'paragraph': return createSourceLocator({ kind, workVersionId, paragraphNumber: 1 })
      default: throw new Error(`unexpected kind ${kind}`)
    }
  }

  const base = {
    academicWorkId,
    workVersionId,
    sourcedStatement: 'The paper proposes a joint evaluation method.',
    verbatimExcerpt: { status: 'available', value: 'excerpt text' },
    sourceProvider: 'openalex',
    sourceUrl: 'https://openalex.org/W1',
    retrievedAt: '2026-09-11T00:00:00Z',
    contentHash: { status: 'not_extracted' },
    extractionMethod,
  } as const

  it('builds a metadata-level record with a provider-record locator', () => {
    const sourceLocator = locator('provider_record')
    const record = createEvidenceRecord({ ...base, level: 'metadata', sourceLocator })
    expect(record.evidenceId).not.toBe('')
    expect(record.level).toBe('metadata')
    expect(record.sourceLocatorId).toBe(sourceLocator.sourceLocatorId)
  })

  it('builds an abstract-level record with an abstract locator', () => {
    const record = createEvidenceRecord({ ...base, level: 'abstract', sourceLocator: locator('abstract') })
    expect(record.level).toBe('abstract')
  })

  it('builds a fulltext-level record with a paragraph locator', () => {
    const record = createEvidenceRecord({ ...base, level: 'fulltext', sourceLocator: locator('paragraph') })
    expect(record.level).toBe('fulltext')
  })

  it('rejects a level-locator mismatch', () => {
    expect(() => createEvidenceRecord({ ...base, level: 'metadata', sourceLocator: locator('paragraph') }))
      .toThrow(expect.objectContaining({ code: 'EVIDENCE_LEVEL_LOCATOR_MISMATCH' }))
  })

  it('rejects an empty statement', () => {
    expect(() => createEvidenceRecord({ ...base, sourcedStatement: '  ', level: 'metadata', sourceLocator: locator('provider_record') }))
      .toThrow(expect.objectContaining({ code: 'EVIDENCE_EMPTY_FIELD' }))
  })
})

describe('createEvidenceCard', () => {
  const evidenceId = createEvidenceId()

  it('builds a card with item ids and preserves statements and evidence ids', () => {
    const card = createEvidenceCard({
      academicWorkId,
      workVersionId,
      researchQuestions: [{
        statement: 'What is the effect?',
        evidenceIds: [evidenceId],
        questionType: { status: 'available', value: 'causal' },
      }],
      methods: [],
      datasets: [],
      metrics: [],
      findings: [],
      limitations: [],
    })

    expect(card.evidenceCardId).not.toBe('')
    expect(card.academicWorkId).toBe(academicWorkId)
    expect(card.researchQuestions).toHaveLength(1)
    expect(card.researchQuestions[0]?.evidenceCardItemId).not.toBe('')
    expect(card.researchQuestions[0]?.statement).toBe('What is the effect?')
    expect(card.researchQuestions[0]?.evidenceIds).toEqual([evidenceId])
    expect(card.methods).toEqual([])
  })

  it('rejects an item with an empty statement', () => {
    expect(() => createEvidenceCard({
      academicWorkId,
      workVersionId,
      researchQuestions: [{ statement: '  ', evidenceIds: [evidenceId], questionType: { status: 'unknown', reason: 'x' } }],
      methods: [],
      datasets: [],
      metrics: [],
      findings: [],
      limitations: [],
    })).toThrow(expect.objectContaining({ code: 'EVIDENCE_EMPTY_ITEM_STATEMENT' }))
  })
})

describe('EvidenceError', () => {
  it('carries its code and names itself', () => {
    const error = new EvidenceError('boom', 'EVIDENCE_LEVEL_LOCATOR_MISMATCH')
    expect(error.code).toBe('EVIDENCE_LEVEL_LOCATOR_MISMATCH')
    expect(error.name).toBe('EvidenceError')
  })
})
