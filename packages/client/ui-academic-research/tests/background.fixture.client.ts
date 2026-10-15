/** Translate test frames into complete background snapshots for existing rendering regressions. */
import type { AcademicBackgroundRunView, AcademicResearchRunFrame, AcademicResearchRunRequest } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import type { ResearchEntryInjected } from '../src/client/ResearchEntry.tsx'
import { sampleRun } from './run-sample.ts'

export type TestStream = (request: AcademicResearchRunRequest, signal: AbortSignal) => AsyncIterable<AcademicResearchRunFrame>
export function initialTask(): AcademicBackgroundRunView {
  const value = sampleRun()
  return { schemaVersion: 1, sessionId: value.sessionId, backgroundRunId: 'test-background', researchBriefId: value.retrievalRun.researchBriefId,
    startedAt: '2026-10-12T00:00:00Z', updatedAt: '2026-10-12T00:00:00Z', state: 'running', retrievalRunId: null,
    progress: null, q6: null, result: null, error: null, cancelReason: null }
}
export function streamRemote(stream: TestStream): Omit<ResearchEntryInjected, 'plan'> {
  let task = initialTask()
  let request: AcademicResearchRunRequest
  return {
    enhanceEvidence: async () => { throw new Error('Enhancement is not used by this background fixture') },
    enhancementHistory: async () => null,
    listBackgroundRuns: async () => [], getBackgroundRun: async () => task,
    startBackgroundRun: async (input) => { request = input; return task },
    cancelBackgroundRun: async () => { task = { ...task, state: 'cancelled', cancelReason: 'user_requested' }; return task },
    watchBackgroundRun: async function* (_key, signal) {
      for await (const frame of stream(request, signal)) {
        task = frame.type === 'progress' ? { ...task, retrievalRunId: frame.progress.retrievalRunId, progress: frame.progress }
          : frame.type === 'q6' ? { ...task, retrievalRunId: frame.projection.retrievalRunId, q6: frame.projection }
            : { ...task, state: 'completed', retrievalRunId: frame.retrievalRunId, result: frame.value, q6: frame.value.q6 ?? null }
        yield task
      }
    },
  }
}
