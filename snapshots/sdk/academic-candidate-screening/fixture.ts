/** Keyless candidate-screening session using canonical catalog metadata and reviewed decisions. */
import assert from 'node:assert/strict'
import type { Context } from '../../../vendor/cordis/lib/index.js'
import { defineTool } from '../../../packages/core/tools/lib/index.js'
import { ACADEMIC_CANDIDATE_RANKING_POLICY_V1, createResearchBriefId, createSearchQueryId,
  type ExecutableResearchBrief, type HybridSearchPlan, type WorkVersionId } from '../../../packages/academic/model/lib/index.js'
import { createIngestIndex, ingestWorks } from '../../../packages/academic/ingestion/lib/index.js'
import { normalizeAcademicCatalogRecord } from '../../../packages/academic/source/lib/index.js'
import { assessPlannedCandidates, parseCandidateScreening, rankPlannedCandidates,
  type CandidateScreeningCriteria } from '../../../packages/academic/retrieval/lib/index.js'

export const name = 'academic-candidate-screening-fixture'
export const inject = ['tools']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'run_candidate_screening_fixture',
    description: 'Screen three fixed scholarly candidates against an approved research question.',
    parameters: {}, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => {
      const question = 'Which retrieval methods improve faithfulness?'
      const brief: ExecutableResearchBrief = {
        schemaVersion: 1, researchBriefId: createResearchBriefId(), version: 1,
        topic: 'retrieval faithfulness', aliases: [], questions: [question],
        publicationWindow: { start: null, end: null, dateBasis: 'first_public_release' },
        includedWorkTypes: ['version_of_record'], inclusionRules: [], exclusionRules: [],
        evidenceRequirements: { minimumIncludedWorks: 1, minimumFulltextWorks: 0,
          minimumEvidenceLevel: 'abstract', requireLocatableEvidence: false, allowPreprints: false,
          insufficientEvidencePolicy: 'continue_with_warning' },
        targetAudience: 'Researchers', reportRequirements: { language: 'en',
          targetLength: { unit: 'words', minimum: null, maximum: null }, requiredSections: [],
          citationStyle: 'numeric', includeEvidenceAppendix: false, includeMethodology: false,
          includeLimitations: true, includeResearchGaps: true },
        stopConditions: { maximumSearchRounds: 1, maximumCandidateWorks: 3, maximumIncludedWorks: 3,
          maximumElapsedMinutes: null, saturationRounds: 1, stopWhenEvidenceRequirementsMet: true },
        assumptions: [], approval: { status: 'approved', reviewedBy: 'user',
          reviewedAt: '2026-10-10T00:00:00Z', approvedBriefVersion: 1, comment: null },
      }
      const queryId = createSearchQueryId()
      const plan: HybridSearchPlan = { schemaVersion: 1, researchBriefId: brief.researchBriefId,
        researchBriefVersion: brief.version,
        constraints: { publicationWindow: brief.publicationWindow, includedWorkTypes: brief.includedWorkTypes,
          inclusionRules: [], exclusionRules: [], requiredTerms: [], excludedTerms: [] },
        inclusionTargets: { minimum: 1, target: 2, maximum: 3 },
        rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
        queries: [{ kind: 'academic', searchQueryId: queryId, expression: 'retrieval faithfulness',
          purpose: 'core', questions: [question], roundIndex: 1, providers: ['acl'] }],
        citationExpansionSeeds: [], maximumSearchRounds: 1 }
      const records = [
        { recordId: '2025.acl-long.10', title: 'Retrieval faithfulness evaluation',
          abstract: 'We evaluate retrieval methods that improve faithfulness.', keywords: ['retrieval'] },
        { recordId: '2025.acl-long.11', title: 'Retrieval for code generation',
          abstract: 'We evaluate code generation with retrieval; faithfulness is outside this study.',
          keywords: ['retrieval', 'faithfulness'] },
        { recordId: '2025.acl-long.12', title: 'Retrieval faithfulness overview',
          abstract: '', keywords: ['evaluate'] },
      ].map(record => normalizeAcademicCatalogRecord('acl', { ...record,
        authors: ['Fixture author'], year: '2025', venue: 'ACL', doi: null }))
      const ingested = ingestWorks(createIngestIndex(), records)
      const round = { ingested, discoveredBy: ingested.works.map(work => ({
        academicWorkId: work.academicWorkId, searchQueryIds: [queryId] })), queries: [] }
      const criteria: CandidateScreeningCriteria = {
        topic: [['retrieval'], ['faithfulness']], questions: [{ question,
          concepts: [['retrieval'], ['faithfulness']] }],
        methods: [['retrieval']], evidence: [['evaluate']],
        contributions: [{ classification: 'empirical_evaluation', concepts: [['evaluate']] }],
      }
      const reviews = new Map(records.slice(0, 2).map((record, index) => {
        const work = ingested.works.find(item => item.title === record.academicWork.title)
        assert.ok(work)
        const metadata = record.metadata
        const screening = index === 0
          ? { schemaVersion: 1, signals: [
            { kind: 'question', question, quote: { source: 'abstract', text: metadata.abstract.status === 'available' ? metadata.abstract.value : '' } },
            { kind: 'method', label: 'retrieval', quote: { source: 'title', text: 'Retrieval' } },
            { kind: 'evidence_type', label: 'evaluate', quote: { source: 'abstract', text: 'evaluate' } },
            { kind: 'contribution', classification: 'empirical_evaluation', quote: { source: 'abstract', text: 'evaluate' } },
          ], surfaceKeywordHits: [], uncertainties: [],
            scope: { status: 'potentially_relevant', reason: 'The abstract evaluates faithfulness.' } }
          : { schemaVersion: 1, signals: [], surfaceKeywordHits: [], uncertainties: [],
            scope: { status: 'off_topic', reason: 'The paper studies code generation.',
              quote: { source: 'abstract', text: 'We evaluate code generation with retrieval' } } }
        return [work.academicWorkId, parseCandidateScreening(JSON.stringify(screening), work.title,
          metadata.abstract, metadata.keywords, brief.questions)] as const
      }))
      const facts = new Map<WorkVersionId, { readonly status: 'resolvable' }>(
        ingested.works.map(work => [work.canonicalVersionId, { status: 'resolvable' }]))
      const assessments = assessPlannedCandidates(plan, brief, round, criteria, facts, reviews)
      const ranking = rankPlannedCandidates(plan, brief, round, assessments)
      const items = ranking.evaluations.map(evaluation => {
        const work = ingested.works.find(item => item.academicWorkId === evaluation.academicWorkId)
        const assessment = assessments.find(item => item.academicWorkId === evaluation.academicWorkId)
        assert.ok(work && assessment)
        return { title: work.title, priority: evaluation.priority,
          classification: evaluation.classification, scope: assessment.screening.scope.status,
          matchedQuestions: evaluation.matchedQuestions.length,
          methodPoints: evaluation.score.methodMatch, evidencePoints: evaluation.score.evidencePotential,
          hardFilters: evaluation.hardFilter.reasons.map(reason => reason.code) }
      })
      assert.equal(items[0]?.priority, 'p0')
      assert.deepEqual(items[1]?.hardFilters, ['off_topic'])
      assert.equal(items[2]?.matchedQuestions, 1)
      assert.equal(items[2]?.scope, 'unknown')
      assert.notEqual(items[2]?.priority, 'excluded')
      return JSON.stringify({ items })
    },
  })))
}
