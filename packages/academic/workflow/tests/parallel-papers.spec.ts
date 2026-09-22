import { describe, expect, it, vi } from 'vitest'
import { runResearchDraft, WorkflowLogError } from '../src/index.ts'
import { draftFixture } from './pipeline-fixture.ts'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((yes) => { resolve = yes })
  return { promise, resolve }
}

function parallelFixture() {
  const f = draftFixture(5)
  f.input.paperConcurrency = 3
  f.input.brief = { ...f.input.brief, stopConditions: { ...f.input.brief.stopConditions,
    maximumCandidateWorks: 5, maximumIncludedWorks: 5 } }
  return f
}

describe('bounded concurrent papers', () => {
  it('overlaps three extractions, replenishes in order and retains candidate order', async () => {
    const f = parallelFixture(), entered = deferred(), gates = Array.from({ length: 5 }, deferred)
    const original = f.adapters.generator
    let active = 0, peak = 0, calls = 0
    f.adapters.generator = async (...args) => {
      const index = calls++
      active++; peak = Math.max(peak, active)
      if (calls === 3) entered.resolve()
      try { await gates[index]!.promise; return await original(...args) } finally { active-- }
    }
    const running = runResearchDraft(f.input, f.adapters)
    try {
      await vi.waitFor(() => { expect(calls).toBe(3) })
      expect(calls).toBe(3)
      expect(active).toBe(3)
      gates[2]!.resolve(); gates[1]!.resolve(); gates[0]!.resolve()
    } finally { for (const gate of gates) gate.resolve() }
    const result = await running
    expect(peak).toBe(3)
    expect(active).toBe(0)
    expect(result.papers.map(p => p.status === 'extracted' ? p.version.sourceRecords[0]!.recordId : null))
      .toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(result.retrievalRun.coverageSummary.includedWorks).toBe(5)
  })

  it('reserves inclusion slots so concurrency cannot exceed the approved maximum', async () => {
    const f = parallelFixture()
    f.input.brief = { ...f.input.brief, stopConditions: { ...f.input.brief.stopConditions, maximumIncludedWorks: 2 } }
    const result = await runResearchDraft(f.input, f.adapters)
    expect(f.adapters.fetcher).toHaveBeenCalledTimes(2)
    expect(result.retrievalRun.coverageSummary.includedWorks).toBe(2)
  })

  it('finishes started papers after evidence suffices without scheduling remaining candidates', async () => {
    const f = parallelFixture(), firstDone = deferred()
    f.input.brief = { ...f.input.brief, stopConditions: { ...f.input.brief.stopConditions, stopWhenEvidenceRequirementsMet: true },
      evidenceRequirements: { ...f.input.brief.evidenceRequirements, minimumIncludedWorks: 1, minimumFulltextWorks: 1 } }
    const original = f.adapters.generator
    let calls = 0
    f.adapters.generator = async (...args) => {
      if (calls++ === 0) firstDone.resolve()
      await firstDone.promise
      return original(...args)
    }
    const result = await runResearchDraft(f.input, f.adapters)
    expect(calls).toBe(3)
    expect(result.papers).toHaveLength(3)
    expect(result.retrievalRun.coverageSummary.limitations.join(' ')).toContain('停止补选')
  })

  it('replaces failed candidates while preserving the other successful papers', async () => {
    const f = parallelFixture(), original = f.adapters.generator
    f.adapters.generator = async (...args) => {
      if (args[1].sourceUrl.endsWith('/a')) throw new Error('upstream failure')
      return original(...args)
    }
    const result = await runResearchDraft(f.input, f.adapters)
    expect(result.failures).toHaveLength(1)
    expect(result.retrievalRun.coverageSummary.includedWorks).toBe(4)
  })

  it.each([false, true])('joins in-flight cancellation and preserves fatal logging errors: %s', async (fatal) => {
    const f = parallelFixture(), entered = deferred(), release = deferred(), abort = new AbortController()
    const signals: AbortSignal[] = []
    let exited = 0
    f.adapters.generator = async (request) => {
      signals.push(request.signal!)
      const first = signals.length === 1
      if (signals.length === 3) entered.resolve()
      await entered.promise
      if (fatal && first) throw new WorkflowLogError(new Error('durability failed'))
      await release.promise
      exited++
      request.signal!.throwIfAborted()
      throw new Error('Expected cancellation')
    }
    let finished = false
    const running = runResearchDraft(f.input, f.adapters, abort.signal)
    const observed = running.then(value => ({ value }), (error: unknown) => ({ error }))
    void observed.then(() => { finished = true })
    try {
      await vi.waitFor(() => { expect(signals).toHaveLength(3) })
      if (!fatal) abort.abort()
      await vi.waitFor(() => { expect(signals.every(s => s.aborted)).toBe(true) })
      expect(finished).toBe(false)
    } finally { abort.abort(); entered.resolve(); release.resolve() }
    const result = await observed
    expect(exited).toBe(fatal ? 2 : 3)
    expect(f.adapters.synthesize).not.toHaveBeenCalled()
    expect(f.adapters.fetcher).toHaveBeenCalledTimes(3)
    if (fatal) expect('error' in result && result.error).toBeInstanceOf(WorkflowLogError)
    else expect('value' in result && result.value.status).toBe('cancelled')
  })

  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid concurrency %s before external work', async (paperConcurrency) => {
    const f = parallelFixture()
    await expect(runResearchDraft({ ...f.input, paperConcurrency }, f.adapters)).rejects.toThrow('Paper concurrency')
    expect(f.adapters.search).not.toHaveBeenCalled()
  })
})
