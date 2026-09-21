// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AcademicResearchRunValue } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import { ResearchEntry, type ResearchEntryProps } from '../src/client/ResearchEntry.tsx'
import { zh, type RunKey } from '../src/client/run-locales.ts'
import { sampleRun } from './run-sample.ts'

const sid = sampleRun().sessionId
const planned = { researchBriefId: sampleRun().retrievalRun.researchBriefId, topic: 'RAG 与幻觉',
  questions: ['何时能减少幻觉？'], searches: [{ query: 'retrieval hallucination', purpose: '查找减少幻觉的效果研究', questions: ['何时能减少幻觉？'] }] }
const loadPlan: ResearchEntryProps['plan'] = async () => planned
function props(run: ResearchEntryProps['run'], current: typeof sid | undefined = sid, blank = false): ResearchEntryProps {
  return { wide: true, t: key => zh[key as RunKey], run, plan: loadPlan,
    useSessions: ((select: (s: unknown) => unknown) => select({ current, byId: { [sid]: { blank }, second: { blank: false } } })) as ResearchEntryProps['useSessions'],
  } as ResearchEntryProps
}
function deferred() {
  let resolve!: (value: AcademicResearchRunValue) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<AcademicResearchRunValue>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function open() { fireEvent.click(screen.getByRole<HTMLButtonElement>('button', { name: '学术研究' })) }
async function start() {
  const button = await screen.findByRole<HTMLButtonElement>('button', { name: '按计划开始研究' })
  fireEvent.click(button)
}
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Session research request lifecycle', () => {
  it.each([false, true])('ignores a late preview after closing (rejected: %s)', async (reject) => {
    let resolve!: (value: typeof planned) => void
    let fail!: (cause: unknown) => void
    const pending = new Promise<typeof planned>((yes, no) => { resolve = yes; fail = no })
    const plan = vi.fn<ResearchEntryProps['plan']>().mockReturnValueOnce(pending).mockResolvedValue(planned)
    const run = vi.fn()
    render(<ResearchEntry {...props(run)} plan={plan} />); open()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    open()
    expect(await screen.findByText(planned.topic)).toBeTruthy()
    await act(async () => {
      if (reject) fail(new Error('old preview'))
      else resolve({ ...planned, topic: '旧会话主题' })
      await pending.catch(() => {})
    })
    expect(screen.queryByText('旧会话主题')).toBeNull()
    expect(screen.queryByText('old preview')).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })

  it('explains a preview transport failure without an Error object', async () => {
    const plan = vi.fn<ResearchEntryProps['plan']>().mockRejectedValue('disconnected')
    render(<ResearchEntry {...props(vi.fn())} plan={plan} />); open()
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', zh.planFailed)
  })

  it('requires a saved Session and has no sample selector', () => {
    const run = vi.fn()
    const view = render(<ResearchEntry {...props(run, sid, true)} />)
    open()
    expect(screen.getByText('请先创建并选择一个已保存的会话。')).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(run).not.toHaveBeenCalled()
    view.rerender(<ResearchEntry {...props(run, undefined, true)} />)
    expect(screen.queryByRole('textbox')).toBeNull()
  })
  it('submits the selected Session, approved plan identity and real-data disclosure then renders returned facts', async () => {
    const d = deferred(), run = vi.fn(() => d.promise)
    render(<ResearchEntry {...props(run)} />); open()
    expect(screen.getByText(zh.loadingPlan)).toBeTruthy()
    await start()
    expect(run).toHaveBeenCalledWith({ sessionId: sid, researchBriefId: planned.researchBriefId,
      synthetic: false }, expect.any(AbortSignal))
    expect(screen.getByRole('status').textContent).toBe('研究运行中')
    fireEvent.submit(screen.getByRole<HTMLButtonElement>('button', { name: zh.start }).closest('form')!)
    expect(run).toHaveBeenCalledTimes(1)
    await act(async () => { d.resolve(sampleRun()); await d.promise })
    expect(screen.getAllByText('部分成功')).toHaveLength(2)
    expect(screen.getAllByText('待审核').length).toBeGreaterThan(0)
  })
  it('shows approved intent and directions without requiring a search expression', async () => {
    const run = vi.fn<ResearchEntryProps['run']>().mockResolvedValue(sampleRun())
    render(<ResearchEntry {...props(run)} />); open()
    expect(await screen.findByText(planned.topic)).toBeTruthy()
    expect(screen.getByText(planned.searches[0]!.purpose)).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText(planned.searches[0]!.query)).toBeNull()
    expect(run).not.toHaveBeenCalled()
    await start()
    await act(async () => { await Promise.resolve() })
    expect(run).toHaveBeenCalledWith({ sessionId: sid, researchBriefId: planned.researchBriefId,
      synthetic: false }, expect.any(AbortSignal))
  })
  it('requires plan repair when preview fails and does not start retrieval', async () => {
    const run = vi.fn()
    render(<ResearchEntry {...props(run)} plan={async () => { throw new Error('请先补齐检索方案并审核。') }} />); open()
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '请先补齐检索方案并审核。')
    expect(screen.queryByRole('button', { name: zh.start })).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })
  it('aborts the actual signal and distinguishes missing final result from a server cancellation result', async () => {
    const d = deferred(), run = vi.fn((_request, signal: AbortSignal) => {
      signal.addEventListener('abort', () => { d.reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
      return d.promise
    })
    render(<ResearchEntry {...props(run)} />); open(); await start()
    await act(async () => { fireEvent.click(screen.getByRole<HTMLButtonElement>('button', { name: '取消研究' })); await d.promise.catch(() => {}) })
    expect(run.mock.calls[0]![1].aborted).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('未收到服务器最终结果')
    expect(screen.queryByText('已完成')).toBeNull()
  })
  it('retains a returned cancelled result including its partial papers', async () => {
    const d = deferred(), run = vi.fn(() => d.promise)
    render(<ResearchEntry {...props(run)} />); open(); await start()
    fireEvent.click(screen.getByRole<HTMLButtonElement>('button', { name: '取消研究' }))
    expect((screen.getByRole<HTMLButtonElement>('button', { name: '正在取消…' })).disabled).toBe(true)
    await act(async () => { d.resolve({ ...sampleRun(), status: 'cancelled', report: null }); await d.promise })
    expect(screen.getByText('已取消')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '下载 Markdown' })).toBeNull()
  })
  it('shows server errors and permits a new request without retaining the old report', async () => {
    const run = vi.fn<ResearchEntryProps['run']>().mockRejectedValueOnce(new Error('Approve the brief first')).mockRejectedValueOnce('transport')
    render(<ResearchEntry {...props(run)} />); open()
    await start()
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('alert').textContent).toContain('Approve the brief first')
    await start()
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('alert').textContent).toContain('研究请求失败')
  })
  it('aborts on close and ignores a late response after reopening', async () => {
    const d = deferred(), run = vi.fn((_request, _signal: AbortSignal) => d.promise)
    render(<ResearchEntry {...props(run)} />); open(); await start()
    fireEvent.click(screen.getByRole<HTMLButtonElement>('button', { name: '关闭' }))
    expect(run.mock.calls[0]![1].aborted).toBe(true)
    open()
    await act(async () => { d.resolve(sampleRun()); await d.promise })
    expect(screen.queryByText('部分成功')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
  it('aborts on Session change and ignores the previous Session rejection', async () => {
    const d = deferred(), run = vi.fn((_request, _signal: AbortSignal) => d.promise)
    const view = render(<ResearchEntry {...props(run)} />); open(); await start()
    view.rerender(<ResearchEntry {...props(run, 'second' as typeof sid)} />)
    expect(run.mock.calls[0]![1].aborted).toBe(true)
    await act(async () => { d.reject(new Error('old session')); await d.promise.catch(() => {}) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/second/)).toBeTruthy()
    const next = deferred()
    run.mockImplementationOnce(() => next.promise)
    await start()
    view.unmount()
    expect(run.mock.calls[1]![1].aborted).toBe(true)
  })
})
