import type { AcademicWork, WorkVersion } from '@deepseek-ai/dsh-academic-model'

/** One arXiv Atom entry distilled into the fields this provider consumes. */
export interface ArxivRawWork {
  readonly id: string
  readonly title: string
  readonly authors: readonly string[]
  readonly published: string | null
  readonly updated: string | null
  readonly doi: string | null
}

/** One parsed arXiv Atom search feed: distilled entries plus the upstream match count. */
export interface ArxivFeedResult {
  /** Distilled entries; possibly empty. */
  readonly entries: readonly ArxivRawWork[]
  /**
   * The feed's `<opensearch:totalResults>` match count, or null when the element is
   * absent or not a safe non-negative integer. Absence never implies zero matches.
   */
  readonly totalResults: number | null
}

/** One arXiv entry translated into shared academic-model records. */
export interface NormalizedArxivWork {
  readonly academicWork: AcademicWork
  readonly workVersion: WorkVersion
}
