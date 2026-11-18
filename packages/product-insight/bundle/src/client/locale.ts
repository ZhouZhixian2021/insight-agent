/** Product investigation locale namespace and dictionaries. */

/** Namespace supplied to the product run card and its exported HTML. */
export const NS = 'productRun'

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  title: '产品洞察调查', waiting: '计划已批准，等待调查启动', running: '调查进行中', completed: '调查已完成',
  failed: '调查失败', cancelled: '调查已取消', final: '正式报告', draft: '调查草稿', blocked: '报告受阻',
  pages: '来源发现与网页抓取', evidence: '证据提取', review: '语义审核', verification: '独立佐证', report: '报告生成',
  pending: '待开始', active: '进行中', done: '已完成', sourcePages: '候选页 / 可用正文', evidenceCount: '有效证据',
  claimCount: '已审核结论', verificationCount: '跨来源核验', failureCount: '失败操作', elapsed: '已用时', seconds: '秒',
  blockers: '未达标原因', reportContent: '报告正文', download: '下载 Markdown', downloadHtml: '下载 HTML',
  htmlContents: '目录', htmlSummary: '调查摘要', htmlCopy: '复制代码', htmlCopied: '已复制', htmlFootnotes: '脚注',
  trace: '研究过程与 Trace', traceDownload: '下载 Trace', all: '全部', traceStatus: '调用状态',
  traceNote: '仅展示已记录事件；字符数不是 token 数，调用成功不代表结论审核通过。',
  noReport: '调查已结算，但没有保存报告正文。',
  unanswered: '未回答的问题', followUp: '继续调查这个问题', draftOccupied: '输入框已有草稿，请先发送或清空。',
  followUpReady: '追问已填入输入框，修改后发送即可。',
  followUpPrompt: '请针对上次“{title}”调查中未回答的问题继续调查：{question}\n\n请先制定范围更窄的新计划，核对原网页正文与引用；如果我提供了来源线索，请优先检查。不要把旧报告或搜索摘要直接当作新证据。',
} as const

/** Locale key set both dictionaries must cover. */
export type ProductRunKey = keyof typeof zh

/** English dictionary for the same keys. */
export const en: Record<ProductRunKey, string> = {
  title: 'Product investigation', waiting: 'Plan approved; waiting to start', running: 'Investigation running', completed: 'Investigation completed',
  failed: 'Investigation failed', cancelled: 'Investigation cancelled', final: 'Final report', draft: 'Investigation draft', blocked: 'Report blocked',
  pages: 'Source discovery and page capture', evidence: 'Evidence extraction', review: 'Semantic review', verification: 'Independent corroboration', report: 'Report synthesis',
  pending: 'Pending', active: 'Running', done: 'Completed', sourcePages: 'Candidates / captured pages', evidenceCount: 'Accepted evidence',
  claimCount: 'Reviewed claims', verificationCount: 'Cross-source checks', failureCount: 'Failed operations', elapsed: 'Elapsed', seconds: 'seconds',
  blockers: 'Delivery blockers', reportContent: 'Report content', download: 'Download Markdown', downloadHtml: 'Download HTML',
  htmlContents: 'Contents', htmlSummary: 'Investigation summary', htmlCopy: 'Copy code', htmlCopied: 'Copied', htmlFootnotes: 'Footnotes',
  trace: 'Research process and Trace', traceDownload: 'Download Trace', all: 'All', traceStatus: 'Call status',
  traceNote: 'Recorded events only; character counts are not tokens. Successful calls do not establish valid conclusions.',
  noReport: 'The investigation settled without a saved report body.',
  unanswered: 'Unanswered questions', followUp: 'Investigate this question',
  draftOccupied: 'The composer has a draft. Send or clear it first.',
  followUpReady: 'The follow-up is in the composer. Edit and send it when ready.',
  followUpPrompt: 'Continue investigating this unanswered question from “{title}”: {question}\n\nFirst prepare a narrower new plan. Check source pages and citations; prioritize any source leads I provide. Do not treat the previous report or search snippets as new evidence.',
}
