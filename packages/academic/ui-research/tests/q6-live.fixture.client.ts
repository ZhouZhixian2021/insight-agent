/** Isolated formal Remote projections built from the canonical synthetic model fixture. */
import type { AcademicQ6Projection, AcademicQ6CandidateView } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import { q6Sample } from '../src/client/q6-sample.ts'
import { sampleRun } from './run-sample.ts'

/**
 * Create a matching formal Session/run/Brief projection for stream and coverage tests.
 * @returns Independent synthetic projection; no network or model calls.
 */
export function liveProjection(): AcademicQ6Projection {
  const sample = structuredClone(q6Sample), result = sampleRun()
  const items: AcademicQ6CandidateView[] = sample.rankingResult.evaluations.map((evaluation, index) => ({
    evaluation, assessment: sample.assessments.find(item => item.academicWorkId === evaluation.academicWorkId)!,
    work: { schemaVersion: 1, academicWorkId: evaluation.academicWorkId, title: `Synthetic candidate ${index + 1}`,
      authors: ['Synthetic author'], externalIdentifiers: [], workVersionIds: [evaluation.workVersionId],
      canonicalVersionId: evaluation.workVersionId, firstPublicDate: { status: 'unknown', reason: 'fixture' },
      publicationStatus: { status: 'unknown', reason: 'fixture' }, venue: { status: 'unknown', reason: 'fixture' } },
    version: { schemaVersion: 1, workVersionId: evaluation.workVersionId, academicWorkId: evaluation.academicWorkId,
      versionType: 'preprint', versionLabel: { status: 'available', value: 'v1' }, releaseDate: { status: 'unknown', reason: 'fixture' },
      externalIdentifiers: [], sourceRecords: [], contentHash: { status: 'not_extracted' }, supersedesWorkVersionId: null, status: 'active' },
  }))
  const identity = { researchBriefId: result.retrievalRun.researchBriefId, researchBriefVersion: 1 }
  return { schemaVersion: 1, sessionId: result.sessionId, retrievalRunId: result.retrievalRun.retrievalRunId,
    ...identity, sequence: 0, updatedAt: '2026-10-09T00:00:00Z', status: 'running', plan: { ...sample.plan, ...identity },
    candidates: { state: 'available', value: { items, ranking: { ...sample.rankingResult, ...identity } } },
    rounds: { state: 'available', value: [] }, batches: { state: 'available', value: { decisions: [], settlements: [] } },
    coverage: { state: 'available', value: { ...sample.coverage, ...identity } },
    stopDecision: { state: 'available', value: sample.stopDecision }, limitations: [] }
}
