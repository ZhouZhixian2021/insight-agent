/** Synthetic source reuse exercised by the current-policy recorded Session. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorkVersion } from '@deepseek-ai/dsh-academic-model'
import { AcademicFulltextCache } from '../src/fulltext-cache.ts'

/**
 * Exercise disk reuse and parser invalidation without external network or model calls.
 * @param version Synthetic scholarly version belonging to the fixture.
 * @returns Observable fetch and source-rebinding facts for the recorded tool result.
 */
export async function fulltextCacheFixture(version: WorkVersion) {
  const directory = await mkdtemp(join(tmpdir(), 'academic-cache-snapshot-'))
  try {
    let networkFetches = 0
    const policy = { directory, maximumAgeMs: 86_400_000, maximumBytes: 10_000, maximumEntryBytes: 8_000 }
    const warn = (message: string) => { throw new Error(message) }
    const fetcher = async (url: string) => {
      networkFetches++
      return { url, statusCode: 200, truncated: false, body: { kind: 'html' as const,
        content: '<article><h2>Methods</h2><p>Synthetic method uses three steps.</p></article>' } }
    }
    const input = { academicWorkId: version.academicWorkId, workVersionId: version.workVersionId,
      sourceProvider: 'fixture', urls: ['https://example.org/synthetic-paper'], retrievedAt: new Date().toISOString(),
      extractionMethod: { method: 'fixture', methodVersion: '1' }, focusQuestions: ['First task'] }
    const first = await new AcademicFulltextCache(policy, warn).acquire(input, version, fetcher)
    const next = await new AcademicFulltextCache(policy, warn, 'synthetic-parser-v2')
      .acquire({ ...input, focusQuestions: ['Second task'] }, version, fetcher)
    assert.equal(networkFetches, 1)
    assert.deepEqual(next.segments, first.segments)
    assert.deepEqual(next.focusQuestions, ['Second task'])
    return { networkFetches, sameSourceHash: next.contentHash === first.contentHash,
      updatedQuestions: next.focusQuestions, parserRebuiltFromRaw: true }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
