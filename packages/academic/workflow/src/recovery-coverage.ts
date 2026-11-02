/** Replay committed repair reservations and verified additions after the last scheduling checkpoint. */
import { isDeepStrictEqual } from 'node:util'
import { appendVerifiedEvidence } from '@deepseek-ai/dsh-academic-evidence'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { AcademicResearchRecoveryCheckpoint } from './recovery-checkpoint.ts'
import type { CoverageRepairPolicy, CoverageRepairState } from './coverage-types.ts'

/**
 * Validate frozen limits and monotonic reservations read from durable storage.
 * @param state Untrusted persisted repair state.
 * @param checkpoint Approved run scope.
 * @returns Whether replay can safely retain this state.
 */
export function validCoverageState(state: CoverageRepairState, checkpoint: AcademicResearchRecoveryCheckpoint): boolean {
  const p = (state as { readonly policy: CoverageRepairPolicy | undefined }).policy
  const count = (n: number) => Number.isSafeInteger(n) && n >= 0
  const schema = (state as { readonly schemaVersion: unknown }).schemaVersion
  return p !== undefined && (schema === 1 && p.targeting === undefined || schema === 2 && p.targeting !== undefined)
    && validTargeting(p.targeting, state.targeting)
    && isDeepStrictEqual(state.requirements, checkpoint.plan.constraints.coverageRequirements)
    && count(p.maximumReviews) && p.maximumReviews >= 1 && p.maximumReviews <= 2
    && count(p.maximumRepairRounds) && p.maximumRepairRounds <= 1
    && [p.maximumRepairPapers, p.maximumNewCandidateWorks, p.maximumExcerptCharacters, p.maximumRepairCharacters,
      p.minimumSupportingWorks, state.reviewCalls, state.repairRounds, state.repairSearchRounds].every(count)
    && p.maximumExcerptCharacters > 0 && p.maximumRepairCharacters > 0 && p.minimumSupportingWorks > 0
    && state.reviewCalls <= p.maximumReviews && state.repairRounds <= p.maximumRepairRounds
    && state.repairSearchRounds <= state.repairRounds
    && Array.isArray(state.repairedWorkVersionIds) && Array.isArray(state.repairCandidateIds)
    && new Set(state.repairedWorkVersionIds).size === state.repairedWorkVersionIds.length
    && new Set(state.repairCandidateIds).size === state.repairCandidateIds.length
    && state.repairedWorkVersionIds.length <= p.maximumRepairPapers
    && state.repairCandidateIds.length <= p.maximumNewCandidateWorks
    && (state.repairRounds > 0 || (state.repairedWorkVersionIds.length === 0 && state.repairCandidateIds.length === 0))
}

function validTargeting(policy: unknown, state: unknown): boolean {
  if (policy === undefined) return state === undefined
  if (policy === null || typeof policy !== 'object' || Array.isArray(policy)) return false
  const p = policy as Record<string, unknown>
  const keys = ['maximumWindowsPerPaper', 'maximumWindowCharacters', 'maximumSourceOptions', 'maximumPreviewCharacters',
    'maximumTotalCharacters', 'contextCharacters',
    'maximumCandidateReads', 'maximumModelTokens', 'maximumModelCalls', 'maximumElapsedMs', 'repairMaxTokens',
    'deltaReviewMaxTokens', 'candidateMaxTokens', 'finalReviewReserveTokens']
  if (keys.some(key => !Number.isSafeInteger(p[key]) || Number(p[key]) < (
    key === 'contextCharacters' || key === 'maximumCandidateReads' || key === 'maximumSourceOptions' ? 0 : 1))
    || Number(p.maximumCandidateReads) > 1 || Number(p.maximumWindowsPerPaper) > 2 || Number(p.maximumModelCalls) > 6) return false
  if (state === undefined) return true
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return false
  const s = state as Record<string, unknown>
  return typeof s.startedAt === 'string' && Number.isFinite(Date.parse(s.startedAt))
    && Number.isSafeInteger(s.characters) && Number(s.characters) >= 0 && Number(s.characters) <= Number(p.maximumTotalCharacters)
    && Array.isArray(s.candidateReads) && s.candidateReads.every(id => typeof id === 'string')
    && new Set(s.candidateReads).size === s.candidateReads.length && s.candidateReads.length <= Number(p.maximumCandidateReads)
    && Array.isArray(s.dispatches) && s.dispatches.length <= Number(p.maximumModelCalls)
    && s.dispatches.every((entry: unknown) => {
      if (entry === null || typeof entry !== 'object') return false
      const d = entry as Record<string, unknown>
      return Number.isSafeInteger(d.reservedTokens) && Number(d.reservedTokens) > 0
        && (d.actualTokens === null || Number.isSafeInteger(d.actualTokens) && Number(d.actualTokens) >= 0)
    })
    && [null, 'tokens', 'time', 'characters'].includes(s.exhausted as string | null)
}

/**
 * Overlay durable repair work that committed after a scheduling checkpoint.
 * @param checkpoint Latest validated scheduling checkpoint.
 * @param events Later Session events in persisted order.
 * @returns Updated immutable checkpoint, or null for inconsistent repair history.
 */
export function recoverCoverageRepairs(checkpoint: AcademicResearchRecoveryCheckpoint,
  events: readonly SessionEvent[]): AcademicResearchRecoveryCheckpoint | null {
  let result = structuredClone(checkpoint)
  for (const event of events) {
    if (event.type === 'academic/coverage-repair-state-v1' && event.data.retrievalRunId === checkpoint.retrievalRunId) {
      const state = event.data.state, prior = result.coverageRepairState
      const targeting = state.targeting
      if (!validCoverageState(state, result) || (prior !== undefined && (!isDeepStrictEqual(state.policy, prior.policy)
        || state.reviewCalls < prior.reviewCalls || state.repairRounds < prior.repairRounds
        || prior.repairedWorkVersionIds.some(id => !state.repairedWorkVersionIds.includes(id))
        || prior.repairCandidateIds.some(id => !state.repairCandidateIds.includes(id))
        || prior.targeting !== undefined && (targeting === undefined || prior.targeting.startedAt !== targeting.startedAt
          || prior.targeting.characters > targeting.characters
          || prior.targeting.dispatches.length > targeting.dispatches.length
          || prior.targeting.candidateReads.some(id => !targeting.candidateReads.includes(id))
          || prior.targeting.dispatches.some((d, i) => {
            const current = targeting.dispatches[i]
            return current === undefined || d.reservedTokens !== current.reservedTokens
              || d.actualTokens !== null && d.actualTokens !== current.actualTokens
          }))))) return null
      result = { ...result, coverageRepairState: state, coverage: state.coverage ?? result.coverage }
    }
    const addition = event.type === 'academic/coverage-repair-paper-v1' && event.data.retrievalRunId === checkpoint.retrievalRunId
      ? { id: event.data.workVersionId, evidence: event.data.evidence }
      : event.type === 'academic/evidence-fragment-verified' && event.data.purpose === 'coverage_repair'
        && event.data.retrievalRunId === checkpoint.retrievalRunId
        ? { id: event.data.source.workVersionId, evidence: event.data.evidence } : null
    if (addition === null) continue
    const paper = result.papers.find(paper => (paper.status === 'extracted' || paper.status === 'partially_extracted')
      && paper.version.workVersionId === addition.id)
    if (paper === undefined || (paper.status !== 'extracted' && paper.status !== 'partially_extracted')) return null
    const hash = paper.evidence.sourceLocators[0]?.contentHash
    if (!result.coverageRepairState?.repairedWorkVersionIds.includes(addition.id)
      || addition.evidence.evidenceCard.workVersionId !== addition.id
      || addition.evidence.sourceLocators.some(locator => locator.workVersionId !== addition.id || locator.contentHash !== hash)
      || addition.evidence.evidenceRecords.some(record => record.workVersionId !== addition.id
        || record.contentHash.status !== 'available' || record.contentHash.value !== hash)) return null
    result = { ...result, papers: result.papers.map(item => item === paper
      ? { ...paper, evidence: appendVerifiedEvidence(paper.evidence, addition.evidence) } : item) }
  }
  return result
}
