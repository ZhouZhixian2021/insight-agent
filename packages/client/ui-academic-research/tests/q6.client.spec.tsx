// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Q6DemoEntry, Q6Page } from '../src/client/Q6Page.tsx'
import { Q6Candidates } from '../src/client/Q6Candidates.tsx'
import { Q6Coverage } from '../src/client/Q6Coverage.tsx'
import { Q6Plan } from '../src/client/Q6Plan.tsx'
import { ResearchEntry, type ResearchEntryProps } from '../src/client/ResearchEntry.tsx'
import { q6Sample } from '../src/client/q6-sample.ts'
import { zh, en, type RunKey } from '../src/client/run-locales.ts'

const t: ResearchEntryProps['t'] = key => zh[key as RunKey]
const sample = () => structuredClone(q6Sample)
afterEach(cleanup)

describe('Q6 fixed JSON read-only preview', () => {
  it('bundles exactly the agreed JSON and keeps dictionary keys paired', () => {
    expect(q6Sample).toEqual(JSON.parse(readFileSync('z-team_docs/interface-samples/academic-model-v1/academic-query-workflow-v1.sample.json', 'utf8')))
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })
  it('opens without a Session or Remote request and remains clearly synthetic', () => {
    const plan = vi.fn(), runStream = vi.fn()
    render(<ResearchEntry {...({ wide: true, t, plan, runStream,
      useSessions: (() => undefined) as ResearchEntryProps['useSessions'] } as ResearchEntryProps)} />)
    fireEvent.click(screen.getByRole('button', { name: zh.q6_entry }))
    expect(screen.getByRole('dialog', { name: zh.q6_title })).toBeTruthy()
    expect(screen.getByRole('note').textContent).toContain('固定合成 JSON')
    expect(plan).not.toHaveBeenCalled(); expect(runStream).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: zh.start })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh.close }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('distinguishes three inclusion targets and the three query channels without granting approval', () => {
    render(<Q6Page data={sample()} t={t} />)
    expect(screen.getByText(zh.q6_approvalUnknown)).toBeTruthy()
    for (const kind of ['academic', 'web_discovery', 'site_restricted'] as const) expect(screen.getAllByText(new RegExp(zh[`q6_${kind}`])).length).toBeGreaterThan(0)
    for (const target of ['minimum', 'target', 'maximum'] as const) expect(screen.getByText(zh[`q6_${target}`]).nextElementSibling?.textContent).toBe(String(q6Sample.plan.inclusionTargets[target]))
    expect(screen.getByText(/aclanthology.org/)).toBeTruthy()
  })
  it('preserves authoritative queue order despite score order and applies filters only to display', () => {
    const data = sample(), first = data.rankingResult.evaluations[0]!, second = data.rankingResult.evaluations[1]!
    const reordered = { ...data, rankingResult: { ...data.rankingResult,
      queues: { ...data.rankingResult.queues, p0: [second.workVersionId, first.workVersionId], p1: [] } } }
    render(<Q6Candidates data={reordered} t={t} />)
    const queue = screen.getByRole('region', { name: zh.q6_p0 })
    expect(within(queue).getAllByRole('heading', { level: 5 }).filter(h => h.textContent?.startsWith('work-version-')).map(h => h.textContent)).toEqual([second.workVersionId, first.workVersionId])
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: second.workVersionId } })
    expect(within(queue).getAllByRole('heading', { level: 5 }).filter(h => h.textContent?.startsWith('work-version-')).map(h => h.textContent)).toEqual([second.workVersionId])
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing-matches' } })
    expect(screen.getByRole('status').textContent).toBe(zh.q6_noMatches)
    expect(reordered.rankingResult.queues.p0).toEqual([second.workVersionId, first.workVersionId])
  })
  it('explains trusted metadata absence, hard exclusion and unresolved full text', () => {
    render(<Q6Candidates data={sample()} t={t} />)
    expect(screen.getAllByText(/关键词/).length).toBeGreaterThan(0)
    expect(screen.getByText(/全文入口未解析/)).toBeTruthy()
    expect(screen.getByText(/命中排除术语/)).toBeTruthy()
    const p1 = screen.getByRole('region', { name: zh.q6_p1 })
    fireEvent.click(within(p1).getByText(zh.q6_details))
    expect(p1.textContent).toContain('The provider adapter does not retain keywords.')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'excluded' } })
    expect(screen.queryByRole('region', { name: zh.q6_p0 })).toBeNull()
    expect(screen.getByRole('region', { name: zh.q6_excluded })).toBeTruthy()
  })
  it('selects absolute snapshots without accumulating counts or replacing separately assessed coverage', () => {
    render(<Q6Coverage data={sample()} t={t} />)
    const funnel = screen.getByRole('region', { name: zh.q6_funnel })
    expect(within(funnel).getByText(zh.q6_extractionCount).nextElementSibling?.textContent).toBe(zh.progressUnknown)
    const count = () => within(funnel).getByText(zh.q6_count_discoveredRecords).nextElementSibling?.textContent
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } })
    expect(count()).toBe('12')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })
    expect(count()).toBe('12')
    expect(screen.getByText('No independent empirical comparison is available.')).toBeTruthy()
    expect(screen.getAllByText(zh.q6_stop_candidate_exhausted).length).toBeGreaterThan(0)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
  it('shows missing evaluations and empty datasets explicitly without inventing data', () => {
    const data = sample()
    render(<Q6Candidates data={{ ...data, rankingResult: { ...data.rankingResult, evaluations: [] } }} t={t} />)
    expect(screen.getAllByText(/缺少对应评估/)).toHaveLength(3)
    cleanup()
    render(<Q6Coverage data={{ ...data, progressEvents: [], coverage: { ...data.coverage, questions: [] } }} t={t} />)
    expect(screen.getByText(zh.q6_noSnapshots)).toBeTruthy()
    expect(screen.getByText(zh.q6_noCoverage)).toBeTruthy()
    cleanup()
    render(<Q6Plan plan={{ ...data.plan, queries: [] }} t={t} />)
    expect(screen.getByText(zh.q6_noQueries)).toBeTruthy()
  })
  it('renders malicious-looking sample text as text and supports an English demo', () => {
    const data = sample()
    const hostile = { ...data, rankingResult: { ...data.rankingResult, limitations: ['<script>attack()</script>'] } }
    const { container } = render(<Q6Candidates data={hostile} t={t} />)
    expect(screen.getByText('<script>attack()</script>')).toBeTruthy()
    expect(container.querySelector('script')).toBeNull()
    cleanup()
    render(<Q6DemoEntry t={key => en[key as RunKey]} />)
    fireEvent.click(screen.getByRole('button', { name: en.q6_entry }))
    expect(screen.getByRole('dialog', { name: en.q6_title })).toBeTruthy()
  })
})
