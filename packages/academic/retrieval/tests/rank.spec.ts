import { describe, expect, it } from 'vitest'
import { ACADEMIC_CANDIDATE_RANKING_POLICY_V1, createAcademicWorkId, createResearchBriefId,
  createSearchQueryId, createWorkVersionId, type AcademicWork, type ExecutableResearchBrief,
  type HybridSearchPlan, type WorkVersion } from '@deepseek-ai/dsh-academic-model'
import { createIngestIndex } from '@deepseek-ai/dsh-academic-ingestion'
import { rankPlannedCandidates, type CandidateAssessment, type PlannedSearchRoundResult } from '../src/index.ts'

const question = 'Which retrieval methods improve faithfulness?'
const brief: ExecutableResearchBrief = {
  schemaVersion: 1, researchBriefId: createResearchBriefId(), version: 1,
  topic: 'retrieval methods', aliases: [], questions: [question],
  publicationWindow: { start: { iso: '2020', precision: 'year' }, end: null,
    dateBasis: 'first_public_release' },
  includedWorkTypes: ['version_of_record'], inclusionRules: ['Reports an evaluation.'],
  exclusionRules: ['Promotional content.'],
  evidenceRequirements: { minimumIncludedWorks: 1, minimumFulltextWorks: 0,
    minimumEvidenceLevel: 'abstract', requireLocatableEvidence: false, allowPreprints: false,
    insufficientEvidencePolicy: 'continue_with_warning' },
  targetAudience: 'Researchers', reportRequirements: { language: 'en',
    targetLength: { unit: 'words', minimum: null, maximum: null }, requiredSections: [],
    citationStyle: 'numeric', includeEvidenceAppendix: false, includeMethodology: false,
    includeLimitations: true, includeResearchGaps: true },
  stopConditions: { maximumSearchRounds: 2, maximumCandidateWorks: 20, maximumIncludedWorks: 6,
    maximumElapsedMinutes: null, saturationRounds: 2, stopWhenEvidenceRequirementsMet: true },
  assumptions: [], approval: { status: 'approved', reviewedBy: 'user',
    reviewedAt: '2026-09-30T00:00:00Z', approvedBriefVersion: 1, comment: null },
}

const plan: HybridSearchPlan = {
  schemaVersion: 1, researchBriefId: brief.researchBriefId, researchBriefVersion: brief.version,
  constraints: { publicationWindow: brief.publicationWindow,
    includedWorkTypes: brief.includedWorkTypes, inclusionRules: brief.inclusionRules,
    exclusionRules: brief.exclusionRules, requiredTerms: ['retrieval'], excludedTerms: ['marketing'] },
  inclusionTargets: { minimum: 1, target: 3, maximum: 6 },
  rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
  queries: [], citationExpansionSeeds: [], maximumSearchRounds: 2,
}

function candidate(title: string, author: string, provider: string, year = '2025',
  status: WorkVersion['status'] = 'active'): { work: AcademicWork; version: WorkVersion } {
  const academicWorkId = createAcademicWorkId(), workVersionId = createWorkVersionId()
  const date = { status: 'available' as const, value: { iso: year, precision: 'year' as const } }
  return { work: { schemaVersion: 1, academicWorkId, title, authors: [author],
    externalIdentifiers: [], workVersionIds: [workVersionId], canonicalVersionId: workVersionId,
    firstPublicDate: date, publicationStatus: { status: 'available', value: 'published' },
    venue: { status: 'available', value: 'Proceedings' } },
  version: { schemaVersion: 1, workVersionId, academicWorkId, versionType: 'version_of_record',
    versionLabel: { status: 'unknown', reason: 'none' }, releaseDate: date,
    externalIdentifiers: [], sourceRecords: [{ provider, recordId: title }],
    contentHash: { status: 'not_extracted' }, supersedesWorkVersionId: null, status } }
}

function assessment(work: AcademicWork, changes: Partial<CandidateAssessment> = {}): CandidateAssessment {
  return { academicWorkId: work.academicWorkId, abstract: 'Retrieval evaluation with empirical results.',
    keywords: ['retrieval'], matchedQuestions: [question],
    contributionSignals: ['empirical_evaluation'], topicRelevance: 1, evidencePotential: 1,
    methodMatch: 1, sourceQuality: 1, recency: 1, fulltextAvailable: true,
    inclusionRuleMatches: [true], exclusionRuleMatches: [false],
    diversityTags: ['retrieval'], reasons: ['Evaluation is described in the abstract.'], ...changes }
}

function round(candidates: readonly ReturnType<typeof candidate>[]): PlannedSearchRoundResult {
  const queryId = createSearchQueryId()
  return { ingested: { index: createIngestIndex(), works: candidates.map(item => item.work),
    versions: candidates.map(item => item.version), verifiedDiscoveries: [], audit: { entries: [] } },
  discoveredBy: candidates.map(item => ({ academicWorkId: item.work.academicWorkId,
    searchQueryIds: [queryId] })), queries: [] }
}

describe('planned candidate ranking', () => {
  it('applies hard filters, weighted priorities, reasons, and diverse queue ordering', () => {
    const first = candidate('Retrieval evaluation A', 'Same Team', 'openalex')
    const similar = candidate('Retrieval evaluation B', 'Same Team', 'openalex')
    const distinct = candidate('Retrieval benchmark', 'Other Team', 'arxiv')
    const excludedBase = candidate('Marketing retrieval page', 'Third Team', 'openalex', '2018', 'retracted')
    const excluded = { ...excludedBase, version: { ...excludedBase.version, versionType: 'preprint' as const } }
    const result = rankPlannedCandidates(plan, brief, round([first, similar, distinct, excluded]), [
      assessment(first.work),
      assessment(similar.work, { topicRelevance: 0.9 }),
      assessment(distinct.work, { topicRelevance: 0.8,
        contributionSignals: ['benchmark_or_dataset'], diversityTags: ['benchmark'] }),
      assessment(excluded.work, { abstract: 'Marketing page.', inclusionRuleMatches: [false],
        exclusionRuleMatches: [true], matchedQuestions: [], topicRelevance: 0 }),
    ])
    expect(result.queues.p0.map(item => item.academicWorkId)).toEqual([
      first.work.academicWorkId, distinct.work.academicWorkId, similar.work.academicWorkId,
    ])
    expect(result.queues.excluded).toHaveLength(1)
    expect(result.queues.excluded[0]).toMatchObject({ classification: 'irrelevant',
      hardFilter: { status: 'excluded' }, priority: 'excluded' })
    expect(result.queues.excluded[0]?.hardFilter.reasons).toEqual(expect.arrayContaining([
      'Work or canonical version is retracted.', 'Publication date is outside the approved window.',
      'Work type is outside the approved scope.', 'Excluded term is present: marketing.',
    ]))
    expect(result.queues.p0[0]?.score.total).toBe(100)
    expect(result.queues.p0[0]?.decisionReasons[0]).toContain('weighted score 100')
  })

  it('retains every eligible work at its approved score threshold', () => {
    const p1 = candidate('Retrieval evaluation P1', 'Team One', 'openalex')
    const p2 = candidate('Retrieval evaluation P2', 'Team Two', 'arxiv')
    const result = rankPlannedCandidates(plan, brief, round([p1, p2]), [
      assessment(p1.work, { topicRelevance: 0.5, evidencePotential: 0.5, methodMatch: 0.5,
        sourceQuality: 0.5, recency: 0.5 }),
      assessment(p2.work, { topicRelevance: 0.35, evidencePotential: 0.35, methodMatch: 0.35,
        sourceQuality: 0.35, recency: 0.35 }),
    ])
    expect(result.queues.p1.map(item => item.academicWorkId)).toEqual([p1.work.academicWorkId])
    expect(result.queues.p2.map(item => item.academicWorkId)).toEqual([p2.work.academicWorkId])
  })

  it('refuses incomplete or stale semantic decisions', () => {
    const item = candidate('Retrieval evaluation', 'A Team', 'openalex')
    const input = round([item])
    expect(() => rankPlannedCandidates(plan, { ...brief, version: 2 }, input,
      [assessment(item.work)])).toThrow(/approved Brief version/u)
    expect(() => rankPlannedCandidates(plan, brief, input,
      [assessment(item.work, { inclusionRuleMatches: [] })])).toThrow(/every approved/u)
    expect(() => rankPlannedCandidates(plan, brief, input,
      [assessment(item.work, { topicRelevance: 1.2 })])).toThrow(/between zero and one/u)
    expect(() => rankPlannedCandidates(plan, brief, input, [])).toThrow(/exactly one assessment/u)
  })
})
