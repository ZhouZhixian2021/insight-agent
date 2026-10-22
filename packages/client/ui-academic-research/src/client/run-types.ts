/** Local request presentation using the formal Remote result. */
import type { AcademicResearchRunValue, AcademicResearchProgressView, AcademicQ6Projection } from '@deepseek-ai/dsh-api-academic-research-controller/types'

/** Returned lifecycle and retrieval status remain producer-owned facts. */
export type RunView = (
  | { readonly phase: 'running'; readonly cancelling?: boolean }
  | { readonly phase: 'error'; readonly message: string; readonly reason?: 'cancelled' | 'connection' | 'server' }
  | { readonly phase: 'settled'; readonly value: AcademicResearchRunValue }
) & {
  readonly progress?: AcademicResearchProgressView
  readonly recent?: readonly AcademicResearchProgressView[]
  readonly q6?: AcademicQ6Projection
}
