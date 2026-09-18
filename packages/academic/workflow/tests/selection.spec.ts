import { describe, expect, it, vi } from 'vitest'
import type { ResearchBrief } from '@deepseek-ai/dsh-academic-model'
import { selectResearchPapers } from '../src/index.ts'
import { draftFixture } from './pipeline-fixture.ts'

describe('production paper selection', () => {
  it('selects canonical versions in search order and applies the approved cap', async () => {
    const { input, adapters } = draftFixture()
    const search = await adapters.search(input.searches[0]!)
    const { createIngestIndex, ingestWorks } = await import('@deepseek-ai/dsh-academic-ingestion')
    const ingested = ingestWorks(createIngestIndex(), search.works)
    const brief = { ...input.brief, stopConditions: { ...input.brief.stopConditions, maximumIncludedWorks: 1 } }
    const selected = selectResearchPapers(ingested, brief, (_work, version) => ({
      urls: [`https://example.org/${version.sourceRecords[0]!.recordId}`], sourceProvider: 'fixture',
      extractionMethod: { method: 'fixture', methodVersion: '1' }, hasHistoricalEvidence: false,
    }))
    expect(selected.papers).toHaveLength(1)
    expect(selected.papers[0]?.workVersionId).toBe(ingested.works[0]?.canonicalVersionId)
    expect(selected.truncated).toBe(true)
  })

  it('filters work type, preprint permission, retraction and publication dates before resolving URLs', async () => {
    const { input, adapters } = draftFixture()
    const search = await adapters.search(input.searches[0]!)
    const { createIngestIndex, ingestWorks } = await import('@deepseek-ai/dsh-academic-ingestion')
    const ingested = ingestWorks(createIngestIndex(), search.works)
    const resolve = vi.fn(() => ({ urls: ['https://example.org/paper'], sourceProvider: 'fixture',
      extractionMethod: { method: 'fixture', methodVersion: '1' }, hasHistoricalEvidence: false }))
    const excludedType = { ...input.brief, includedWorkTypes: ['version_of_record'] }
    expect(selectResearchPapers(ingested, excludedType, resolve)).toEqual({ papers: [], truncated: false })
    const noPreprints = { ...input.brief, evidenceRequirements: { ...input.brief.evidenceRequirements, allowPreprints: false } }
    expect(selectResearchPapers(ingested, noPreprints, resolve)).toEqual({ papers: [], truncated: false })
    const dated: ResearchBrief = { ...input.brief,
      publicationWindow: { start: { iso: '2025', precision: 'year' }, end: null, dateBasis: 'first_public_release' } }
    expect(selectResearchPapers(ingested, dated, resolve)).toEqual({ papers: [], truncated: false })
    expect(resolve).not.toHaveBeenCalled()
  })
})
