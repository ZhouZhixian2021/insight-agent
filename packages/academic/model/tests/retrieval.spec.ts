import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  createAcademicWorkId,
  createBatchResult,
  createCoverageSummary,
  createFailureId,
  createResearchBriefId,
  createRetrievalRunId,
  type ResearchStage,
  type RetrievalRun,
} from '../src/index.ts'

const common = {
  schemaVersion: 1 as const,
  retrievalRunId: createRetrievalRunId(),
  researchBriefId: createResearchBriefId(),
  researchBriefVersion: 2,
  startedAt: '2026-09-14T08:00:00Z',
  queries: ['retrieval evaluation', 'retrieval evaluation'],
  providers: ['sample-openalex'],
  academicWorkIds: [createAcademicWorkId()],
  coverageSummary: createCoverageSummary({
    discoveredRecords: 2,
    deduplicatedWorks: 1,
    includedWorks: 1,
    availableFulltextWorks: 0,
    abstractOnlyWorks: 1,
    metadataOnlyWorks: 0,
    failedOperations: 1,
    truncated: true,
    limitations: ['Full-text access denied.'],
    providerBreakdown: null,
  }),
  failures: [{
    schemaVersion: 1 as const,
    failureId: createFailureId(),
    provider: 'sample-openalex',
    operation: 'fetch_fulltext',
    category: 'fulltext_unavailable' as const,
    message: 'Full-text access denied.',
    retryable: false,
    retryAfter: null,
  }],
}

describe('RetrievalRun', () => {
  it('retains successful work and brief binding when a completed run has partial failures', () => {
    const outcome = createBatchResult(common.academicWorkIds, common.failures)
    const run: RetrievalRun = {
      ...common,
      stage: 'completed',
      status: outcome.status,
      completedAt: '2026-09-14T08:01:00Z',
      academicWorkIds: outcome.items,
      failures: outcome.failures,
    }
    expect(run.status).toBe('partial_success')
    expect(run.academicWorkIds).toEqual(common.academicWorkIds)
    expect(run.failures).toEqual(common.failures)
    expect(run.researchBriefVersion).toBe(2)
    expect(run.queries).toEqual(['retrieval evaluation', 'retrieval evaluation'])
  })

  it.each(['planning', 'awaiting_approval', 'running'] as const)('keeps %s records without a final result', (stage) => {
    const run: RetrievalRun = { ...common, stage, status: null, completedAt: null }
    expect(run.status).toBeNull()
    expect(run.completedAt).toBeNull()
    expectTypeOf(run.status).toEqualTypeOf<null>()
  })

  it('records cancellation separately from retained partial results', () => {
    const run: RetrievalRun = {
      ...common,
      stage: 'cancelled',
      status: createBatchResult(common.academicWorkIds, common.failures).status,
      completedAt: '2026-09-14T08:01:00Z',
    }
    expect(run.stage).toBe('cancelled')
    expect(run.status).toBe('partial_success')
    expect(run.academicWorkIds).toHaveLength(1)
  })

  it('keeps a successful zero-result search distinct from an unsuccessful search', () => {
    expect(createBatchResult([], []).status).toBe('success')
    const run: RetrievalRun = {
      ...common,
      stage: 'failed',
      status: createBatchResult([], common.failures).status,
      completedAt: '2026-09-14T08:01:00Z',
      academicWorkIds: [],
    }
    expect(run.status).toBe('failed')
  })

  it('uses a distinct branded identity for each run, independent of the brief', () => {
    expect(createRetrievalRunId()).not.toBe(common.retrievalRunId)
    expectTypeOf(common.retrievalRunId).not.toEqualTypeOf(common.researchBriefId)
    expectTypeOf<ResearchStage>().toEqualTypeOf<'planning' | 'awaiting_approval' | 'running' | 'completed' | 'failed' | 'cancelled'>()
  })

  it('disallows final results on open stages and missing results on terminal stages', () => {
    // These negative assignments are checked by the focused TypeScript contract check.
    // @ts-expect-error A running record cannot have a final status or completedAt.
    const premature: RetrievalRun = { ...common, stage: 'running', status: 'success', completedAt: '2026-09-14T08:01:00Z' }
    // @ts-expect-error A terminal record must carry both terminal time and status.
    const unfinished: RetrievalRun = { ...common, stage: 'completed', status: null, completedAt: null }
    expect(premature.stage).toBe('running')
    expect(unfinished.stage).toBe('completed')
  })
})
