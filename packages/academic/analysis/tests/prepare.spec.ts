import { describe, expect, it } from 'vitest'
import { prepareAnalysisInput } from '../src/index.ts'
import { batch, paper } from './fixtures.ts'

describe('analysis input preparation', () => {
  it('preserves two works, six sections, evidence provenance, and caller input', () => {
    const input = batch(paper('a'), paper('b'))
    const before = structuredClone(input)
    const result = prepareAnalysisInput(input)
    expect(result.status).toBe('usable')
    expect(result.works.map(p => p.work.title)).toEqual(['Synthetic paper a', 'Synthetic paper b'])
    expect(result.works[0]!.versions[0]!.cards).toEqual([input.evidenceCards[0]])
    expect(result.works[0]!.versions[0]!.evidenceRecords).toEqual([input.evidenceRecords[0]])
    expect(result.works[0]!.versions[0]!.sourceLocators).toEqual([input.sourceLocators[0]])
    expect(result.issues.filter(i => i.disposition === 'excluded')).toEqual([])
    expect(input).toEqual(before)
    expect(prepareAnalysisInput(input)).toEqual(result)
  })

  it('excludes only the entry with an absent reference and retains the other paper', () => {
    const a = paper('a')
    const b = paper('b')
    a.card = { ...a.card, methods: [{ ...a.card.methods[0]!, evidenceIds: [paper('absent').record.evidenceId] }] }
    const result = prepareAnalysisInput(batch(a, b))
    expect(result.works).toHaveLength(2)
    expect(result.works[0]!.versions[0]!.cards[0]!.methods).toEqual([])
    expect(result.works[0]!.versions[0]!.cards[0]!.metrics).toHaveLength(1)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'missing_evidence', itemId: a.card.methods[0]!.evidenceCardItemId, evidenceId: paper('absent').record.evidenceId }))
  })

  it.each(['work', 'version', 'locator'] as const)('excludes material with a missing %s', (missing) => {
    const input = batch(paper('a'))
    const result = prepareAnalysisInput({ ...input, ...(missing === 'work' ? { academicWorks: [] } : missing === 'version' ? { workVersions: [] } : { sourceLocators: [] }) })
    expect(result.status).toBe('no_usable_input')
    expect(result.issues.some(i => i.code === `missing_${missing}`)).toBe(true)
  })

  it.each(['record', 'locator', 'version-owner', 'work-membership'] as const)('rejects a mismatched %s relationship', (target) => {
    const a = paper('a')
    const b = paper('b')
    if (target === 'record') a.record = { ...a.record, workVersionId: b.version.workVersionId }
    if (target === 'locator') a.locator = { ...a.locator, workVersionId: b.version.workVersionId }
    if (target === 'version-owner') a.version = { ...a.version, academicWorkId: b.work.academicWorkId }
    if (target === 'work-membership') a.work = { ...a.work, workVersionIds: [] }
    const result = prepareAnalysisInput(batch(a))
    expect(result.status).toBe('no_usable_input')
    expect(result.issues.some(i => i.code === 'version_mismatch')).toBe(true)
  })

  it('retains unknown dataset information and reports its location without filling it', () => {
    const a = paper('a')
    a.card = { ...a.card, datasets: [{ ...a.card.datasets[0]!, datasetName: { status: 'unknown', reason: 'Not reported' } }] }
    const result = prepareAnalysisInput(batch(a))
    expect(result.works[0]!.versions[0]!.cards[0]!.datasets[0]!.datasetName).toEqual({ status: 'unknown', reason: 'Not reported' })
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'unavailable_field', section: 'datasets', field: 'datasetName', disposition: 'limitation' }))
  })

  it('retains abstract-only material with an explicit depth limitation', () => {
    const a = paper('a')
    a.record = { ...a.record, level: 'abstract' }
    a.locator = { schemaVersion: 1, sourceLocatorId: a.locator.sourceLocatorId, workVersionId: a.version.workVersionId, contentHash: a.locator.contentHash, kind: 'abstract', characterStart: 0, characterEnd: 20 }
    const result = prepareAnalysisInput(batch(a))
    expect(result.status).toBe('usable')
    expect(result.issues.some(i => i.code === 'abstract_only')).toBe(true)
  })

  it('does not use metadata as support for methods or numerical results', () => {
    const a = paper('a')
    a.record = { ...a.record, level: 'metadata' }
    a.locator = { schemaVersion: 1, sourceLocatorId: a.locator.sourceLocatorId, workVersionId: a.version.workVersionId, contentHash: a.locator.contentHash, kind: 'provider_record', provider: 'fixture', recordId: 'a', url: a.record.sourceUrl }
    const result = prepareAnalysisInput(batch(a, paper('b')))
    expect(result.works.map(p => p.work.academicWorkId)).toEqual([paper('b').work.academicWorkId])
    expect(result.issues.some(i => i.code === 'metadata_only')).toBe(true)
  })

  it.each(['level', 'hash', 'retracted'] as const)('rejects inconsistent or ineligible %s material', (target) => {
    const a = paper('a')
    if (target === 'level') a.record = { ...a.record, level: 'abstract' }
    if (target === 'hash') a.locator = { ...a.locator, contentHash: 'different' }
    if (target === 'retracted') a.version = { ...a.version, status: 'retracted' }
    const result = prepareAnalysisInput(batch(a))
    expect(result.status).toBe('no_usable_input')
    expect(result.issues.some(i => i.code === ({ level: 'locator_level_mismatch', hash: 'hash_mismatch', retracted: 'retracted_version' }[target]))).toBe(true)
  })

  it('reports missing excerpt and hashes while retaining original availability', () => {
    const a = paper('a')
    a.record = { ...a.record, verbatimExcerpt: { status: 'not_extracted' }, contentHash: { status: 'not_extracted' } }
    a.version = { ...a.version, contentHash: { status: 'not_extracted' } }
    a.locator = { ...a.locator, contentHash: null }
    const result = prepareAnalysisInput(batch(a))
    expect(result.status).toBe('usable')
    expect(result.issues.map(i => i.code)).toEqual(expect.arrayContaining(['unavailable_excerpt', 'unavailable_hash']))
  })

  it('counts one work once while retaining two actual evidence versions', () => {
    const a = paper('a')
    const b = paper('b')
    a.work = { ...a.work, workVersionIds: [a.version.workVersionId, b.version.workVersionId], canonicalVersionId: b.version.workVersionId }
    b.version = { ...b.version, academicWorkId: a.work.academicWorkId }
    b.record = { ...b.record, academicWorkId: a.work.academicWorkId }
    b.card = { ...b.card, academicWorkId: a.work.academicWorkId }
    const result = prepareAnalysisInput({ ...batch(a, b), academicWorks: [a.work] })
    expect(result.works).toHaveLength(1)
    expect(result.works[0]!.versions.map(v => v.version.workVersionId)).toEqual([a.version.workVersionId, b.version.workVersionId])
  })

  it('retains multiple cards per version without duplicating evidence', () => {
    const a = paper('a')
    const input = batch(a)
    const result = prepareAnalysisInput({ ...input, evidenceCards: [a.card, { ...a.card, evidenceCardId: paper('b').card.evidenceCardId }] })
    expect(result.works[0]!.versions[0]!.cards).toHaveLength(2)
    expect(result.works[0]!.versions[0]!.evidenceRecords).toHaveLength(1)
  })

  it('rejects an entire multi-evidence entry if one reference is missing', () => {
    const a = paper('a')
    a.card = { ...a.card, methods: [{ ...a.card.methods[0]!, evidenceIds: [a.record.evidenceId, paper('absent').record.evidenceId] }] }
    expect(prepareAnalysisInput(batch(a)).works[0]!.versions[0]!.cards[0]!.methods).toEqual([])
  })

  it('returns no usable input for empty batches and cards with no entries', () => {
    expect(prepareAnalysisInput(batch()).status).toBe('no_usable_input')
    const a = paper('a')
    a.card = { ...a.card, methods: [], datasets: [], metrics: [] }
    expect(prepareAnalysisInput(batch(a)).status).toBe('no_usable_input')
  })

  it.each(['academicWorks', 'workVersions', 'evidenceRecords', 'sourceLocators', 'evidenceCards'] as const)('refuses ambiguous duplicate IDs in %s', (key) => {
    const input = batch(paper('a'))
    expect(() => prepareAnalysisInput({ ...input, [key]: [...input[key], ...input[key]] })).toThrow('Ambiguous duplicate input ID')
  })
})
