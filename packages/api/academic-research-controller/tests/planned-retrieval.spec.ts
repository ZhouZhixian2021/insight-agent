import {
  createAcademicWorkId,
  createBatchResult,
  createResearchBriefId,
  createWorkVersionId,
  type AcademicWork,
  type ExecutableResearchBrief,
  type WorkVersion,
} from '@deepseek-ai/dsh-academic-model'
import type { AcademicSourceWork } from '@deepseek-ai/dsh-academic-source'
import type { PlannedSearchAdapters } from '@deepseek-ai/dsh-academic-retrieval'
import { describe, expect, it, vi } from 'vitest'
import { approvedHybridSearchHandoff, executeApprovedSearchRound } from '../src/planned-retrieval.ts'
import type { AcademicPlannedSearch } from '../src/types.ts'

const question = '检索增强生成如何影响事实可靠性？'
const brief: ExecutableResearchBrief = {
  schemaVersion: 1,
  researchBriefId: createResearchBriefId(),
  version: 1,
  topic: '检索增强生成与幻觉',
  aliases: ['RAG'],
  questions: [question],
  publicationWindow: { start: null, end: null, dateBasis: 'first_public_release' },
  includedWorkTypes: ['preprint', 'version_of_record'],
  inclusionRules: ['纳入直接评估事实可靠性的研究。'],
  exclusionRules: ['排除没有论文身份的产品页面。'],
  evidenceRequirements: { minimumIncludedWorks: 2, minimumFulltextWorks: 1,
    minimumEvidenceLevel: 'fulltext', requireLocatableEvidence: true, allowPreprints: true,
    insufficientEvidencePolicy: 'continue_with_warning' },
  targetAudience: '研究人员',
  reportRequirements: { language: 'zh-CN', targetLength: { unit: 'characters', minimum: null, maximum: null },
    requiredSections: [], citationStyle: 'numeric', includeEvidenceAppendix: true,
    includeMethodology: true, includeLimitations: true, includeResearchGaps: true },
  stopConditions: { maximumSearchRounds: 3, maximumCandidateWorks: 20, maximumIncludedWorks: 6,
    maximumElapsedMinutes: null, saturationRounds: 2, stopWhenEvidenceRequirementsMet: true },
  assumptions: [],
  approval: { status: 'approved', reviewedBy: 'user', reviewedAt: '2026-09-30T00:00:00Z',
    approvedBriefVersion: 1, comment: null },
}

const searches: readonly AcademicPlannedSearch[] = [
  { query: 'retrieval augmented generation factuality', purpose: '核心问题', questions: [question],
    retrieval: { channels: ['academic', 'web_discovery'], academicProviders: ['openalex', 'arxiv'],
      verificationProviders: ['openalex', 'arxiv', 'acl'], maximumWebDiscoveryResults: 8,
      maximumReferenceVerifications: 4 } },
  { query: 'RAG hallucination evaluation', purpose: '评估研究', questions: [question],
    retrieval: { channels: ['academic'], academicProviders: ['openalex'], verificationProviders: [],
      maximumWebDiscoveryResults: 0, maximumReferenceVerifications: 0 } },
]

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
    versionType: 'version_of_record', versionLabel: { status: 'unknown', reason: 'none' }, releaseDate: date,
    externalIdentifiers: [identifier], sourceRecords: [{ provider, recordId: doi }],
    contentHash: { status: 'not_extracted' }, supersedesWorkVersionId: null, status: 'active' }
  return { academicWork, workVersion }
}

describe('approved Session plan to Q2/Q3 retrieval bridge', () => {
  it('preserves reviewed expressions and channel policies without regenerating queries', () => {
    const handoff = approvedHybridSearchHandoff(brief, searches)
    expect(handoff.plan.queries.map(query => ({ kind: query.kind, expression: query.expression,
      roundIndex: query.roundIndex, questions: query.questions }))).toEqual([
      { kind: 'academic', expression: searches[0]!.query, roundIndex: 1, questions: [question] },
      { kind: 'web_discovery', expression: searches[0]!.query, roundIndex: 1, questions: [question] },
      { kind: 'academic', expression: searches[1]!.query, roundIndex: 2, questions: [question] },
    ])
    expect(handoff.plan.queries.some(query => query.expression === brief.topic)).toBe(false)
    expect(new Set(handoff.plan.queries.map(query => query.searchQueryId)).size).toBe(3)
    expect(handoff.plan.inclusionTargets).toEqual({ minimum: 2, target: 6, maximum: 6 })
    expect(handoff.rounds).toEqual([
      { roundIndex: 1, verificationProviders: ['openalex', 'arxiv', 'acl'],
        maximumReferenceVerificationsPerQuery: 4 },
      { roundIndex: 2, verificationProviders: [], maximumReferenceVerificationsPerQuery: 0 },
    ])
    expect(handoff.plan.citationExpansionSeeds).toEqual([])
  })

  it('runs one approved round through the retrieval package and keeps query provenance', async () => {
    const direct = record('10.1000/direct', 'openalex')
    const verified = record('10.1000/web', 'openalex')
    const searchAcademic = vi.fn(async () => ({ works: [direct], batch: createBatchResult([direct], []),
      providers: ['openalex', 'arxiv'], discoveredRecords: 1, truncated: false, limitations: [] }))
    const searchWeb = vi.fn(async () => ({ candidates: [{ url: 'https://doi.org/10.1000/web' }], truncated: false }))
    const adapters: PlannedSearchAdapters = {
      searchAcademic,
      searchWeb,
      identifyReferences: candidate => ({ status: 'identified', references: [{ kind: 'doi',
        normalizedValue: '10.1000/web', originalValue: '10.1000/web', discoveryUrl: candidate.url }], issues: [] }),
      verifyReference: async reference => ({ status: 'verified', value: { reference,
        verificationProvider: 'openalex', work: verified, fullText: null, fullTextFailure: null } }),
    }
    const handoff = approvedHybridSearchHandoff(brief, searches)
    const result = await executeApprovedSearchRound(handoff, 1, 5, adapters)
    expect(searchAcademic).toHaveBeenCalledExactlyOnceWith(searches[0]!.query,
      ['openalex', 'arxiv'], 5, undefined)
    expect(searchWeb).toHaveBeenCalledExactlyOnceWith(searches[0]!.query, 8, undefined)
    expect(result.ingested.works).toHaveLength(2)
    expect(result.queries.map(query => query.searchQueryId)).toEqual(
      handoff.plan.queries.filter(query => query.roundIndex === 1).map(query => query.searchQueryId),
    )
    expect(result.discoveredBy.every(item => item.searchQueryIds.length === 1)).toBe(true)
    const academicOnly = await executeApprovedSearchRound(handoff, 2, 3, adapters)
    expect(academicOnly.queries).toHaveLength(1)
    expect(searchAcademic).toHaveBeenLastCalledWith(searches[1]!.query, ['openalex'], 3, undefined)
    expect(searchWeb).toHaveBeenCalledTimes(1)
  })

  it('keeps legacy plans on the existing adapter and rejects inconsistent approved bounds', () => {
    expect(() => approvedHybridSearchHandoff(brief, [{ query: 'legacy', purpose: '旧计划', questions: [question] }]))
      .toThrow(/Legacy searches/u)
    expect(() => approvedHybridSearchHandoff({ ...brief, stopConditions: { ...brief.stopConditions,
      maximumSearchRounds: 1 } }, searches)).toThrow(/search-round limit/u)
    expect(() => approvedHybridSearchHandoff({ ...brief,
      evidenceRequirements: { ...brief.evidenceRequirements, minimumIncludedWorks: 7 } }, searches))
      .toThrow(/minimum included-work/u)
  })
})
