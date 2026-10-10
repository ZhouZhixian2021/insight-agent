import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type {
  AcademicWork,
  CandidateAssessment,
  CandidateScreeningDetails,
  DetailedCandidateAssessment,
  HybridSearchPlan,
  ResearchQuestionCoverageResult,
  WorkVersion,
} from '@deepseek-ai/dsh-academic-model'
import type { AcademicQueryWorkflowObservation } from '@deepseek-ai/dsh-academic-workflow'
import { academicQ6Projection } from '../src/q6-projection.ts'

interface Sample {
  readonly plan: HybridSearchPlan
  readonly assessments: readonly CandidateAssessment[]
  readonly rankingResult: AcademicQueryWorkflowObservation['ranking']
  readonly coverage: ResearchQuestionCoverageResult
  readonly round: AcademicQueryWorkflowObservation['rounds'][number]
  readonly stopDecision: NonNullable<AcademicQueryWorkflowObservation['stopDecision']>
}

const sample = JSON.parse(readFileSync(new URL(
  '../../../../z-team_docs/interface-samples/academic-model-v1/academic-query-workflow-v1.sample.json',
  import.meta.url,
), 'utf8')) as Sample

const works: readonly AcademicWork[] = sample.rankingResult.evaluations.map(evaluation => ({
  schemaVersion: 1,
  academicWorkId: evaluation.academicWorkId,
  title: `Work ${evaluation.academicWorkId}`,
  authors: [],
  externalIdentifiers: [],
  workVersionIds: [evaluation.workVersionId],
  canonicalVersionId: evaluation.workVersionId,
  firstPublicDate: { status: 'unknown', reason: 'fixture' },
  publicationStatus: { status: 'unknown', reason: 'fixture' },
  venue: { status: 'unknown', reason: 'fixture' },
}))

const versions: readonly WorkVersion[] = sample.rankingResult.evaluations.map(evaluation => ({
  schemaVersion: 1,
  workVersionId: evaluation.workVersionId,
  academicWorkId: evaluation.academicWorkId,
  versionType: 'unknown',
  versionLabel: { status: 'unknown', reason: 'fixture' },
  releaseDate: { status: 'unknown', reason: 'fixture' },
  externalIdentifiers: [],
  sourceRecords: [],
  contentHash: { status: 'not_extracted' },
  supersedesWorkVersionId: null,
  status: 'active',
}))

function observation(
  value: Partial<AcademicQueryWorkflowObservation> = {},
): AcademicQueryWorkflowObservation {
  return {
    schemaVersion: 1,
    retrievalRunId: 'retrieval-run-q6' as never,
    sequence: 4,
    observedAt: '2026-10-09T00:00:00.000Z',
    status: 'running',
    plan: sample.plan,
    works,
    versions,
    assessments: sample.assessments,
    ranking: sample.rankingResult,
    rounds: [sample.round],
    decisions: [],
    settlements: [],
    coverage: null,
    stopDecision: null,
    limitations: ['run limitation'],
    ...value,
  }
}

describe('Academic Q6 projection', () => {
  it('joins ranked candidates and keeps unfinished sections pending', () => {
    const projected = academicQ6Projection('session-q6' as never, observation())
    expect(projected).toMatchObject({
      schemaVersion: 1,
      sessionId: 'session-q6',
      sequence: 4,
      status: 'running',
      candidates: { state: 'available' },
      coverage: { state: 'pending' },
      stopDecision: { state: 'pending' },
    })
    expect(projected.candidates.state === 'available' && projected.candidates.value.items).toHaveLength(3)
    expect(projected.limitations).toEqual([...sample.rankingResult.limitations, 'run limitation'])
  })

  it('returns completed coverage and stop facts without changing their values', () => {
    const projected = academicQ6Projection('session-q6' as never, observation({
      status: 'settled',
      coverage: sample.coverage,
      stopDecision: sample.stopDecision,
      limitations: [...sample.rankingResult.limitations, 'run limitation'],
    }))
    expect(projected.coverage).toEqual({ state: 'available', value: sample.coverage })
    expect(projected.stopDecision).toEqual({ state: 'available', value: sample.stopDecision })
    expect(projected.limitations).toEqual([...sample.rankingResult.limitations, 'run limitation'])
  })

  it('passes through grounded screening details while old assessments remain valid', () => {
    const screening: CandidateScreeningDetails = {
      schemaVersion: 1,
      signals: [{ kind: 'method', label: 'comparison', quote: { source: 'abstract', text: 'compares methods' } }],
      surfaceKeywordHits: [{ term: 'RAG', source: 'keywords', text: 'RAG' }],
      uncertainties: ['The abstract does not establish the evaluation outcome.'],
      scope: { status: 'unknown', reason: 'The available metadata does not settle the Plan scope.' },
    }
    const detailed: DetailedCandidateAssessment = { ...sample.assessments[0]!, screening }
    const projected = academicQ6Projection('session-q6' as never, observation({
      assessments: [detailed, ...sample.assessments.slice(1)],
    }))
    if (projected.candidates.state !== 'available') throw new Error('expected candidate projection')
    expect(projected.candidates.value.items[0]?.assessment.screening).toEqual(screening)
    expect(projected.candidates.value.items[1]?.assessment).not.toHaveProperty('screening')
  })

  it('marks missing terminal coverage and stop facts as failed', () => {
    const projected = academicQ6Projection('session-q6' as never, observation({ status: 'cancelled' }))
    expect(projected.coverage).toMatchObject({ state: 'failed', code: 'Q6_COVERAGE_NOT_RECORDED' })
    expect(projected.stopDecision).toMatchObject({ state: 'failed', code: 'Q6_STOP_DECISION_NOT_RECORDED' })
  })

  it('rejects mismatched brief identities and incomplete candidate joins', () => {
    expect(() => academicQ6Projection('session-q6' as never, observation({
      coverage: { ...sample.coverage, researchBriefVersion: sample.plan.researchBriefVersion + 1 },
    }))).toThrow('one exact ResearchBrief identity')
    expect(() => academicQ6Projection('session-q6' as never, observation({ works: works.slice(1) })))
      .toThrow('one matching work, version, assessment, and evaluation')
  })
})
