/**
 * arXiv scholarly search over the public Atom `/api/query` endpoint. Each search parses the
 * Atom feed and maps each entry through {@link normalizeArxivWork}; the seam owns the
 * `maxResults` bound, so `truncated` is always `false` here.
 * @module @deepseek-ai/dsh-academic-source-arxiv/provider
 */

import { AcademicSourceError } from '@deepseek-ai/dsh-academic-source'
import type {
  AcademicSourceProvider,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
} from '@deepseek-ai/dsh-academic-source'
import { normalizeArxivWork } from './normalize.ts'
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

  async search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult> {
    throwIfAborted(signal)
    const options = this.resolveOptions()
    const url = new URL('/api/query', options.baseURL)
    url.searchParams.set('search_query', `all:${request.query}`)
    if (request.maxResults !== undefined) {
      url.searchParams.set('max_results', String(request.maxResults))
    }

    let response: Response
    try {
      response = await fetch(url, {
        redirect: 'error',
        headers: {
          'user-agent': USER_AGENT,
          'accept': 'application/atom+xml',
        },
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      throw new AcademicSourceError(
        `arXiv search request failed: ${String(error)}`,
        'ACADEMIC_SOURCE_PROVIDER_ERROR',
        { cause: error },
      )
    }

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
      const works = parseArxivFeed(body).map(normalizeArxivWork)
      return { works, truncated: false }
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
