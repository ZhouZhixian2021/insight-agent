/** Replays the complete retained pool without rediscovery, model calls or Session ownership. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AcademicCandidateRankingResult, AcademicWorkId, CandidateAssessment,
  CandidateFulltextAvailability, CandidateReviewSelectionV1, ExecutableResearchBrief,
  HybridSearchPlan, WorkVersion, WorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { createIngestIndex, type IngestRecord } from '@deepseek-ai/dsh-academic-ingestion'
import { assessPlannedCandidates, rankPlannedCandidates, selectCandidateReviews,
  type CandidateScreeningCriteria, type PlannedSearchRoundResult } from '@deepseek-ai/dsh-academic-retrieval'
import { approvedCandidateScreeningCriteria, type AcademicCandidateScreening } from '../src/candidate-screening.ts'

const directory = new URL('../../../../z-team_docs/验收数据/2026-10-20-candidate-review/full-pool-handoff/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8')) as {
  readonly files: readonly { readonly path: string; readonly sha256: string }[]
}

interface PoolInput {
  readonly brief: ExecutableResearchBrief
  readonly plan: HybridSearchPlan
  readonly candidateScreening: AcademicCandidateScreening
  readonly records: readonly IngestRecord[]
  readonly retainedVersions: readonly WorkVersion[]
  readonly queryProvenance: PlannedSearchRoundResult['discoveredBy']
  readonly fulltextFacts: readonly {
    readonly workVersionId: WorkVersionId
    readonly availability: CandidateFulltextAvailability
  }[]
}

interface PoolReplay {
  readonly mode: 'offline_current_selector_no_model'
  readonly historicalSelection: false
  readonly maximumModelReviews: number
  readonly attemptedWorkIdsBefore: readonly AcademicWorkId[]
  readonly criteria: CandidateScreeningCriteria
  readonly lexicalAssessments: readonly CandidateAssessment[]
  readonly lexicalRanking: AcademicCandidateRankingResult
  readonly selection: CandidateReviewSelectionV1
}

interface HistoricalPool {
  readonly assessments: readonly CandidateAssessment[]
  readonly fulltextCandidates: readonly { readonly workVersionId: WorkVersionId }[]
  readonly selectionEvent: { readonly status: 'not_recorded' }
  readonly requestFacts: readonly {
    readonly seq: number
    readonly academicWorkId: AcademicWorkId
    readonly dispatchOrder: number
  }[]
  readonly resultFacts: readonly {
    readonly seq: number
    readonly requestSeq: number
    readonly academicWorkId: AcademicWorkId
    readonly status: string
  }[]
}

interface PoolAudit {
  readonly comparison: {
    readonly historicalActualWorkIds: readonly AcademicWorkId[]
    readonly offlineSelectedWorkIds: readonly AcademicWorkId[]
    readonly sameMembership: boolean
    readonly sameOrder: boolean
    readonly independentRelevanceLabels: { readonly status: string }
  }
  readonly questionRouting: readonly { readonly offlineSelectedWorkIds: readonly AcademicWorkId[] }[]
}

function readText(name: string): string {
  const bytes = readFileSync(new URL(name, directory))
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.files.find(item => item.path === name)?.sha256)
  return bytes.toString()
}

function readFixture(name: string): unknown {
  return JSON.parse(readText(name))
}

function restoreRound(input: PoolInput): PlannedSearchRoundResult {
  return {
    ingested: {
      index: { ...createIngestIndex(), records: new Map(input.records.map(record => [record.academicWork.academicWorkId, [record]])) },
      works: input.records.map(record => record.academicWork), versions: input.retainedVersions,
      verifiedDiscoveries: [], audit: { entries: [] },
    },
    discoveredBy: input.queryProvenance, queries: [],
  }
}

describe('complete retained candidate-pool handoff', () => {
  it('retains canonical metadata, all version identities and links to the original eight', () => {
    const input = readFixture('input.json') as PoolInput
    const historical = readFixture('historical.json') as HistoricalPool
    const eight = JSON.parse(readFileSync(new URL('../scoring-handoff/input.json', directory), 'utf8')) as {
      readonly records: readonly IngestRecord[]
      readonly sourcePlan: HybridSearchPlan
    }
    expect(input.plan).toEqual(eight.sourcePlan)
    expect(input.records).toHaveLength(276)
    expect(input.retainedVersions).toHaveLength(286)
    expect(new Set(input.records.map(record => record.academicWork.academicWorkId)).size).toBe(276)
    expect(new Set(input.retainedVersions.map(version => version.workVersionId)).size).toBe(286)
    const versions = new Map(input.retainedVersions.map(version => [version.workVersionId, version]))
    for (const record of input.records) {
      expect(record.workVersion.workVersionId).toBe(record.academicWork.canonicalVersionId)
      expect(versions.get(record.academicWork.canonicalVersionId)).toEqual(record.workVersion)
      expect(record.academicWork.workVersionIds.every(id =>
        versions.get(id)?.academicWorkId === record.academicWork.academicWorkId)).toBe(true)
      const assessment = historical.assessments.find(item => item.academicWorkId === record.academicWork.academicWorkId)
      expect(record.metadata).toEqual({ abstract: assessment?.abstract, keywords: assessment?.keywords })
      expect(input.fulltextFacts.find(item => item.workVersionId === record.workVersion.workVersionId)?.availability)
        .toEqual(assessment?.fulltextAvailability)
    }
    for (const record of eight.records) {
      expect(input.records.find(item => item.academicWork.academicWorkId === record.academicWork.academicWorkId)).toEqual(record)
    }
  })

  it('reconstructs screening, hard filters, all queues and every selection decision from frozen inputs', () => {
    const input = readFixture('input.json') as PoolInput
    const replay = readFixture('replay.json') as PoolReplay
    expect(replay.mode).toBe('offline_current_selector_no_model')
    expect(replay.historicalSelection).toBe(false)
    const round = restoreRound(input)
    const criteria = approvedCandidateScreeningCriteria(input.brief, input.plan, input.candidateScreening)
    expect(criteria).toEqual(replay.criteria)
    const facts = new Map(input.fulltextFacts.map(item => [item.workVersionId, item.availability]))
    const assessments = assessPlannedCandidates(input.plan, input.brief, round, criteria, facts)
    expect(assessments).toEqual(replay.lexicalAssessments)
    const ranking = rankPlannedCandidates(input.plan, input.brief, round, assessments)
    expect(ranking).toEqual(replay.lexicalRanking)
    const selection = selectCandidateReviews(input.brief, input.plan, ranking, assessments,
      new Set(replay.attemptedWorkIdsBefore), replay.maximumModelReviews)
    expect(selection).toEqual(replay.selection)
    expect(selection.decisions).toHaveLength(276)
    expect(Object.fromEntries(['selected', 'not_selected_budget', 'hard_excluded', 'fulltext_unresolvable']
      .map(status => [status, selection.decisions.filter(item => item.status === status).length])))
      .toEqual({ selected: 8, not_selected_budget: 215, hard_excluded: 30, fulltext_unresolvable: 23 })
  })

  it('keeps actual historical dispatch separate from the offline selector and leaves relevance unlabelled', () => {
    const historical = readFixture('historical.json') as HistoricalPool
    const replay = readFixture('replay.json') as PoolReplay
    const audit = readFixture('audit.json') as PoolAudit
    expect(historical.selectionEvent.status).toBe('not_recorded')
    expect(historical.fulltextCandidates).toHaveLength(14)
    expect(historical.requestFacts).toHaveLength(8)
    expect(historical.resultFacts).toHaveLength(8)
    for (const request of historical.requestFacts) {
      expect(historical.resultFacts.filter(result => result.requestSeq === request.seq))
        .toEqual([expect.objectContaining({ academicWorkId: request.academicWorkId })])
    }
    const oldIds = [...historical.requestFacts].sort((a, b) => a.dispatchOrder - b.dispatchOrder).map(item => item.academicWorkId)
    const newIds = replay.selection.decisions.filter(item => item.status === 'selected')
      .sort((a, b) => a.selectionOrder! - b.selectionOrder!).map(item => item.academicWorkId)
    expect(audit.comparison.historicalActualWorkIds).toEqual(oldIds)
    expect(audit.comparison.offlineSelectedWorkIds).toEqual(newIds)
    expect([...newIds].sort()).toEqual([...oldIds].sort())
    expect(newIds).not.toEqual(oldIds)
    expect(audit.comparison).toMatchObject({ sameMembership: true, sameOrder: false })
    expect(audit.comparison.independentRelevanceLabels.status).toBe('not_supplied')
    expect(audit.questionRouting).toHaveLength(5)
    expect(audit.questionRouting.every(question => question.offlineSelectedWorkIds.length > 0)).toBe(true)
    readText('candidates.md')
  })
})
