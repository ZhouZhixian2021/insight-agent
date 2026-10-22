/** Pure browser projection for one observed Academic query workflow. */
import type { AcademicQueryWorkflowObservation } from '@deepseek-ai/dsh-academic-workflow/query-workflow'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AcademicQ6CandidateView, AcademicQ6Projection, AcademicQ6Section } from './types.ts'

/**
 * Join authoritative Q3/Q4/Q5 facts into one complete read-only Q6 snapshot.
 * @param sessionId - Session that owns the observed research run.
 * @param observation - Latest complete query-workflow observation from the running pipeline.
 * @returns Browser-safe Q6 data with explicit pending or failed sections.
 */
export function academicQ6Projection(
  sessionId: SessionId,
  observation: AcademicQueryWorkflowObservation,
): AcademicQ6Projection {
  validateIdentity(observation)
  const works = new Map(observation.works.map(work => [work.academicWorkId, work]))
  const versions = new Map(observation.versions.map(version => [version.workVersionId, version]))
  const assessments = new Map(observation.assessments.map(assessment => [assessment.academicWorkId, assessment]))
  const items = observation.ranking.evaluations.map((evaluation): AcademicQ6CandidateView => {
    const work = works.get(evaluation.academicWorkId)
    const version = versions.get(evaluation.workVersionId)
    const assessment = assessments.get(evaluation.academicWorkId)
    if (work === undefined || version === undefined || assessment === undefined
      || version.academicWorkId !== evaluation.academicWorkId) {
      throw new RangeError('Q6 candidate facts must identify one matching work, version, assessment, and evaluation.')
    }
    return {
      work,
      version,
      assessment: { ...assessment, reasons: [...assessment.reasons] },
      evaluation: {
        ...evaluation,
        hardFilter: { ...evaluation.hardFilter, reasons: [...evaluation.hardFilter.reasons] },
        decisionReasons: [...evaluation.decisionReasons],
      },
    }
  })
  const terminal = observation.status !== 'running'
  return {
    schemaVersion: 1,
    sessionId,
    retrievalRunId: observation.retrievalRunId,
    researchBriefId: observation.plan.researchBriefId,
    researchBriefVersion: observation.plan.researchBriefVersion,
    sequence: observation.sequence,
    updatedAt: observation.observedAt,
    status: observation.status,
    plan: observation.plan,
    candidates: { state: 'available', value: { items, ranking: {
      schemaVersion: observation.ranking.schemaVersion,
      researchBriefId: observation.ranking.researchBriefId,
      researchBriefVersion: observation.ranking.researchBriefVersion,
      queues: observation.ranking.queues,
      limitations: observation.ranking.limitations,
    } } },
    rounds: { state: 'available', value: observation.rounds },
    batches: { state: 'available', value: {
      decisions: observation.decisions,
      settlements: observation.settlements,
    } },
    coverage: section(observation.coverage, terminal, 'Q6_COVERAGE_NOT_RECORDED',
      'The query workflow settled without a question-coverage result.'),
    stopDecision: section(observation.stopDecision, terminal, 'Q6_STOP_DECISION_NOT_RECORDED',
      'The query workflow settled without a scheduler stop decision.'),
    limitations: [...new Set([...observation.ranking.limitations, ...observation.limitations])],
  }
}

function section<T>(
  value: T | null,
  terminal: boolean,
  code: string,
  message: string,
): AcademicQ6Section<T> {
  if (value !== null) return { state: 'available', value }
  return terminal ? { state: 'failed', code, message, retryable: false } : { state: 'pending' }
}

function validateIdentity(observation: AcademicQueryWorkflowObservation): void {
  const { plan, ranking, coverage } = observation
  if (plan.researchBriefId !== ranking.researchBriefId
    || plan.researchBriefVersion !== ranking.researchBriefVersion
    || (coverage !== null && (plan.researchBriefId !== coverage.researchBriefId
      || plan.researchBriefVersion !== coverage.researchBriefVersion))) {
    throw new RangeError('Q6 projection requires one exact ResearchBrief identity and version.')
  }
}
