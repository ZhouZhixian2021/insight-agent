/** UI-only adaptation of A's agreed handoff until the Remote exposes retrievalRun. */
import type { AcademicResearchRunValue } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import type { RetrievalRun } from '@deepseek-ai/dsh-academic-model'

/** Existing Remote fields plus the exact shared retrieval record required by the handoff. */
export type RunValue = AcademicResearchRunValue & { readonly retrievalRun: RetrievalRun }

/** Local request presentation; returned lifecycle and retrieval status stay in their producer records. */
export type RunView =
  | { readonly phase: 'running' }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'settled'; readonly value: RunValue }
