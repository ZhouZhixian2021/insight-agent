/** Copy owned by the standalone research-report viewer. */
export const labels = {
  'zh-CN': { title: '学术研究报告', draft: '审核草稿', final: '最终报告', synthetic: '合成基准样例 · 非真实学术结论',
    ready: '检查通过', needs_review: '待语义审核', blocked: '证据或质量检查未通过',
    claims: '结论与对比', evidence: '证据详情', limits: '局限与评测', download: '下载 Markdown',
    search: '筛选结论和证据', none: '没有可用结论，请检查证据与限制。', confidence: '置信度',
    source: '来源', version: '实际版本', excerpt: '原文不可用', navigation: '报告导航', markdown: 'Markdown 原文' },
  en: { title: 'Academic research report', draft: 'Review draft', final: 'Final report', synthetic: 'Synthetic benchmark · Not real research conclusions',
    ready: 'Checks passed', needs_review: 'Semantic review required', blocked: 'Evidence or quality checks failed',
    claims: 'Claims and comparisons', evidence: 'Evidence details', limits: 'Limitations and evaluation', download: 'Download Markdown',
    search: 'Filter claims and evidence', none: 'No usable conclusions. Check the evidence and limitations.', confidence: 'Confidence',
    source: 'Source', version: 'Actual version', excerpt: 'Excerpt unavailable', navigation: 'Report navigation', markdown: 'Markdown source' },
} as const
