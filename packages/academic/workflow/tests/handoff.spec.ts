import { describe, expect, it, vi } from 'vitest'
import { createAcademicWorkId, createWorkVersionId, type WorkVersion } from '@deepseek-ai/dsh-academic-model'
import { prepareFetchedAcademicFullText, type EvidenceGenerator } from '@deepseek-ai/dsh-academic-evidence'
import { extractPaperEvidence } from '../src/index.ts'

function fixture() {
  const version: WorkVersion = { schemaVersion: 1, academicWorkId: createAcademicWorkId(), workVersionId: createWorkVersionId(),
    versionType: 'preprint', versionLabel: { status: 'available', value: 'v1' }, releaseDate: { status: 'unknown', reason: 'fixture' },
    externalIdentifiers: [], sourceRecords: [], contentHash: { status: 'not_extracted', reason: 'not fetched' },
    supersedesWorkVersionId: null, status: 'active' }
  const parsed = prepareFetchedAcademicFullText({ academicWorkId: version.academicWorkId, workVersionId: version.workVersionId,
    sourceProvider: 'fixture', retrievedAt: '2026-09-15T00:00:00Z', extractionMethod: { method: 'fixture', methodVersion: '1' },
    fetched: { url: 'https://example.org/paper', statusCode: 200, truncated: false,
      body: { kind: 'html', content: '<article><h2>Methods</h2><p>The method uses reranking.</p></article>' } } })
  const generator = vi.fn<EvidenceGenerator>(async () => [{ segmentIndex: 0, sourcedStatement: 'The method uses reranking.',
    verbatimExcerpt: 'The method uses reranking.', cardItems: [{ section: 'methods', statement: 'The method uses reranking.',
      methodName: { status: 'available', value: 'reranking' }, methodRole: { status: 'available', value: 'proposed' } }] }])
  return { version, parsed, generator }
}

describe('paper handoff', () => {
  it('connects actual HTML parsing to extraction without changing the original version', async () => {
    const { version, parsed, generator } = fixture()
    const before = structuredClone(version)
    Object.freeze(version)
    const result = await extractPaperEvidence(version, parsed, false, generator)
    expect(result.status).toBe('extracted')
    if (result.status !== 'extracted') throw new Error('unexpected pause')
    expect(version).toEqual(before)
    expect(result.version).not.toBe(version)
    expect(result.version.workVersionId).toBe(version.workVersionId)
    expect(result.version.contentHash).toEqual({ status: 'available', value: parsed.contentHash })
    expect(result.evidence.evidenceCard.workVersionId).toBe(version.workVersionId)
    expect(result.evidence.evidenceRecords[0]?.contentHash).toEqual(result.version.contentHash)
    expect(result.evidence.sourceLocators[0]?.contentHash).toBe(parsed.contentHash)
    expect(result.evidence.sourceLocators[0]?.workVersionId).toBe(version.workVersionId)
  })
  it('reuses an already matching version even with historical evidence', async () => {
    const { version, parsed, generator } = fixture()
    const current: WorkVersion = { ...version, contentHash: { status: 'available', value: parsed.contentHash } }
    const result = await extractPaperEvidence(current, parsed, true, generator)
    expect(result.status === 'extracted' && result.version).toBe(current)
  })
  it('retains a conflict and lets the caller process another paper', async () => {
    const a = fixture(), b = fixture()
    a.version = { ...a.version, contentHash: { status: 'available', value: 'sha256:old' } }
    const results = []
    for (const item of [a, b]) results.push(await extractPaperEvidence(item.version, item.parsed, false, item.generator))
    expect(results.map(result => result.status)).toEqual(['paused', 'extracted'])
    expect(a.generator).not.toHaveBeenCalled()
    expect(b.generator).toHaveBeenCalledOnce()
    expect(results[0]).toEqual({ status: 'paused', pause: { academicWorkId: a.version.academicWorkId,
      workVersionId: a.version.workVersionId, oldHash: a.version.contentHash, newHash: a.parsed.contentHash,
      sourceUrl: a.parsed.sourceUrl, retrievedAt: a.parsed.retrievedAt, reason: 'hash_conflict' } })
  })
  it.each(['work', 'version', 'empty', 'history', 'unavailable'] as const)('pauses %s before calling the generator', async (kind) => {
    const { version, parsed, generator } = fixture()
    const current: WorkVersion = kind === 'unavailable' ? { ...version, contentHash: { status: 'unknown', reason: 'unknown' } } : version
    const input = { ...parsed,
      academicWorkId: kind === 'work' ? createAcademicWorkId() : parsed.academicWorkId,
      workVersionId: kind === 'version' ? createWorkVersionId() : parsed.workVersionId,
      contentHash: kind === 'empty' ? '  ' : parsed.contentHash }
    const result = await extractPaperEvidence(current, input, kind === 'history', generator)
    const reason = kind === 'work' || kind === 'version' ? 'identity_mismatch' : kind === 'empty' ? 'empty_hash' : kind === 'history' ? 'history_requires_review' : 'hash_unavailable'
    expect(result.status === 'paused' && result.pause.reason).toBe(reason)
    expect(generator).not.toHaveBeenCalled()
  })
  it('propagates cancellation without invoking extraction', async () => {
    const { version, parsed, generator } = fixture()
    await expect(extractPaperEvidence(version, parsed, false, generator, AbortSignal.abort())).rejects.toThrow()
    expect(generator).not.toHaveBeenCalled()
  })
  it('propagates extraction failure without publishing a filled version', async () => {
    const { version, parsed, generator } = fixture()
    generator.mockRejectedValueOnce(new Error('model failed'))
    await expect(extractPaperEvidence(version, parsed, false, generator)).rejects.toThrow('model failed')
    expect(version.contentHash.status).toBe('not_extracted')
  })
})
