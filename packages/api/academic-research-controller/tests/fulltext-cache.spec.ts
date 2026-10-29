import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAcademicWorkId, createWorkVersionId, type WorkVersion } from '@deepseek-ai/dsh-academic-model'
import type { AcademicFullTextFetchInput, AcademicWebFetcher } from '@deepseek-ai/dsh-academic-evidence'
import { AcademicFulltextCache } from '../src/fulltext-cache.ts'

interface StoredEntry {
  fetchedAt: string
  body: string
  parsed: { parser: string; segments: { text: string }[] }
}

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'academic-source-cache-'))
  roots.push(directory)
  const policy = { directory, maximumAgeMs: 60_000, maximumBytes: 10_000, maximumEntryBytes: 8_000 }
  const warn = vi.fn()
  const cache = new AcademicFulltextCache(policy, warn)
  const version: WorkVersion = { schemaVersion: 1, academicWorkId: createAcademicWorkId(), workVersionId: createWorkVersionId(),
    versionType: 'preprint', versionLabel: { status: 'available', value: 'v1' }, releaseDate: { status: 'not_extracted' },
    externalIdentifiers: [], sourceRecords: [{ provider: 'fixture', recordId: 'paper-v1' }],
    contentHash: { status: 'not_extracted' }, supersedesWorkVersionId: null, status: 'active' }
  const input: AcademicFullTextFetchInput = { ...version, sourceProvider: 'fixture',
    retrievedAt: new Date().toISOString(), urls: ['https://example.org/paper-v1'],
    extractionMethod: { method: 'fixture', methodVersion: '1' }, focusQuestions: ['First question'] }
  const fetcher = vi.fn<AcademicWebFetcher>(async url => ({ url, statusCode: 200, truncated: false,
    body: { kind: 'html', content: '<article><h2>Methods</h2><p>Method X uses three steps.</p></article>' } }))
  const cacheFile = async () => join(directory, (await readdir(directory)).find(name => name.endsWith('.json'))!)
  return { directory, policy, warn, cache, version, input, fetcher, cacheFile }
}

describe('cross-task full-text cache', () => {
  it('rejects policies that cannot bound the cache', () => {
    const policies = [
      { directory: '', maximumAgeMs: 60_000, maximumBytes: 10_000, maximumEntryBytes: 8_000 },
      { directory: '/cache', maximumAgeMs: 0, maximumBytes: 10_000, maximumEntryBytes: 8_000 },
      { directory: '/cache', maximumAgeMs: 60_000, maximumBytes: 10_000, maximumEntryBytes: 0 },
      { directory: '/cache', maximumAgeMs: 60_000, maximumBytes: 10_000, maximumEntryBytes: 20_000 },
    ]
    for (const policy of policies) {
      expect(() => new AcademicFulltextCache(policy, () => {})).toThrow(RangeError)
    }
  })
  it('stops cache publication when its owner closes during acquisition', async () => {
    const f = await fixture()
    let release: (() => void) | undefined
    const barrier = new Promise<void>((resolve) => { release = resolve })
    const started = Promise.withResolvers<undefined>()
    const pending = f.cache.acquire(f.input, f.version, async (...args) => {
      started.resolve(undefined)
      await barrier
      return f.fetcher(...args)
    })
    try {
      await started.promise
      await f.cache.close()
    } finally { release?.() }
    expect((await pending).segments).toHaveLength(1)
    expect(await readdir(f.directory)).toEqual([])
    await expect(f.cache.acquire(f.input, f.version, f.fetcher)).rejects.toThrow('closed')
  })
  it('reuses disk sources across owners while rebinding identities, questions and extraction metadata', async () => {
    const f = await fixture()
    const first = await f.cache.acquire(f.input, f.version, f.fetcher)
    const next = { ...f.input, academicWorkId: createAcademicWorkId(), workVersionId: createWorkVersionId(),
      focusQuestions: ['Different question'], extractionMethod: { method: 'different', methodVersion: '2' } }
    const result = await new AcademicFulltextCache(f.policy, f.warn).acquire(next, f.version, f.fetcher)
    expect(f.fetcher).toHaveBeenCalledTimes(1)
    const { urls: _, ...metadata } = next
    expect(result).toMatchObject({ ...metadata, sourceUrl: f.input.urls[0], retrievedAt: first.retrievedAt,
      contentHash: first.contentHash, segments: first.segments })
    expect(JSON.stringify(await readFile(await f.cacheFile(), 'utf8'))).not.toContain('First question')
  })

  it('reparses raw bytes after parser changes or parsed-cache corruption without downloading again', async () => {
    const f = await fixture()
    const original = await f.cache.acquire(f.input, f.version, f.fetcher)
    const path = await f.cacheFile()
    const entry = JSON.parse(await readFile(path, 'utf8')) as StoredEntry
    entry.parsed.segments[0]!.text = 'Corrupted unsupported text'
    await writeFile(path, JSON.stringify(entry))
    const repaired = await f.cache.acquire(f.input, f.version, f.fetcher)
    expect(repaired.segments).toEqual(original.segments)
    const regenerated = await new AcademicFulltextCache(f.policy, f.warn, 'parser-v2').acquire(f.input, f.version, f.fetcher)
    expect(regenerated.segments).toEqual(original.segments)
    expect((JSON.parse(await readFile(path, 'utf8')) as StoredEntry).parsed.parser).toBe('parser-v2')
    expect(f.fetcher).toHaveBeenCalledTimes(1)
    expect(f.warn).toHaveBeenCalled()
  })

  it('refetches expired, corrupt or mismatched-version sources', async () => {
    const f = await fixture()
    await f.cache.acquire(f.input, f.version, f.fetcher)
    const path = await f.cacheFile()
    const entry = JSON.parse(await readFile(path, 'utf8')) as StoredEntry
    entry.fetchedAt = new Date(Date.now() - 120_000).toISOString()
    await writeFile(path, JSON.stringify(entry))
    await f.cache.acquire(f.input, f.version, f.fetcher)
    const corrupt = JSON.parse(await readFile(path, 'utf8')) as StoredEntry
    corrupt.body = 'changed'
    await writeFile(path, JSON.stringify(corrupt))
    await f.cache.acquire(f.input, f.version, f.fetcher)
    await f.cache.acquire(f.input, { ...f.version, versionLabel: { status: 'available', value: 'v2' } }, f.fetcher)
    await f.cache.acquire(f.input, { ...f.version, contentHash: { status: 'available', value: 'sha256:different' } }, f.fetcher)
    expect(f.fetcher).toHaveBeenCalledTimes(5)
  })

  it('does not cache truncated bodies or cancellations and bounds disk bytes', async () => {
    const f = await fixture()
    const failed: AcademicWebFetcher = async url => ({ url, statusCode: 200, truncated: true,
      body: { kind: 'html', content: '<article><h2>Methods</h2><p>Partial</p></article>' } })
    await expect(f.cache.acquire(f.input, f.version, failed)).rejects.toThrow('truncated')
    await expect(f.cache.acquire(f.input, f.version, f.fetcher, AbortSignal.abort())).rejects.toThrow()
    expect(await readdir(f.directory)).toEqual([])
    const cache = new AcademicFulltextCache({ ...f.policy, maximumBytes: 1_200, maximumEntryBytes: 1_200 }, f.warn)
    for (let index = 0; index < 4; index++) {
      await cache.acquire({ ...f.input, urls: [`https://example.org/${index}`] }, f.version, f.fetcher)
    }
    const sizes = await Promise.all((await readdir(f.directory))
      .map(async name => Buffer.byteLength(await readFile(join(f.directory, name)))))
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1_200)
    expect(sizes.length).toBeGreaterThan(0)
  })
})
