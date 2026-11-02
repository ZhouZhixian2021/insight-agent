import { describe, expect, it } from 'vitest'
import { ACADEMIC_CANDIDATE_RANKING_POLICY_V1, createRetrievalRunId, type ResearchAspectId } from '@deepseek-ai/dsh-academic-model'
import { SessionSeq, type SessionEvent, type SessionEventMap } from '@deepseek-ai/dsh-session'
import { runResearchDraft, type AcademicResearchRecoveryCheckpoint } from '../src/index.ts'
import { recoverCoverageRepairs, validCoverageState } from '../src/recovery-coverage.ts'
import type { CoverageRepairState, CoverageTargetingPolicy } from '../src/coverage-types.ts'
import { draftFixture } from './pipeline-fixture.ts'

async function fixture() {
  const { input, adapters, records } = draftFixture()
  const result = await runResearchDraft(input, adapters)
  const requirements = [{ question: input.brief.questions[0]!, aspects: [{ aspectId: 'q1.method' as ResearchAspectId,
    label: 'Method', evidenceRequirement: 'direct' as const, searchTerms: ['reranking'] }] }]
  const checkpoint: AcademicResearchRecoveryCheckpoint = { schemaVersion: 1, retrievalRunId: createRetrievalRunId(),
    startedAt: '2026-10-30T00:00:00Z', executedQueries: [], search: null, works: records.map(r => r.academicWork),
    versions: records.map(r => r.workVersion), candidates: [], papers: result.papers, paperFailures: [], providerFailures: [],
    availableFulltextWorks: 2, selectionTruncated: false, selectionLimitations: [], scheduledWorkVersionIds: [],
    completedBatchCount: 0, consecutiveBatchesWithoutEvidence: 0, completedSearchRounds: 1, pendingBatchIndex: null,
    assessments: [], rounds: [], decisions: [], settlements: [], coverage: null,
    policy: { initialBatchSize: 2, evidenceGapBatchSize: 1, replenishmentBatchSize: 1, minimumQuestionSupportingWorks: 1 },
    plan: { schemaVersion: 1, researchBriefId: input.brief.researchBriefId, researchBriefVersion: input.brief.version,
      constraints: { publicationWindow: input.brief.publicationWindow, includedWorkTypes: input.brief.includedWorkTypes,
        inclusionRules: [], exclusionRules: [], requiredTerms: [], excludedTerms: [], coverageRequirements: requirements },
      inclusionTargets: { minimum: 2, target: 2, maximum: 3 }, rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
      queries: [], citationExpansionSeeds: [], maximumSearchRounds: 1 },
    ranking: { schemaVersion: 1, researchBriefId: input.brief.researchBriefId, researchBriefVersion: input.brief.version,
      evaluations: [], queues: { p0: [], p1: [], p2: [], excluded: [] }, limitations: [] } }
  const state: CoverageRepairState = { schemaVersion: 1, requirements,
    policy: { minimumSupportingWorks: 1, maximumReviews: 2, maximumRepairRounds: 1, maximumRepairPapers: 2,
      maximumNewCandidateWorks: 4, maximumExcerptCharacters: 1200, maximumRepairCharacters: 4000 },
    reviewCalls: 1, repairRounds: 1, repairedWorkVersionIds: [records[0]!.workVersion.workVersionId],
    repairCandidateIds: [], repairSearchRounds: 0, fingerprint: null, review: null, coverage: null, pending: 'repair', failure: null }
  return { checkpoint, state }
}

function event<T extends keyof SessionEventMap>(type: T, data: SessionEventMap[T], seq = 1): SessionEvent<T> {
  return { type, data, seq: SessionSeq(seq), time: 0 } as SessionEvent<T>
}

describe('durable coverage repair recovery', () => {
  it('rejects schema-1 targeted states and budget rollback while retaining interrupted schema-2 reservations', async () => {
    const { checkpoint, state } = await fixture()
    const targeting: CoverageTargetingPolicy = { maximumWindowsPerPaper: 2, maximumWindowCharacters: 1500,
      maximumSourceOptions: 20, maximumPreviewCharacters: 360, maximumTotalCharacters: 6000, contextCharacters: 240,
      maximumCandidateReads: 1, maximumModelTokens: 45000, maximumModelCalls: 6, maximumElapsedMs: 220000,
      repairMaxTokens: 4096, deltaReviewMaxTokens: 8192, candidateMaxTokens: 4096, finalReviewReserveTokens: 10000 }
    const targeted: CoverageRepairState = { ...state, schemaVersion: 2, policy: { ...state.policy, targeting },
      targeting: { startedAt: '2026-10-30T00:00:00Z', characters: 1500,
        candidateReads: [checkpoint.versions[0]!.workVersionId],
        dispatches: [{ reservedTokens: 5000, actualTokens: null }], exhausted: null } }
    expect(validCoverageState(targeted, checkpoint)).toBe(true)
    expect(validCoverageState({ ...targeted, schemaVersion: 1 }, checkpoint)).toBe(false)
    const restored = recoverCoverageRepairs(checkpoint, [event('academic/coverage-repair-state-v1', {
      retrievalRunId: checkpoint.retrievalRunId, state: targeted })])!
    expect(restored.coverageRepairState?.targeting?.dispatches[0]?.actualTokens).toBeNull()
    for (const changed of [{ ...targeted.targeting!, characters: 0 }, { ...targeted.targeting!, candidateReads: [] },
      { ...targeted.targeting!, dispatches: [] }, { ...targeted.targeting!, startedAt: '2026-10-30T00:00:01Z' }]) {
      expect(recoverCoverageRepairs(restored, [event('academic/coverage-repair-state-v1', {
        retrievalRunId: checkpoint.retrievalRunId, state: { ...targeted, targeting: changed } })])).toBeNull()
    }
  })
  it('retains reservations committed after the latest scheduling checkpoint and rejects counter rollback', async () => {
    const { checkpoint, state } = await fixture()
    const reservation = event('academic/coverage-repair-state-v1', { retrievalRunId: checkpoint.retrievalRunId, state })
    const restored = recoverCoverageRepairs(checkpoint, [reservation])
    expect(restored?.coverageRepairState).toEqual(state)
    expect(checkpoint.coverageRepairState).toBeUndefined()
    expect(recoverCoverageRepairs(restored!, [event('academic/coverage-repair-state-v1', {
      retrievalRunId: checkpoint.retrievalRunId, state: { ...state, reviewCalls: 0 } })])).toBeNull()
  })

  it('replays committed paper evidence idempotently and rejects a changed content hash', async () => {
    const { checkpoint, state } = await fixture()
    const paper = checkpoint.papers[0]!
    if (paper.status !== 'extracted') throw new Error('Expected extracted fixture')
    const reservation = event('academic/coverage-repair-state-v1', { retrievalRunId: checkpoint.retrievalRunId, state })
    const commit = event('academic/coverage-repair-paper-v1', { retrievalRunId: checkpoint.retrievalRunId,
      workVersionId: paper.version.workVersionId, evidence: paper.evidence }, 2)
    const restored = recoverCoverageRepairs(checkpoint, [reservation, commit, commit])
    expect(restored?.papers).toEqual(checkpoint.papers)
    const changed = event('academic/coverage-repair-paper-v1', { ...commit.data, evidence: { ...paper.evidence,
      sourceLocators: paper.evidence.sourceLocators.map(locator => ({ ...locator, contentHash: 'sha256:other-content' })) } })
    expect(recoverCoverageRepairs(checkpoint, [reservation, changed])).toBeNull()
    expect(recoverCoverageRepairs(checkpoint, [commit])).toBeNull()
  })

  it('refuses changed approved scope and excessive durable budgets', async () => {
    const { checkpoint, state } = await fixture()
    expect(validCoverageState(state, checkpoint)).toBe(true)
    expect(validCoverageState({ ...state, requirements: [] }, checkpoint)).toBe(false)
    expect(validCoverageState({ ...state, reviewCalls: 3 }, checkpoint)).toBe(false)
    expect(validCoverageState({ ...state, repairRounds: 2 }, checkpoint)).toBe(false)
  })
})
