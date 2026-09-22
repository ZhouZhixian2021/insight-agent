/** Shared synthetic research input; external search and HTTP responses are scripted. */
import { vi } from 'vitest'
import { parseSynthesisDraft, synthesisSections, type AcademicSynthesisInput } from '@deepseek-ai/dsh-academic-analysis'
import { createAcademicWorkId, createBatchResult, createWorkVersionId, createResearchBriefId,
  type AcademicWork, type WorkVersion } from '@deepseek-ai/dsh-academic-model'
import type { AcademicSourceWork } from '@deepseek-ai/dsh-academic-source'
import type { DraftPipelineInput, DraftPipelineAdapters } from '../src/index.ts'

/** Create independent synthetic works and the externally supplied pipeline operations. */
export function draftFixture(count = 2) {
  const events: string[] = []
  const records: AcademicSourceWork[] = Array.from({ length: count }, (_, index) => String.fromCharCode(97 + index)).map((key) => {
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
  const input: { -readonly [K in keyof DraftPipelineInput]: DraftPipelineInput[K] } = { synthetic: true,
    searches: [{ query: 'synthetic methods' }], brief: {
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
    synthesize: vi.fn<DraftPipelineAdapters['synthesize']>(async input => synthesisFixture(input)),
    now: () => '2026-09-15T00:01:00Z',
  }
  return { input, adapters, records, events }
}

/** Synthetic model answer referencing only the supplied evidence identities. */
export function synthesisFixture(input: AcademicSynthesisInput) {
  const crossPaper = new Set(input.analysisInput.evidenceRecords.map(record => record.academicWorkId)).size > 1
  return parseSynthesisDraft(JSON.stringify({ schemaVersion: 1, researchBriefId: input.brief.researchBriefId,
    researchBriefVersion: input.brief.version,
    statements: [{ text: '合成论文描述了重排序方法，当前材料不足以判断优劣。', kind: crossPaper ? 'synthesis' : 'source_statement',
      category: crossPaper ? 'comparison' : null, scope: '仅限合成材料', uncertainty: '尚未审核语义支持。',
      evidenceLinks: input.analysisInput.evidenceRecords.map(record => ({ evidenceId: record.evidenceId, relation: 'supports', rationale: '材料中的方法描述。' })) }],
    questionAnswers: input.brief.questions.map((_, questionIndex) => ({ questionIndex, status: 'answered', statementIndexes: [0], reason: null })),
    sections: synthesisSections(input.brief).map(sectionId => ({ sectionId, title: sectionId,
      statementIndexes: ['scope_and_method', 'references', 'evidence_appendix'].includes(sectionId) ? [] : [0], missingReason: null })),
    limitations: ['材料为合成样例，不能证明实际研究结论。'],
  }), input)
}
