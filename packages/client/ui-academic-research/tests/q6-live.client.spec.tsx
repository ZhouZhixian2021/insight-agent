// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { AcademicResearchRunFrame, AcademicQ6Projection } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import { Q6Live } from '../src/client/Q6Live.tsx'
import { ResearchEntry, type ResearchEntryProps } from '../src/client/ResearchEntry.tsx'
import { RunPanel } from '../src/client/RunPanel.tsx'
import { zh, type RunKey } from '../src/client/run-locales.ts'
import { liveProjection } from './q6-live.fixture.client.ts'
import { sampleRun } from './run-sample.ts'

const t: ResearchEntryProps['t'] = key => zh[key as RunKey]
afterEach(cleanup)
function props(runStream: ResearchEntryProps['runStream']): ResearchEntryProps {
  const result = sampleRun()
  return { wide: true, t, runStream, plan: async () => ({ researchBriefId: result.retrievalRun.researchBriefId,
    topic: 'Real Remote preview', questions: [], searches: [] }),
  useSessions: ((select: (s: unknown) => unknown) => select({ current: result.sessionId,
    byId: { [result.sessionId]: { blank: false } } })) as ResearchEntryProps['useSessions'] } as ResearchEntryProps
}
async function start() {
  fireEvent.click(screen.getByRole('button', { name: zh.entry }))
  fireEvent.click(await screen.findByRole('button', { name: zh.start }))
}

describe('formal Q6 projection', () => {
  it('keeps an unmatched-evidence question uncovered even when candidates match both questions', () => {
    const p = liveProjection()
    if (p.candidates.state !== 'available' || p.coverage.state !== 'available') throw new Error('fixture sections')
    const coverage = p.coverage.value
    const projection: AcademicQ6Projection = { ...p,
      candidates: { state: 'available', value: { ...p.candidates.value, items: p.candidates.value.items.map(item => ({ ...item,
        evaluation: { ...item.evaluation, matchedQuestions: coverage.questions.map(q => q.question) } })) } },
      coverage: { state: 'available', value: { ...coverage, allQuestionsCovered: false, questions: coverage.questions.map((q, i) => i === 0 ? q
        : { ...q, status: 'uncovered', supportingWorkIds: [], evidenceIds: [], gaps: ['No evidence explicitly supports question 2.'] }) } } }
    render(<Q6Live projection={projection} t={t} />)
    const region = screen.getByRole('region', { name: zh.q6_coverage })
    const question = within(region).getByRole('heading', { name: coverage.questions[1]!.question }).closest('article')!
    expect(question.textContent).toContain(zh.q6_uncovered)
    expect(question.textContent).toContain('No evidence explicitly supports question 2.')
    expect(question.textContent).not.toContain('evidence-candidate-a-1')
    expect(question.textContent).not.toContain(zh.q6_covered)
    expect(region.textContent).toContain(coverage.questions[0]!.evidenceIds[0])
    fireEvent.click(screen.getByRole('button', { name: zh.q6_candidates }))
    expect(screen.getByRole('heading', { name: 'Synthetic candidate 1' })).toBeTruthy()
    expect(screen.queryByText(zh.q6_missingTitles)).toBeNull()
    expect(screen.queryByText(zh.q6_demoNotice)).toBeNull()
  })
  it('distinguishes pending, failure, truncation and available empty coverage without sample fallback', () => {
    const p = liveProjection()
    const view = render(<Q6Live projection={{ ...p, coverage: { state: 'pending' } }} t={t} />)
    expect(screen.getByRole('status').textContent).toBe(zh.q6_sectionPending)
    view.rerender(<Q6Live projection={{ ...p, coverage: { state: 'failed', code: 'NO_COVERAGE', message: 'Missing settlement', retryable: false } }} t={t} />)
    expect(screen.getByRole('alert').textContent).toContain('NO_COVERAGE')
    if (p.coverage.state !== 'available') throw new Error('fixture coverage')
    view.rerender(<Q6Live projection={{ ...p, coverage: { state: 'truncated', value: { ...p.coverage.value, questions: [] }, reason: 'Result bound' } }} t={t} />)
    expect(screen.getByRole('note').textContent).toContain('Result bound')
    expect(screen.getByText(zh.q6_noCoverage)).toBeTruthy()
  })
  it('replaces Q6 snapshots monotonically and accepts the terminal projection without starting a second run', async () => {
    const p = liveProjection(), result = sampleRun()
    const runStream = vi.fn(async function* (): AsyncIterable<AcademicResearchRunFrame> {
      yield { type: 'q6', projection: { ...p, sequence: 2 } }
      yield { type: 'q6', projection: { ...p, sequence: 1, coverage: { state: 'failed', code: 'STALE', message: 'Old', retryable: false } } }
      yield { type: 'result', retrievalRunId: p.retrievalRunId, value: { ...result, q6: { ...p, sequence: 3, status: 'settled' } } }
    })
    render(<ResearchEntry {...props(runStream)} />); await start()
    expect(await screen.findByRole('region', { name: zh.q6_liveTitle })).toBeTruthy()
    expect(await screen.findByRole('button', { name: zh.download })).toBeTruthy()
    expect(screen.queryByText(/STALE/)).toBeNull()
    expect(runStream).toHaveBeenCalledTimes(1)
  })
  it.each(['session', 'run', 'brief'] as const)('rejects a Q6 frame for another %s', async (field) => {
    const p = liveProjection()
    const foreign = { ...p, ...field === 'session' ? { sessionId: 'foreign' as typeof p.sessionId }
      : field === 'run' ? { retrievalRunId: 'foreign' as typeof p.retrievalRunId } : { researchBriefId: 'foreign' as typeof p.researchBriefId } }
    const runStream = async function* (): AsyncIterable<AcademicResearchRunFrame> {
      yield { type: 'q6', projection: p }; yield { type: 'q6', projection: foreign }
    }
    render(<ResearchEntry {...props(runStream)} />); await start()
    expect((await screen.findByRole('alert')).textContent).toContain(zh.streamMismatch)
  })
  it('preserves a received Q6 snapshot on disconnect and shows no fabricated final report', async () => {
    const runStream = async function* (): AsyncIterable<AcademicResearchRunFrame> {
      yield { type: 'q6', projection: liveProjection() }; throw new TypeError('Connection lost')
    }
    render(<ResearchEntry {...props(runStream)} />); await start()
    expect((await screen.findByRole('alert')).textContent).toContain(zh.streamDisconnected)
    expect(screen.getByRole('region', { name: zh.q6_liveTitle })).toBeTruthy()
    expect(screen.queryByRole('button', { name: zh.download })).toBeNull()
  })
  it('shows final-only Q6 projections and explicit legacy unavailability', () => {
    const result = sampleRun()
    const view = render(<RunPanel view={{ phase: 'settled', value: { ...result, q6: liveProjection() } }} t={t} onCancel={vi.fn()} />)
    expect(screen.getByRole('region', { name: zh.q6_liveTitle })).toBeTruthy()
    view.rerender(<RunPanel view={{ phase: 'settled', value: { ...result, q6: null } }} t={t} onCancel={vi.fn()} />)
    expect(screen.getByText(zh.q6_liveUnavailable)).toBeTruthy()
    expect(screen.queryByRole('region', { name: zh.q6_liveTitle })).toBeNull()
  })
  it('ignores a late Q6 frame after closing the form', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const runStream = async function* (): AsyncIterable<AcademicResearchRunFrame> { await gate; yield { type: 'q6', projection: liveProjection() } }
    render(<ResearchEntry {...props(runStream)} />); await start()
    fireEvent.click(screen.getByRole('button', { name: zh.close }))
    await act(async () => { release() })
    fireEvent.click(screen.getByRole('button', { name: zh.entry }))
    expect(screen.queryByRole('region', { name: zh.q6_liveTitle })).toBeNull()
  })
})
