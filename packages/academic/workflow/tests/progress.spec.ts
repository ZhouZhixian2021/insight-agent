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
  })

  it('contains observer exceptions without changing research settlement', async () => {
    const { input, adapters } = draftFixture()
    adapters.onProgress = () => { throw new Error('subscriber failed') }

    await expect(runResearchDraft(input, adapters)).resolves.toMatchObject({
      status: 'completed',
      synthesis: { status: 'completed' },
    })
  })
})
