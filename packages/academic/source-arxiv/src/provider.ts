/**
 * arXiv scholarly search over the public Atom `/api/query` endpoint. Each search parses the
 * Atom feed and maps each entry through {@link normalizeArxivWork}; `truncated` reports the
 * feed's `<opensearch:totalResults>` exceeding the returned entries, while the seam separately
 * flags its own `maxResults` cap.
 * @module @deepseek-ai/dsh-academic-source-arxiv/provider
 */

import { setTimeout as delay } from 'node:timers/promises'
import { AcademicSourceError } from '@deepseek-ai/dsh-academic-source'
import type {
  AcademicReference,
  AcademicSourceProvider,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
  AcademicSourceWork,
} from '@deepseek-ai/dsh-academic-source'
import { normalizeArxivWork } from './normalize.ts'
import { arxivFullTextUrls } from './normalize.ts'
import { parseArxivFeed } from './parse.ts'

/** Stable id this provider registers under. */
export const ARXIV_PROVIDER_ID = 'arxiv'

/** Default endpoint base: arXiv's public export API (`/api/query` is appended). */
export const ARXIV_DEFAULT_BASE_URL = 'https://export.arxiv.org'

/** Explicit product agent, never a browser disguise. */
const USER_AGENT = 'deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)'

/** Resolved options the provider serves its next search with. */
export interface ArxivProviderOptions {
  /** Endpoint base; `/api/query` is appended. */
  baseURL: string
  /** Total transport attempts for a network failure. */
  maxAttempts: number
  /** Delay before a repeated transport attempt, in milliseconds. */
  retryDelayMs: number
}

/**
 * The arXiv scholarly-source provider. Registers with
 * `ctx.academicSource.registerSearchProvider`. `available()` is a cheap local
 * check over the resolved endpoint and never makes network calls.
 */
export class ArxivProvider implements AcademicSourceProvider {
  readonly id = ARXIV_PROVIDER_ID

  /**
   * @param resolveOptions - the options for the NEXT operation, snapshotted once
   * at each operation's entry so one search never mixes two config sections.
   */
  constructor(private readonly resolveOptions: () => ArxivProviderOptions) {}

  available(): boolean {
    return URL.canParse(this.resolveOptions().baseURL)
  }

  fullTextUrls(recordId: string): readonly string[] {
    return arxivFullTextUrls(recordId)
  }

  /** Query one arXiv ID, preserving an explicitly requested version. */
  async verifyReference(reference: AcademicReference, signal?: AbortSignal): Promise<AcademicSourceWork | null> {
    if (reference.kind !== 'arxiv' || !/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?$/iu.test(reference.normalizedValue)) {
      throw new AcademicSourceError('Invalid arXiv reference', 'ACADEMIC_SOURCE_INVALID_REQUEST')
    }
    throwIfAborted(signal)
    const url = new URL('/api/query', this.resolveOptions().baseURL)
    url.searchParams.set('id_list', reference.normalizedValue)
    url.searchParams.set('max_results', '1')
    const response = await requestWithNetworkRetry(url, this.resolveOptions(), signal)
    if (!response.ok) {
      await response.body?.cancel()
      throw new AcademicSourceError(`arXiv paper request returned HTTP ${response.status}`,
        response.status === 429 ? 'ACADEMIC_SOURCE_RATE_LIMIT' : 'ACADEMIC_SOURCE_PROVIDER_ERROR')
    }
    try {
      const entries = parseArxivFeed(await response.text()).entries
      const [entry] = entries
      if (entry === undefined) return null
      if (entries.length !== 1) throw new AcademicSourceError('arXiv returned multiple paper records', 'ACADEMIC_SOURCE_PARSE_ERROR')
      const work = normalizeArxivWork(entry)
      const returned = work.workVersion.sourceRecords[0]?.recordId
      const requested = reference.normalizedValue
      return returned === requested || (!/v\d+$/u.test(requested) && returned?.replace(/v\d+$/u, '') === requested)
        ? work : null
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      if (error instanceof AcademicSourceError) throw error
      throw new AcademicSourceError('arXiv returned invalid paper metadata', 'ACADEMIC_SOURCE_PARSE_ERROR', { cause: error })
    }
  }

  async search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult> {
    throwIfAborted(signal)
    const options = this.resolveOptions()
    const url = new URL('/api/query', options.baseURL)
    url.searchParams.set('search_query', `all:${request.query}`)
    if (request.maxResults !== undefined) {
      url.searchParams.set('max_results', String(request.maxResults))
    }

    const response = await requestWithNetworkRetry(url, options, signal)

    if (!response.ok) {
      const status = response.status
      let message = `arXiv API error (HTTP ${status})`
      try {
        const detail = await response.text()
        if (detail.length > 0) message += `: ${detail.slice(0, 500)}`
      } catch (error: unknown) {
        if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      }
      throw new AcademicSourceError(message, 'ACADEMIC_SOURCE_PROVIDER_ERROR')
    }

    try {
      const body = await response.text()
      const feed = parseArxivFeed(body)
      const works = feed.entries.map(normalizeArxivWork)
      return { works, truncated: feed.totalResults !== null && feed.totalResults > works.length }
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      if (error instanceof AcademicSourceError) throw error
      throw new AcademicSourceError(
        `arXiv returned an unprocessable response body: ${String(error)}`,
        'ACADEMIC_SOURCE_PROVIDER_ERROR',
        { cause: error },
      )
    }
  }
}

/** Send one arXiv request, repeating only failures that occur before an HTTP response exists. */
async function requestWithNetworkRetry(
  url: URL,
  options: ArxivProviderOptions,
  signal?: AbortSignal,
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fetch(url, {
        redirect: 'error',
        headers: {
          'user-agent': USER_AGENT,
          'accept': 'application/atom+xml',
        },
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      lastError = error
      if (attempt < options.maxAttempts) await waitForRetry(options.retryDelayMs, signal)
    }
  }
  throw new AcademicSourceError(
    `arXiv search network request failed after ${options.maxAttempts} attempt(s)`,
    'ACADEMIC_SOURCE_NETWORK_ERROR',
    { cause: lastError },
  )
}

/** Wait for the configured retry delay while preserving caller cancellation. */
async function waitForRetry(retryDelayMs: number, signal?: AbortSignal): Promise<void> {
  try {
    await delay(retryDelayMs, undefined, signal === undefined ? undefined : { signal })
  } catch (error: unknown) {
    throw aborted(signal, error)
  }
}

/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw aborted(signal)
}

/** Build the provider's stable cancellation error while retaining the caller's reason. */
function aborted(signal?: AbortSignal, fallback?: unknown): AcademicSourceError {
  return new AcademicSourceError('arXiv search aborted', 'ACADEMIC_SOURCE_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

/** True for a fetch/`AbortSignal` abort, surfaced as `ACADEMIC_SOURCE_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
