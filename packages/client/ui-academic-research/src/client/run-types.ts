/** Local request presentation using the formal Remote result. */
import type { AcademicResearchRunValue } from '@deepseek-ai/dsh-api-academic-research-controller/types'

/** Returned lifecycle and retrieval status remain producer-owned facts. */
export type RunView =
  | { readonly phase: 'running'; readonly cancelling?: boolean }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'settled'; readonly value: AcademicResearchRunValue }
