import { describe, expect, it, vi } from 'vitest'
import { createBatchResult } from '@deepseek-ai/dsh-academic-model'
import type { AcademicWorkflowProgressSnapshot } from '../src/index.ts'
import { runResearchDraft } from '../src/index.ts'
import { draftFixture } from './pipeline-fixture.ts'

function snapshotsOf(count = 2) {
  const fixture = draftFixture(count)
  const snapshots: AcademicWorkflowProgressSnapshot[] = []
  fixture.adapters.onProgress = snapshot => snapshots.push(snapshot)
  return { ...fixture, snapshots }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((yes) => { resolve = yes })
  return { promise, resolve }
}

describe('Academic workflow progress', () => {
  it('publishes monotone snapshots through all six stages', async () => {
    const { input, adapters, snapshots } = snapshotsOf()

    const result = await runResearchDraft(input, adapters)

    expect(result.status).toBe('completed')
    expect(snapshots.map(snapshot => snapshot.sequence)).toEqual(
      snapshots.map((_, index) => index),
    )
    expect(new Set(snapshots.map(snapshot => snapshot.retrievalRunId))).toEqual(
      new Set([result.retrievalRun.retrievalRunId]),
    )
    expect(snapshots[0]?.latestEvent.code).toBe('run_started')
    expect(snapshots.at(-1)).toMatchObject({
      primaryStage: null,
      activeStages: [],
      latestEvent: { code: 'run_completed', stage: 'report' },
      stages: {
        retrieval: { status: 'success' },
        screening: { status: 'success' },
        fulltext: { status: 'success' },
        extraction: { status: 'success' },
        analysis: { status: 'success' },
        report: { status: 'success' },
      },
      counts: {
        completedQueries: 1,
        mergedWorkIdentities: 0,
        mergedVersionRecords: 0,
        retainedWorkVersions: 2,
        suspectedDuplicateRecords: 0,
        candidateWorks: 2,
        completedPapers: 2,
        totalPapers: 2,
        includedPapers: 2,
        availableFulltextPapers: 2,
        validatedEvidenceRecords: 2,
        completedQuestions: 1,
      },
    })
  })

  it('keeps merged records separate from the retained version total', async () => {
    const { input, adapters, records, snapshots } = snapshotsOf()
    const identifier = { kind: 'doi' as const, normalizedValue: '10.1000/progress',
      originalValue: '10.1000/PROGRESS', sourceProvider: 'fixture' }
    const repeatedWork = records.map(record => ({
      academicWork: { ...record.academicWork, externalIdentifiers: [identifier] },
      workVersion: { ...record.workVersion, externalIdentifiers: [identifier] },
    }))
    adapters.search = async () => {
      const batch = createBatchResult(repeatedWork, [])
      return { works: batch.items, batch, providers: ['fixture'], discoveredRecords: 2,
        truncated: false, limitations: [] }
    }
    adapters.selectPapers = ingested => ({ papers: ingested.versions.slice(0, 1).map(version => ({
      workVersionId: version.workVersionId, urls: ['https://example.org/a'], sourceProvider: 'fixture',
      extractionMethod: { method: 'fixture', methodVersion: '1' }, hasHistoricalEvidence: false,
    })), truncated: ingested.versions.length > 1 })

    await runResearchDraft(input, adapters)

    expect(snapshots.at(-1)?.counts).toMatchObject({
      deduplicatedWorks: 1,
      mergedWorkIdentities: 0,
      mergedVersionRecords: 1,
      retainedWorkVersions: 2,
      suspectedDuplicateRecords: 0,
    })
  })

  it('publishes provider lifecycle facts inside the owning query', async () => {
    const { input, adapters, snapshots } = snapshotsOf()
    const search = adapters.search
    adapters.search = async (request, signal, onProvider) => {
      onProvider?.({ provider: 'openalex', phase: 'started', settlement: null,
        category: null, works: 0, truncated: false })
      const result = await search(request, signal)
      onProvider?.({ provider: 'openalex', phase: 'settled', settlement: 'success',
        category: null, works: result.works.length, truncated: false })
      return result
    }

    await runResearchDraft(input, adapters)

    const started = snapshots.find(snapshot => snapshot.latestEvent.code === 'provider_updated'
      && snapshot.latestEvent.providerId === 'openalex'
      && snapshot.activities.some(activity => activity.kind === 'provider' && activity.status === 'running'))
    const settled = snapshots.find(snapshot => snapshot.latestEvent.code === 'provider_updated'
      && snapshot.latestEvent.providerId === 'openalex'
      && snapshot.activities.some(activity => activity.kind === 'provider' && activity.status === 'success'))
    expect(started?.activities).toContainEqual(expect.objectContaining({ kind: 'provider', providerId: 'openalex',
      operation: 'academic_search', queryIndex: 1, queryCount: 1, itemIndex: null, itemCount: null,
      discoveredRecords: null, completedAt: null }))
    expect(settled?.activities).toContainEqual(expect.objectContaining({ kind: 'provider', providerId: 'openalex',
      status: 'success', discoveredRecords: 2, failureCode: null }))
  })

  it('maps hybrid Web operations into retrieval activities', async () => {
    const { input, adapters, snapshots } = snapshotsOf()
    const search = adapters.search
    adapters.search = async (request, signal, onProvider, onHybrid) => {
      onHybrid?.({ operation: 'web_discovery', phase: 'started', providerId: 'web', status: 'running',
        itemIndex: null, itemCount: null, discoveredRecords: null, failureCode: null })
      onHybrid?.({ operation: 'web_discovery', phase: 'settled', providerId: 'web', status: 'success',
        itemIndex: null, itemCount: null, discoveredRecords: 4, failureCode: null })
      onHybrid?.({ operation: 'reference_verification', phase: 'started', providerId: 'arxiv', status: 'running',
        itemIndex: 1, itemCount: 2, discoveredRecords: null, failureCode: null })
      onHybrid?.({ operation: 'reference_verification', phase: 'settled', providerId: 'arxiv', status: 'failed',
        itemIndex: 1, itemCount: 2, discoveredRecords: 0, failureCode: 'not_found' })
      return search(request, signal, onProvider)
    }

    await runResearchDraft(input, adapters)

    const web = snapshots.find(snapshot => snapshot.activities.some(activity => activity.kind === 'provider'
      && activity.operation === 'web_discovery' && activity.status === 'success'))
    expect(web?.activities).toContainEqual(expect.objectContaining({ kind: 'provider', providerId: 'web',
      operation: 'web_discovery', discoveredRecords: 4, itemIndex: null, itemCount: null }))
    const verification = snapshots.find(snapshot => snapshot.activities.some(activity => activity.kind === 'provider'
      && activity.operation === 'reference_verification' && activity.status === 'failed'))
    expect(verification?.activities).toContainEqual(expect.objectContaining({ kind: 'provider', providerId: 'arxiv',
      operation: 'reference_verification', itemIndex: 1, itemCount: 2, failureCode: 'not_found' }))
  })

  it('publishes approved channels before a Web discovery failure settles the query', async () => {
    const { input, adapters, snapshots } = snapshotsOf()
    input.searches = [{ query: 'synthetic methods', channels: ['academic', 'web_discovery'] }]
    adapters.search = async () => { throw new Error('web discovery failed') }

    await expect(runResearchDraft(input, adapters)).rejects.toThrow('web discovery failed')

    const started = snapshots.find(snapshot => snapshot.activities.some(activity => activity.kind === 'query'))
    expect(started?.activities).toContainEqual(expect.objectContaining({ kind: 'query',
      channels: ['academic', 'web_discovery'] }))
    expect(snapshots.at(-1)?.stages.retrieval.status).toBe('failed')
  })

  it('preserves failed and cancelled provider settlements before the query settles', async () => {
    const failed = snapshotsOf()
    const failedSearch = failed.adapters.search
    failed.adapters.search = async (request, signal, onProvider) => {
      onProvider?.({ provider: 'arxiv', phase: 'started', settlement: null,
        category: null, works: 0, truncated: false })
      const result = await failedSearch(request, signal)
      onProvider?.({ provider: 'arxiv', phase: 'settled', settlement: 'failed',
        category: 'rate_limited', works: 0, truncated: false })
      return result
    }
    await runResearchDraft(failed.input, failed.adapters)
    const failedSnapshot = failed.snapshots.find(snapshot => snapshot.latestEvent.code === 'provider_updated'
      && snapshot.latestEvent.providerId === 'arxiv' && snapshot.latestEvent.failureCode === 'rate_limited')
    expect(failedSnapshot?.activities).toContainEqual(expect.objectContaining({ kind: 'provider', providerId: 'arxiv',
      status: 'failed', discoveredRecords: 0, failureCode: 'rate_limited' }))

    const cancelled = snapshotsOf()
    const abort = new AbortController()
    cancelled.adapters.search = async (_request, _signal, onProvider) => {
      onProvider?.({ provider: 'openalex', phase: 'started', settlement: null,
        category: null, works: 0, truncated: false })
      onProvider?.({ provider: 'openalex', phase: 'settled', settlement: 'cancelled',
        category: null, works: 0, truncated: false })
      abort.abort(new DOMException('cancelled', 'AbortError'))
      throw abort.signal.reason
    }
    await expect(runResearchDraft(cancelled.input, cancelled.adapters, abort.signal)).resolves.toMatchObject({ status: 'cancelled' })
    const cancelledSnapshot = cancelled.snapshots.find(snapshot => snapshot.latestEvent.code === 'provider_updated'
      && snapshot.latestEvent.providerId === 'openalex' && snapshot.latestEvent.failureCode === 'cancelled')
    expect(cancelledSnapshot?.activities).toContainEqual(expect.objectContaining({ kind: 'provider', providerId: 'openalex',
      status: 'cancelled', failureCode: 'cancelled' }))
  })

  it('maps full-text candidate fallback and accepted parsing into paper activities', async () => {
    const { input, adapters, snapshots } = snapshotsOf(1)
    const select = adapters.selectPapers
    adapters.selectPapers = (ingested, brief) => {
      const selected = select(ingested, brief)
      return { ...selected, papers: selected.papers.map(paper => ({ ...paper,
        urls: ['https://example.org/missing', 'https://example.org/accepted'] })) }
    }
    const fetcher = adapters.fetcher
    adapters.fetcher = async (url, signal) => url.endsWith('/missing')
      ? { url, statusCode: 404, truncated: false, body: { kind: 'html', content: '<main>missing</main>' } }
      : fetcher(url, signal)

    await runResearchDraft(input, adapters)

    const retry = snapshots.find(snapshot => snapshot.activities.some(activity => activity.kind === 'paper'
      && activity.operation === 'waiting_retry'))
    expect(retry?.latestEvent).toMatchObject({ code: 'paper_updated', stage: 'fulltext', failureCode: 'upstream_error' })
    expect(retry?.activities).toContainEqual(expect.objectContaining({ kind: 'paper', stage: 'fulltext',
      operation: 'waiting_retry', attempt: 1, maximumAttempts: 2, lastFailure: 'upstream_error' }))
    const secondAttempt = snapshots.find(snapshot => snapshot.activities.some(activity => activity.kind === 'paper'
      && activity.operation === 'fulltext_fetch' && activity.attempt === 2))
    expect(secondAttempt?.activities).toContainEqual(expect.objectContaining({ kind: 'paper', stage: 'fulltext',
      operation: 'fulltext_fetch', attempt: 2, maximumAttempts: 2, lastFailure: null }))
    const parsed = snapshots.find(snapshot => snapshot.activities.some(activity => activity.kind === 'paper'
      && activity.operation === 'fulltext_parse'))
    expect(parsed?.activities).toContainEqual(expect.objectContaining({ kind: 'paper', stage: 'fulltext',
      operation: 'fulltext_parse', attempt: 2, maximumAttempts: 2, lastFailure: null }))
  })

  it('maps evidence batches, retries and source validation into paper activities', async () => {
    const { input, adapters, snapshots } = snapshotsOf(1)
    const generate = adapters.generator
    adapters.generator = async (request, source, scope, onProgress) => {
      onProgress?.({ operation: 'evidence_extract', batchIndex: 1, batchCount: 2, attempt: null,
        maximumAttempts: null, lastFailure: null, validatedEvidenceRecords: 0, rejectedEvidenceDrafts: 0 })
      onProgress?.({ operation: 'evidence_extract', batchIndex: 1, batchCount: 2, attempt: 1,
        maximumAttempts: 2, lastFailure: null, validatedEvidenceRecords: 0, rejectedEvidenceDrafts: 0 })
      onProgress?.({ operation: 'waiting_retry', batchIndex: 1, batchCount: 2, attempt: 1,
        maximumAttempts: 2, lastFailure: 'timeout', validatedEvidenceRecords: 0, rejectedEvidenceDrafts: 0 })
      onProgress?.({ operation: 'evidence_extract', batchIndex: 1, batchCount: 2, attempt: 2,
        maximumAttempts: 2, lastFailure: null, validatedEvidenceRecords: 0, rejectedEvidenceDrafts: 0 })
      onProgress?.({ operation: 'evidence_extract', batchIndex: 2, batchCount: 2, attempt: 1,
        maximumAttempts: 2, lastFailure: null, validatedEvidenceRecords: 0, rejectedEvidenceDrafts: 0 })
      const response = await generate(request, source, scope)
      return { ...response, evidence: [...response.evidence, { segmentIndex: 0,
        sourcedStatement: 'Unsupported.', verbatimExcerpt: 'Missing excerpt.', cardItems: [] }] }
    }

    await runResearchDraft(input, adapters)

    const retry = snapshots.find(snapshot => snapshot.activities.some(activity => activity.kind === 'paper'
      && activity.operation === 'waiting_retry'))
    expect(retry?.activities).toContainEqual(expect.objectContaining({ kind: 'paper', stage: 'extraction',
      batchIndex: 1, batchCount: 2, attempt: 1, maximumAttempts: 2, lastFailure: 'timeout' }))
    const secondBatch = snapshots.find(snapshot => snapshot.activities.some(activity => activity.kind === 'paper'
      && activity.operation === 'evidence_extract' && activity.batchIndex === 2))
    expect(secondBatch?.activities).toContainEqual(expect.objectContaining({ kind: 'paper', stage: 'extraction',
      batchIndex: 2, batchCount: 2, attempt: 1, maximumAttempts: 2 }))
    const validation = snapshots.find(snapshot => snapshot.activities.some(activity => activity.kind === 'paper'
      && activity.operation === 'evidence_validate'))
    expect(validation?.activities).toContainEqual(expect.objectContaining({ kind: 'paper', stage: 'extraction',
      batchIndex: 2, batchCount: 2, attempt: null, maximumAttempts: null,
      validatedEvidenceRecords: 1, rejectedEvidenceDrafts: 1 }))
  })

  it('keeps concurrent paper activities separate and preserves successes after one failure', async () => {
    const { input, adapters, snapshots } = snapshotsOf(3)
    input.paperConcurrency = 3
    const entered = deferred(), release = deferred()
    const generate = adapters.generator
    let calls = 0
    adapters.generator = async (...args) => {
      const index = calls++
      if (calls === 3) entered.resolve()
      await release.promise
      if (index === 0) throw new Error('synthetic extraction failure')
      return generate(...args)
    }

    const running = runResearchDraft(input, adapters)
    await entered.promise
    try {
      await vi.waitFor(() => {
        const latest = snapshots.at(-1)
        expect(latest?.activeStages).toEqual(expect.arrayContaining(['fulltext', 'extraction']))
        expect(latest?.activities.filter(activity => activity.kind === 'paper')).toHaveLength(3)
      })
    } finally {
      release.resolve()
    }
    const result = await running

    expect(result.failures).toHaveLength(1)
    expect(result.papers).toHaveLength(2)
    expect(snapshots.at(-1)).toMatchObject({
      stages: { extraction: { status: 'partial_success' } },
      counts: { completedPapers: 3, includedPapers: 2, validatedEvidenceRecords: 2 },
    })
    expect(snapshots.some(snapshot => snapshot.latestEvent.code === 'paper_updated'
      && snapshot.latestEvent.failureCode === 'unknown')).toBe(true)
  })

  it('retains committed paper counts when cancellation settles the active run', async () => {
    const { input, adapters, snapshots } = snapshotsOf()
    const abort = new AbortController(), fetch = adapters.fetcher
    adapters.fetcher = async (url, signal) => {
      if (url.endsWith('/b')) {
        abort.abort()
        throw new Error('cancelled')
      }
      return fetch(url, signal)
    }

    const result = await runResearchDraft(input, adapters, abort.signal)

    expect(result.status).toBe('cancelled')
    expect(snapshots.at(-1)).toMatchObject({
      primaryStage: null,
      activeStages: [],
      latestEvent: { code: 'run_cancelled', failureCode: 'cancelled' },
      counts: { completedPapers: 1, includedPapers: 1, validatedEvidenceRecords: 1 },
    })
    expect(snapshots.at(-1)?.stages.report.status).toBe('not_run')
    expect(snapshots.some(snapshot => snapshot.latestEvent.code === 'paper_updated'
      && snapshot.latestEvent.failureCode === 'cancelled')).toBe(true)
  })

  it('contains observer exceptions without changing research settlement', async () => {
    const { input, adapters } = draftFixture()
    adapters.onProgress = () => { throw new Error('subscriber failed') }

    await expect(runResearchDraft(input, adapters)).resolves.toMatchObject({
      status: 'completed',
      synthesis: { status: 'completed' },
    })
  })

  it('publishes report evaluation before Markdown rendering', async () => {
    const { input, adapters, snapshots } = snapshotsOf()

    await runResearchDraft(input, adapters)

    const operations = snapshots.flatMap(snapshot => snapshot.activities)
      .filter(activity => activity.kind === 'report')
      .map(activity => activity.operation)
    expect(operations).toEqual(['evaluation', 'rendering'])
  })
})
