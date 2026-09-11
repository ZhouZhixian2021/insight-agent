/**
 * Crossref scholarly search over the public `/works` endpoint. Each search maps the API's
 * `message.items[]` through {@link normalizeCrossrefWork} into provider-neutral work/version
 * pairs; the seam owns the `maxResults` bound, so `truncated` is always `false` here.
 * @module @deepseek-ai/dsh-academic-source-crossref/provider
 */

import { AcademicSourceError } from '@deepseek-ai/dsh-academic-source'
import type {
  AcademicSourceProvider,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
} from '@deepseek-ai/dsh-academic-source'
import { normalizeCrossrefWork } from './normalize.ts'
import type { CrossrefSearchResponse } from './types.ts'

/** Stable id this provider registers under. */
export const CROSSREF_PROVIDER_ID = 'crossref'

/** Default endpoint base: Crossref's public API (no trailing slash; `/works` is appended). */
export const CROSSREF_DEFAULT_BASE_URL = 'https://api.crossref.org'

/** Explicit product agent, never a browser disguise. */
const USER_AGENT = 'deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)'

/** Resolved options the provider serves its next search with. */
export interface CrossrefProviderOptions {
  /** Endpoint base; `/works` is appended. */
  baseURL: string
  /** Polite-pool contact email, appended as `mailto` when set. */
  mailto?: string
}

/**
 * The Crossref scholarly-source provider. Registers with
 * `ctx.academicSource.registerSearchProvider`. `available()` is a cheap local
 * check over the resolved endpoint and never makes network calls.
 */
export class CrossrefProvider implements AcademicSourceProvider {
  readonly id = CROSSREF_PROVIDER_ID

  /**
   * @param resolveOptions - the options for the NEXT operation, snapshotted once
   * at each operation's entry so one search never mixes two config sections.
   */
  constructor(private readonly resolveOptions: () => CrossrefProviderOptions) {}

  available(): boolean {
    return URL.canParse(this.resolveOptions().baseURL)
  }

  async search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult> {
    throwIfAborted(signal)
    const options = this.resolveOptions()
    const url = new URL('/works', options.baseURL)
    url.searchParams.set('query', request.query)
    if (request.maxResults !== undefined) {
      url.searchParams.set('rows', String(request.maxResults))
    }
    if (options.mailto !== undefined && options.mailto.length > 0) {
      url.searchParams.set('mailto', options.mailto)
    }

    let response: Response
    try {
      response = await fetch(url, {
        redirect: 'error',
        headers: {
          'user-agent': USER_AGENT,
          'accept': 'application/json',
        },
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      throw new AcademicSourceError(
        `Crossref search request failed: ${String(error)}`,
        'ACADEMIC_SOURCE_PROVIDER_ERROR',
        { cause: error },
      )
    }

    if (!response.ok) {
      const status = response.status
      let message = `Crossref API error (HTTP ${status})`
      try {
        const detail = await response.text()
        if (detail.length > 0) message += `: ${detail.slice(0, 500)}`
      } catch (error: unknown) {
        if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      }
      throw new AcademicSourceError(message, 'ACADEMIC_SOURCE_PROVIDER_ERROR')
    }

    try {
      const payload = await response.json() as CrossrefSearchResponse
      return { works: (payload.message.items ?? []).map(normalizeCrossrefWork), truncated: false }
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      throw new AcademicSourceError(
        `Crossref returned an unprocessable response body: ${String(error)}`,
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
  return new AcademicSourceError('Crossref search aborted', 'ACADEMIC_SOURCE_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

/** True for a fetch/`AbortSignal` abort, surfaced as `ACADEMIC_SOURCE_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
