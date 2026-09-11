/**
 * OpenAlex scholarly search over the public `/works` endpoint. Each search maps the API's
 * `results[]` through {@link normalizeOpenAlexWork} into provider-neutral work/version pairs;
 * the seam owns the `maxResults` bound, so `truncated` is always `false` here. The wire format
 * and native `fetch` client are provider-private and do not use `ctx.llm`.
 * @module @deepseek-ai/dsh-academic-source-openalex/provider
 */

import { AcademicSourceError } from '@deepseek-ai/dsh-academic-source'
import type {
  AcademicSourceProvider,
  AcademicSourceSearchRequest,
  AcademicSourceSearchResult,
} from '@deepseek-ai/dsh-academic-source'
import { normalizeOpenAlexWork } from './normalize.ts'
import type { OpenAlexSearchResponse } from './types.ts'

/** Stable id this provider registers under. */
export const OPENALEX_PROVIDER_ID = 'openalex'

/** Default endpoint base: OpenAlex's public API (no trailing slash; `/works` is appended). */
export const OPENALEX_DEFAULT_BASE_URL = 'https://api.openalex.org'

/** Upstream cap OpenAlex enforces on `per-page`. */
export const OPENALEX_MAX_PER_PAGE = 200

/** Explicit product agent, never a browser disguise. */
const USER_AGENT = 'deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)'

/** Resolved options the provider serves its next search with. */
export interface OpenAlexProviderOptions {
  /** Endpoint base; `/works` is appended. */
  baseURL: string
  /** Polite-pool contact email, appended as `mailto` when set. */
  mailto?: string
  /** Premium-pool API key, appended as `api_key` when set. */
  apiKey?: string
}

/**
 * The OpenAlex scholarly-source provider. Registers with
 * `ctx.academicSource.registerSearchProvider`. `available()` is a cheap local
 * check over the resolved endpoint and never makes network calls.
 */
export class OpenAlexProvider implements AcademicSourceProvider {
  readonly id = OPENALEX_PROVIDER_ID

  /**
   * @param resolveOptions - the options for the NEXT operation, snapshotted once
   * at each operation's entry so one search never mixes two config sections.
   */
  constructor(private readonly resolveOptions: () => OpenAlexProviderOptions) {}

  available(): boolean {
    return URL.canParse(this.resolveOptions().baseURL)
  }

  async search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult> {
    throwIfAborted(signal)
    const options = this.resolveOptions()
    const url = new URL('/works', options.baseURL)
    url.searchParams.set('search', request.query)
    if (request.maxResults !== undefined) {
      url.searchParams.set('per-page', String(Math.min(request.maxResults, OPENALEX_MAX_PER_PAGE)))
    }
    if (options.mailto !== undefined && options.mailto.length > 0) {
      url.searchParams.set('mailto', options.mailto)
    }
    if (options.apiKey !== undefined && options.apiKey.length > 0) {
      url.searchParams.set('api_key', options.apiKey)
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
        `OpenAlex search request failed: ${String(error)}`,
        'ACADEMIC_SOURCE_PROVIDER_ERROR',
        { cause: error },
      )
    }

    if (!response.ok) {
      const status = response.status
      let message = `OpenAlex API error (HTTP ${status})`
      try {
        const detail = await response.text()
        if (detail.length > 0) message += `: ${detail.slice(0, 500)}`
      } catch (error: unknown) {
        if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      }
      throw new AcademicSourceError(message, 'ACADEMIC_SOURCE_PROVIDER_ERROR')
    }

    try {
      const payload = await response.json() as OpenAlexSearchResponse
      return { works: (payload.results ?? []).map(normalizeOpenAlexWork), truncated: false }
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      throw new AcademicSourceError(
        `OpenAlex returned an unprocessable response body: ${String(error)}`,
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
  return new AcademicSourceError('OpenAlex search aborted', 'ACADEMIC_SOURCE_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

/** True for a fetch/`AbortSignal` abort, surfaced as `ACADEMIC_SOURCE_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
