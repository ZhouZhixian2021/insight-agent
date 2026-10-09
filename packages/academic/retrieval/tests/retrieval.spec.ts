import { describe, expect, it } from 'vitest'
import {
  ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
  createAcademicWorkId,
  createBatchResult,
  createFailureId,
  createResearchBriefId,
  createWorkVersionId,
  type AcademicWork,
  type ExecutableResearchBrief,
  type ResearchQuestionCoverageResult,
  type WorkVersion,
} from '@deepseek-ai/dsh-academic-model'
import type { AcademicSourceWork } from '@deepseek-ai/dsh-academic-source'
import { metadataForVersion } from '@deepseek-ai/dsh-academic-ingestion'
import { executePlannedSearchRound, extendPlanForEvidenceGaps, planHybridSearch,
  type PlannedSearchAdapters, type QueryPlanningOptions } from '../src/index.ts'

const question = 'Which methods improve factual faithfulness?'
const brief: ExecutableResearchBrief = {
  schemaVersion: 1,
  researchBriefId: createResearchBriefId(),
  version: 1,
  topic: 'retrieval augmented generation',
  aliases: ['grounded generation'],
  questions: [question],
  publicationWindow: { start: null, end: null, dateBasis: 'first_public_release' },
  includedWorkTypes: ['preprint', 'version_of_record'],
  inclusionRules: [],
  exclusionRules: [],
  evidenceRequirements: { minimumIncludedWorks: 1, minimumFulltextWorks: 0,
    minimumEvidenceLevel: 'abstract', requireLocatableEvidence: false, allowPreprints: true,
    insufficientEvidencePolicy: 'continue_with_warning' },
  targetAudience: 'Researchers',
  reportRequirements: { language: 'en', targetLength: { unit: 'words', minimum: null, maximum: null },
    requiredSections: [], citationStyle: 'numeric', includeEvidenceAppendix: false,
    includeMethodology: false, includeLimitations: true, includeResearchGaps: true },
  stopConditions: { maximumSearchRounds: 3, maximumCandidateWorks: 20, maximumIncludedWorks: 6,
    maximumElapsedMinutes: null, saturationRounds: 2, stopWhenEvidenceRequirementsMet: true },
  assumptions: [],
  approval: { status: 'approved', reviewedBy: 'user', reviewedAt: '2026-09-30T00:00:00Z',
    approvedBriefVersion: 1, comment: null },
}

const options: QueryPlanningOptions = {
  academicProviders: ['openalex', 'arxiv'],
  maximumQueriesPerRound: 9,
  maximumWebResultsPerQuery: 6,
  expansions: [{ expression: 'RAG', kind: 'synonym', questions: [question] },
    { expression: 'self-reflection', kind: 'method', questions: [question] }],
}

function plan() {
  return planHybridSearch({ brief, inclusionTargets: { minimum: 1, target: 3, maximum: 6 },
    requestedSiteHosts: ['aclanthology.org'], rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1 }, options).plan
}

function record(doi: string, provider: string): AcademicSourceWork {
  const academicWorkId = createAcademicWorkId()
  const workVersionId = createWorkVersionId()
  const identifier = { kind: 'doi' as const, normalizedValue: doi, originalValue: doi, sourceProvider: provider }
  const date = { status: 'available' as const, value: { iso: '2025', precision: 'year' as const } }
  const academicWork: AcademicWork = { schemaVersion: 1, academicWorkId, title: 'Grounded answers',
    authors: ['A. Researcher'], externalIdentifiers: [identifier], workVersionIds: [workVersionId],
    canonicalVersionId: workVersionId, firstPublicDate: date,
    publicationStatus: { status: 'available', value: 'published' },
    venue: { status: 'available', value: 'Example Conference' } }
  const workVersion: WorkVersion = { schemaVersion: 1, workVersionId, academicWorkId,
    versionType: 'version_of_record', versionLabel: { status: 'unknown', reason: 'none' },
    releaseDate: date, externalIdentifiers: [identifier], sourceRecords: [{ provider, recordId: doi }],
    contentHash: { status: 'not_extracted' }, supersedesWorkVersionId: null, status: 'active' }
  return { academicWork, workVersion }
}

describe('planned Academic retrieval', () => {
  it('builds bounded channel queries, reviewed expansions, and gap searches', () => {
    const first = plan()
    expect(first.queries.map(query => query.kind)).toEqual([
      'academic', 'web_discovery', 'site_restricted', 'academic', 'web_discovery',
      'academic', 'web_discovery', 'academic', 'web_discovery',
    ])
    expect(first.queries.find(query => query.kind === 'site_restricted')).toMatchObject({ siteHost: 'aclanthology.org' })
    expect(first.queries.some(query => query.expression === 'retrieval augmented generation self-reflection')).toBe(true)
    expect(new Set(first.queries.map(query => query.searchQueryId)).size).toBe(first.queries.length)
    const limited = planHybridSearch({ brief, inclusionTargets: { minimum: 1, target: 3, maximum: 6 },
      requestedSiteHosts: ['aclanthology.org'], rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1 },
    { ...options, maximumQueriesPerRound: 8 })
    expect(limited.plan.queries).toHaveLength(7)
    expect(limited.warnings).toHaveLength(1)
    const coverage: ResearchQuestionCoverageResult = { schemaVersion: 1,
      researchBriefId: brief.researchBriefId, researchBriefVersion: brief.version,
      assessedAt: '2026-09-30T00:00:00Z', evidenceRequirementsMet: false, allQuestionsCovered: false,
      questions: [{ question, status: 'partial', supportingWorkIds: [], evidenceIds: [], gaps: ['negative evidence'] }] }
    const second = extendPlanForEvidenceGaps(first, coverage, 2, options).plan
    expect(second.queries.at(-1)).toMatchObject({ kind: 'academic', purpose: 'evidence_gap',
      roundIndex: 2, expression: 'retrieval augmented generation negative evidence' })
    expect(second.queries.slice(0, first.queries.length)).toEqual(first.queries)
    expect(() => extendPlanForEvidenceGaps(first, { ...coverage, researchBriefVersion: 2 }, 2, options))
      .toThrow(/coverage must match/u)
    expect(() => planHybridSearch({ brief, inclusionTargets: { minimum: 1, target: 3, maximum: 6 },
      requestedSiteHosts: ['example.org/path'], rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1 }, options))
      .toThrow(/hostnames/u)
    expect(() => planHybridSearch({ brief: { ...brief, stopConditions: { ...brief.stopConditions,
      maximumSearchRounds: 0 } }, inclusionTargets: { minimum: 1, target: 3, maximum: 6 },
    requestedSiteHosts: [], rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1 }, options))
      .toThrow(/maximumSearchRounds/u)
  })

  it('keeps only verified Web works, merges duplicate versions, and retains every discovering query', async () => {
    const approved = plan()
    const direct = record('10.1000/one', 'openalex')
    const webCopy = { ...record('10.1000/one', 'openalex'), metadata: {
      abstract: { status: 'available' as const, value: 'Verified scholarly summary.' },
      keywords: { status: 'available' as const, value: ['retrieval'] },
    } }
    const webQueries: string[] = []
    const adapters: PlannedSearchAdapters = {
      searchAcademic: async () => ({ works: [direct], batch: createBatchResult([direct], []),
        providers: ['openalex', 'arxiv'], discoveredRecords: 1, truncated: false, limitations: [] }),
      searchWeb: async (query) => { webQueries.push(query); return { candidates: [
        { url: 'https://doi.org/10.1000/one', snippet: 'Untrusted Web snippet.' }, { url: 'https://example.org/product' },
      ], truncated: false } },
      identifyReferences: candidate => candidate.url.includes('doi.org')
        ? { status: 'identified', references: [{ kind: 'doi', normalizedValue: '10.1000/one',
          originalValue: '10.1000/one', discoveryUrl: candidate.url }], issues: [] }
        : { status: 'discarded', references: [], issues: [{ code: 'unrecognized_page', message: 'No paper ID.' }] },
      verifyReference: async reference => ({ status: 'verified', value: { reference,
        verificationProvider: 'openalex', work: webCopy, fullText: null, fullTextFailure: null } }),
    }
    const result = await executePlannedSearchRound(approved, 1, {
      maximumAcademicResultsPerQuery: 5, maximumReferenceVerificationsPerQuery: 5,
      verificationProviders: ['openalex'],
    }, adapters)
    expect(result.ingested.works).toHaveLength(1)
    expect(metadataForVersion(result.ingested.index, result.ingested.versions[0]!)).toEqual(webCopy.metadata)
    expect(result.ingested.verifiedDiscoveries.map(item => item.discoveryUrl))
      .toEqual(['https://doi.org/10.1000/one'])
    expect(result.discoveredBy[0]?.searchQueryIds).toEqual(approved.queries.map(query => query.searchQueryId))
    expect(result.queries.every(query => query.status === 'success')).toBe(true)
    expect(result.queries.flatMap(query => query.identifications)
      .some(item => item.result.status === 'discarded')).toBe(true)
    expect(result.queries.flatMap(query => query.verifications).every(item => item.status === 'verified')).toBe(true)
    expect(webQueries).toContain('site:aclanthology.org retrieval augmented generation')
    await expect(executePlannedSearchRound(approved, 1, {
      maximumAcademicResultsPerQuery: 5, maximumReferenceVerificationsPerQuery: 5,
      verificationProviders: ['openalex'],
    }, { ...adapters, verifyReference: async reference => ({ status: 'verified', value: { reference,
      verificationProvider: 'arxiv', work: webCopy, fullText: null, fullTextFailure: null } }) }))
      .rejects.toThrow(/different provider/u)
  })

  it('retains direct works through provider and Web verification failures', async () => {
    const approved = plan()
    const direct = record('10.1000/two', 'arxiv')
    const sourceFailure = { schemaVersion: 1 as const, failureId: createFailureId(), provider: 'openalex',
      operation: 'search', category: 'timeout' as const, message: 'Provider timed out.',
      retryable: true, retryAfter: null }
    const adapters: PlannedSearchAdapters = {
      searchAcademic: async () => ({ works: [direct], batch: createBatchResult([direct], [sourceFailure]),
        providers: ['openalex', 'arxiv'], discoveredRecords: 1, truncated: false, limitations: [] }),
      searchWeb: async () => ({ candidates: [{ url: 'https://doi.org/10.1000/missing' }], truncated: false }),
      identifyReferences: candidate => ({ status: 'identified', references: [{ kind: 'doi',
        normalizedValue: '10.1000/missing', originalValue: '10.1000/missing',
        discoveryUrl: candidate.url }], issues: [] }),
      verifyReference: async reference => ({ status: 'failed', failure: { reference,
        verificationProvider: 'openalex', category: 'not_found', message: 'No official record.',
        retryable: false, retryAfter: null } }),
    }
    const result = await executePlannedSearchRound(approved, 1, {
      maximumAcademicResultsPerQuery: 5, maximumReferenceVerificationsPerQuery: 5,
      verificationProviders: ['openalex'],
    }, adapters)
    expect(result.ingested.works).toHaveLength(1)
    expect(result.queries.some(query => query.status === 'partial_success')).toBe(true)
    expect(result.queries.some(query => query.status === 'failed')).toBe(true)
    expect(result.queries.flatMap(query => query.verifications).every(item => item.status === 'failed')).toBe(true)
    expect(result.ingested.verifiedDiscoveries).toEqual([])
  })
})
