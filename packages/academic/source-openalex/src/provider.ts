/** One bounded OpenAlex request per caller-supplied query; no planning, fallback queries or retries. */
import { AcademicSourceError } from '@deepseek-ai/dsh-academic-source'
import type { AcademicSourceProvider, AcademicSourceSearchRequest, AcademicSourceSearchResult } from '@deepseek-ai/dsh-academic-source'
import { normalizeOpenAlexWork, object } from './normalize.ts'

/** Deployment controls resolved by the plugin before searching. */
export interface OpenAlexOptions {
  readonly baseURL: string
  readonly apiKey: string | undefined
  readonly searchMode: 'keyword' | 'semantic'
  readonly publicationYears: string | undefined
  readonly timeoutMs: number
  readonly maxResults: number
  readonly maxCachedRecords: number
}

/** OpenAlex discovery with a bounded, instance-local map of previously returned full-text locations. */
export class OpenAlexProvider implements AcademicSourceProvider {
  readonly id = 'openalex'
  private readonly candidates = new Map<string, readonly string[]>()

  /** @param options Explicit deployment settings; no credentials are included in result metadata. */
  constructor(private readonly options: OpenAlexOptions) {}

  get limitations(): readonly string[] {
    return [
      `OpenAlex ${this.options.searchMode} search sends one unchanged query; no automatic planning, pagination or retries are performed.`,
      `OpenAlex returns at most ${this.options.maxResults} records per request; index coverage, ranking and full-text links may be incomplete.`,
      'OpenAlex aggregate publication dates do not establish first_public_release; first-public dates remain unknown until an authoritative source supplies them.',
      'Full-text locations are version-matched; missing official links are not recovered through an automatic site search.',
      `Full-text resolution retains the latest ${this.options.maxCachedRecords} records in this provider instance; restart or eviction requires discovery again.`,
      ...this.options.publicationYears === undefined ? []
        : [`OpenAlex discovery is restricted to publication_year ${this.options.publicationYears}; this is not a first_public_release filter.`],
    ]
  }

  available(): boolean { return true }

  fullTextUrls(recordId: string): readonly string[] { return this.candidates.get(recordId) ?? [] }

  async search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult> {
    if (signal?.aborted) throw new AcademicSourceError('OpenAlex search aborted', 'ACADEMIC_SOURCE_ABORTED')
    if (request.query.trim() === '' || /[\r\n]/u.test(request.query)
      || (request.maxResults !== undefined && (!Number.isSafeInteger(request.maxResults) || request.maxResults < 1))) {
      throw new AcademicSourceError('OpenAlex requires one non-empty query and a positive result limit', 'ACADEMIC_SOURCE_INVALID_REQUEST')
    }
    const controller = new AbortController()
    const operationSignal = signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal])
    const timer = setTimeout(() => { controller.abort() }, this.options.timeoutMs)
    const url = new URL('/works', this.options.baseURL)
    const limit = Math.min(request.maxResults ?? this.options.maxResults, this.options.maxResults)
    url.searchParams.set(this.options.searchMode === 'keyword' ? 'search' : 'search.semantic', request.query)
    url.searchParams.set('per_page', String(limit))
    if (this.options.publicationYears !== undefined) url.searchParams.set('filter', `publication_year:${this.options.publicationYears}`)
    try {
      const response = await fetch(url, { redirect: 'error', signal: operationSignal, headers: {
        accept: 'application/json', 'user-agent': 'deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)',
        ...this.options.apiKey === undefined ? {} : { authorization: `Bearer ${this.options.apiKey}` },
      } })
      if (!response.ok) {
        await response.body?.cancel()
        throw new AcademicSourceError(`OpenAlex search returned HTTP ${response.status}`,
          response.status === 429 ? 'ACADEMIC_SOURCE_RATE_LIMIT' : 'ACADEMIC_SOURCE_PROVIDER_ERROR')
      }
      const raw = object(await response.json())
      const meta = object(raw.meta)
      if (!Array.isArray(raw.results) || !Number.isSafeInteger(meta.count) || Number(meta.count) < raw.results.length) {
        throw new AcademicSourceError('OpenAlex returned an invalid results envelope', 'ACADEMIC_SOURCE_PARSE_ERROR')
      }
      const selected = raw.results.slice(0, limit).map(normalizeOpenAlexWork)
      for (const record of selected) {
        this.candidates.delete(record.id)
        this.candidates.set(record.id, record.urls)
      }
      while (this.candidates.size > this.options.maxCachedRecords) {
        this.candidates.delete(this.candidates.keys().next().value as string)
      }
      return { works: selected.map(record => record.work), truncated: Number(meta.count) > selected.length }
    } catch (cause: unknown) {
      if (signal?.aborted) throw new AcademicSourceError('OpenAlex search aborted', 'ACADEMIC_SOURCE_ABORTED')
      if (controller.signal.aborted) throw new AcademicSourceError('OpenAlex search timed out', 'ACADEMIC_SOURCE_TIMEOUT')
      if (cause instanceof AcademicSourceError) throw cause
      if (cause instanceof SyntaxError) throw new AcademicSourceError('OpenAlex returned invalid JSON', 'ACADEMIC_SOURCE_PARSE_ERROR')
      throw new AcademicSourceError('OpenAlex network request failed', 'ACADEMIC_SOURCE_NETWORK_ERROR')
    } finally { clearTimeout(timer) }
  }
}
