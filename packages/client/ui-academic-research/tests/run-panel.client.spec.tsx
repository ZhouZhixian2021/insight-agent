// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { Blob as NodeBlob } from 'node:buffer'
import { RunPanel, downloadMarkdown, type RunPanelProps } from '../src/client/RunPanel.tsx'
import { sampleRun } from './run-sample.ts'
import { scenarioView, scenarios } from './run-scenarios.client.ts'
import { zh, en, type RunKey } from '../src/client/run-locales.ts'

const t: RunPanelProps['t'] = key => zh[key as RunKey]
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('fixed research result presentation', () => {
  it('matches A’s handoff exactly and keeps fixture mutations isolated', () => {
    const agreed = JSON.parse(readFileSync('z-team_docs/interface-samples/academic-model-v1/c-academic-research-run.sample.json', 'utf8')) as { expectedValue: unknown }
    expect(sampleRun()).toEqual(agreed.expectedValue)
    for (const scenario of scenarios) expect(scenarioView(scenario)).toBeDefined()
    expect(sampleRun()).toEqual(agreed.expectedValue)
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('separates completed, partial retrieval and pending report review', () => {
    render(<RunPanel view={scenarioView('partial_success')} onCancel={vi.fn()} t={t} />)
    expect(screen.getAllByRole('definition').slice(0, 3).map(node => node.textContent))
      .toEqual(['已完成', '部分成功', '待审核'])
  })

  it('shows producer counts and source failure even when paper failures are empty', () => {
    const { container } = render(<RunPanel view={scenarioView('partial_success')} onCancel={vi.fn()} t={t} />)
    expect(screen.getByText('已完成')).toBeTruthy()
    expect(screen.getByText('部分成功')).toBeTruthy()
    expect(screen.getAllByText(/待审核/).length).toBeGreaterThan(0)
    for (const [label, count] of [['发现记录', '5'], ['去重后论文', '2'], ['实际纳入', '1']]) {
      expect(screen.getByText(label!).parentElement?.querySelector('dd')?.textContent).toBe(count)
    }
    expect(screen.getByText('pmlr')).toBeTruthy()
    expect(screen.getByText('未提供逐来源统计。')).toBeTruthy()
    expect(screen.getByText('检索覆盖受限或提前截断')).toBeTruthy()
    expect(screen.getByText('已排除')).toBeTruthy()
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
    expect(screen.queryByText('人工审核通过')).toBeNull()
  })

  it('pending has only a waiting message and cancel, without premature facts', () => {
    const cancel = vi.fn()
    render(<RunPanel view={{ phase: 'running' }} onCancel={cancel} t={t} />)
    expect(screen.getByRole('status').textContent).toBe('研究运行中')
    expect(screen.queryByText('覆盖统计')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '取消研究' }))
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each(['cancelled', 'failed'] as const)('%s retains facts and does not invent a report', (scenario) => {
    render(<RunPanel view={scenarioView(scenario)} onCancel={vi.fn()} t={t} />)
    expect(screen.getAllByText('未返回报告').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '下载 Markdown' })).toBeNull()
    if (scenario === 'cancelled') expect(screen.getByText('已提取')).toBeTruthy()
    else expect(screen.getByText('未返回论文处理结果')).toBeTruthy()
  })

  it('success is not report approval; blocked and transport error stay distinct', () => {
    const view = render(<RunPanel view={scenarioView('success')} onCancel={vi.fn()} t={t} />)
    expect(screen.getByText('成功')).toBeTruthy()
    expect(screen.getAllByText(/待审核/).length).toBeGreaterThan(0)
    view.rerender(<RunPanel view={scenarioView('blocked')} onCancel={vi.fn()} t={t} />)
    expect(screen.getAllByText(/阻止交付/).length).toBeGreaterThan(0)
    view.rerender(<RunPanel view={scenarioView('error')} onCancel={vi.fn()} t={t} />)
    expect(screen.getByRole('alert').textContent).toContain('Synthetic Remote request failure')
    expect(screen.queryByText('覆盖统计')).toBeNull()
  })

  it('filters content, opens referenced evidence and renders source text without HTML execution', () => {
    const value = sampleRun()
    const report = value.report
    render(<RunPanel view={{ phase: 'settled', value: { ...value, report: { ...report,
      claims: report.claims.map(claim => ({ ...claim, text: '<script>attack()</script>' })),
    } } }} onCancel={vi.fn()} t={t} />)
    expect(screen.getByText('<script>attack()</script>')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'unmatched-input' } })
    expect(screen.getByText('没有匹配的结论或证据')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('link', { name: /^证据:/ }))
    expect(document.querySelector('details[id^="academic-evidence-"]')?.hasAttribute('open')).toBe(true)
    expect(screen.getByText(/Synthetic source text reports/)).toBeTruthy()
  })

  it('downloads exactly the producer Markdown and revokes the object URL', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('Blob', NodeBlob)
    const objects: Blob[] = []
    const create = vi.fn((blob: Blob) => { objects.push(blob); return 'blob:test' })
    const revoke = vi.fn()
    vi.stubGlobal('URL', class extends URL { static override createObjectURL = create; static override revokeObjectURL = revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('academic-report.md')
    })
    downloadMarkdown('fixed markdown')
    expect(click).toHaveBeenCalledOnce()
    expect(await objects[0]!.text()).toBe('fixed markdown')
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:test')
  })

  it('preserves missing evidence, absent excerpts, non-retryable failures and paper-level failures', () => {
    const value = sampleRun()
    const record = value.report.evidence[0]!
    const view = { ...value, failures: [{ workVersionId: record.workVersionId, stage: 'fulltext' as const }],
      retrievalRun: { ...value.retrievalRun, stage: 'running' as const, status: null, completedAt: null,
        coverageSummary: { ...value.retrievalRun.coverageSummary, limitations: [] },
        failures: value.retrievalRun.failures.map(f => ({ ...f, retryable: false, retryAfter: '2026-09-17T03:00:00Z' })),
      },
      report: { ...value.report, synthetic: false, limitations: [],
        evaluation: { ...value.report.evaluation, status: 'ready' as const, assessments: [], issues: [] },
        claims: value.report.claims.map(claim => ({ ...claim, uncertainty: null, confidenceReasons: [],
          evidenceSnapshot: { ...claim.evidenceSnapshot, evidenceItems: [{ ...claim.evidenceSnapshot.evidenceItems[0]!, evidenceId: 'missing' as typeof record.evidenceId }] },
        })),
        evidence: [{ ...record, sourceUrl: 'javascript:alert(1)', verbatimExcerpt: { status: 'not_extracted' as const }, qualityNotes: ['Extraction incomplete'] }],
      },
    }
    render(<RunPanel view={{ phase: 'settled', value: view }} onCancel={vi.fn()} t={t} />)
    expect(screen.getByText(/返回结果中缺少对应证据/)).toBeTruthy()
    expect(screen.getByText('未提供可用原文摘录')).toBeTruthy()
    expect(screen.getByText('不可重试')).toBeTruthy()
    expect(screen.getByText(/建议重试时间/)).toBeTruthy()
    expect(screen.getByText('Extraction incomplete')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).toBeNull()
    expect(screen.getByText('未提供结论评测')).toBeTruthy()
    expect(screen.getAllByText(/可交付/).length).toBeGreaterThan(0)
  })

  it('handles an empty report, localized English copy and download from the visible report', () => {
    const value = sampleRun()
    const tEnglish: RunPanelProps['t'] = key => en[key as RunKey]
    const display = render(<RunPanel view={{ phase: 'settled', value: { ...value,
      report: { ...value.report, claims: [], evidence: [] },
    } }} onCancel={vi.fn()} t={tEnglish} />)
    expect(screen.getByText('No claims returned')).toBeTruthy()
    expect(screen.getByText('No evidence returned')).toBeTruthy()
    display.rerender(<RunPanel view={scenarioView('partial_success')} onCancel={vi.fn()} t={t} />)
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:report')
    vi.stubGlobal('URL', class extends URL {
      static override createObjectURL = create
      static override revokeObjectURL = vi.fn()
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: '下载 Markdown' }))
    expect(create).toHaveBeenCalledOnce()
    vi.runAllTimers()
  })
})
