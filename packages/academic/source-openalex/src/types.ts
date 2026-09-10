import type { AcademicWork, WorkVersion } from '@deepseek-ai/dsh-academic-model'

/** One OpenAlex authorship entry naming a display author. */
export interface OpenAlexRawAuthorship {
  readonly author: { readonly display_name: string | null }
}

/** Primary location of one OpenAlex work record. */
export interface OpenAlexRawPrimaryLocation {
  readonly source: { readonly display_name: string | null } | null
}

/** Field subset of one OpenAlex `/works` record consumed by this adapter. */
export interface OpenAlexRawWork {
  readonly id: string
  readonly doi: string | null
  readonly display_name: string
  readonly authorships: readonly OpenAlexRawAuthorship[]
  readonly publication_year: number | null
  readonly publication_date: string | null
  readonly type: string | null
  readonly is_retracted: boolean | null
  readonly primary_location: OpenAlexRawPrimaryLocation | null
}

/** One OpenAlex record translated into shared academic-model records. */
export interface NormalizedOpenAlexWork {
  readonly academicWork: AcademicWork
  readonly workVersion: WorkVersion
}
