import { describe, expect, it } from 'vitest'
import {
  createResearchBriefId,
  createRetrievalRunId,
  createSearchQueryId,
  createWorkVersionId,
  type ResearchQuestionCoverageResult,
} from '@deepseek-ai/dsh-academic-model'
import { SessionSeq, type SessionEvent, type SessionEventMap } from '@deepseek-ai/dsh-session'
import {
  reconstructAcademicResearchRecoveryState,
  type AcademicResearchRecoveryTarget,
  type AcademicSearchPlanEvent,
} from '../src/index.ts'

const target: AcademicResearchRecoveryTarget = {
  retrievalRunId: createRetrievalRunId(),
  researchBriefId: createResearchBriefId(),
  researchBriefVersion: 3,
}
const versions = [createWorkVersionId(), createWorkVersionId(), createWorkVersionId()]

function sessionEvent<T extends keyof SessionEventMap>(
  type: T,
  data: SessionEventMap[T],
  seq: number,
): SessionEvent<T> {
  return { type, data, seq: SessionSeq(seq), time: Date.UTC(2026, 9, 9, 0, 0, seq) } as SessionEvent<T>
}

function plan(): AcademicSearchPlanEvent {
  return {
    schemaVersion: 1,
    researchBriefId: target.researchBriefId,
    researchBriefVersion: target.researchBriefVersion,
    maximumSearchRounds: 2,
    queries: [{
      searchQueryId: createSearchQueryId(),
      kind: 'academic',
      expression: 'recovery',
      purpose: 'answer the approved question',
      questions: ['What survives a restart?'],
      roundIndex: 1,
      providers: ['fixture'],
      maximumResults: null,
      siteHost: null,
    }],
  }
}

function coverage(): ResearchQuestionCoverageResult {
  return {
    schemaVersion: 1,
    researchBriefId: target.researchBriefId,
    researchBriefVersion: target.researchBriefVersion,
    assessedAt: '2026-10-09T00:00:02.000Z',
    questions: [{ question: 'What survives a restart?', status: 'partial',
      supportingWorkIds: [], evidenceIds: [], gaps: ['one more independent paper'] }],
    evidenceRequirementsMet: false,
    allQuestionsCovered: false,
  }
}

describe('Academic research recovery reconstruction', () => {
  it('rebuilds settled batches, pending candidates, and latest committed coverage', () => {
    const observedCoverage = coverage()
    const state = reconstructAcademicResearchRecoveryState([
      sessionEvent('academic/search-plan', plan(), 0),
      sessionEvent('academic/candidate-batch-decision', { retrievalRunId: target.retrievalRunId,
        batchIndex: 1, action: 'schedule_batch', workVersionIds: versions.slice(0, 2),
        searchQuestions: [], reason: 'initial batch' }, 1),
      sessionEvent('academic/candidate-batch-settlement', { retrievalRunId: target.retrievalRunId,
        batchIndex: 1, admittedEvidence: 4, coverage: observedCoverage,
        completedAt: '2026-10-09T00:00:02.000Z' }, 2),
      sessionEvent('academic/candidate-batch-decision', { retrievalRunId: target.retrievalRunId,
        batchIndex: 2, action: 'schedule_batch', workVersionIds: versions.slice(2),
        searchQuestions: [], reason: 'fill question gap' }, 3),
    ], target)

    expect(state).toMatchObject({
      status: 'resumable',
      failure: null,
      input: {
        completedBatches: [{ batchIndex: 1, workVersionIds: versions.slice(0, 2), admittedEvidence: 4 }],
        pendingCandidates: [{ batchIndex: 2, workVersionId: versions[2] }],
        coverage: observedCoverage,
      },
    })
  })

  it('returns a terminal state and accepts historical settlements without committed coverage', () => {
    const state = reconstructAcademicResearchRecoveryState([
      sessionEvent('academic/search-plan', plan(), 0),
      sessionEvent('academic/candidate-batch-decision', { retrievalRunId: target.retrievalRunId,
        batchIndex: 1, action: 'schedule_batch', workVersionIds: versions.slice(0, 1),
        searchQuestions: [], reason: 'initial batch' }, 1),
      sessionEvent('academic/candidate-batch-settlement', { retrievalRunId: target.retrievalRunId,
        batchIndex: 1, admittedEvidence: 2, completedAt: '2026-10-09T00:00:02.000Z' }, 2),
      sessionEvent('academic/run-settlement', { retrievalRunId: target.retrievalRunId,
        status: 'completed', completedAt: '2026-10-09T00:00:03.000Z' }, 3),
    ], target)

    expect(state.status).toBe('completed')
    expect(state.input?.coverage).toBeNull()
  })

  it('rejects a run without a preceding approved plan', () => {
    const state = reconstructAcademicResearchRecoveryState([
      sessionEvent('academic/candidate-batch-decision', { retrievalRunId: target.retrievalRunId,
        batchIndex: null, action: 'stop', workVersionIds: [], searchQuestions: [], reason: 'exhausted' }, 0),
    ], target)

    expect(state).toMatchObject({ status: 'failed', failure: { code: 'search_plan_missing' } })
  })

  it('rejects a plan bound to another Brief version', () => {
    const state = reconstructAcademicResearchRecoveryState([
      sessionEvent('academic/search-plan', { ...plan(), researchBriefVersion: 2 }, 0),
      sessionEvent('academic/candidate-batch-decision', { retrievalRunId: target.retrievalRunId,
        batchIndex: null, action: 'stop', workVersionIds: [], searchQuestions: [], reason: 'exhausted' }, 1),
    ], target)

    expect(state).toMatchObject({ status: 'failed', failure: { code: 'brief_version_mismatch' } })
  })

  it('rejects a settlement without a preceding scheduling decision', () => {
    const state = reconstructAcademicResearchRecoveryState([
      sessionEvent('academic/search-plan', plan(), 0),
      sessionEvent('academic/candidate-batch-settlement', { retrievalRunId: target.retrievalRunId,
        batchIndex: 1, admittedEvidence: 2, completedAt: '2026-10-09T00:00:01.000Z' }, 1),
    ], target)

    expect(state).toMatchObject({ status: 'failed', failure: { code: 'batch_history_inconsistent' } })
  })

  it('rejects committed coverage from another Brief', () => {
    const state = reconstructAcademicResearchRecoveryState([
      sessionEvent('academic/search-plan', plan(), 0),
      sessionEvent('academic/candidate-batch-decision', { retrievalRunId: target.retrievalRunId,
        batchIndex: 1, action: 'schedule_batch', workVersionIds: versions.slice(0, 1),
        searchQuestions: [], reason: 'initial batch' }, 1),
      sessionEvent('academic/candidate-batch-settlement', { retrievalRunId: target.retrievalRunId,
        batchIndex: 1, admittedEvidence: 2, coverage: { ...coverage(), researchBriefId: createResearchBriefId() },
        completedAt: '2026-10-09T00:00:02.000Z' }, 2),
    ], target)

    expect(state).toMatchObject({ status: 'failed', failure: { code: 'brief_identity_mismatch' } })
  })
})
