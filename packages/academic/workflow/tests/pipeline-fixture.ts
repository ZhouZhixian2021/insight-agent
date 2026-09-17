/** Shared synthetic research input; external search and HTTP responses are scripted. */
import { vi } from 'vitest'
import { createAcademicWorkId, createBatchResult, createWorkVersionId, createResearchBriefId,
  type AcademicWork, type WorkVersion } from '@deepseek-ai/dsh-academic-model'
import type { AcademicSourceWork } from '@deepseek-ai/dsh-academic-source'
import type { DraftPipelineInput, DraftPipelineAdapters } from '../src/index.ts'

/** Create two independent synthetic works and the externally supplied pipeline operations. */
export function draftFixture() {
  const events: string[] = []
  const records: AcademicSourceWork[] = ['a', 'b'].map((key) => {
    const academicWorkId = createAcademicWorkId(), workVersionId = createWorkVersionId()
    const academicWork: AcademicWork = { schemaVersion: 1, academicWorkId,
      workVersionIds: [workVersionId], canonicalVersionId: workVersionId,
      title: `Synthetic ${key}`, authors: ['Example'], externalIdentifiers: [], firstPublicDate: { status: 'unknown', reason: 'fixture' },
      publicationStatus: { status: 'available', value: 'preprint' }, venue: { status: 'unknown', reason: 'fixture' } }
    const workVersion: WorkVersion = { schemaVersion: 1, academicWorkId, workVersionId, versionType: 'preprint',
      versionLabel: { status: 'available', value: 'v1' }, releaseDate: { status: 'unknown', reason: 'fixture' }, externalIdentifiers: [],
      sourceRecords: [{ provider: 'fixture', recordId: key }], contentHash: { status: 'not_extracted' }, supersedesWorkVersionId: null, status: 'active' }
    return { academicWork, workVersion }
  })
  const input: { -readonly [K in keyof DraftPipelineInput]: DraftPipelineInput[K] } = { synthetic: true, search: { query: 'synthetic methods' }, brief: {
    schemaVersion: 1, researchBriefId: createResearchBriefId(), version: 1, topic: 'Synthetic comparison', aliases: [], questions: ['Compare methods'],
    publicationWindow: { start: null, end: null, dateBasis: 'first_public_release' }, includedWorkTypes: ['preprint'], inclusionRules: [], exclusionRules: [],
    evidenceRequirements: { minimumIncludedWorks: 2, minimumFulltextWorks: 2, minimumEvidenceLevel: 'fulltext', requireLocatableEvidence: true,
      allowPreprints: true, insufficientEvidencePolicy: 'continue_with_warning' }, targetAudience: 'researchers',
    reportRequirements: { language: 'zh-CN', targetLength: { unit: 'characters', minimum: null, maximum: null }, requiredSections: [], citationStyle: 'numeric',
      includeEvidenceAppendix: true, includeMethodology: true, includeLimitations: true, includeResearchGaps: false },
    stopConditions: { maximumSearchRounds: 1, maximumCandidateWorks: 3, maximumIncludedWorks: 3, maximumElapsedMinutes: null,
      saturationRounds: 1, stopWhenEvidenceRequirementsMet: false }, assumptions: ['Synthetic'],
    approval: { status: 'approved', reviewedBy: 'fixture', reviewedAt: '2026-09-15T00:00:00Z', approvedBriefVersion: 1, comment: null },
  } }
  const adapters: { -readonly [K in keyof DraftPipelineAdapters]: DraftPipelineAdapters[K] } = {
    search: vi.fn<DraftPipelineAdapters['search']>(async (request) => { events.push('search')
      const works = request.maxResults === undefined ? records : records.slice(0, request.maxResults)
      const truncated = works.length < records.length
      const batch = createBatchResult(works, [])
      return { works: batch.items, truncated, providers: ['fixture'], discoveredRecords: records.length, batch,
        limitations: truncated ? [`The aggregate result bound retained ${works.length} of ${records.length} discovered records.`] : [] } }),
    selectPapers: vi.fn<DraftPipelineAdapters['selectPapers']>((ingested) => { events.push('select'); return {
      papers: ingested.versions.map(version => ({
        workVersionId: version.workVersionId, urls: [`https://example.org/${version.sourceRecords[0]!.recordId}`],
        sourceProvider: 'fixture', extractionMethod: { method: 'fixture', methodVersion: '1' }, hasHistoricalEvidence: false })),
      truncated: false,
    } }),
    fetcher: vi.fn<DraftPipelineAdapters['fetcher']>(async (url) => { events.push(`fetch:${url.at(-1)}`); return { url, statusCode: 200, truncated: false,
      body: { kind: 'html', content: '<article><h2>Methods</h2><p>Uses reranking.</p></article>' } } }),
    generator: vi.fn<DraftPipelineAdapters['generator']>(async () => { events.push('extract'); return {
      scope: { status: 'included', reason: 'The paper addresses the approved comparison.' },
      evidence: [{ segmentIndex: 0, sourcedStatement: 'Uses reranking.', verbatimExcerpt: 'Uses reranking.',
        cardItems: [{ section: 'methods', statement: 'Uses reranking.', methodName: { status: 'available', value: 'reranking' },
          methodRole: { status: 'available', value: 'proposed' } }] }],
    } }),
    now: () => '2026-09-15T00:01:00Z',
  }
  return { input, adapters, records, events }
}
