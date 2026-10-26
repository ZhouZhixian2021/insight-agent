/** Replays the recorded eight-paper handoff through the production assessor, selector and ranker. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AcademicWorkId, CandidateFulltextAvailability, CandidateReviewSelectionV1,
  CandidateSemanticReviewStateV1, CandidateSemanticReviewV1, ExecutableResearchBrief,
  HybridSearchPlan, WorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { createIngestIndex, dedupKeys, type IngestRecord } from '@deepseek-ai/dsh-academic-ingestion'
import { assessPlannedCandidates, parseCandidateSemanticReview, rankPlannedCandidates,
  screeningFromSemanticReview, selectCandidateReviews,
  type CandidateScreeningCriteria, type PlannedSearchRoundResult } from '@deepseek-ai/dsh-academic-retrieval'
import type { CandidateScheduling } from '@deepseek-ai/dsh-academic-workflow'
import { approvedCandidateScreeningCriteria, type AcademicCandidateScreening } from '../src/candidate-screening.ts'

const directory = new URL('../../../../z-team_docs/验收数据/2026-10-20-candidate-review/scoring-handoff/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8')) as {
  readonly files: readonly { readonly path: string; readonly sha256: string }[]
}

interface HandoffInput {
  readonly brief: ExecutableResearchBrief
  readonly sourcePlan: HybridSearchPlan
  readonly candidateScreening: AcademicCandidateScreening
  readonly records: readonly IngestRecord[]
  readonly fulltextResolutions: readonly {
    readonly workVersionId: WorkVersionId
    readonly availability: CandidateFulltextAvailability
  }[]
  readonly deployment: { readonly candidateReviewMaximumWorks: number }
}

interface HandoffRun {
  readonly criteria: CandidateScreeningCriteria
  readonly round: { readonly attemptedWorkIdsBefore: readonly AcademicWorkId[] }
  readonly queryProvenance: PlannedSearchRoundResult['discoveredBy']
  readonly selectionEvent: { readonly selection: CandidateReviewSelectionV1 }
  readonly verifiedReviews: readonly {
    readonly academicWorkId: AcademicWorkId
    readonly review: CandidateSemanticReviewV1
  }[]
  readonly initialLexical: {
    readonly assessments: ReturnType<typeof assessPlannedCandidates>
    readonly ranking: ReturnType<typeof rankPlannedCandidates>
  }
  readonly scheduling: CandidateScheduling
  readonly candidateQuestionCoverage: { readonly questions: ReturnType<typeof candidateCoverage> }
}

function readFixture(name: string): unknown {
  const bytes = readFileSync(new URL(name, directory))
  const entry = manifest.files.find(item => item.path === name)
  expect(entry, `manifest entry for ${name}`).toBeDefined()
  expect(createHash('sha256').update(bytes).digest('hex'), `sha256 for ${name}`).toBe(entry?.sha256)
  const value: unknown = JSON.parse(bytes.toString())
  return value
}

function restoreRound(input: HandoffInput, plan: HybridSearchPlan): PlannedSearchRoundResult {
  const expressions = new Map(input.sourcePlan.queries.map(query => [query.searchQueryId, query.expression]))
  const records = input.records.map(record => ({ ...record,
    discoveredBy: (record.discoveredBy ?? []).flatMap(queryId => plan.queries
      .filter(query => query.expression === expressions.get(queryId)).map(query => query.searchQueryId)),
  }))
  // Restore recorded post-deduplication identities; ingestWorks would allocate new work IDs.
  const index = { ...createIngestIndex(),
    records: new Map(records.map(record => [record.academicWork.academicWorkId, [record]])),
    byExactKey: new Map(records.flatMap(record => dedupKeys(record.academicWork).exact
      .map(key => [key, record.academicWork.academicWorkId] as const))),
  }
  return {
    ingested: { index, works: records.map(record => record.academicWork),
      versions: records.map(record => record.workVersion), verifiedDiscoveries: [], audit: { entries: [] } },
    discoveredBy: records.map(record => ({ academicWorkId: record.academicWork.academicWorkId,
      searchQueryIds: [...new Set(record.discoveredBy)] })),
    queries: [],
  }
}

function candidateCoverage(brief: ExecutableResearchBrief, selection: CandidateReviewSelectionV1,
  ranking: CandidateScheduling['ranking']) {
  return brief.questions.map(question => ({ question,
    routedWorkIds: selection.decisions.filter(item => item.routedQuestions.includes(question))
      .map(item => item.academicWorkId),
    reviewSelectedWorkIds: selection.decisions.filter(item => item.status === 'selected'
      && item.routedQuestions.includes(question)).map(item => item.academicWorkId),
    semanticallyMatchedWorkIds: ranking.evaluations.filter(item => item.matchedQuestions.includes(question))
      .map(item => item.academicWorkId),
    matchedWorksByPriority: Object.fromEntries((['p0', 'p1', 'p2', 'excluded'] as const).map(priority => [priority,
      ranking.evaluations.filter(item => item.priority === priority && item.matchedQuestions.includes(question))
        .map(item => item.academicWorkId)])),
  }))
}

describe('fixed candidate-review scoring handoff', () => {
  it.each(['pro', 'flash'] as const)('replays %s selection, assessments, queues and candidate coverage', (name) => {
    const input = (readFixture('input.json') as HandoffInput)
    const run = (readFixture(`${name}.json`) as HandoffRun)
    const { plan } = run.scheduling
    const round = restoreRound(input, plan)
    expect(round.ingested.works).toHaveLength(8)
    expect(round.discoveredBy).toEqual(run.queryProvenance)
    expect(plan.rankingPolicy).toEqual(input.sourcePlan.rankingPolicy)

    const criteria = approvedCandidateScreeningCriteria(input.brief, plan, input.candidateScreening)
    expect(criteria).toEqual(run.criteria)
    const facts = new Map(input.fulltextResolutions.map(item => [item.workVersionId, item.availability]))
    const lexical = assessPlannedCandidates(plan, input.brief, round, criteria, facts)
    const lexicalRanking = rankPlannedCandidates(plan, input.brief, round, lexical)
    expect(lexical).toEqual(run.initialLexical.assessments)
    expect(lexicalRanking).toEqual(run.initialLexical.ranking)
    const selection = selectCandidateReviews(input.brief, plan, lexicalRanking, lexical,
      new Set(run.round.attemptedWorkIdsBefore), input.deployment.candidateReviewMaximumWorks)
    expect(selection).toEqual(run.selectionEvent.selection)

    const states = new Map<AcademicWorkId, CandidateSemanticReviewStateV1>()
    const screenings = new Map(run.verifiedReviews.map((entry) => {
      const record = input.records.find(item => item.academicWork.academicWorkId === entry.academicWorkId)
      if (record?.metadata === undefined) throw new Error('Recorded review requires its scholarly metadata.')
      const review = parseCandidateSemanticReview(JSON.stringify(entry.review), record.academicWork.title,
        record.metadata.abstract, input.brief.questions)
      states.set(entry.academicWorkId, review.scope.status === 'unknown'
        ? { status: 'unknown' } : { status: 'validated', scope: review.scope.status })
      return [entry.academicWorkId, screeningFromSemanticReview(review)] as const
    }))
    const assessments = assessPlannedCandidates(plan, input.brief, round, criteria, facts, screenings)
      .map((assessment) => {
        const semanticReview = states.get(assessment.academicWorkId)
        if (semanticReview === undefined) throw new Error('Recorded candidate requires its verified review state.')
        return { ...assessment, semanticReview }
      })
    expect(assessments).toEqual(run.scheduling.assessments)
    const ranking = rankPlannedCandidates(plan, input.brief, round, assessments)
    expect(ranking).toEqual(run.scheduling.ranking)
    expect(candidateCoverage(input.brief, selection, ranking)).toEqual(run.candidateQuestionCoverage.questions)
  })

  it('accounts for every cross-model score change using the recorded question judgments', () => {
    const input = (readFixture('input.json') as HandoffInput)
    const pro = (readFixture('pro.json') as HandoffRun).scheduling.ranking
    const flash = (readFixture('flash.json') as HandoffRun).scheduling.ranking
    const pointsPerQuestion = input.sourcePlan.rankingPolicy.weights.questionMatch / input.brief.questions.length
    expect(pointsPerQuestion).toBe(4)
    const changed = []
    for (const before of pro.evaluations) {
      const after = flash.evaluations.find(item => item.academicWorkId === before.academicWorkId)
      if (after === undefined) throw new Error('Compared runs must contain the same work identities.')
      const added = after.matchedQuestions.filter(question => !before.matchedQuestions.includes(question))
      const removed = before.matchedQuestions.filter(question => !after.matchedQuestions.includes(question))
      const delta = (added.length - removed.length) * pointsPerQuestion
      const { questionMatch: beforeQuestions, total: beforeTotal, ...beforeOtherScores } = before.score
      const { questionMatch: afterQuestions, total: afterTotal, ...afterOtherScores } = after.score
      expect(afterOtherScores).toEqual(beforeOtherScores)
      expect(afterQuestions - beforeQuestions).toBe(delta)
      expect(afterTotal - beforeTotal).toBe(delta)
      if (delta !== 0) changed.push({ academicWorkId: before.academicWorkId,
        pro: beforeTotal, flash: afterTotal, delta, proPriority: before.priority, flashPriority: after.priority })
    }
    expect(changed.map(({ pro, flash, delta, proPriority, flashPriority }) =>
      ({ pro, flash, delta, proPriority, flashPriority }))).toEqual([
      { pro: 62, flash: 66, delta: 4, proPriority: 'p2', flashPriority: 'p1' },
      { pro: 54, flash: 58, delta: 4, proPriority: 'p2', flashPriority: 'p2' },
      { pro: 62, flash: 70, delta: 8, proPriority: 'p2', flashPriority: 'p1' },
    ])
    const comparison = (readFixture('comparison.json') as { readonly works: readonly {
      readonly academicWorkId: AcademicWorkId
      readonly scoreDelta: { readonly total: number }
    }[] })
    expect(comparison.works.filter(item => item.scoreDelta.total !== 0)
      .map(item => ({ academicWorkId: item.academicWorkId, delta: item.scoreDelta.total })))
      .toEqual(changed.map(({ academicWorkId, delta }) => ({ academicWorkId, delta })))
  })
})
