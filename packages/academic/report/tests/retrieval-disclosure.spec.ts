import { describe, expect, it } from 'vitest'
import { appendRetrievalDisclosure, generateReport } from '../src/index.ts'
import { benchmark } from './benchmark.ts'

const disclosure = { title: '检索披露', scopeNotice: 'Web 只用于发现；未证明覆盖完整。',
  observations: [{ label: 'Web 核验失败引用数', value: 2 }], limitations: ['候选数量受限'], failures: ['arxiv timeout'] }
describe('observed retrieval disclosure', () => {
  it('preserves the report, escapes source text and includes failure and limitation facts', () => {
    const text = appendRetrievalDisclosure('# 原报告\n', { ...disclosure, failures: ['<script>bad</script>'] })
    expect(text).toContain('# 原报告\n')
    expect(text).toContain('Web 核验失败引用数: 2')
    expect(text).toContain('候选数量受限')
    expect(text).not.toContain('<script>')
  })
  it('adds the same disclosure to generated drafts without granting semantic approval', () => {
    const { input } = benchmark()
    const report = generateReport({ ...input, retrievalDisclosure: disclosure })
    expect(report.markdown).toContain('arxiv timeout')
    expect(report.evaluation.status).toBe('needs_review')
    expect(() => generateReport({ ...input, mode: 'final', retrievalDisclosure: disclosure })).toThrow()
  })
  it('keeps unadmitted evidence out of even a draft bibliography', () => {
    const { input } = benchmark()
    expect(() => generateReport({ ...input, admittedEvidence: [], retrievalDisclosure: disclosure }))
      .toThrow('Unadmitted evidence cannot enter report claims or references')
  })
})
