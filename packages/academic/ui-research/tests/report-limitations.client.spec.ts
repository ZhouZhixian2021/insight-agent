import { describe, expect, it } from 'vitest'
import { sampleRun } from './run-sample.ts'
import { hasLimitationGroups, reportLimitations } from '../src/client/report-limitations.ts'

describe('report limitation presentation adapter', () => {
  it('reads producer sections without reclassifying original records', () => {
    const report = sampleRun().report
    if (report === null) throw new Error('report fixture missing')
    const raw = 'Version internal-id failed during fulltext.'
    const value = { ...report, limitations: [raw, raw], markdown: [
      '## 关键限制', '', '- 缺少 \\`同条件\\` 比较。', '',
      '## 逐题内容缺口', '', '- 问题一：缺少数值。', '',
      '## 筛选与处理记录', '', '- 已达到纳入上限。', '',
      '## 运行诊断（原始记录）', '', '- 原始记录。', '', '## 其他章节', '', '- 不属于限制。',
    ].join('\n') }
    expect(hasLimitationGroups(value)).toBe(true)
    expect(reportLimitations(value)).toEqual({ keyLimitations: ['缺少 `同条件` 比较。'],
      questionGaps: ['问题一：缺少数值。'], processingNotes: ['已达到纳入上限。'],
      diagnostics: [...new Set([raw, ...report.evaluation.issues.filter(issue => issue.category === 'content').map(issue => issue.message)])] })
    expect(value.limitations).toEqual([raw, raw])
  })
  it('does not infer a clean report from missing historical grouping sections', () => {
    const report = sampleRun().report
    if (report === null) throw new Error('report fixture missing')
    const value = { ...report, markdown: '## 关键限制\n\n- 旧格式。', limitations: ['unknown producer note'] }
    expect(hasLimitationGroups(value)).toBe(false)
    expect(reportLimitations(value).keyLimitations).toEqual([])
    expect(reportLimitations(value).diagnostics).toContain('unknown producer note')
  })
})
