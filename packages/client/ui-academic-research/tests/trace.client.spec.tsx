// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { AcademicTracePage } from '@deepseek-ai/dsh-academic-model'
import { TracePanel } from '../src/client/TracePanel.tsx'
import { zh, type RunKey } from '../src/client/run-locales.ts'
import type { RunPanelProps } from '../src/client/RunPanel.tsx'

const t: RunPanelProps['t'] = key => zh[key as RunKey]
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('real Trace query controls', () => {
  it('reads the requested run, explains old data absence, filters and aborts only the viewer', async () => {
    const signals: AbortSignal[] = []
    const traceList = vi.fn(async (_query, signal: AbortSignal) => {
      signals.push(signal)
      return { status: 'not_found', items: [], events: [], gaps: [] } as unknown as AcademicTracePage
    })
    const traceDetail = vi.fn()
    const { unmount } = render(<TracePanel sessionId={'session-fixture' as never} researchRunId={'run-fixture' as never}
      traceList={traceList} traceDetail={traceDetail} t={t} />)
    expect(traceList).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: zh.traceLoad }))
    await screen.findByText(zh.traceUnavailable)
    expect(traceList.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ sessionId: 'session-fixture', researchRunId: 'run-fixture' }))
    fireEvent.change(screen.getByLabelText(zh.traceStage), { target: { value: 'extraction' } })
    fireEvent.click(screen.getByRole('button', { name: zh.traceLoad }))
    await waitFor(() => { expect(traceList).toHaveBeenCalledTimes(2) })
    expect(traceList.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ stage: 'extraction', cursor: null }))
    expect(signals[0]?.aborted).toBe(true)
    unmount()
    expect(signals[1]?.aborted).toBe(true)
    expect(traceDetail).not.toHaveBeenCalled()
  })
})
