import { describe, expect, it } from 'vitest'
import { createAcademicWorkId, createBatchResult, createWorkVersionId,
  type AcademicWork, type WorkVersion } from '@deepseek-ai/dsh-academic-model'
import type { AcademicSourceSearchBatchResult, AcademicSourceWork } from '@deepseek-ai/dsh-academic-source'
import { parseDomainSurveyMap, runDomainSurvey, type DomainSurveyPaper } from '../src/domain-survey.ts'

const papers: readonly DomainSurveyPaper[] = [
  { workId: 'w1', title: 'Memory safety in operating systems', abstract: 'We study memory-safe kernels.',
    sourceProviders: ['openalex'] },
  { workId: 'w2', title: 'Operating system scheduling', abstract: 'We evaluate a new scheduler.',
    sourceProviders: ['arxiv'] },
]

describe('parseDomainSurveyMap', () => {
  it('retains exact source metadata and unclassified papers', () => {
    const map = parseDomainSurveyMap(JSON.stringify({ directions: [{ label: '内存安全', definition: '内核内存安全研究',
      supports: [{ workId: 'w1', field: 'abstract', quote: 'memory-safe kernels' }] }],
    unclassifiedWorkIds: ['w2'] }), papers)
    expect(map.directions[0]).toMatchObject({ label: '内存安全', sourceProviders: ['openalex'] })
    expect(map.directions[0]?.directionId).toHaveLength(16)
    expect(map.unclassifiedWorkIds).toEqual(['w2'])
  })

  it('rejects invented sources, missing works, and unaccounted candidates', () => {
    const result = { directions: [{ label: '内存安全', definition: '内核内存安全研究',
      supports: [{ workId: 'w1', field: 'abstract', quote: 'memory-safe kernels' }] }],
    unclassifiedWorkIds: ['w2'] }
    expect(() => parseDomainSurveyMap(JSON.stringify({ ...result, directions: [{ ...result.directions[0],
      supports: [{ workId: 'w1', field: 'abstract', quote: 'invented' }] }] }), papers)).toThrow('absent')
    expect(() => parseDomainSurveyMap(JSON.stringify({ ...result, directions: [{ ...result.directions[0],
      supports: [{ workId: 'missing', field: 'title', quote: 'Memory' }] }] }), papers)).toThrow('unknown')
    expect(() => parseDomainSurveyMap(JSON.stringify({ ...result, unclassifiedWorkIds: [] }), papers)).toThrow('account')
  })
})

function sourceWork(title: string, year: number, recordId: string): AcademicSourceWork {
  const academicWorkId = createAcademicWorkId()
  const workVersionId = createWorkVersionId()
  const date = { status: 'available' as const, value: { iso: String(year), precision: 'year' as const } }
  const identifiers = [{ kind: 'provider_record' as const, normalizedValue: `openalex:${recordId}`,
    originalValue: recordId, sourceProvider: 'openalex' }]
  const academicWork: AcademicWork = { schemaVersion: 1, academicWorkId, title, authors: [],
    externalIdentifiers: identifiers, workVersionIds: [workVersionId], canonicalVersionId: workVersionId,
    firstPublicDate: date, publicationStatus: { status: 'available', value: 'published' },
    venue: { status: 'unknown', reason: 'not supplied' } }
  const workVersion: WorkVersion = { schemaVersion: 1, workVersionId, academicWorkId,
    versionType: 'version_of_record', versionLabel: { status: 'unknown', reason: 'not supplied' },
    releaseDate: date, externalIdentifiers: identifiers, sourceRecords: [{ provider: 'openalex', recordId }],
    contentHash: { status: 'not_extracted' }, supersedesWorkVersionId: null, status: 'active' }
  return { academicWork, workVersion,
    metadata: { abstract: { status: 'available', value: `Abstract of ${title}` },
      keywords: { status: 'not_extracted' } } }
}

describe('runDomainSurvey', () => {
  it('keeps omission-check papers when the discovery query fills the candidate budget', async () => {
    const discovery = Array.from({ length: 8 }, (_, index) => sourceWork(`Kernel paper ${index}`, 2024, `K${index}`))
    const omission = sourceWork('Filesystem paper found in omission check', 2024, 'F1')
    const result = await runDomainSurvey([
      { expression: 'kernel discovery', purpose: 'discovery', roundIndex: 1 },
      { expression: 'filesystem omission check', purpose: 'omission_check', roundIndex: 2 },
    ], { maximumQueries: 2, maximumQueriesPerRound: 1, maximumCandidates: 4, maximumResultsPerQuery: 10 },
    async (query) => {
      const works = query === 'kernel discovery' ? discovery : [omission]
      return { works, batch: createBatchResult(works, []), providers: ['openalex'],
        discoveredRecords: works.length, truncated: false, limitations: [] }
    }, async papers => ({ text: JSON.stringify({ directions: [{ label: '文件系统', definition: '文件系统方向',
      supports: [{ workId: papers.find(paper => paper.title === omission.academicWork.title)?.workId,
        field: 'title', quote: 'Filesystem paper' }] }],
    unclassifiedWorkIds: papers.filter(paper => paper.title !== omission.academicWork.title).map(paper => paper.workId) }),
    limitations: ['abstract compact'] }))
    expect(result.papers).toHaveLength(4)
    expect(result.papers.some(paper => paper.title === omission.academicWork.title)).toBe(true)
    expect(result.map.directions[0]?.supports).toHaveLength(1)
    expect(result.limitations).toContain('abstract compact')
    expect(result.status).toBe('incomplete')
  })
  it('applies the reviewed year policy before mapping and retains version and source records', async () => {
    const works = [sourceWork('Operating system kernel', 2024, 'W2024'),
      sourceWork('Old operating system', 2018, 'W2018')]
    const batch: AcademicSourceSearchBatchResult = { works, batch: createBatchResult(works, []),
      providers: ['openalex'], discoveredRecords: 2, truncated: false, limitations: [] }
    const result = await runDomainSurvey([
      { expression: 'operating systems', purpose: 'discovery', roundIndex: 1 },
      { expression: 'computer systems', purpose: 'omission_check', roundIndex: 2 },
    ], { maximumQueries: 2, maximumQueriesPerRound: 1, maximumCandidates: 10, maximumResultsPerQuery: 10 },
    async () => batch,
    async papers => JSON.stringify({ directions: [{ label: '内核', definition: '操作系统内核',
      supports: [{ workId: papers[0]?.workId, field: 'title', quote: 'Operating system kernel' }] }],
    unclassifiedWorkIds: [] }), undefined,
    { startYear: 2022, endYear: 2026, dateBasis: 'published', includedVersionTypes: ['version_of_record'] })
    expect(result.papers).toHaveLength(1)
    expect(result.papers[0]).toMatchObject({ versionType: 'version_of_record',
      publicationDate: '2024', sourceRecords: [{ provider: 'openalex', recordId: 'W2024' }] })
    expect(result.excludedByPolicy).toBe(1)
    expect(result.status).toBe('mapped')
  })
})
