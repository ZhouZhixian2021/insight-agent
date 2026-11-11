// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionLiveEventEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import { ConversationNodeAssembler } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import { processGroupDefinition } from '../../../client/ui-chat/src/client/conversation-nodes/process-groups.ts'
import { chatViewDefinition } from '../../../client/ui-chat/src/client/conversation-nodes/chat-snapshot-builder.ts'
import { exportProductHtml, ProductRunCard, productChatDefinition } from '../src/client/index.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

const plan = '# 华为产品调查计划\n\n```product-insight-plan-json\n{}\n```'
const planId = 'session-1:approved-product-plan:product-call'
const labels: Record<string, string> = { draft: '调查草稿', pages: '来源发现与网页抓取', evidence: '证据提取',
  review: '语义审核', verification: '独立佐证', report: '报告生成', done: '已完成', sourcePages: '候选页 / 可用正文',
  evidenceCount: '有效证据', claimCount: '已审核结论', verificationCount: '跨来源核验', failureCount: '失败操作',
  elapsed: '已用时', seconds: '秒', blockers: '未达标原因', reportContent: '报告正文', download: '下载 Markdown',
  downloadHtml: '下载 HTML', htmlContents: '目录', htmlSummary: '调查摘要', htmlCopy: '复制代码', htmlCopied: '已复制',
  htmlFootnotes: '脚注', title: '产品洞察调查', noReport: '无报告' }
const t = ((key: string) => labels[key] ?? key) as never

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
      traceId: 'trace-123',
      system: 'Read', user: 'Source', maxTokens: 8192 } },
    { type: 'product/model-result-v1', data: { planId, candidatePageId: 'page-1', status: 'completed', text: '[]', error: null } },
    { type: 'product/evidence-v1', data: { planId, items: [{}, {}, {}, {}] } },
    { type: 'product/checkpoint-v2', data: { planId, stage: 'evidence', elapsedMilliseconds: 12_400,
      failures: [{ failureId: 'f1' }] } },
    { type: 'product/passage-model-request-v1', data: { planId, candidatePageId: 'page-1', provider: 'mock', model: 'model',
      system: 'Select passages', user: 'Passages', maxTokens: 8192 } },
    { type: 'product/passage-model-result-v1', data: { planId, candidatePageId: 'page-1', status: 'completed',
      text: '[{"passageIds":["p1"]}]', error: null } },
    { type: 'product/evidence-v2', data: { planId, items: [{}, {}, {}, {}] } },
    { type: 'product/claims-v1', data: { planId, items: [{}, {}] } },
    { type: 'product/verification-v1', data: { planId, verification: {} } },
    { type: 'product/report-v1', data: { planId, contentRef: `${planId}:report`, markdown: '# 调查草稿\n\n已保存正文。' } },
    { type: 'product/run-settlement-v1', data: { planId, runId: 'run-1', status: 'draft',
      reportRef: `${planId}:report`, reasons: ['缺少独立佐证'] } },
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
  expect((node.data as { trace: readonly { traceId?: string }[] }).trace).toContainEqual(
    expect.objectContaining({ traceId: 'trace-123' }))
  render(<ProductRunCard node={node as never} t={t} />)
  expect(screen.getByText('华为产品调查计划')).toBeTruthy()
  expect(screen.getByText('缺少独立佐证')).toBeTruthy()
  expect(screen.getByRole('button', { name: '下载 Markdown' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '下载 HTML' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: '调查草稿' })).toBeTruthy()
  expect(screen.getByText('已保存正文。')).toBeTruthy()
  expect(screen.getAllByText('已完成').filter(element => element.tagName === 'SMALL')).toHaveLength(5)
  expect(screen.getByRole('button', { name: 'traceDownload' })).toBeTruthy()
  expect(screen.getAllByText(/product\/model-request-v1/u).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/product\/passage-model-request-v1/u).length).toBeGreaterThan(0)
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
  render(<ProductRunCard node={node as never} t={t} />)
  fireEvent.click(screen.getByRole('button', { name: '下载 HTML' }))
  expect(create).toHaveBeenCalledOnce()
  expect((click.mock.instances[0] as HTMLAnchorElement)?.download).toBe('product-insight-report.html')
  vi.runAllTimers()
})
