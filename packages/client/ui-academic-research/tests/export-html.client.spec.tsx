// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { exportAcademicHtml } from '../src/client/export-html.tsx'
import { RunPanel, type RunPanelProps } from '../src/client/RunPanel.tsx'
import { sampleRun } from './run-sample.ts'
import { zh, type RunKey } from '../src/client/run-locales.ts'

const t: RunPanelProps['t'] = key => zh[key as RunKey]
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('standalone report delivery', () => {
  it('exports formatted content, local evidence links and quality without active content or external resources', () => {
    const report = sampleRun().report
    const markdown = '# Scope\n\n| Method | Result |\n|---|---|\n| A | Limited |\n\n<a id="academic-paragraph-1"></a>\n\n[paragraph](#academic-paragraph-1)\n\n<script>alert(1)</script>\n\n![image](https://example.invalid/tracker)\n\n[unsafe](javascript:alert(1))'
    const html = exportAcademicHtml({ ...report, title: '<img src=x onerror=alert(1)>', markdown }, t)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.querySelector('table')?.textContent).toContain('Limited')
    expect(doc.querySelector('script,iframe,img,object,link')).toBeNull()
    expect(doc.querySelector('[onclick],[onerror],[style]')).toBeNull()
    expect(doc.querySelector('a[href^="javascript:"]')).toBeNull()
    expect(doc.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain("default-src 'none'")
    expect(doc.getElementById('academic-paragraph-1')).not.toBeNull()
    expect(doc.body.textContent).toContain(zh.needs_review)
    for (const anchor of doc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      expect(doc.getElementById(anchor.getAttribute('href')!.slice(1))).not.toBeNull()
    }
  })

  it('preserves a limited draft and explicitly shows no evidence without changing its quality', () => {
    const report = sampleRun().report
    const before = structuredClone(report)
    const html = exportAcademicHtml({ ...report, evidence: [], limitations: ['Coverage is partial.'] }, t)
    expect(html).toContain(zh.noEvidence)
    expect(html).toContain('Coverage is partial.')
    expect(html).toContain(zh.draft)
    expect(report).toEqual(before)
  })

  it('downloads HTML from the actual report panel independently of content search', () => {
    vi.useFakeTimers()
    const create = vi.fn().mockReturnValue('blob:report')
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<RunPanel view={{ phase: 'settled', value: sampleRun() }} onCancel={() => {}} t={t} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no-matching-text' } })
    fireEvent.click(screen.getByRole('button', { name: zh.downloadHtml }))
    expect(create).toHaveBeenCalledOnce()
    expect((click.mock.instances[0] as HTMLAnchorElement)?.download).toBe('academic-report.html')
    vi.runAllTimers()
  })
})
