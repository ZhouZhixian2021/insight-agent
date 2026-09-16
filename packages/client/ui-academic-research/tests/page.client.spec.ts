import { describe, expect, it } from 'vitest'
import { renderResearchPage } from '../src/client/render.ts'
import { benchmarkReport } from './fixtures.client.ts'

describe('standalone research report viewer', () => {
  it('renders empty and unavailable material without a false success state', () => {
    const report = benchmarkReport()
    const html = renderResearchPage({ ...report, claims: [], mode: 'final', synthetic: false,
      evidence: report.evidence.map(record => ({ ...record, verbatimExcerpt: { status: 'not_extracted' } })) }, 'zh-CN')
    expect(html).toContain('没有可用结论')
    expect(html).toContain('原文不可用')
    expect(html).toContain('最终报告')
    expect(html).toContain('待语义审核')
  })
  it('renders the actual pipeline result with draft state, evidence navigation and download', () => {
    const html = renderResearchPage(benchmarkReport(), 'zh-CN')
    expect(html).toContain('待语义审核')
    expect(html).toContain('下载 Markdown')
    expect(html).toContain('id="evidence-evidence-rag-a"')
    expect(html).toContain('id="report-data"')
    expect(html).toContain('URL.revokeObjectURL')
  })

  it('escapes user content in markup and script data', () => {
    const report = benchmarkReport()
    const html = renderResearchPage({ ...report, title: '<img src=x onerror=alert(1)>', markdown: '</script><script>alert(1)</script>' }, 'en')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('</script><script>alert(1)')
    expect(html).toContain('\\u003c/script>')
    expect(html).toContain('Download Markdown')
  })
})
