import { describe, expect, it, vi } from 'vitest'
import { ACADEMIC_CANDIDATE_RANKING_POLICY_V1, createSearchQueryId,
  type CandidateAssessment, type AcademicCandidateEvaluation, type ResearchAspectId } from '@deepseek-ai/dsh-academic-model'
import { coverageCandidateScore, extractPaperEvidence, parseFocusedEvidence, runResearchDraft,
  type CoverageRepairPolicy, type DraftPipelineAdapters } from '../src/index.ts'
import { draftFixture } from './pipeline-fixture.ts'

const method = 'q1.method' as ResearchAspectId, symbolic = 'q1.symbolic' as ResearchAspectId
const policy: CoverageRepairPolicy = { minimumSupportingWorks: 1, maximumReviews: 2, maximumRepairRounds: 1,
  maximumRepairPapers: 0, maximumNewCandidateWorks: 1, maximumExcerptCharacters: 1200, maximumRepairCharacters: 4000,
  targeting: { maximumWindowsPerPaper: 2, maximumWindowCharacters: 1500, maximumSourceOptions: 0,
    maximumPreviewCharacters: 360, maximumTotalCharacters: 6000, contextCharacters: 240,
    maximumCandidateReads: 1, maximumModelTokens: 45000, maximumModelCalls: 6, maximumElapsedMs: 220000,
    repairMaxTokens: 8192, deltaReviewMaxTokens: 8192, candidateMaxTokens: 4096, finalReviewReserveTokens: 10000 } }

describe('retained-pool metadata supplementation', () => {
  it.each(['question', 'abstract', 'unrelated', 'off_topic', 'future', 'work_type', 'total_cap', 'uncertain_cap'] as const)(
    'selects CoALA without a title hit while retaining admission checks: %s', async (kind) => {
      const { input, adapters, records } = draftFixture(3), question = input.brief.questions[0]!
      for (const [index, record] of records.entries()) records[index] = {
        academicWork: { ...record.academicWork,
          title: index === 2 ? 'Cognitive Architectures for Language Agents' : record.academicWork.title },
        workVersion: { ...record.workVersion, ...index === 2 && kind === 'work_type' ? { versionType: 'accepted_manuscript' as const } : {},
          releaseDate: { status: 'available', value: { iso: index === 2 && kind === 'future' ? '2027-01-01' : '2024-03-15', precision: 'day' } } },
      }
      input.brief = { ...input.brief,
        publicationWindow: { start: { iso: '1990', precision: 'year' }, end: { iso: '2026-10-30', precision: 'day' }, dateBasis: 'published' },
        publicationDatePolicy: { endMode: 'fixed', timeZone: 'Asia/Shanghai', inclusionRuleKinds: [], exclusionRuleKinds: [] },
        coverageRequirements: [{ question, aspects: [
          { aspectId: method, label: 'Method', evidenceRequirement: 'direct', searchTerms: ['reranking'] },
          { aspectId: symbolic, label: '符号推理架构', evidenceRequirement: 'direct', searchTerms: ['symbolic', 'reasoning'] }] }],
        stopConditions: { ...input.brief.stopConditions, stopWhenEvidenceRequirementsMet: true } }
      input.coverageRepairPolicy = policy
      adapters.selectPapers = (ingested, brief) => {
        const query = createSearchQueryId()
        const evaluations = ingested.versions.map((version, index): AcademicCandidateEvaluation => ({
          schemaVersion: 1, academicWorkId: version.academicWorkId, workVersionId: version.workVersionId,
          discoveredBy: [query], classification: 'background', priority: index < 2 ? 'p0' : 'p2',
          hardFilter: index === 2 && kind === 'off_topic' ? { status: 'excluded', reasons: [{ code: 'off_topic' }] }
            : { status: 'eligible', reasons: [] },
          score: { topicRelevance: 30, questionMatch: 20, evidencePotential: 15, methodMatch: 10,
            workTypeFit: 8, sourceQuality: 7, recency: 5, fulltextAvailability: 5, total: 100 - index },
          matchedQuestions: kind === 'abstract' || kind === 'unrelated' ? [] : [question],
          fulltextAvailability: { status: 'resolvable' }, diversityTags: [], decisionReasons: ['Retained metadata.'],
        }))
        const assessments = evaluations.map((e, index): CandidateAssessment => ({ academicWorkId: e.academicWorkId,
          abstract: kind === 'abstract' && index === 2 ? { status: 'available', value: 'Symbolic production rules select actions.' }
            : { status: 'unknown', reason: 'Not supplied.' }, keywords: { status: 'unknown', reason: 'Not supplied.' },
          matchedQuestions: e.matchedQuestions, fulltextAvailability: e.fulltextAvailability,
          semanticReview: index === 2 && kind === 'uncertain_cap' ? { status: 'unknown' }
            : { status: 'validated', scope: kind === 'off_topic' && index === 2 ? 'off_topic' : 'potentially_relevant' },
          contributionSignals: [], topicRelevance: 1, evidencePotential: 1, methodMatch: 0, sourceQuality: 1, recency: 1,
          inclusionRuleMatches: [], exclusionRuleMatches: [], diversityTags: [], reasons: ['Retained metadata.'],
        }))
        const coala = ingested.works.find(w => w.title === 'Cognitive Architectures for Language Agents')!
        const version = ingested.versions.find(v => v.academicWorkId === coala.academicWorkId)!
        const gaps = brief.coverageRequirements!.map(r => ({ ...r, aspects: r.aspects.filter(a => a.aspectId === symbolic) }))
        expect(coverageCandidateScore(coala, version, gaps)).toBe(0)
        return { truncated: false, papers: ingested.versions.slice(0, 2).map(version => ({ workVersionId: version.workVersionId,
          urls: ['https://example.org/' + version.sourceRecords[0]!.recordId], sourceProvider: 'fixture',
          extractionMethod: { method: 'fixture', methodVersion: '1' }, hasHistoricalEvidence: false })),
        candidateScheduling: { assessments,
          ranking: { schemaVersion: 1, researchBriefId: brief.researchBriefId, researchBriefVersion: brief.version,
            evaluations, queues: { p0: evaluations.slice(0, 2).map(e => e.workVersionId), p1: [],
              p2: kind === 'off_topic' ? [] : [version.workVersionId],
              excluded: kind === 'off_topic' ? [version.workVersionId] : [] }, limitations: [] },
          plan: { schemaVersion: 1, researchBriefId: brief.researchBriefId, researchBriefVersion: brief.version,
            constraints: { publicationWindow: brief.publicationWindow, includedWorkTypes: brief.includedWorkTypes,
              inclusionRules: [], exclusionRules: [], requiredTerms: [], excludedTerms: [],
              coverageRequirements: brief.coverageRequirements! },
            inclusionTargets: { minimum: 2, target: 2, maximum: 3 }, rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
            queries: [{ kind: 'academic', searchQueryId: query, expression: 'original pool', purpose: 'core',
              questions: [question], roundIndex: 1, providers: ['fixture'] }], citationExpansionSeeds: [], maximumSearchRounds: 1 },
          policy: { initialBatchSize: 2, evidenceGapBatchSize: 1, replenishmentBatchSize: 1, minimumQuestionSupportingWorks: 1,
            fulltext: { maximumWorks: kind === 'total_cap' ? 2 : 3, maximumUncertainWorks: 0 } } } }
      }
      adapters.resolveCoverageCandidate = vi.fn<NonNullable<DraftPipelineAdapters['resolveCoverageCandidate']>>(version => ({ workVersionId: version.workVersionId,
        urls: ['https://example.org/coala-v3'], sourceProvider: 'fixture',
        extractionMethod: { method: 'fixture', methodVersion: '1' }, hasHistoricalEvidence: false }))
      const fetcher = adapters.fetcher
      adapters.fetcher = vi.fn<DraftPipelineAdapters['fetcher']>(async (url, signal) => url.endsWith('/coala-v3') ? { url, statusCode: 200, truncated: false,
        body: { kind: 'html' as const, content: '<article><h2>Methods</h2><p>Symbolic production rules select actions.</p></article>' } }
        : fetcher(url, signal))
      adapters.extractCoverageCandidate = vi.fn<NonNullable<DraftPipelineAdapters['extractCoverageCandidate']>>(async (version, source, scope, _requirements, _budget, signal) => {
        expect(scope.publicationDate?.evaluation.verdict).toBe('within_window')
        return extractPaperEvidence(version, source, false, async () => ({
          scope: { status: 'included', reason: 'Substantive symbolic architecture.' },
          evidence: parseFocusedEvidence(JSON.stringify({ evidence: [{ segmentIndex: 0, questionIndexes: [0],
            sourcedStatement: 'Symbolic production rules select actions.', verbatimExcerpt: 'Symbolic production rules select actions.', section: 'methods' }] })),
        }), scope, signal)
      })
      adapters.reviewCoverage = vi.fn<NonNullable<DraftPipelineAdapters['reviewCoverage']>>(async (request) => {
        const fact = request.evidence.find(e => e.sourcedStatement === 'Symbolic production rules select actions.')
        return { aspects: [
          ...request.delta === undefined ? [{ aspectId: method, status: 'covered' as const,
            evidenceIds: [request.evidence[0]!.evidenceId], reason: 'Known method.' }] : [],
          fact === undefined ? { aspectId: symbolic, status: 'missing', evidenceIds: [], reason: 'No symbolic mechanism.' }
            : { aspectId: symbolic, status: 'covered', evidenceIds: [fact.evidenceId], reason: 'Direct source support.' }],
        ...request.delta === undefined ? {} : { invalidatedAspectIds: [] } }
      })
      const result = await runResearchDraft(input, adapters)
      const accepted = kind === 'question' || kind === 'abstract'
      expect(adapters.extractCoverageCandidate).toHaveBeenCalledTimes(accepted ? 1 : 0)
      expect(result.coverageRepair?.targeting?.candidateReads).toHaveLength(accepted ? 1 : 0)
      expect(result.coverageRepair?.coverage?.allQuestionsCovered).toBe(accepted)
      expect(result.papers).toHaveLength(accepted ? 3 : 2)
      expect(adapters.search).toHaveBeenCalledOnce()
      expect(adapters.reviewCoverage).toHaveBeenCalledTimes(accepted ? 2 : 1)
    })
})
