import type { AcademicWork, WorkVersion } from '@deepseek-ai/dsh-academic-model'

/** One arXiv Atom entry distilled into the fields this provider consumes. */
export interface ArxivRawWork {
  readonly id: string
  readonly title: string
  readonly authors: readonly string[]
  readonly published: string | null
  readonly doi: string | null
}

/** One arXiv entry translated into shared academic-model records. */
export interface NormalizedArxivWork {
  readonly academicWork: AcademicWork
  readonly workVersion: WorkVersion
}
