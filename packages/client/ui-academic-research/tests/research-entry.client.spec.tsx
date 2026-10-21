// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AcademicBackgroundRunView, AcademicResearchRunRequest, AcademicBackgroundRunKey, AcademicBackgroundRunCancelRequest } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import { ResearchEntry, type ResearchEntryProps } from '../src/client/ResearchEntry.tsx'
import { zh, type RunKey } from '../src/client/run-locales.ts'
import { sampleRun } from './run-sample.ts'
import { initialTask } from './background.fixture.client.ts'

const sid = initialTask().sessionId
const planned = { researchBriefId: initialTask().researchBriefId, topic: 'RAG', questions: [], searches: [] }
function fixture() {
  let saved: AcademicBackgroundRunView | null = null
  const observers = new Set<(task: AcademicBackgroundRunView) => void>()
  const signals: AbortSignal[] = []
  const publish = (task: AcademicBackgroundRunView) => { saved = task; for (const update of observers) update(task) }
  const startBackgroundRun = vi.fn(async (_request: AcademicResearchRunRequest, _signal: AbortSignal) => {
    saved = initialTask(); return saved
  })
  const listBackgroundRuns = vi.fn(async (_sessionId: typeof sid) => saved === null ? [] : [saved])
  const getBackgroundRun = vi.fn(async (_key: AcademicBackgroundRunKey) => saved!)
  const cancelBackgroundRun = vi.fn(async (_request: AcademicBackgroundRunCancelRequest) => { const task = { ...saved!, state: 'cancelled' as const, cancelReason: 'user_requested' as const }; publish(task); return task })
  const watchBackgroundRun = vi.fn(async function* (_key: AcademicBackgroundRunKey, signal: AbortSignal) {
    signals.push(signal)
    const queue: AcademicBackgroundRunView[] = []
    let wake: (() => void) | undefined
    const update = (task: AcademicBackgroundRunView) => { queue.push(task); wake?.() }
    observers.add(update)
    const abort = () => { wake?.() }
    signal.addEventListener('abort', abort, { once: true })
    try {
      yield saved!
      while (!signal.aborted) {
        const next = queue.shift()
        if (next !== undefined) { yield next; if (next.state !== 'running') return }
        else await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally { observers.delete(update); signal.removeEventListener('abort', abort) }
  })
  function props(current = sid): ResearchEntryProps {
    return { wide: true, sessionId: current, t: key => zh[key as RunKey], plan: async () => planned,
      startBackgroundRun, listBackgroundRuns, getBackgroundRun, watchBackgroundRun, cancelBackgroundRun,
      enhanceEvidence: vi.fn(), enhancementHistory: vi.fn().mockResolvedValue(null),
      useSessions: ((select: (s: unknown) => unknown) => select({ current, byId: { [current]: { blank: false } } })) as ResearchEntryProps['useSessions'] } as ResearchEntryProps
  }
  return { props, publish, signals, startBackgroundRun, listBackgroundRuns,
    getBackgroundRun, watchBackgroundRun, cancelBackgroundRun, observers }
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: zh.entry }))
  await waitFor(() => { expect(screen.queryByText(zh.backgroundLoading)).toBeNull() })
}
async function start() {
  const button = await screen.findByRole<HTMLButtonElement>('button', { name: zh.start })
  await waitFor(() => { expect(button.disabled).toBe(false) })
  fireEvent.click(button)
  await screen.findByText(zh.backgroundConnected)
}
afterEach(cleanup)
it('starts once with the selected Session and approved Brief; closing only disconnects and reopening reads the same task', async () => {
  const f = fixture(); render(<ResearchEntry {...f.props()} />)
  await open(); await start()
  expect(screen.getByText(zh.disclosure).textContent).toContain('只停止监听')
  expect(f.startBackgroundRun).toHaveBeenCalledWith({ sessionId: sid, researchBriefId: planned.researchBriefId,
    synthetic: false }, expect.any(AbortSignal))
  expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.start }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: zh.close }))
  expect(f.signals[0]!.aborted).toBe(true)
  expect(f.cancelBackgroundRun).not.toHaveBeenCalled()
  await open(); await screen.findByText(zh.backgroundConnected)
  expect(f.getBackgroundRun).toHaveBeenCalledWith({ sessionId: sid, backgroundRunId: 'test-background' })
  expect(f.startBackgroundRun).toHaveBeenCalledTimes(1)
})
it('recovers the server result after remount without execution or report-quality promotion', async () => {
  const f = fixture(); const first = render(<ResearchEntry {...f.props()} />)
  await open(); await start(); first.unmount()
  f.publish({ ...initialTask(), state: 'completed', retrievalRunId: sampleRun().retrievalRun.retrievalRunId, result: sampleRun() })
  render(<ResearchEntry {...f.props()} />); await open()
  await screen.findByRole('button', { name: zh.download })
  expect(screen.getAllByText('待审核').length).toBeGreaterThan(0)
  expect(f.startBackgroundRun).toHaveBeenCalledTimes(1)
  expect(f.cancelBackgroundRun).not.toHaveBeenCalled()
})
it('switching Sessions detaches observation; switching back recovers the original task', async () => {
  const f = fixture(); const other = 'other' as typeof sid
  const originalList = f.listBackgroundRuns.getMockImplementation()!
  f.listBackgroundRuns.mockImplementation(async sessionId => sessionId === other ? [] : originalList(sid))
  const ui = render(<ResearchEntry {...f.props()} />); await open(); await start()
  ui.rerender(<ResearchEntry {...f.props(other)} />)
  await waitFor(() => { expect(f.signals[0]!.aborted).toBe(true) })
  expect(f.cancelBackgroundRun).not.toHaveBeenCalled()
  ui.rerender(<ResearchEntry {...f.props()} />)
  await screen.findByText(zh.backgroundConnected)
  expect(f.startBackgroundRun).toHaveBeenCalledTimes(1)
})
it('cancels through the explicit command while retaining the subscription until server settlement', async () => {
  const f = fixture(); render(<ResearchEntry {...f.props()} />); await open(); await start()
  fireEvent.click(screen.getByRole('button', { name: zh.cancel }))
  await waitFor(() => { expect(f.cancelBackgroundRun).toHaveBeenCalledWith({ sessionId: sid, backgroundRunId: 'test-background', reason: 'user_requested' }) })
  expect(f.signals[0]!.aborted).toBe(false)
  await screen.findByText(zh.backgroundReason_user_requested)
  expect(screen.queryByRole('button', { name: zh.download })).toBeNull()
})
it('shows service interruption and never resumes or starts automatically', async () => {
  const f = fixture(); f.publish({ ...initialTask(), state: 'interrupted', cancelReason: 'service_stopped' })
  render(<ResearchEntry {...f.props()} />); await open()
  expect(screen.getAllByText(zh.backgroundInterrupted).length).toBeGreaterThan(0)
  expect(f.startBackgroundRun).not.toHaveBeenCalled()
  expect(f.watchBackgroundRun).not.toHaveBeenCalled()
})
it('preserves the running task on watch failure and explicitly reconnects without a new start', async () => {
  const f = fixture(); f.watchBackgroundRun.mockImplementationOnce(async function* () { throw new Error('offline') })
  render(<ResearchEntry {...f.props()} />); await open()
  fireEvent.click(await screen.findByRole('button', { name: zh.start }))
  expect((await screen.findByRole('alert')).textContent).toContain('offline')
  expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.start }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: zh.backgroundReconnect }))
  await screen.findByText(zh.backgroundConnected)
  expect(f.startBackgroundRun).toHaveBeenCalledTimes(1)
})
it('does not admit a duplicate run when its start reply was lost after server persistence', async () => {
  const f = fixture()
  f.startBackgroundRun.mockImplementationOnce(async () => { f.publish(initialTask()); throw new Error('reply lost') })
  render(<ResearchEntry {...f.props()} />); await open()
  fireEvent.click(await screen.findByRole('button', { name: zh.start }))
  await screen.findByText('reply lost')
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.start }).disabled).toBe(true) })
  expect(f.listBackgroundRuns).toHaveBeenCalledTimes(2)
})
it('ignores late get replies after closing and permits viewing saved results despite a missing current approval', async () => {
  const f = fixture(); let release!: (task: AcademicBackgroundRunView) => void
  const pending = new Promise<AcademicBackgroundRunView>((resolve) => { release = resolve })
  f.publish(initialTask()); f.getBackgroundRun.mockReturnValueOnce(pending)
  render(<ResearchEntry {...f.props()} plan={async () => { throw new Error('No current approval') }} />)
  fireEvent.click(screen.getByRole('button', { name: zh.entry }))
  await screen.findByText('No current approval')
  fireEvent.click(screen.getByRole('button', { name: zh.close }))
  await act(async () => { release({ ...initialTask(), state: 'completed', retrievalRunId: sampleRun().retrievalRun.retrievalRunId, result: sampleRun() }); await pending })
  expect(screen.queryByRole('button', { name: zh.download })).toBeNull()
  f.publish({ ...initialTask(), state: 'completed', retrievalRunId: sampleRun().retrievalRun.retrievalRunId, result: sampleRun() })
  await open(); await screen.findByRole('button', { name: zh.download })
  expect(f.startBackgroundRun).not.toHaveBeenCalled()
})
