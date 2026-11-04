/** Academic provider over page-published citation metadata and observed PDF links. */
import { AcademicSourceError, normalizeAcademicCatalogRecord, parseAcademicPaperCitation,
  type AcademicSourceProvider, type AcademicSourceSearchRequest, type AcademicSourceSearchResult,
  type AcademicSourceWork } from '@deepseek-ai/dsh-academic-source'
import { z } from 'zod'
import { WebError, type WebFetchRequest, type WebFetchResult } from '@deepseek-ai/dsh-web'
import { downloadAcademicPdf } from './download.ts'
import { academicBrowserScript } from './script.ts'
import type { BrowserAcademicExecutor, BrowserAcademicOptions } from './types.ts'

const resultSchema = z.object({ papers: z.array(z.object({ url: z.url(), html: z.string() })), truncated: z.boolean() })

/** Browser searches never guess paper or PDF URLs and never call publisher APIs. */
export class BrowserAcademicProvider implements AcademicSourceProvider {
  readonly id = 'browser'
  readonly limitations: readonly string[]
  private readonly records = new Map<string, readonly string[]>()
  private readonly shutdown = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()

  /**
   * @param options Validated, resolved search pages and limits.
   * @param execute Existing DSH browser executor; serializes each complete site operation.
   * @param isAvailable Cheap check for the configured browser provider.
   * @param otherFetch Explicit retrieval route for papers from other source providers.
   */
  constructor(private readonly options: BrowserAcademicOptions, private readonly execute: BrowserAcademicExecutor,
    private readonly isAvailable: () => boolean,
    private readonly otherFetch?: (request: WebFetchRequest, signal: AbortSignal) => Promise<WebFetchResult>) {
    this.limitations = [...options.sites.map(site => site.scope),
      'Browser search reads only the first result page of each configured scope; a failed site fails this browser search.',
      'Browser PDF locations are retained in memory until provider unload or restart.']
  }

  available(): boolean { return !this.shutdown.signal.aborted && this.isAvailable() }

  search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult> {
    return this.track(this.run(request, signal))
  }

  private track<T>(operation: Promise<T>): Promise<T> {
    this.pending.add(operation)
    void operation.then(() => this.pending.delete(operation), () => this.pending.delete(operation))
    return operation
  }

  /**
   * Download observed PDFs through the browser; route other URLs to the configured fetch provider.
   * @param request PDF URL returned by Academic source resolution.
   * @param callerSignal Caller cancellation, combined with provider shutdown.
   * @returns Validated PDF bytes or the explicitly selected other provider's result.
   */
  fetch(request: WebFetchRequest, callerSignal?: AbortSignal): Promise<WebFetchResult> {
    return this.track(this.runFetch(request, callerSignal))
  }

  private async runFetch(request: WebFetchRequest, callerSignal?: AbortSignal): Promise<WebFetchResult> {
    const signal = AbortSignal.any([this.shutdown.signal, ...(callerSignal === undefined ? [] : [callerSignal])])
    try {
      signal.throwIfAborted()
      const landing = [...this.records].find(([, urls]) => urls.includes(request.url))?.[0]
      if (landing !== undefined) return await downloadAcademicPdf(this.execute, landing, request.url, this.options, signal)
      if (this.otherFetch === undefined) throw new WebError('PDF URL was not observed by browser search.', 'ACADEMIC_BROWSER_PDF_UNOBSERVED')
      return await this.otherFetch(request, signal)
    } catch (cause: unknown) {
      if (signal.aborted) throw new WebError('Academic browser download cancelled.', 'ACADEMIC_BROWSER_PDF_ABORTED', { cause })
      if (cause instanceof WebError) throw cause
      throw new WebError('Academic browser PDF download failed; check the paper link and site access.',
        'ACADEMIC_BROWSER_PDF_FAILED', { cause })
    }
  }

  fullTextUrls(recordId: string): readonly string[] { return this.records.get(recordId) ?? [] }

  /** Abort and settle owned calls before releasing the browser dependency. */
  async dispose(): Promise<void> {
    this.shutdown.abort()
    await Promise.allSettled([...this.pending])
    this.records.clear()
  }

  private async run(request: AcademicSourceSearchRequest, callerSignal?: AbortSignal): Promise<AcademicSourceSearchResult> {
    const requestedMaximum = request.maxResults ?? this.options.maximumResults
    if (!request.query.trim() || !Number.isSafeInteger(requestedMaximum) || requestedMaximum < 1) {
      throw new AcademicSourceError('Browser query must be non-empty and maxResults must be a positive integer.',
        'ACADEMIC_SOURCE_INVALID_REQUEST')
    }
    const maximum = Math.min(requestedMaximum, this.options.maximumResults)
    const signal = AbortSignal.any([this.shutdown.signal, ...(callerSignal === undefined ? [] : [callerSignal])])
    const groups: AcademicSourceWork[][] = []
    const records = new Map<string, readonly string[]>()
    let truncated = false
    try {
      for (const site of this.options.sites) {
        const works: AcademicSourceWork[] = []
        groups.push(works)
        signal.throwIfAborted()
        const response = resultSchema.safeParse(await this.execute(
          academicBrowserScript(site, request.query, maximum, this.options), signal))
        signal.throwIfAborted()
        if (!response.success || response.data.papers.length > maximum) {
          throw new AcademicSourceError('Browser returned invalid scholarly search results.', 'ACADEMIC_SOURCE_PARSE_ERROR')
        }
        truncated ||= response.data.truncated
        for (const paper of response.data.papers) {
          const url = new URL(paper.url)
          if (url.protocol !== 'https:' || url.username || url.password || url.origin !== new URL(site.url).origin
            || !new RegExp(site.paperUrlPattern).test(paper.url) || paper.html.length > this.options.maximumMetadataCharacters) {
            throw new AcademicSourceError('Browser returned an unexpected scholarly paper page.', 'ACADEMIC_SOURCE_PARSE_ERROR')
          }
          if (records.has(paper.url)) continue
          const citation = parseAcademicPaperCitation(paper.html,
            url.hostname === 'aclanthology.org' ? 'acl' : url.hostname === 'proceedings.mlr.press' ? 'pmlr'
              : url.hostname === 'openaccess.thecvf.com' ? 'cvf' : undefined)
          const pdf = citation.pdfUrl === null ? null : new URL(citation.pdfUrl, paper.url)
          if (pdf !== null && (pdf.protocol !== 'https:' || pdf.username || pdf.password || !site.pdfOrigins.includes(pdf.origin))) {
            throw new AcademicSourceError('Paper publishes a PDF outside the configured origins.', 'ACADEMIC_SOURCE_PARSE_ERROR')
          }
          records.set(paper.url, pdf === null ? [] : [pdf.href])
          works.push(normalizeAcademicCatalogRecord(this.id, { recordId: paper.url, ...citation }))
        }
      }
      const selected: AcademicSourceWork[] = []
      for (let index = 0; selected.length < maximum && groups.some(group => index < group.length); index++) {
        for (const group of groups) {
          const work = group[index]
          if (work !== undefined && selected.length < maximum) selected.push(work)
        }
      }
      const selectedIds = selected.flatMap(work => work.workVersion.sourceRecords.map(record => record.recordId))
      const added = selectedIds.filter(id => !this.records.has(id)).length
      if (this.records.size + added > this.options.maximumCachedRecords) {
        throw new AcademicSourceError('Browser paper cache is full; increase maximumCachedRecords or reload the provider.',
          'ACADEMIC_SOURCE_PROVIDER_ERROR')
      }
      for (const id of selectedIds) this.records.set(id, records.get(id) ?? [])
      return { works: selected, truncated: truncated || groups.reduce((count, group) => count + group.length, 0) > maximum }
    } catch (cause: unknown) {
      if (signal.aborted) throw new AcademicSourceError('Browser academic search cancelled.', 'ACADEMIC_SOURCE_ABORTED', { cause })
      if (cause instanceof AcademicSourceError) throw cause
      throw new AcademicSourceError('Browser academic search failed; check site access, search selectors, and browser readiness.',
        'ACADEMIC_SOURCE_PROVIDER_ERROR', { cause })
    }
  }
}
