import type { AcademicWork, WorkVersion } from '@deepseek-ai/dsh-academic-model'

/** One Crossref authorship entry naming a display author. */
export interface CrossrefRawAuthor {
  readonly given?: string
  readonly family?: string
  readonly name?: string
}

/** One Crossref publication date with year-first date parts. */
export interface CrossrefRawDate {
  readonly 'date-parts'?: readonly (readonly number[])[]
}

/** Field subset of one Crossref `/works` record consumed by this provider. */
export interface CrossrefRawWork {
  readonly DOI: string
  readonly title?: readonly string[]
  readonly author?: readonly CrossrefRawAuthor[]
  readonly published?: CrossrefRawDate
  readonly 'published-print'?: CrossrefRawDate
  readonly 'published-online'?: CrossrefRawDate
  readonly type?: string
  readonly 'container-title'?: readonly string[]
}

/** One Crossref record translated into shared academic-model records. */
export interface NormalizedCrossrefWork {
  readonly academicWork: AcademicWork
  readonly workVersion: WorkVersion
}

/** Parsed Crossref `/works` search response envelope. */
export interface CrossrefSearchResponse {
  readonly message: {
    readonly items?: readonly CrossrefRawWork[]
  }
}
