/** Disposable raw-body and parsed-source cache; task decisions and evidence identities are never cached. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import z from 'zod'
import { fetchAcademicFullText, prepareFetchedAcademicFullText, prepareFetchedAcademicPdf,
  type AcademicFullTextFetchInput, type AcademicFullTextObserver, type AcademicWebFetcher,
  type EvidenceExtractionInput } from '@deepseek-ai/dsh-academic-evidence'
import type { WorkVersion } from '@deepseek-ai/dsh-academic-model'

const parsedSchema = z.object({
  parser: z.string(), contentHash: z.string().min(1),
  segments: z.array(z.object({ text: z.string().min(1), locator: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('paragraph'), paragraphNumber: z.number().int().positive(), sectionTitle: z.string().nullable().default(null) }),
    z.object({ kind: z.literal('page_section'), pdfPage: z.number().int().positive(), sectionTitle: z.string() }),
  ]) })).min(1),
})
const entrySchema = z.object({ schemaVersion: z.literal(1), key: z.string(), fetchedAt: z.iso.datetime(),
  rawHash: z.string(), url: z.url(), kind: z.enum(['html', 'pdf']), body: z.string(),
  parsed: parsedSchema.optional(), parsedHash: z.string().optional(),
})
type Entry = z.infer<typeof entrySchema>

/** Deployment-owned disk and freshness limits; bytes include raw bodies and parsed text. */
export interface FulltextCachePolicy {
  readonly directory: string
  readonly maximumAgeMs: number
  readonly maximumBytes: number
  readonly maximumEntryBytes: number
}

/** Cross-task source reuse owned by one Controller, with atomic files and serialized pruning. */
export class AcademicFulltextCache {
  private writes: Promise<void> = Promise.resolve()
  private closing = false
  private readonly policy: FulltextCachePolicy
  private readonly warn: (message: string) => void
  private readonly parser: string

  /**
   * @param policy Explicit cache directory and finite freshness/storage bounds.
   * @param warn Visible cache failure report; acquisition can safely continue without a disposable cache.
   * @param parser Parser generation; change it when HTML/PDF parsing or locator semantics change.
   */
  constructor(policy: FulltextCachePolicy, warn: (message: string) => void, parser = 'academic-html-pdf-v1') {
    this.policy = policy
    this.warn = warn
    this.parser = parser
    if (policy.directory.trim() === '' || [policy.maximumAgeMs, policy.maximumBytes, policy.maximumEntryBytes]
      .some(value => !Number.isSafeInteger(value) || value < 1) || policy.maximumEntryBytes > policy.maximumBytes) {
      throw new RangeError('Academic full-text cache requires a directory and positive age/byte limits; entry bytes cannot exceed total bytes.')
    }
  }

  /**
   * Reuse source bytes and locators, then bind them to this task's identities and questions.
   * @param input Current paper identity, source candidates and approved questions.
   * @param version Exact source-record version; generated run-local IDs are not cache keys.
   * @param fetcher Configured raw-body transport on a cache miss.
   * @param signal Cancellation checked before parsing and cache publication; failed bodies are never cached.
   * @param observer Ordered acquisition facts, including successful cache acquisition.
   * @returns Locatable current-task input; retrievedAt remains the actual acquisition time on a hit.
   */
  async acquire(input: AcademicFullTextFetchInput, version: WorkVersion, fetcher: AcademicWebFetcher,
    signal?: AbortSignal, observer?: AcademicFullTextObserver): Promise<EvidenceExtractionInput> {
    if (this.closing) throw new Error('Academic full-text cache owner is closed.')
    const identity = JSON.stringify([version.versionType, version.versionLabel, version.externalIdentifiers, version.sourceRecords
      .map(record => [record.provider, record.recordId]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))])
    if (version.sourceRecords.length === 0) return fetchAcademicFullText(input, fetcher, signal, observer)
    let active: { key: string; entry?: Entry } | undefined
    return fetchAcademicFullText(input, async (url, fetchSignal) => {
      const key = hash(JSON.stringify([identity, url, input.sourceProvider]))
      const entry = await this.read(key)
      fetchSignal?.throwIfAborted()
      const reusable = entry !== undefined && (version.contentHash.status !== 'available'
        || entry.parsed?.contentHash === version.contentHash.value)
      active = { key, ...reusable ? { entry } : {} }
      if (!reusable) return fetcher(url, fetchSignal)
      return { url: entry.url, statusCode: 200, truncated: false, body: entry.kind === 'pdf'
        ? { kind: 'pdf', content: new Uint8Array(Buffer.from(entry.body, 'base64')) }
        : { kind: 'html', content: entry.body } }
    }, signal, observer, async (prepared, parseSignal) => {
      parseSignal?.throwIfAborted()
      const cached = active?.entry
      if (cached?.parsed?.parser === this.parser) {
        const { fetched: _, ...metadata } = prepared
        return { ...metadata, sourceUrl: cached.url, retrievedAt: cached.fetchedAt,
          contentHash: cached.parsed.contentHash, segments: cached.parsed.segments }
      }
      const parsed = prepared.fetched.body.kind === 'pdf'
        ? await prepareFetchedAcademicPdf(prepared, parseSignal) : prepareFetchedAcademicFullText(prepared)
      parseSignal?.throwIfAborted()
      if (active !== undefined && prepared.fetched.body.kind !== 'text') {
        const raw = encode(prepared.fetched.body)
        const preparedCache = parsedSchema.parse({ parser: this.parser, contentHash: parsed.contentHash, segments: parsed.segments })
        await this.store({ schemaVersion: 1, key: active.key, fetchedAt: cached?.fetchedAt ?? input.retrievedAt,
          rawHash: hash(raw.body), url: prepared.fetched.url, ...raw,
          parsed: preparedCache, parsedHash: hash(JSON.stringify(preparedCache)) })
      }
      return { ...parsed, retrievedAt: cached?.fetchedAt ?? parsed.retrievedAt }
    })
  }

  /**
   * Stop cache publication before releasing its owner.
   * @returns Resolves after previously queued atomic writes settle.
   */
  async close(): Promise<void> { this.closing = true; await this.writes }

  private async read(key: string): Promise<Entry | undefined> {
    try {
      const path = join(this.policy.directory, `${key}.json`)
      if ((await stat(path)).size > this.policy.maximumEntryBytes) return undefined
      const entry = entrySchema.parse(JSON.parse(await readFile(path, 'utf8')))
      const age = Date.now() - Date.parse(entry.fetchedAt)
      if (entry.key !== key || hash(entry.body) !== entry.rawHash) {
        this.warn('论文来源缓存校验失败，已重新获取来源内容。')
        return undefined
      }
      if (age < 0 || age > this.policy.maximumAgeMs) return undefined
      if (entry.parsed !== undefined && entry.parsedHash !== hash(JSON.stringify(entry.parsed))) {
        this.warn('论文解析缓存校验失败，已使用原始文件重新解析。')
        const { parsed: _, parsedHash: __, ...raw } = entry
        return raw
      }
      return entry
    } catch (error: unknown) {
      if (!isMissing(error)) this.warn('论文全文缓存无法读取或校验，已重新获取来源内容。')
      return undefined
    }
  }

  private async store(entry: Entry): Promise<void> {
    if (this.closing) return
    const text = JSON.stringify(entry)
    if (Buffer.byteLength(text) > this.policy.maximumEntryBytes) return
    const write = this.writes.then(async () => {
      await mkdir(this.policy.directory, { recursive: true })
      const path = join(this.policy.directory, `${entry.key}.json`)
      const temporary = `${path}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, text, { flag: 'wx' })
        await rename(temporary, path)
      } finally {
        await rm(temporary, { force: true })
      }
      const files = await Promise.all((await readdir(this.policy.directory)).filter(name => /^[a-f0-9]{64}\.json$/u.test(name))
        .map(async (name) => {
          const path = join(this.policy.directory, name), info = await stat(path)
          return { path, size: info.size, mtimeMs: info.mtimeMs }
        }))
      let bytes = files.reduce((total, file) => total + file.size, 0)
      for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
        if (bytes <= this.policy.maximumBytes) break
        await rm(file.path, { force: true })
        bytes -= file.size
      }
    })
    this.writes = write.catch(() => { this.warn('论文全文缓存写入失败；本次已获取的来源仍可继续处理。') })
    await this.writes
  }
}

function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }
function isMissing(error: unknown): boolean { return error instanceof Error && 'code' in error && error.code === 'ENOENT' }
function encode(body: { readonly kind: 'html'; readonly content: string }
| { readonly kind: 'pdf'; readonly content: Uint8Array }): { kind: 'html' | 'pdf'; body: string } {
  return body.kind === 'pdf'
    ? { kind: 'pdf', body: Buffer.from(body.content).toString('base64') }
    : { kind: 'html', body: body.content }
}
