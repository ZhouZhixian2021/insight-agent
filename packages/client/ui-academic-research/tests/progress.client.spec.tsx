// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { AcademicResearchRunFrame, AcademicResearchProgressView } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import { ResearchEntry, type ResearchEntryProps } from '../src/client/ResearchEntry.tsx'
import { ProgressPanel } from '../src/client/ProgressPanel.tsx'
import { zh, type RunKey } from '../src/client/run-locales.ts'
import { sampleRun } from './run-sample.ts'

const fixture = JSON.parse(readFileSync('z-team_docs/interface-samples/academic-model-v1/academic-research-progress-v1.sample.json', 'utf8')) as {
  frames: { type: 'progress'; progress: AcademicResearchProgressView }[]
}
const t: ResearchEntryProps['t'] = key => zh[key as RunKey]
const result = sampleRun()
const snapshot = (index = 0): AcademicResearchProgressView => ({ ...fixture.frames[index]!.progress,
  sessionId: result.sessionId, retrievalRunId: result.retrievalRun.retrievalRunId })
const final: AcademicResearchRunFrame = { type: 'result', retrievalRunId: result.retrievalRun.retrievalRunId, value: result }
const plan: ResearchEntryProps['plan'] = async () => ({ researchBriefId: result.retrievalRun.researchBriefId, topic: 'RAG', questions: [], searches: [] })
function props(runStream: ResearchEntryProps['runStream']): ResearchEntryProps {
  return { wide: true, t, plan, runStream,
    useSessions: ((select: (s: unknown) => unknown) => select({ current: result.sessionId,
      byId: { [result.sessionId]: { blank: false } } })) as ResearchEntryProps['useSessions'] } as ResearchEntryProps
}
async function start() {
  fireEvent.click(screen.getByRole('button', { name: zh.entry }))
  fireEvent.click(await screen.findByRole('button', { name: zh.start }))
}
function pause() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}
afterEach(cleanup)

describe('one-shot research progress', () => {
  it('shows concurrent papers, retry facts, all six stages and unknown values from the official fixture', () => {
    const progress = snapshot(1)
    render(<ProgressPanel progress={progress} recent={[progress]} t={t} />)
    for (const paper of progress.activities.filter(item => item.kind === 'paper')) {
      expect(screen.getAllByText(new RegExp(paper.workVersionId)).length).toBeGreaterThan(0)
    }
    expect(screen.getByText(zh.operation_waiting_retry)).toBeTruthy()
    expect(screen.getAllByText(/请求超时/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByText(zh.progress_report)).toBeTruthy()
    expect(screen.getAllByText(/未提供/).length).toBeGreaterThan(0)
  })
  it('ignores stale snapshots, bounds history, calls the stream once and keeps progress beside the final report', async () => {
    const gate = pause()
    const runStream = vi.fn(async function* () {
      for (let sequence = 0; sequence < 25; sequence++) yield { type: 'progress' as const, progress: { ...snapshot(), sequence, elapsedMs: sequence * 1000 } }
      yield { type: 'progress' as const, progress: { ...snapshot(), sequence: 1, elapsedMs: 999999 } }
      await gate.promise
      yield final
    })
    render(<ResearchEntry {...props(runStream)} />); await start()
    const panel = await screen.findByRole('region', { name: zh.liveProgress })
    await act(async () => { await Promise.resolve() })
    expect(panel.textContent).toContain('24 秒')
    expect(panel.textContent).not.toContain('999 秒')
    expect(within(panel).getByRole('list', { name: zh.recentProgress }).children).toHaveLength(20)
    fireEvent.submit(screen.getByRole('button', { name: zh.start }).closest('form')!)
    expect(runStream).toHaveBeenCalledTimes(1)
    await act(async () => { gate.release() })
    expect(await screen.findByRole('button', { name: zh.download })).toBeTruthy()
    expect(screen.getByRole('region', { name: zh.liveProgress })).toBeTruthy()
  })
  it.each(['empty', 'throw'] as const)('preserves observed progress on %s disconnect without restarting', async (mode) => {
    const runStream = vi.fn(async function* () {
      yield { type: 'progress' as const, progress: snapshot(1) }
      if (mode === 'throw') throw new TypeError('Connection lost')
    })
    render(<ResearchEntry {...props(runStream)} />); await start()
    expect((await screen.findByRole('alert')).textContent).toContain(zh.streamDisconnected)
    expect(screen.getByRole('region', { name: zh.liveProgress })).toBeTruthy()
    expect(runStream).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: zh.download })).toBeNull()
  })
  it('distinguishes explicit server refusal from a transport interruption', async () => {
    const runStream = async function* () { throw Object.assign(new Error('Plan no longer approved'), { code: 'gateway/bad-request' }); yield final }
    render(<ResearchEntry {...props(runStream)} />); await start()
    expect((await screen.findByRole('alert')).textContent).toContain(zh.serverError)
    expect(screen.queryByText(zh.connectionUnknown)).toBeNull()
  })
  it('rejects progress from another run rather than mixing counters', async () => {
    const runStream = async function* () {
      yield { type: 'progress' as const, progress: snapshot() }
      yield { type: 'progress' as const, progress: { ...snapshot(), sessionId: 'other' as typeof result.sessionId } }
    }
    render(<ResearchEntry {...props(runStream)} />); await start()
    expect((await screen.findByRole('alert')).textContent).toContain(zh.streamMismatch)
  })
  it('keeps committed counts when cancellation ends the stream without a result', async () => {
    const runStream: ResearchEntryProps['runStream'] = async function* (_request, signal) {
      yield { type: 'progress', progress: snapshot(1) }
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    }
    render(<ResearchEntry {...props(runStream)} />); await start()
    await screen.findByRole('region', { name: zh.liveProgress })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: zh.cancel })) })
    expect((await screen.findByRole('alert')).textContent).toContain(zh.cancelledRequest)
    expect(screen.getByRole('region', { name: zh.liveProgress })).toBeTruthy()
  })
})
