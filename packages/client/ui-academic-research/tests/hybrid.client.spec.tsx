// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within, fireEvent } from '@testing-library/react'
import type { AcademicHybridRetrievalView, AcademicResearchPlanView } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import { SearchPolicies, HybridRetrieval } from '../src/client/HybridRetrieval.tsx'
import { RunPanel, type RunPanelProps } from '../src/client/RunPanel.tsx'
import { reportWithRetrieval } from '../src/client/retrieval-report.ts'
import { zh, type RunKey } from '../src/client/run-locales.ts'
import { sampleRun } from './run-sample.ts'

const sample = JSON.parse(readFileSync('z-team_docs/interface-samples/academic-model-v1/hybrid-retrieval-v1.sample.json', 'utf8')) as {
  planView: AcademicResearchPlanView
  hybridRetrieval: AcademicHybridRetrievalView
}
const t: RunPanelProps['t'] = key => zh[key as RunKey]
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('approved hybrid discovery presentation', () => {
  it('separates direct providers, verification providers, questions and per-query limits', () => {
    render(<SearchPolicies searches={sample.planView.searches} t={t} />)
    expect(screen.getByText('openalex, arxiv')).toBeTruthy()
    expect(screen.getByText('openalex, arxiv, acl, pmlr, cvf')).toBeTruthy()
    expect(screen.getByText(zh.discoveryOnly)).toBeTruthy()
    expect(screen.getByText('8')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    fireEvent.click(screen.getByText(zh.queryExpression))
    expect(screen.getByText(sample.planView.searches[0]!.query)).toBeTruthy()
  })
  it('preserves absent legacy policy and projection rather than inventing zero activity', () => {
    const search = sample.planView.searches[0]!
    render(<><SearchPolicies searches={[{ query: search.query, purpose: search.purpose, questions: search.questions }]} t={t} />
      <HybridRetrieval value={undefined} t={t} /></>)
    expect(screen.getByText(zh.legacyPolicy)).toBeTruthy()
    expect(screen.getByText(zh.hybridUnavailable)).toBeTruthy()
    expect(screen.queryByText(zh.verifiedReferences)).toBeNull()
  })
  it('uses explicit stage settlements and keeps references distinct from works', () => {
    render(<HybridRetrieval value={sample.hybridRetrieval} t={t} />)
    const count = screen.getByText(zh.verifiedReferences).parentElement!
    expect(within(count).getByText('4')).toBeTruthy()
    expect(within(screen.getByText(zh.deduplicatedWorks).parentElement!).getByText('8')).toBeTruthy()
    expect(screen.getAllByText(zh.merged_duplicate)).toHaveLength(2)
    expect(screen.getByText(zh.verification_failed)).toBeTruthy()
    expect(screen.getByText(zh.referenceUnits)).toBeTruthy()
    expect(screen.getByText(zh.settledStages)).toBeTruthy()
  })
  it('shows an unverified official reference as unverified and does not activate unsafe URLs', () => {
    const reference = sample.hybridRetrieval.references[0]!
    render(<HybridRetrieval t={t} value={{ ...sample.hybridRetrieval,
      webCandidates: [{ url: 'javascript:alert(1)', title: null, status: 'discovered', identifiedReferenceCount: 0, message: null }],
      references: [{ kind: reference.kind, normalizedValue: reference.normalizedValue, status: 'identified', verificationProvider: null, discoveryUrl: '', message: 'Verification budget reached' }],
    }} />)
    expect(screen.getByText(zh.identified)).toBeTruthy()
    expect(screen.getByText('Verification budget reached')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText(zh.verified)).toBeNull()
  })
  it('retains academic success when Web fails, discloses coverage and preserves report quality', () => {
    const value = { ...sampleRun(), hybridRetrieval: { ...sample.hybridRetrieval,
      stages: { ...sample.hybridRetrieval.stages, academicSearch: 'success' as const, webDiscovery: 'failed' as const },
    } }
    const report = reportWithRetrieval(value, t)!
    expect(report.markdown.startsWith(value.report.markdown)).toBe(true)
    expect(report.markdown).toContain(`${zh.webDiscovery}: ${zh.failed}`)
    expect(report.markdown).toContain(zh.coverageNotProven)
    expect(report.markdown).not.toContain('https://example.org/synthetic-commentary')
    expect(report.evaluation).toBe(value.report.evaluation)
    render(<RunPanel view={{ phase: 'settled', value }} onCancel={vi.fn()} t={t} />)
    expect(screen.getByText((_text, element) => element?.tagName === 'PRE' && element.textContent === report.markdown)).toBeTruthy()
    expect(screen.getByRole('button', { name: zh.download })).toBeTruthy()
    expect(reportWithRetrieval({ ...value, report: null }, t)).toBeNull()
  })
  it('never renders terminal statistics while the request is still running', () => {
    render(<RunPanel view={{ phase: 'running' }} onCancel={vi.fn()} t={t} />)
    expect(screen.getByText(zh.waiting)).toBeTruthy()
    expect(screen.queryByText(zh.verifiedReferences)).toBeNull()
  })
  it('downloads the displayed disclosure including approved budgets without changing the returned report', async () => {
    const value = { ...sampleRun(), hybridRetrieval: sample.hybridRetrieval }
    const original = value.report.markdown
    const blobs: NodeBlob[] = []
    vi.stubGlobal('Blob', NodeBlob)
    vi.stubGlobal('URL', { createObjectURL: (blob: NodeBlob) => { blobs.push(blob); return 'blob:test' }, revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<RunPanel view={{ phase: 'settled', value }} plannedSearches={sample.planView.searches} onCancel={vi.fn()} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: zh.download }))
    const markdown = await blobs[0]!.text()
    expect(markdown).toBe(reportWithRetrieval(value, t, sample.planView.searches)!.markdown)
    expect(markdown).toContain(zh.webLimit)
    expect(markdown).toContain(zh.verificationLimit)
    expect(value.report.markdown).toBe(original)
  })
})
