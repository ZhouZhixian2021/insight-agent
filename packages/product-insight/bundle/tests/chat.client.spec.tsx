// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionLiveEventEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import { ConversationNodeAssembler } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import { processGroupDefinition } from '../../../client/ui-chat/src/client/conversation-nodes/process-groups.ts'
import { chatViewDefinition } from '../../../client/ui-chat/src/client/conversation-nodes/chat-snapshot-builder.ts'
import { exportProductHtml, ProductRunCard, productChatDefinition } from '../src/client/index.ts'
import { ProductReport } from '../src/client/ProductReport.tsx'
import { productPriceMarkdown } from '../src/client/report-prices.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

it.each([
  '## 调查问题覆盖情况\n\n覆盖缺口。',
  '<details>\n<summary>调查问题覆盖情况</summary>\n\n覆盖缺口。\n</details>',
  '\\<details> \\<summary>调查问题覆盖情况\\</summary>\n\n覆盖缺口。\n\\</details> &#x20;',
])('folds coverage with evidence and search appendices in chat and HTML: %s', (coverage) => {
  const report = `# 报告\n\n正文结论。\n\n${coverage}\n\n## 证据附录\n\n### 证据 1\n\n> 原文摘录。\n\n## 检索与取证范围\n\n抓取记录。`
  const { container } = render(<ProductReport text={report}
    labels={{ code: { copyLabel: '复制', copiedLabel: '已复制' }, footnotes: '脚注' }} />)
  const run = { callId: 'fold', title: '报告', approved: true, runState: 'completed', stage: 6,
    candidatePages: 1, availablePages: 1, evidence: 1, claims: 1, verifications: 0, failures: 0,
    elapsedMilliseconds: 10, deliveryStatus: 'final', reasons: [], report } as const
  const doc = new DOMParser().parseFromString(exportProductHtml(run, t), 'text/html')
  for (const root of [container, doc.body]) {
    const details = [...root.querySelectorAll('details')]
    expect(details.map(node => node.querySelector('summary')?.textContent))
      .toEqual(['调查问题覆盖情况', '证据附录', '检索与取证范围'])
    expect(details.every(node => !node.hasAttribute('open'))).toBe(true)
    expect(details[0]?.textContent).toContain('覆盖缺口。')
    expect(details[1]?.querySelector('blockquote')?.textContent).toContain('原文摘录。')
    expect(root.textContent).not.toContain('<details>')
    expect(root.textContent).not.toContain('<summary>')
  }
})

const plan = '# 华为产品调查计划\n\n```product-insight-plan-json\n{}\n```'
const planId = 'session-1:approved-product-plan:product-call'
const labels: Record<string, string> = { draft: '调查草稿', pages: '来源发现与网页抓取', evidence: '证据提取',
  review: '语义审核', verification: '独立佐证', report: '报告生成', done: '已完成', sourcePages: '候选页 / 可用正文',
  evidenceCount: '有效证据', claimCount: '已审核结论', verificationCount: '跨来源核验', failureCount: '失败操作',
  elapsed: '已用时', seconds: '秒', blockers: '未达标原因', reportContent: '报告正文', download: '下载 Markdown',
  downloadHtml: '下载 HTML', htmlContents: '目录', htmlSummary: '调查摘要', htmlCopy: '复制代码', htmlCopied: '已复制',
  htmlFootnotes: '脚注', title: '产品洞察调查', noReport: '无报告',
  followUpPrompt: '继续调查“{title}”中未回答的问题：{question}', followUp: '继续调查这个问题' }
const t = ((key: string) => labels[key] ?? key) as never
const setDraft = vi.fn()
const persistDraft = vi.fn()
const submit = vi.fn()
const inputActions = { setDraft, persistDraft, submit } as never
const useInput = ((selector: (state: { draft: string; attachmentIds: string[] }) => unknown) =>
  selector({ draft: '', attachmentIds: [] })) as never

it('keeps Chinese prose outside automatically linked domains in reports and HTML exports', () => {
  const report = '# 报告\n\n资料来源：www.apple.com.cn、www.macworld.com），按材料内容说明限制。\n\n'
    + '转义域名：www\\.apple\\.com\\.cn、www\\.macworld\\.com），普通说明。\n\n'
    + '[具体来源](https://example.com/中文路径?q=一、二)'
  const run = { callId: 'call', title: '报告', approved: true, runState: 'completed', stage: 6,
    candidatePages: 2, availablePages: 2, evidence: 2, claims: 2, verifications: 0, failures: 0,
    elapsedMilliseconds: 1, deliveryStatus: 'final', reasons: [], report } as const
  render(<ProductReport text={report} labels={{ code: { copyLabel: '复制', copiedLabel: '已复制' }, footnotes: '来源' }} />)
  for (const anchor of screen.getAllByRole('link')) {
    expect(anchor.textContent).not.toMatch(/按材料|普通说明|），/u)
  }
  const doc = new DOMParser().parseFromString(exportProductHtml(run, t), 'text/html')
  expect(doc.body.textContent).toContain('www.apple.com.cn、www.macworld.com），按材料内容说明限制。')
  const explicit = [...doc.querySelectorAll('a')].find(anchor => anchor.textContent === '具体来源')
  expect(decodeURI(explicit?.getAttribute('href') ?? '')).toBe('https://example.com/中文路径?q=一、二')
  for (const anchor of doc.querySelectorAll('a')) expect(anchor.textContent).not.toMatch(/按材料|普通说明|），/u)
})

it('pairs concurrent review Trace results with their exact requests', () => {
  const assembler = new ConversationNodeAssembler({ entries: () => [productChatDefinition], fallbackEntry: () => undefined },
    { entries: () => [chatViewDefinition] },
    { entries: () => [processGroupDefinition], forTarget: () => processGroupDefinition })
  const events = [
    { seq: 1, time: 0, type: 'tool/call', data: { name: 'exit_plan_mode', callId: 'product-call', arguments: JSON.stringify({ plan }) } },
    { seq: 2, time: 10, type: 'product/claim-review-request-v1', data: { planId, user: 'first' } },
    { seq: 3, time: 20, type: 'product/claim-review-request-v1', data: { planId, user: 'second' } },
    { seq: 4, time: 60, type: 'product/claim-review-result-v1', data: { planId, requestSeq: 2, status: 'completed', text: '[]', error: null } },
    { seq: 5, time: 90, type: 'product/claim-review-result-v1', data: { planId, requestSeq: 3, status: 'completed', text: '[]', error: null } },
  ]
  assembler.replaceWindow(events.map(event => ({ type: 'event', event })) as SessionLiveEventEntry[], false)
  assembler.activateTarget('chat')
  const node = (assembler.snapshot('chat') as ChatSnapshot).nodes.values().find(item => item.kind === 'product-insight-run')!
  expect(node.data).toMatchObject({ trace: [
    { seq: 2, durationMilliseconds: 50, status: 'completed' },
    { seq: 3, durationMilliseconds: 70, status: 'completed' },
    { seq: 4, durationMilliseconds: 50 }, { seq: 5, durationMilliseconds: 70 },
  ] })
})

it('exposes per-question synthesis validation in Trace without requiring it on historical events', () => {
  const assembler = new ConversationNodeAssembler({ entries: () => [productChatDefinition], fallbackEntry: () => undefined },
    { entries: () => [chatViewDefinition] },
    { entries: () => [processGroupDefinition], forTarget: () => processGroupDefinition })
  const validation = { acceptedQuestionIds: ['q1'], issues: [{ questionId: 'q2', reasons: ['Unknown evidence ID.'] }],
    notes: ['Normalized reference list.'] }
  const events = [
    { seq: 1, time: 0, type: 'tool/call', data: { name: 'exit_plan_mode', callId: 'product-call', arguments: JSON.stringify({ plan }) } },
    { seq: 2, time: 10, type: 'product/synthesis-request-v1', data: { planId, user: 'first' } },
    { seq: 3, time: 20, type: 'product/synthesis-result-v1', data: { planId, requestSeq: 2, text: '[]', error: 'invalid_output', validation } },
    { seq: 4, time: 30, type: 'product/synthesis-request-v1', data: { planId, user: 'repair q2' } },
    { seq: 5, time: 40, type: 'product/synthesis-result-v1', data: { planId, requestSeq: 4, text: '[]', error: null } },
  ]
  assembler.replaceWindow(events.map(event => ({ type: 'event', event })) as SessionLiveEventEntry[], false)
  assembler.activateTarget('chat')
  const node = (assembler.snapshot('chat') as ChatSnapshot).nodes.values().find(item => item.kind === 'product-insight-run')!
  expect(node.data).toMatchObject({ trace: [
    { seq: 2, durationMilliseconds: 10 }, { seq: 3, details: validation },
    { seq: 4, durationMilliseconds: 10 }, { seq: 5, status: 'completed' },
  ] })
})

it('exposes item repair and same-text reuse diagnostics in product Trace', () => {
  const assembler = new ConversationNodeAssembler({ entries: () => [productChatDefinition], fallbackEntry: () => undefined },
    { entries: () => [chatViewDefinition] },
    { entries: () => [processGroupDefinition], forTarget: () => processGroupDefinition })
  const issues = [{ index: 2, reason: 'missing_statement' }]
  const events = [
    { seq: 1, time: 0, type: 'tool/call', data: { name: 'exit_plan_mode', callId: 'product-call', arguments: JSON.stringify({ plan }) } },
    { seq: 2, time: 10, type: 'product/extraction-inspection-v1', data: { planId, candidatePageId: 'page1', kind: 'validation', accepted: 2, issues, error: null } },
    { seq: 3, time: 20, type: 'product/extraction-inspection-v1', data: { planId, candidatePageId: 'page2', kind: 'reuse', accepted: 2, issues: [], reusedFrom: 'page1', error: null } },
  ]
  assembler.replaceWindow(events.map(event => ({ type: 'event', event })) as SessionLiveEventEntry[], false)
  assembler.activateTarget('chat')
  const node = (assembler.snapshot('chat') as ChatSnapshot).nodes.values().find(item => item.kind === 'product-insight-run')!
  expect(node.data).toMatchObject({ trace: [
    { seq: 2, details: { kind: 'validation', accepted: 2, issues } },
    { seq: 3, details: { kind: 'reuse', accepted: 2, reusedFrom: 'page1' } },
  ] })
})

it('shows four stages without an independent corroboration step for new investigations', () => {
  render(<ProductRunCard t={t} useInput={useInput} inputActions={inputActions} node={{ id: 'run', data: { planId, callId: 'call', title: 'Product', approved: true, runState: 'running',
    stage: 3, candidatePages: 1, availablePages: 1, evidence: 1, claims: 1, verifications: 0,
    failures: 0, elapsedMilliseconds: 1, reasons: [] } } as never} />)
  expect(screen.getByText('语义审核')).toBeTruthy()
  expect(screen.getByText('报告生成')).toBeTruthy()
  expect(screen.queryByText('独立佐证')).toBeNull()
  expect(screen.queryByText('跨来源核验')).toBeNull()
  expect(screen.queryByRole('button', { name: '继续调查这个问题' })).toBeNull()
})

it('keeps an existing composer draft when a settled question is selected', () => {
  setDraft.mockClear()
  const occupiedInput = ((selector: (state: { draft: string; attachmentIds: string[] }) => unknown) =>
    selector({ draft: '已有草稿', attachmentIds: [] })) as never
  render(<ProductRunCard t={t} useInput={occupiedInput} inputActions={inputActions} node={{ id: 'run', data: {
    planId, callId: 'call', title: 'Product', approved: true, runState: 'completed', stage: 6,
    candidatePages: 1, availablePages: 1, evidence: 1, claims: 0, verifications: 0,
    failures: 0, elapsedMilliseconds: 1, reasons: [], report: '# 草稿',
    unansweredQuestions: [{ questionId: 'q1', text: '待回答问题' }],
  } } as never} />)
  fireEvent.click(screen.getByRole('button', { name: '继续调查这个问题' }))
  expect(setDraft).not.toHaveBeenCalled()
  expect(screen.getByRole('status').textContent).toContain('draftOccupied')
})

it('projects approved product stages and the saved report into one Chat card', () => {
  const events = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'tool/call', data: { turn: 1, step: 1, name: 'exit_plan_mode', callId: 'product-call',
      arguments: JSON.stringify({ plan }) } },
    { type: 'tool/result', data: { turn: 1, step: 1,
      message: { toolCallId: 'product-call', isError: false }, meta: { approved: true } } },
    { type: 'product/background-run-v1', data: { planId, jobId: 'job-1', state: 'running',
      startedAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z', reportRef: null,
      deliveryStatus: null, error: null } },
    { type: 'product/pages-v1', data: { planId, candidates: [{}, {}, {}],
      snapshots: [{ status: 'available' }, { status: 'available' }, { status: 'unavailable' }] } },
    { type: 'product/checkpoint-v1', data: { planId, stage: 'evidence', elapsedMilliseconds: 12_400,
      failures: [{ failureId: 'f1' }] } },
    { type: 'product/model-request-v1', data: { planId, candidatePageId: 'page-1', provider: 'mock', model: 'model',
      system: 'Read', user: 'Source', maxTokens: 8192 } },
    { type: 'product/model-result-v1', data: { planId, candidatePageId: 'page-1', status: 'completed', text: '[]', error: null } },
    { type: 'product/evidence-v1', data: { planId, items: [{}, {}, {}, {}] } },
    { type: 'product/claims-v1', data: { planId, items: [{}, {}] } },
    { type: 'product/verification-v1', data: { planId, verification: {} } },
    { type: 'product/report-v1', data: { planId, contentRef: `${planId}:report`, markdown: '# 调查草稿\n\n已保存正文。' } },
    { type: 'product/run-settlement-v1', data: { planId, runId: 'run-1', status: 'draft',
      reportRef: `${planId}:report`, reasons: ['缺少独立佐证'],
      unansweredQuestions: [{ questionId: `${planId}:question:2`, text: '第二个问题是什么？' }] } },
    { type: 'product/background-run-v1', data: { planId, jobId: 'job-1', state: 'completed',
      startedAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:01:00Z',
      reportRef: `${planId}:report`, deliveryStatus: 'draft', error: null } },
  ]
  const assembler = new ConversationNodeAssembler({ entries: () => [productChatDefinition], fallbackEntry: () => undefined },
    { entries: () => [chatViewDefinition] },
    { entries: () => [processGroupDefinition], forTarget: () => processGroupDefinition })
  assembler.replaceWindow(events.map((event, index) => ({ type: 'event', event: {
    ...event, seq: index + 1, time: index,
  } })) as SessionLiveEventEntry[], false)
  assembler.activateTarget('chat')
  const node = (assembler.snapshot('chat') as ChatSnapshot).nodes.values()
    .find(candidate => candidate.kind === 'product-insight-run')!
  expect(node.data).toMatchObject({ approved: true, runState: 'completed', deliveryStatus: 'draft',
    candidatePages: 3, availablePages: 2, evidence: 4, claims: 2, verifications: 1,
    failures: 1, elapsedMilliseconds: 12_400, report: '# 调查草稿\n\n已保存正文。' })
  render(<ProductRunCard node={node as never} t={t} useInput={useInput} inputActions={inputActions} />)
  expect(screen.getByText('华为产品调查计划')).toBeTruthy()
  expect(screen.getByText('缺少独立佐证')).toBeTruthy()
  expect(screen.getByRole('button', { name: '下载 Markdown' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '下载 HTML' })).toBeTruthy()
  const preview = screen.getByText('报告正文')
  expect(preview.closest('details')?.open).toBe(false)
  fireEvent.click(preview)
  expect(preview.closest('details')?.open).toBe(true)
  expect(screen.getByRole('heading', { name: '调查草稿' })).toBeTruthy()
  expect(screen.getByText('已保存正文。')).toBeTruthy()
  expect(screen.getAllByText('已完成').filter(element => element.tagName === 'SMALL')).toHaveLength(5)
  expect(screen.getByRole('button', { name: 'traceDownload' })).toBeTruthy()
  expect(screen.getAllByText(/product\/model-request-v1/u).length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: '继续调查这个问题' }))
  expect(setDraft).toHaveBeenCalledWith(expect.stringContaining('第二个问题是什么？'))
  expect(persistDraft).toHaveBeenCalled()
  expect(submit).not.toHaveBeenCalled()
})

it('exports and downloads a self-contained safe HTML report', () => {
  const run = { callId: 'call', title: '<img src=x onerror=alert(1)>', approved: true, runState: 'completed', stage: 6,
    candidatePages: 3, availablePages: 2, evidence: 4, claims: 2, verifications: 1, failures: 1,
    elapsedMilliseconds: 12_400, deliveryStatus: 'draft', reasons: ['缺少独立佐证', '<script>unsafe()</script>'],
    report: '# 产品报告\n\n## 结论\n\n| 项目 | 结果 |\n|---|---|\n| A | 有限 |\n\n[来源](https://example.com/a)\n\n<script>alert(1)</script>\n\n![跟踪图](https://example.com/pixel)\n\n## 证据附录\n\n原文依据。' } as const
  const html = exportProductHtml(run, t)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  expect(doc.querySelector('h1')?.textContent).toBe(run.title)
  expect(doc.querySelector('table')?.textContent).toContain('有限')
  expect(doc.body.textContent).toContain('缺少独立佐证')
  expect(doc.querySelector('script,iframe,img,object,link')).toBeNull()
  const data = 'data:image/png;base64,iVBORw0KGgo='
  const illustratedReport = 'First.\n\n| Configuration | Time |\n| --- | --- |\n| A\\|B | 42 ms[^product-source-1] |'
    + '\n\nSecond.\n\n![I1](' + data + ')\n\nAfter.\n\n[^product-source-1]: [查看来源原文](https://example.com/chart)'
  const illustrated = new DOMParser().parseFromString(exportProductHtml({ ...run, report: illustratedReport }, t), 'text/html')
  const preview = render(<ProductReport text={illustratedReport}
    labels={{ code: { copyLabel: '复制', copiedLabel: '已复制' }, footnotes: '脚注' }} />)
  for (const root of [preview.container, illustrated.querySelector('article')!]) {
    expect(root.querySelectorAll('td')).toHaveLength(2)
    expect(root.querySelector('td')?.textContent).toBe('A|B')
    expect(root.querySelector('td a')?.getAttribute('href')).toBe('https://example.com/chart')
    expect([...root.querySelectorAll('p, table, img')].map(node => node.tagName === 'P' ? node.textContent : node.tagName))
      .toEqual(['First.', 'TABLE', 'Second.', 'IMG', 'After.'])
  }
  preview.unmount()
  expect(illustrated.querySelector('article img')?.getAttribute('src')).toBe(data)
  expect(illustrated.querySelector('article')?.textContent).toContain('After.')
  expect(illustrated.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain('img-src data:')
  expect(doc.querySelector('[onclick],[onerror]')).toBeNull()
  expect(doc.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain("default-src 'none'")
  expect(doc.querySelector('a[href="https://example.com/a"]')?.getAttribute('rel')).toBe('noopener noreferrer')
  const disclosures = [...doc.querySelectorAll('details')]
  expect(disclosures.every(item => !item.hasAttribute('open'))).toBe(true)
  expect(disclosures[0]?.querySelector('summary')?.textContent).toBe('未达标原因')
  expect(disclosures.find(item => item.querySelector('summary')?.textContent === '证据附录')?.textContent).toContain('原文依据。')

  vi.useFakeTimers()
  const create = vi.fn().mockReturnValue('blob:product-report')
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const node = { id: 'call', data: run }
  render(<ProductRunCard node={node as never} t={t} useInput={useInput} inputActions={inputActions} />)
  fireEvent.click(screen.getByRole('button', { name: '下载 HTML' }))
  expect(create).toHaveBeenCalledOnce()
  expect((click.mock.instances[0] as HTMLAnchorElement)?.download).toBe('product-insight-report.html')
  vi.runAllTimers()
})


it('reopens a settled M6 report with cited regional prices, literal dollars and no success message among blockers', () => {
  const report = '# Apple M6 — 产品洞察报告\n\n| 机型 | 配置 | 美国起售价 | 中国大陆起售价 |\n| --- | --- | --- | --- |\n'
    + '| MacBook Pro | 16GB | $1,999；教育 $1,899 [^product-source-16] | RMB15,999；教育 RMB15,199 [^product-source-17] |\n'
    + '| Mac mini | 32GB | 官方摘录未给 | 官方摘录未给 |\n\n'
    + '美国价格 $1,999 和 $1,899。公式 $x^2$；代码 `$6 和 $7`；[记录](https://example.test/$42)。\n\n'
    + '[^product-source-16]: [查看来源原文](https://example.test/us)\n[^product-source-17]: [查看来源原文](https://example.test/cn)\n\n'
    + '## 证据附录\n\n> starts at $1,999 \\(U\\.S\\.\\) and $1,899 \\(U\\.S\\.\\) with education savings.'
  const run = { callId: 'prices', approved: true, title: 'M6', runState: 'completed', deliveryStatus: 'final',
    stage: 6, elapsedMilliseconds: 0, candidatePages: 0, availablePages: 0, evidence: 0, claims: 0, verifications: 0, failures: 0,
    reasons: ['Report structure checks passed; source limitations and unanswered questions are disclosed separately.'], report } as const
  const markdown = productPriceMarkdown(report)
  expect(markdown).toContain('美国价格 \\$1,999 和 \\$1,899。公式 $x^2$；代码 `$6 和 $7`')
  expect(markdown).toContain('https://example.test/$42')
  expect(productPriceMarkdown(markdown)).toBe(markdown)
  const card = render(<ProductRunCard node={{ id: 'prices', data: run } as never} t={t} useInput={useInput} inputActions={inputActions} />)
  const doc = new DOMParser().parseFromString(exportProductHtml(run, t), 'text/html')
  expect(screen.queryByText(/未达标原因/u)).toBeNull()
  expect(doc.querySelector('details.notice')).toBeNull()
  fireEvent.click(screen.getByText('报告正文'))
  for (const root of [card.container, doc.body]) {
    const tables = root.querySelectorAll('table')
    expect(tables[0]?.textContent).toContain('16GB')
    const pricing = tables[1]
    expect([...pricing!.querySelectorAll('th')].map(cell => cell.textContent))
      .toEqual(['机型', '地区（币种）', '常规起售价', '教育优惠起售价'])
    const rows = [...pricing!.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(cell => cell.textContent))
    expect(rows.slice(0, 2)).toEqual([['MacBook Pro', '美国（美元）', '1,999', '1,899 [16]'],
      ['MacBook Pro', '中国大陆（人民币）', '15,999', '15,199 [17]']])
    expect(rows[2]?.slice(2)).toEqual(['官方摘录未给', '官方摘录未给'])
    expect([...pricing!.querySelectorAll('a')].map(a => a.getAttribute('href')))
      .toEqual(['https://example.test/us', 'https://example.test/cn'])
    expect(root.textContent).toContain('美国价格 $1,999 和 $1,899。')
    expect(root.querySelector('blockquote')?.textContent?.trim()).toBe('starts at $1,999 (U.S.) and $1,899 (U.S.) with education savings.')
  }
})

it('renders sentence citations as superscript links in exported HTML', () => {
  const run = { callId: 'cite', title: '报告', approved: true, runState: 'completed', stage: 6,
    candidatePages: 1, availablePages: 1, evidence: 1, claims: 1, verifications: 0, failures: 0,
    elapsedMilliseconds: 10, deliveryStatus: 'final', reasons: [],
    report: '# 报告\n\n## 综合回答\n\n支持导出。[^product-source-1]费用尚未确认。\n\n[^product-source-1]: [查看来源原文](https://example.com/export)\n\n## 证据附录\n\n已保存原文。' } as const
  const doc = new DOMParser().parseFromString(exportProductHtml(run, t), 'text/html')
  const citation = doc.querySelector('a[href="https://example.com/export"]')!
  expect(citation).not.toBeNull()
  expect(citation.textContent).toBe('[1]')
  expect(citation.className).toBe('product-citation')
  expect(citation.parentElement?.textContent).toContain('支持导出[1]。费用尚未确认。')
  expect(doc.body.textContent).not.toContain('[^product-source-1]')
})

it('keeps adjacent and multi-digit citations at the sentence end without styling ordinary links', () => {
  render(<ProductReport text={'支持导出。[^product-source-5][^product-source-12]另一句。\n\n[产品官网](https://example.com)\n\n[^product-source-5]: [查看来源原文](https://example.com/a)\n[^product-source-12]: [查看来源原文](https://example.com/b)'}
    labels={{ code: { copyLabel: '复制', copiedLabel: '已复制' }, footnotes: '脚注' }} />)
  const citation = screen.getByRole('link', { name: '[5]' })
  expect(citation.hasAttribute('data-product-citation')).toBe(true)
  expect(citation.parentElement?.textContent).toContain('支持导出[5][12]。另一句。')
  expect(screen.getByRole('link', { name: '[12]' }).getAttribute('href')).toBe('https://example.com/b')
  expect(screen.getByRole('link', { name: '产品官网' }).hasAttribute('data-product-citation')).toBe(false)
})
