// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnhancementPanel, type EnhancementPanelProps } from '../src/client/EnhancementPanel.tsx'
import { projectEnhancement, type EnhancementHistory } from '../src/client/enhancement-history.ts'
import { zh, type RunKey } from '../src/client/run-locales.ts'
import { sampleRun } from './run-sample.ts'

afterEach(cleanup)
const value = sampleRun()
const key = { sessionId: value.sessionId, retrievalRunId: value.retrievalRun.retrievalRunId }
const paper = value.papers.find(item => item.status === 'extracted' || item.status === 'partially_extracted')!
const t: EnhancementPanelProps['t'] = name => zh[name as RunKey]
function history(status: EnhancementHistory['status'] = 'completed'): EnhancementHistory {
  return { workVersionId: paper.workVersionId, selectedAt: '2026-10-15T00:00:00Z', status,
    addedEvidenceRecords: 1, incompleteFragments: status === 'partial_success' ? 1 : 0,
    excerpts: [{ evidenceId: 'supplement-1', workVersionId: paper.workVersionId, level: 'fulltext',
      statement: 'Fixed additional finding', excerpt: 'Exact supplemental source', locator: 'page-2' }] }
}
async function choose() {
  await waitFor(() => { expect(screen.queryByText(zh.enhance_loading)).toBeNull() })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: paper.workVersionId } })
}

describe('selected-paper enhancement', () => {
  it.each(['completed', 'partial_success', 'failed', 'cancelled'] as const)('submits once and keeps durable %s separate from the original report', async (status) => {
    const pending = Promise.withResolvers<{ sessionId: typeof key.sessionId
      retrievalRunId: typeof key.retrievalRunId
      workVersionId: typeof paper.workVersionId
      status: 'completed' | 'partial_success'
      initialEvidenceRecords: number
      addedEvidenceRecords: number
      incompleteFragments: number }>()
    const enhanceEvidence = vi.fn(() => pending.promise)
    const enhancementHistory = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(history(status))
    const before = JSON.stringify(value)
    const ui = render(<><p>Original draft remains</p><EnhancementPanel value={value}
      enhanceEvidence={enhanceEvidence} enhancementHistory={enhancementHistory} t={t} /></>)
    await choose()
    const button = screen.getByRole('button', { name: zh.enhance_start })
    fireEvent.click(button); fireEvent.click(button)
    expect(enhanceEvidence).toHaveBeenCalledTimes(1)
    expect(enhanceEvidence).toHaveBeenCalledWith({ ...key, workVersionId: paper.workVersionId }, expect.any(AbortSignal))
    expect(screen.getByText('Original draft remains')).toBeTruthy()
    await act(async () => {
      if (status === 'failed' || status === 'cancelled') pending.reject(new Error('timeout or cancelled'))
      else pending.resolve({ ...key, workVersionId: paper.workVersionId, status, initialEvidenceRecords: 1,
        addedEvidenceRecords: 1, incompleteFragments: status === 'partial_success' ? 1 : 0 })
    })
    expect(await screen.findByText(zh[`enhance_${status}`])).toBeTruthy()
    expect(screen.getByText('Exact supplemental source')).toBeTruthy()
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(JSON.stringify(value)).toBe(before)
    ui.unmount()
    render(<EnhancementPanel value={value} enhanceEvidence={enhanceEvidence}
      enhancementHistory={vi.fn().mockResolvedValue(history(status))} t={t} />)
    await screen.findByText(zh[`enhance_${status}`])
    expect(enhanceEvidence).toHaveBeenCalledTimes(1)
  })

  it('aborts only the enhancement request on unmount and ignores a late response', async () => {
    const pending = Promise.withResolvers<never>()
    const enhanceEvidence = vi.fn((_request: unknown, _signal: AbortSignal) => pending.promise)
    const ui = render(<EnhancementPanel value={value} enhanceEvidence={enhanceEvidence}
      enhancementHistory={vi.fn().mockResolvedValue(null)} t={t} />)
    await choose(); fireEvent.click(screen.getByRole('button', { name: zh.enhance_start }))
    const signal = enhanceEvidence.mock.calls[0]![1]
    ui.unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => { pending.reject(new Error('late failure')) })
    expect(enhanceEvidence).toHaveBeenCalledTimes(1)
  })

  it('requires successful history discovery and never treats an unsettled selection as retryable', async () => {
    const enhanceEvidence = vi.fn()
    const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(history('unsettled'))
    render(<EnhancementPanel value={value} enhanceEvidence={enhanceEvidence} enhancementHistory={read} t={t} />)
    await screen.findByText('offline')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.enhance_start }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: zh.enhance_refresh }))
    await screen.findByText(zh.enhance_unsettled)
    expect(enhanceEvidence).not.toHaveBeenCalled()
  })
})

it('projects only verified additions inside the selected run and restores failed settlement counts', () => {
  const event = (type: string, seq: number, data: unknown) => ({ event: { type, seq, data } })
  const selected = { ...key, workVersionId: paper.workVersionId, selectedAt: 'now' }
  const record = { evidenceId: 'new', workVersionId: paper.workVersionId, level: 'fulltext',
    sourcedStatement: 'Finding', verbatimExcerpt: { status: 'available', value: 'Exact text' }, sourceLocatorId: 'loc' }
  const fragment = { purpose: 'enhancement', source: { workVersionId: paper.workVersionId }, evidence: { evidenceRecords: [record] } }
  const entries = [event('academic/evidence-fragment-verified', 1, fragment),
    event('academic/evidence-enhancement-selection', 2, selected),
    event('academic/evidence-fragment-verified', 3, { ...fragment, purpose: undefined }),
    event('academic/evidence-fragment-verified', 4, fragment),
    event('academic/evidence-enhancement-settlement', 5, { ...selected, status: 'failed', addedEvidenceRecords: 0, incompleteFragments: 0 }),
    event('academic/evidence-fragment-verified', 6, { ...fragment, evidence: { evidenceRecords: [{ ...record, evidenceId: 'later' }] } })]
  const projected = projectEnhancement(entries, key)
  expect(projected?.status).toBe('failed')
  expect(projected?.addedEvidenceRecords).toBe(0)
  expect(projected?.excerpts.map(item => item.evidenceId)).toEqual(['new'])
  expect(projectEnhancement(entries, { ...key, retrievalRunId: 'other' as typeof key.retrievalRunId })).toBeNull()
  expect(() => projectEnhancement([...entries, event('academic/evidence-enhancement-selection', 7, selected)], key)).toThrow('Ambiguous')
})
