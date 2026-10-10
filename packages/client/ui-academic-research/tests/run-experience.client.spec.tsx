// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Q6DemoEntry } from '../src/client/Q6Page.tsx'
import { ResearchEntry, type ResearchEntryProps } from '../src/client/ResearchEntry.tsx'
import { zh, en, type RunKey } from '../src/client/run-locales.ts'
import { runExperienceSample } from '../src/client/run-experience-sample.ts'

const t: ResearchEntryProps['t'] = key => zh[key as RunKey]
function open() {
  fireEvent.click(screen.getByRole('button', { name: zh.q6_entry }))
  fireEvent.click(screen.getByRole('button', { name: zh.exp_open }))
}
function select(id: string) { fireEvent.change(screen.getByRole('combobox', { name: zh.exp_scenario }), { target: { value: id } }) }
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('phase-one lifecycle preview', () => {
  it('uses the reviewed fixed JSON and paired locale keys', () => {
    expect(runExperienceSample).toEqual(JSON.parse(readFileSync('packages/client/ui-academic-research/tests/fixtures/run-experience.sample.json', 'utf8')))
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })
  it('closing and reopening keeps the same record, counts and running state', () => {
    render(<Q6DemoEntry t={t} />); open()
    expect(screen.getByText(zh.exp_runStatus).nextElementSibling?.textContent).toBe(zh.exp_running)
    fireEvent.click(screen.getByRole('button', { name: zh.close }))
    fireEvent.click(screen.getByRole('button', { name: zh.q6_entry }))
    expect(screen.getByText(zh.exp_runId).nextElementSibling?.textContent).toBe('demo-running')
    expect(screen.getByText(zh.exp_runStatus).nextElementSibling?.textContent).toBe(zh.exp_running)
    expect(screen.getByText(zh.exp_count_evidence).nextElementSibling?.textContent).toBe('12')
  })
  it('connection loss and switching records do not cancel the selected run', () => {
    render(<Q6DemoEntry t={t} />); open()
    fireEvent.click(screen.getByRole('button', { name: zh.exp_disconnect }))
    expect(screen.getByText(zh.exp_connection).nextElementSibling?.textContent).toBe(zh.exp_disconnected)
    expect(screen.getByText(zh.exp_runStatus).nextElementSibling?.textContent).toBe(zh.exp_running)
    select('demo-paused'); select('demo-running')
    expect(screen.getByText(zh.exp_runStatus).nextElementSibling?.textContent).toBe(zh.exp_running)
    expect(screen.getByText(zh.exp_cancelReason).nextElementSibling?.textContent).toBe(zh.exp_notCancelled)
  })
  it('only explicit demo cancellation changes run state and retains earlier evidence', () => {
    render(<Q6DemoEntry t={t} />); open()
    fireEvent.click(screen.getByRole('button', { name: zh.exp_cancel }))
    expect(screen.getByText(zh.exp_runStatus).nextElementSibling?.textContent).toBe(zh.exp_cancelled)
    expect(screen.getByText(zh.exp_cancelReason).nextElementSibling?.textContent).toBe(zh.exp_reason_user_cancelled)
    expect(screen.getByText(zh.exp_count_evidence).nextElementSibling?.textContent).toBe('12')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.exp_cancel }).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: zh.exp_download })).toBeNull()
  })
  it('keeps a limited draft when the preview is closed, revisited or cancelled', () => {
    render(<Q6DemoEntry t={t} />); open(); select('demo-paused')
    fireEvent.click(screen.getByRole('button', { name: zh.exp_cancel }))
    fireEvent.click(screen.getByRole('button', { name: zh.close }))
    fireEvent.click(screen.getByRole('button', { name: zh.q6_entry }))
    expect(screen.getByRole('button', { name: zh.exp_download })).toBeTruthy()
    expect(screen.getByText(zh.exp_report_draft)).toBeTruthy()
    expect(screen.getByText(/This draft exists only for UI development/)).toBeTruthy()
  })
  it('displays unknown cancellations, stage failures and counts without guessing missing values', () => {
    render(<Q6DemoEntry t={t} />); open(); select('demo-cancelled')
    expect(screen.getByText(zh.exp_cancelReason).nextElementSibling?.textContent).toBe(zh.exp_reason_unknown)
    expect(screen.getByText(zh.exp_count_failed).nextElementSibling?.textContent).toBe(zh.progressUnknown)
    expect(screen.getByText(zh.exp_count_candidateLimit).nextElementSibling?.textContent).toBe('30')
    const stages = screen.getByRole('list', { name: zh.exp_stages }).children
    expect(stages).toHaveLength(8)
    expect(within(stages[6] as HTMLElement).getByText(new RegExp(zh.exp_output)).textContent).toContain(zh.progressUnknown)
    expect(screen.queryByRole('progressbar')).toBeNull()
    select('demo-completed_with_limitations')
    expect(screen.getByText(zh.exp_runStatus).nextElementSibling?.textContent).toBe(zh.exp_completed_with_limitations)
    expect(screen.getByText(zh.exp_report_draft)).toBeTruthy()
    select('demo-failed')
    expect(screen.getByText(zh.exp_report_failed)).toBeTruthy()
  })
  it('does not call real plan or run methods, including after a real Session selector changes', () => {
    const plan = vi.fn(), runStream = vi.fn()
    const props = (current: string): ResearchEntryProps => {
      const useSessions = (selectState: (s: unknown) => unknown) => selectState({ current, byId: { [current]: { blank: false } } })
      return { wide: true, t, plan, runStream, useSessions } as ResearchEntryProps
    }
    const view = render(<ResearchEntry {...props('one')} />); open()
    view.rerender(<ResearchEntry {...props('two')} />)
    expect(screen.getByText(zh.exp_runStatus).nextElementSibling?.textContent).toBe(zh.exp_running)
    expect(plan).not.toHaveBeenCalled(); expect(runStream).not.toHaveBeenCalled()
  })
})
