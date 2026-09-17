import { Context } from '@deepseek-ai/cordis'
import { createAcademicWorkId, createResearchBriefId, createWorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'

type RunAcademicResearchDraft = typeof import('@deepseek-ai/dsh-academic-workflow')['runAcademicResearchDraft']
const runAcademicResearchDraft = vi.hoisted(() => vi.fn<RunAcademicResearchDraft>())
vi.mock('@deepseek-ai/dsh-academic-workflow', async load => ({
  ...await load<typeof import('@deepseek-ai/dsh-academic-workflow')>(),
  runAcademicResearchDraft,
}))

import AcademicResearchController from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  runAcademicResearchDraft.mockReset()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

function brief() {
  return { schemaVersion: 1 as const, researchBriefId: createResearchBriefId(), version: 1, topic: 'Retrieval', aliases: [],
    questions: ['Which method works?'], publicationWindow: { start: null, end: null, dateBasis: 'first_public_release' as const },
    includedWorkTypes: ['preprint'], inclusionRules: ['Include retrieval studies.'], exclusionRules: ['Exclude surveys.'],
    evidenceRequirements: { minimumIncludedWorks: 1, minimumFulltextWorks: 1, minimumEvidenceLevel: 'fulltext' as const,
      requireLocatableEvidence: true, allowPreprints: true, insufficientEvidencePolicy: 'continue_with_warning' as const },
    targetAudience: 'researchers', reportRequirements: { language: 'en', targetLength: { unit: 'words', minimum: null, maximum: null },
      requiredSections: [], citationStyle: 'numeric' as const, includeEvidenceAppendix: true, includeMethodology: true,
      includeLimitations: true, includeResearchGaps: false }, stopConditions: { maximumSearchRounds: 1, maximumCandidateWorks: 3,
      maximumIncludedWorks: 2, maximumElapsedMinutes: null, saturationRounds: 1, stopWhenEvidenceRequirementsMet: false },
    assumptions: [], approval: { status: 'approved' as const, reviewedBy: 'tester', reviewedAt: '2026-09-16T00:00:00Z',
      approvedBriefVersion: 1, comment: null } }
}

function harness(options: { busy?: boolean; header?: boolean } = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  const dispose = (): void => {}
  ctx.provide('typert', { lookups: { configure: () => dispose }, contexts: { configureHost: () => dispose } } as never)
  const search = vi.fn()
  const resolveFullText = vi.fn((version: { sourceRecords: readonly { provider: string; recordId: string }[] }) => {
    const record = version.sourceRecords[0]
    return record === undefined ? null : {
      sourceProvider: record.provider,
      urls: [`https://arxiv.org/html/${record.recordId}`, `https://arxiv.org/pdf/${record.recordId}`],
    }
  })
  const fetch = vi.fn()
  ctx.provide('academicSource', { searchAll: search, resolveFullText } as never)
  ctx.provide('web', { fetch } as never)
  const sessionId = SessionId('academic-session')
  const signal = new AbortController().signal
  const agent = { id: sessionId, ctx, options: { provider: 'fixture', model: 'fallback', maxTokens: 4000 },
    session: { id: sessionId, requestHeader: () => options.header === false ? undefined
      : { config: { provider: 'fixture', model: 'selected', maxTokens: 8000 } } },
    runMaintenance: options.busy ? () => { throw new Error('already has active work') }
      : (task: (maintenanceSignal: AbortSignal) => Promise<unknown>) => task(signal) }
  ctx.provide('sessionController', { resolveAgent: () => Promise.resolve({ agent }) } as never)
  const controller = new AcademicResearchController(ctx)
  return { controller, search, fetch, sessionId, signal }
}

describe('AcademicResearchController', () => {
  it('runs the formal workflow with the Session model and arXiv adapters', async () => {
    const fixture = harness()
    const resultWorkVersionId = createWorkVersionId()
    runAcademicResearchDraft.mockResolvedValue({ status: 'completed', sessionId: fixture.sessionId,
      papers: [
        { status: 'extracted', version: { workVersionId: resultWorkVersionId }, evidence: { evidenceRecords: [{}, {}] } },
        { status: 'excluded', exclusion: { workVersionId: resultWorkVersionId, reason: 'survey' } },
        { status: 'paused', pause: { workVersionId: resultWorkVersionId, reason: 'too long' } },
      ], failures: [], analysis: null, report: null } as never)
    const result = await fixture.controller.run({ sessionId: fixture.sessionId, brief: brief(), query: 'retrieval', maxResults: 2,
      synthetic: false }, new AbortController().signal)
    expect(result.papers).toEqual([
      { status: 'extracted', workVersionId: resultWorkVersionId, evidenceCount: 2 },
      { status: 'excluded', workVersionId: resultWorkVersionId, reason: 'survey' },
      { status: 'paused', workVersionId: resultWorkVersionId, reason: 'too long' },
    ])
    const call = runAcademicResearchDraft.mock.calls[0]?.[0]
    if (call === undefined) throw new Error('missing Academic workflow invocation')
    expect(call).toMatchObject({ session: { id: fixture.sessionId }, model: { provider: 'fixture', model: 'selected', maxTokens: 8000 },
      input: { search: { query: 'retrieval', maxResults: 2 }, synthetic: false } })
    await call.adapters.search({ query: 'x' }, fixture.signal)
    await call.adapters.fetcher('https://arxiv.org/pdf/1', fixture.signal)
    expect(fixture.search).toHaveBeenCalledWith({ query: 'x' }, fixture.signal)
    expect(fixture.fetch).toHaveBeenCalledWith({ url: 'https://arxiv.org/pdf/1' }, fixture.signal)

    const academicWorkId = createAcademicWorkId(), workVersionId = createWorkVersionId()
    const selected = call.adapters.selectPapers({ works: [{ schemaVersion: 1, academicWorkId, title: 'Paper', authors: [],
      externalIdentifiers: [], workVersionIds: [workVersionId], canonicalVersionId: workVersionId,
      firstPublicDate: { status: 'available', value: { iso: '2026', precision: 'year' } },
      publicationStatus: { status: 'available', value: 'preprint' }, venue: { status: 'unknown', reason: 'none' } }],
    versions: [{ schemaVersion: 1, workVersionId, academicWorkId, versionType: 'preprint',
      versionLabel: { status: 'available', value: 'v1' }, releaseDate: { status: 'available', value: { iso: '2026', precision: 'year' } },
      externalIdentifiers: [], sourceRecords: [{ provider: 'arxiv', recordId: '2406.12345v1' }],
      contentHash: { status: 'not_extracted' }, supersedesWorkVersionId: null, status: 'active' }],
    index: { byExactKey: new Map(), byFuzzyKey: new Map(), records: new Map() }, audit: { entries: [] } }, brief())
    expect(selected[0]).toMatchObject({ sourceProvider: 'arxiv', urls: [
      'https://arxiv.org/html/2406.12345v1', 'https://arxiv.org/pdf/2406.12345v1',
    ] })
  })

  it('uses the Agent fallback selection before the Session has a request header', async () => {
    const fixture = harness({ header: false })
    runAcademicResearchDraft.mockResolvedValue({ status: 'cancelled', sessionId: fixture.sessionId,
      papers: [], failures: [], analysis: null, report: null } as never)
    await fixture.controller.run({ sessionId: fixture.sessionId, brief: brief(), query: 'x', synthetic: true },
      new AbortController().signal)
    expect(runAcademicResearchDraft.mock.calls[0]?.[0].model).toEqual({ provider: 'fixture', model: 'fallback', maxTokens: 4000 })
  })

  it('reports a busy Session before starting workflow work', async () => {
    const fixture = harness({ busy: true })
    await expect(fixture.controller.run({ sessionId: fixture.sessionId, brief: brief(), query: 'x', synthetic: false },
      new AbortController().signal)).rejects.toMatchObject({ code: 'session/agent-busy' })
    expect(runAcademicResearchDraft).not.toHaveBeenCalled()
  })
})
