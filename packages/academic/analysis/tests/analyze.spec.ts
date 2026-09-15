import { describe, expect, it } from 'vitest'
import { analyzeEvidence } from '../src/index.ts'
import { batch, paper } from './fixtures.ts'
import { benchmark } from '../../report/tests/benchmark.ts'

describe('extractive comparison boundaries', () => {
  it('uses fulltext confidence and preserves unavailable hashes', () => {
    const { input } = benchmark()
    const a = paper('a')
    a.record = { ...a.record, contentHash: { status: 'not_extracted' } }
    const result = analyzeEvidence(batch(a, paper('b')), input.brief, input.assessedAt)
    expect(result.claims[0]!.confidence).toBe('medium')
    expect(result.claims[0]!.evidenceSnapshot.evidenceItems[0]!.contentHash).toBeNull()
  })
  it('does not compare abstracts when the brief requires fulltext', () => {
    const { input } = benchmark()
    const a = paper('a')
    const b = paper('b')
    b.record = { ...b.record, level: 'abstract' }
    b.locator = { schemaVersion: 1, sourceLocatorId: b.locator.sourceLocatorId, workVersionId: b.version.workVersionId,
      contentHash: b.locator.contentHash, kind: 'abstract', characterStart: 0, characterEnd: 5 }
    const brief = { ...input.brief, evidenceRequirements: { ...input.brief.evidenceRequirements, minimumEvidenceLevel: 'fulltext' as const } }
    expect(analyzeEvidence(batch(a, b), brief, input.assessedAt).claims).toHaveLength(0)
  })
  it('uses a sole accessible version but refuses ambiguous alternate versions', () => {
    const { input } = benchmark()
    const a = paper('a')
    const b = paper('b')
    a.work = { ...a.work, canonicalVersionId: paper('unavailable').version.workVersionId,
      workVersionIds: [a.version.workVersionId, b.version.workVersionId] }
    b.version = { ...b.version, academicWorkId: a.work.academicWorkId }
    b.record = { ...b.record, academicWorkId: a.work.academicWorkId }
    b.card = { ...b.card, academicWorkId: a.work.academicWorkId }
    expect(analyzeEvidence(batch(a, paper('c')), input.brief, input.assessedAt).claims).toHaveLength(1)
    const result = analyzeEvidence({ ...batch(a, b), academicWorks: [a.work] }, input.brief, input.assessedAt)
    expect(result.limitations.join(' ')).toContain('Multiple evidence versions')
    expect(result.claims).toHaveLength(0)
  })
})
