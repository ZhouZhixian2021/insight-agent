// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AcademicResearchRunValue } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import { ResearchEntry, type ResearchEntryProps } from '../src/client/ResearchEntry.tsx'
import { zh, type RunKey } from '../src/client/run-locales.ts'
import { sampleRun } from './run-sample.ts'

const sid = sampleRun().sessionId
function props(run: ResearchEntryProps['run'], current: typeof sid | undefined = sid, blank = false): ResearchEntryProps {
  return { wide: true, t: key => zh[key as RunKey], run,
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
function start(query = '  retrieval  ') {
  fireEvent.change(screen.getByRole<HTMLInputElement>('textbox', { name: '研究查询' }), { target: { value: query } })
  fireEvent.click(screen.getByRole<HTMLButtonElement>('button', { name: '开始研究' }))
}
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Session research request lifecycle', () => {
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
  it('submits the selected Session, trimmed query and real-data disclosure then renders returned facts', async () => {
    const d = deferred(), run = vi.fn(() => d.promise)
    render(<ResearchEntry {...props(run)} />); open()
    expect((screen.getByRole<HTMLButtonElement>('button', { name: '开始研究' })).disabled).toBe(true)
    start()
    expect(run).toHaveBeenCalledWith({ sessionId: sid, query: 'retrieval', synthetic: false }, expect.any(AbortSignal))
    expect(screen.getByRole('status').textContent).toBe('研究运行中')
    fireEvent.submit(screen.getByRole<HTMLInputElement>('textbox').closest('form')!)
    expect(run).toHaveBeenCalledTimes(1)
    await act(async () => { d.resolve(sampleRun()); await d.promise })
    expect(screen.getByText('部分成功')).toBeTruthy()
    expect(screen.getAllByText('待审核').length).toBeGreaterThan(0)
  })
  it('aborts the actual signal and distinguishes missing final result from a server cancellation result', async () => {
    const d = deferred(), run = vi.fn((_request, signal: AbortSignal) => {
      signal.addEventListener('abort', () => { d.reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
      return d.promise
    })
    render(<ResearchEntry {...props(run)} />); open(); start()
    await act(async () => { fireEvent.click(screen.getByRole<HTMLButtonElement>('button', { name: '取消研究' })); await d.promise.catch(() => {}) })
    expect(run.mock.calls[0]![1].aborted).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('未收到服务器最终结果')
    expect(screen.queryByText('已完成')).toBeNull()
  })
  it('retains a returned cancelled result including its partial papers', async () => {
    const d = deferred(), run = vi.fn(() => d.promise)
    render(<ResearchEntry {...props(run)} />); open(); start()
    fireEvent.click(screen.getByRole<HTMLButtonElement>('button', { name: '取消研究' }))
    expect((screen.getByRole<HTMLButtonElement>('button', { name: '正在取消…' })).disabled).toBe(true)
    await act(async () => { d.resolve({ ...sampleRun(), status: 'cancelled', report: null }); await d.promise })
    expect(screen.getByText('已取消')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '下载 Markdown' })).toBeNull()
  })
  it('shows server errors and permits a new request without retaining the old report', async () => {
    const run = vi.fn<ResearchEntryProps['run']>().mockRejectedValueOnce(new Error('Approve the brief first')).mockRejectedValueOnce('transport')
    render(<ResearchEntry {...props(run)} />); open()
    await act(async () => { start() })
    expect(screen.getByRole('alert').textContent).toContain('Approve the brief first')
    await act(async () => { start('again') })
    expect(screen.getByRole('alert').textContent).toContain('研究请求失败')
  })
  it('aborts on close and ignores a late response after reopening', async () => {
    const d = deferred(), run = vi.fn((_request, _signal: AbortSignal) => d.promise)
    render(<ResearchEntry {...props(run)} />); open(); start()
    fireEvent.click(screen.getByRole<HTMLButtonElement>('button', { name: '关闭' }))
    expect(run.mock.calls[0]![1].aborted).toBe(true)
    open()
    await act(async () => { d.resolve(sampleRun()); await d.promise })
    expect(screen.queryByText('部分成功')).toBeNull()
    expect((screen.getByRole<HTMLInputElement>('textbox')).value).toBe('')
  })
  it('aborts on Session change and ignores the previous Session rejection', async () => {
    const d = deferred(), run = vi.fn((_request, _signal: AbortSignal) => d.promise)
    const view = render(<ResearchEntry {...props(run)} />); open(); start()
    view.rerender(<ResearchEntry {...props(run, 'second' as typeof sid)} />)
    expect(run.mock.calls[0]![1].aborted).toBe(true)
    await act(async () => { d.reject(new Error('old session')); await d.promise.catch(() => {}) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/second/)).toBeTruthy()
    start('new session')
    view.unmount()
    expect(run.mock.calls[1]![1].aborted).toBe(true)
  })
})
