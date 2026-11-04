/** Configuration for browser-owned scholarly form submissions. */
export interface BrowserAcademicSite {
  /** Search page; volume and conference scopes must be explicit. */
  readonly url: string
  /** Human-readable coverage limit included with search results. */
  readonly scope: string
  /** Unique search input accepted by Playwright's locator API. */
  readonly inputSelector: string
  /** Omitted submits Enter in the search input. */
  readonly submitSelector?: string
  /** Submit navigates; filter updates the current document. */
  readonly mode: 'submit' | 'filter'
  /** Visible result container or explicit no-results marker. */
  readonly readySelector: string
  /** CSS selector for visible paper links in the current results. */
  readonly resultSelector: string
  /** Published result-to-landing URL mapping, applied before paper URL validation. */
  readonly resultUrlRewrite?: {
    /** Anchored expression for a known publisher result URL, such as its PDF route. */
    readonly pattern: string
    /** Publisher landing route using the expression's capture groups. */
    readonly replacement: string
  } | undefined
  /** Anchored expression matching official paper landing URLs. */
  readonly paperUrlPattern: string
  /** Origins allowed for page-published PDF links. */
  readonly pdfOrigins: string[]
  /** Optional visible next-page control marks incomplete coverage. */
  readonly nextSelector?: string
}

/** Resolved deployment limits for the browser provider. */
export interface BrowserAcademicOptions {
  /** Search forms and their declared conference, volume, or site coverage. */
  readonly sites: BrowserAcademicSite[]
  /** Maximum papers retained across all configured sites per query. */
  readonly maximumResults: number
  /** Maximum paper PDF locations retained without eviction. */
  readonly maximumCachedRecords: number
  /** Deadline in milliseconds for each navigation or readiness operation. */
  readonly operationTimeoutMs: number
  /** Maximum citation HTML characters accepted from each paper page. */
  readonly maximumMetadataCharacters: number
  /** Maximum PDF bytes accepted after a browser download completes. */
  readonly maximumPdfBytes: number
  /** Fetch provider used for URLs not observed by this browser source. */
  readonly otherFetchProvider: string
}

/** Execute fixed browser operations using the initiating Agent's existing browser. */
export type BrowserAcademicExecutor = (code: string, signal: AbortSignal) => Promise<unknown>
