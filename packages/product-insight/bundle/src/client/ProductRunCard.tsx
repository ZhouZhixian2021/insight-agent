/** Product investigation progress and saved reports in the Chat transcript. */
import type { Context } from '@deepseek-ai/cordis'
import { useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ProductReport } from './ProductReport.tsx'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatNode, ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-product-insight-workflow'
import type {} from '@deepseek-ai/dsh-tools/types'
import css from './ProductRunCard.module.css'

type DeliveryStatus = 'blocked' | 'draft' | 'final'
type RunState = 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled'

interface ProductTraceEntry {
  readonly seq: number
  readonly time: number
  readonly type: string
  readonly status: 'running' | 'completed' | 'failed' | 'recorded'
  readonly page?: string
  readonly model?: string
  readonly inputCharacters?: number
  readonly durationMilliseconds?: number
  readonly outputCharacters?: number
  readonly error?: string
  readonly details?: unknown
}

/** Complete client projection for one approved product investigation. */
export interface ProductChatRun {
  readonly callId: string
  readonly planId?: string
  readonly title: string
  readonly approved: boolean
  readonly runState: RunState
  readonly stage: number
  readonly candidatePages: number
  readonly availablePages: number
  readonly evidence: number
  readonly claims: number
  readonly verifications: number
  readonly failures: number
  readonly elapsedMilliseconds: number
  readonly deliveryStatus?: DeliveryStatus
  readonly reasons: readonly string[]
  readonly trace?: readonly ProductTraceEntry[]
  readonly report?: string
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** Approved product plan and its durable investigation progress. */
    'product-insight-run': ProductChatRun
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Product investigation stage and report labels. */
    productRun: ProductRunKey
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function submittedPlan(event: Parameters<ConversationNodeDefinition['match']>[0]): ProductChatRun | null {
  if (event.type !== 'tool/call' && event.type !== 'tool/ptc-dispatch-start' && event.type !== 'tool/ptc-dispatch') return null
  if (event.data.name !== 'exit_plan_mode') return null
  let args: unknown = event.data.arguments
  if (typeof args === 'string') {
    try { args = JSON.parse(args) }
    catch (_error) { return null }
  }
  if (!record(args) || typeof args.plan !== 'string' || !args.plan.includes('```product-insight-plan-json')) return null
  const approved = event.type === 'tool/ptc-dispatch' && !event.data.isError
    && record(event.data.meta) && event.data.meta.approved === true
  return initial(String(event.type === 'tool/call' ? event.data.callId : event.data.subCallId),
    /^#\s+([^\r\n]+)/mu.exec(args.plan)?.[1] ?? '', approved)
}

function initial(callId: string, title = '', approved = true): ProductChatRun {
  return { callId, title, approved, runState: 'waiting', stage: 0, candidatePages: 0, availablePages: 0,
    evidence: 0, claims: 0, verifications: 0, failures: 0, elapsedMilliseconds: 0, reasons: [] }
}

function callIdFromPlanId(planId: string): string | undefined {
  const marker = ':approved-product-plan:'
  const start = planId.indexOf(marker)
  return start < 0 ? undefined : planId.slice(start + marker.length) || undefined
}

function eventPlanId(event: Parameters<ConversationNodeDefinition['match']>[0]): string | undefined {
  if (!event.type.startsWith('product/') || !record(event.data)) return undefined
  const data = event.data as Record<string, unknown>
  return typeof data.planId === 'string' ? data.planId : undefined
}

function stageNumber(value: unknown): number {
  return value === 'pages' ? 1 : value === 'evidence' ? 2 : value === 'claims' ? 3 : value === 'verification' ? 4 : 0
}

function count(value: unknown): number { return Array.isArray(value) ? value.length : 0 }

function applyEvent(state: ProductChatRun, event: Parameters<ConversationNodeDefinition['match']>[0]): ProductChatRun {
  const data: Record<string, unknown> = record(event.data) ? event.data : {}
  if (event.type.startsWith('product/') && !(state.trace ?? []).some(entry => entry.seq === event.seq)) {
    const status = data.error || data.status === 'failed' || data.state === 'failed' ? 'failed'
      : event.type.includes('-request-') ? 'running' : event.type.includes('-result-') ? 'completed' : 'recorded'
    const prior = [...state.trace ?? []]
    const requestType = event.type.replace('-result-', '-request-')
    const requestIndex = event.type.includes('-result-') ? prior.findLastIndex(entry => entry.type === requestType
      && entry.status === 'running' && (typeof data.candidatePageId !== 'string' || entry.page === data.candidatePageId)) : -1
    const request = prior[requestIndex]
    const duration = request === undefined ? undefined : Math.max(0, event.time - request.time)
    if (request !== undefined) prior[requestIndex] = { ...request, status, durationMilliseconds: duration ?? 0 }
    state = { ...state, trace: [...prior, {
      seq: event.seq, time: event.time, type: event.type, status,
      ...duration === undefined ? {} : { durationMilliseconds: duration },
      ...typeof data.candidatePageId === 'string' ? { page: data.candidatePageId } : {},
      ...typeof data.model === 'string' ? { model: data.model } : {},
      ...typeof data.user === 'string' ? { inputCharacters: data.user.length } : {},
      ...typeof data.text === 'string' ? { outputCharacters: data.text.length } : {},
      ...typeof data.error === 'string' ? { error: data.error } : {},
      ...Array.isArray(data.failures) ? { details: data.failures } : {},
    }] }
  }
  const planId = typeof data.planId === 'string' ? data.planId : state.planId
  switch (event.type) {
    case 'tool/result':
      return { ...state, approved: true }
    case 'product/background-run-v1': {
      const next = data.state === 'running' || data.state === 'completed' || data.state === 'failed' || data.state === 'cancelled'
        ? data.state : state.runState
      return { ...state, ...(planId === undefined ? {} : { planId }), runState: next,
        ...(typeof data.error === 'string' && data.error.length > 0 ? { reasons: [data.error] } : {}),
        stage: next === 'running' ? Math.max(1, state.stage) : state.stage,
        ...(data.deliveryStatus === 'blocked' || data.deliveryStatus === 'draft' || data.deliveryStatus === 'final'
          ? { deliveryStatus: data.deliveryStatus } : {}) }
    }
    case 'product/pages-v1':
      return { ...state, ...(planId === undefined ? {} : { planId }), stage: Math.max(1, state.stage),
        candidatePages: count(data.candidates), availablePages: Array.isArray(data.snapshots)
          ? data.snapshots.filter(item => record(item) && item.status === 'available').length : state.availablePages }
    case 'product/checkpoint-v1':
      return { ...state, ...(planId === undefined ? {} : { planId }), stage: Math.max(stageNumber(data.stage), state.stage),
        failures: count(data.failures), elapsedMilliseconds: typeof data.elapsedMilliseconds === 'number'
          ? data.elapsedMilliseconds : state.elapsedMilliseconds }
    case 'product/model-request-v1': case 'product/model-result-v1':
      return { ...state, stage: Math.max(2, state.stage) }
    case 'product/evidence-v1':
      return { ...state, ...(planId === undefined ? {} : { planId }), stage: Math.max(2, state.stage), evidence: count(data.items) }
    case 'product/claim-review-request-v1': case 'product/claim-review-result-v1':
    case 'product/claims-v1':
      return { ...state, ...(planId === undefined ? {} : { planId }), stage: Math.max(3, state.stage),
        claims: event.type === 'product/claims-v1' ? count(data.items) : state.claims }
    case 'product/cross-check-request-v1': case 'product/cross-check-result-v1':
    case 'product/verification-v1':
      return { ...state, ...(planId === undefined ? {} : { planId }), stage: Math.max(4, state.stage),
        verifications: event.type === 'product/verification-v1' ? state.verifications + 1 : state.verifications }
    case 'product/synthesis-request-v1': case 'product/synthesis-result-v1':
      return { ...state, ...(planId === undefined ? {} : { planId }), stage: Math.max(5, state.stage) }
    case 'product/report-v1':
      return { ...state, ...(planId === undefined ? {} : { planId }), stage: Math.max(5, state.stage),
        ...(typeof data.markdown === 'string' ? { report: data.markdown } : {}) }
    case 'product/run-settlement-v1':
      return { ...state, ...(planId === undefined ? {} : { planId }), runState: 'completed', stage: 6,
        ...(data.status === 'blocked' || data.status === 'draft' || data.status === 'final'
          ? { deliveryStatus: data.status } : {}),
        reasons: Array.isArray(data.reasons) ? data.reasons.filter((item): item is string => typeof item === 'string') : state.reasons }
    default: return state
  }
}

/** One visible card per explicitly approved product plan. */
export const productChatDefinition: ConversationNodeDefinition<ProductChatRun> = {
  kind: 'product-insight-run', target: 'chat',
  match: (event) => {
    const plan = submittedPlan(event)
    if (plan !== null) return { id: plan.callId, role: 'start' }
    if (event.type === 'tool/result' && record(event.data.meta) && event.data.meta.approved === true) {
      return { id: String(event.data.message.toolCallId), role: 'update' }
    }
    const planId = eventPlanId(event)
    const callId = planId === undefined ? undefined : callIdFromPlanId(planId)
    return callId === undefined ? null : { id: callId, role: 'start' }
  },
  start: (_context, match) => {
    const plan = submittedPlan(match.event)
    if (plan !== null) return plan
    const planId = eventPlanId(match.event)
    const callId = planId === undefined ? undefined : callIdFromPlanId(planId)
    if (callId === undefined) throw new Error('Product investigation event has no approved plan identity')
    return applyEvent({ ...initial(callId), ...(planId === undefined ? {} : { planId }) }, match.event)
  },
  update: (context, match) => {
    const plan = submittedPlan(match.event)
    return plan === null ? applyEvent(context.state, match.event) : { ...context.state, ...plan }
  },
  buildViewNode: (context) => {
    const start = context.start ?? context.matches[0]
    if (context.state === undefined || start === undefined) return null
    return { key: context.key, kind: 'product-insight-run', id: context.id, target: 'chat', groupTree: 'turn',
      anchorSeq: (start.location.kind === 'step' || start.location.kind === 'turn' ? start.location.turn.end?.seq : undefined)
        ?? start.event.seq,
      location: start.event.type.startsWith('product/') ? { kind: 'session' } : start.location,
      visibility: context.state.approved ? 'visible' : 'hidden', data: context.state } satisfies ChatNode<'product-insight-run'>
  },
}

const zh = {
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
} as const
type ProductRunKey = keyof typeof zh
const en: Record<ProductRunKey, string> = {
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
}

function downloadProductTrace(run: ProductChatRun): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 1, planId: run.planId,
    state: run.runState, deliveryStatus: run.deliveryStatus, events: run.trace ?? [] }, null, 2)],
  { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'product-insight-trace.json'; anchor.click()
  setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
}

function downloadMarkdown(markdown: string): void {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'product-insight-report.md'; anchor.click()
  setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
}

const htmlTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY',
  'TR', 'TH', 'TD', 'BLOCKQUOTE', 'PRE', 'CODE', 'STRONG', 'EM', 'DEL', 'BR', 'HR', 'A', 'SUP', 'SUB', 'SPAN', 'DIV', 'DETAILS', 'SUMMARY'])
const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const productHtmlStyles = `
:root{color-scheme:light;--ink:#243340;--muted:#556575;--line:#dbe2e7;--accent:#176b70}
*{box-sizing:border-box}html{scroll-padding-top:24px}body{margin:0;background:#f4f6f5;color:var(--ink);font:16px/1.8 system-ui,"Microsoft YaHei",sans-serif}
a{color:var(--accent);text-underline-offset:3px;overflow-wrap:anywhere}.header{max-width:1120px;margin:auto;padding:44px 28px 22px}.header h1{font-size:30px;line-height:1.45;margin:12px 0}
.status{display:inline-block;padding:4px 12px;background:#e4eeec;border-radius:6px;font-weight:600}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:22px 0}
.summary div{padding:10px 12px;background:#fff;border:1px solid var(--line);border-radius:6px}.summary dt{color:var(--muted);font-size:13px}.summary dd{margin:3px 0 0;font-weight:650}
.notice{border-left:4px solid #bd833b;padding:8px 18px;background:#fff9ee;margin:18px 0}.layout{max-width:1120px;margin:auto;display:grid;grid-template-columns:210px minmax(0,1fr);gap:30px;padding:0 28px 60px}
nav{position:sticky;top:24px;align-self:start;max-height:90vh;overflow:auto;font-size:13px}nav h2{font-size:15px}nav ul{list-style:none;padding:0}nav li{margin:9px 0}nav a{text-decoration:none;color:var(--muted)}
article{min-width:0;background:#fff;border:1px solid var(--line);border-radius:8px;padding:30px 40px 48px}h1,h2,h3,h4{line-height:1.5}h2{font-size:23px;margin:42px 0 18px;border-bottom:1px solid var(--line);padding-bottom:10px}
p{margin:14px 0;overflow-wrap:anywhere}li{margin:6px 0}ul,ol{padding-left:1.5em}table{border-collapse:collapse;display:block;overflow-x:auto;max-width:100%;font-size:14px;margin:22px 0}
th,td{border-bottom:1px solid var(--line);padding:11px;vertical-align:top;min-width:100px}th{background:#edf3f2;text-align:left}tr:nth-child(even){background:#f8faf9}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f7;padding:16px}blockquote{border-left:3px solid #93b6b4;margin:20px 0;padding:8px 18px;color:var(--muted);background:#f7faf9}
@media(max-width:800px){.layout{display:block;padding:0 14px 30px}.header{padding:24px 18px 12px}.header h1{font-size:24px}nav{position:static;max-height:180px;margin-bottom:18px}.paper{padding:20px}}
@media print{body{background:#fff;font-size:11pt}.header{padding:0}.layout{display:block;padding:0}nav{display:none}article{border:0;padding:0}table{display:table;font-size:9pt}a{color:inherit}}
`

/** Produce a self-contained, script-free HTML report from the saved product Markdown. */
export function exportProductHtml(run: ProductChatRun, t: PropsLocale<'productRun'>['t']): string {
  if (run.report === undefined) throw new Error('Product HTML export requires a saved report')
  const template = document.createElement('template')
  template.innerHTML = renderToStaticMarkup(<ProductReport text={run.report}
    labels={{ code: { copyLabel: t('htmlCopy'), copiedLabel: t('htmlCopied') }, footnotes: t('htmlFootnotes') }} />)
  const headings: { id: string; text: string; level: number }[] = []
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '')
    if (!(node instanceof Element)) return ''
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'MATH', 'BUTTON'].includes(node.tagName)) return ''
    if (node.tagName === 'IMG') return escapeHtml(node.getAttribute('alt') ?? '')
    const children = [...node.childNodes].map(serialize).join('')
    if (!htmlTags.has(node.tagName)) return children
    const tag = node.tagName.toLowerCase()
    let attributes = ''
    if (/^H[1-6]$/u.test(node.tagName)) {
      const id = `section-${headings.length + 1}`
      headings.push({ id, text: node.textContent, level: Number(node.tagName.slice(1)) })
      attributes = ` id="${id}"`
    } else if (node.tagName === 'A') {
      const href = node.getAttribute('href')
      if (href !== null && (/^#[\w:.-]+$/u.test(href) || /^https?:\/\//iu.test(href))) {
        attributes = ` href="${escapeHtml(href)}"${href.startsWith('#') ? '' : ' target="_blank" rel="noopener noreferrer"'}`
      }
    }
    return ['BR', 'HR'].includes(node.tagName) ? `<${tag}>` : `<${tag}${attributes}>${children}</${tag}>`
  }
  const reportTitle = template.content.querySelector('h1')
  if (reportTitle?.textContent === run.title) reportTitle.remove()
  const body = [...template.content.childNodes].map(serialize).join('')
  const title = run.title || t('title')
  const list = (items: readonly string[]) => `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
  const summary: readonly [ProductRunKey, string][] = [
    ['sourcePages', `${run.candidatePages} / ${run.availablePages}`], ['evidenceCount', String(run.evidence)],
    ['claimCount', String(run.claims)], ['verificationCount', String(run.verifications)],
    ['failureCount', String(run.failures)], ['elapsed', `${Math.round(run.elapsedMilliseconds / 1000)} ${t('seconds')}`],
  ]
  const contents = headings.filter(heading => heading.level <= 2)
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
    <title>${escapeHtml(title)}</title><style>${productHtmlStyles}</style></head><body>
    <header class="header"><span class="status">${escapeHtml(t(run.deliveryStatus ?? run.runState))}</span><h1>${escapeHtml(title)}</h1>
    <h2>${escapeHtml(t('htmlSummary'))}</h2><dl class="summary">${summary.map(([key, value]) => `<div><dt>${escapeHtml(t(key))}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
    ${run.reasons.length === 0 ? '' : `<details class="notice"><summary>${escapeHtml(t('blockers'))}</summary>${list([...new Set(run.reasons)])}</details>`}</header>
    <div class="layout"><nav aria-label="${escapeHtml(t('htmlContents'))}"><h2>${escapeHtml(t('htmlContents'))}</h2><ul>${contents.map(heading =>
      `<li><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`).join('')}</ul></nav><article class="paper">${body}</article></div></body></html>`
}

/** Download one inert, self-contained HTML report. */
export function downloadProductHtml(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'product-insight-report.html'; anchor.click()
  setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
}

function stageState(run: ProductChatRun, index: number): 'pending' | 'active' | 'done' {
  if (run.stage > index || run.runState === 'completed') return 'done'
  return run.stage === index && run.runState === 'running' ? 'active' : 'pending'
}

/** Render durable product workflow stages and the saved report without invoking the Agent. */
export function ProductRunCard({ node, t }: Pick<ChatNodeViewProps<'product-insight-run'>, 'node'> & PropsLocale<'productRun'>) {
  const run = node.data
  const [traceStatus, setTraceStatus] = useState('all')
  const stages: readonly [ProductRunKey, number][] = [['pages', 1], ['evidence', 2], ['review', 3], ['verification', 4], ['report', 5]]
  const status = run.deliveryStatus ?? run.runState
  return <section className={css.card} data-product-insight-run={node.id} aria-label={t('title')}>
    <header className={css.header}><div><h3>{run.title || t('title')}</h3><p>{t(status)}</p></div>
      {run.runState === 'running' && <span className={css.pulse} aria-hidden="true" />}</header>
    <ol className={css.stages}>{stages.map(([label, index]) => {
      const state = stageState(run, index)
      return <li key={label} data-state={state}><span aria-hidden="true">{state === 'done' ? '✓' : state === 'active' ? '●' : '○'}</span>
        <span>{t(label)}</span><small>{t(state)}</small></li>
    })}</ol>
    <dl className={css.stats}>
      <div><dt>{t('sourcePages')}</dt><dd>{run.candidatePages} / {run.availablePages}</dd></div>
      <div><dt>{t('evidenceCount')}</dt><dd>{run.evidence}</dd></div>
      <div><dt>{t('claimCount')}</dt><dd>{run.claims}</dd></div>
      <div><dt>{t('verificationCount')}</dt><dd>{run.verifications}</dd></div>
      <div><dt>{t('failureCount')}</dt><dd>{run.failures}</dd></div>
      <div><dt>{t('elapsed')}</dt><dd>{Math.round(run.elapsedMilliseconds / 1000)} {t('seconds')}</dd></div>
    </dl>
    <details className={css.details}>
      <summary>{t('trace')} · {run.trace?.length ?? 0}</summary>
      <p>{t('traceNote')}</p>
      <label>{t('traceStatus')} <select value={traceStatus} onChange={(event) => { setTraceStatus(event.target.value) }}>
        <option value="all">{t('all')}</option><option value="running">{t('active')}</option>
        <option value="completed">{t('done')}</option><option value="failed">{t('failed')}</option>
      </select></label>
      <button type="button" onClick={() => { downloadProductTrace(run) }}>{t('traceDownload')}</button>
      <ol>{(run.trace ?? []).filter(entry => traceStatus === 'all' || entry.status === traceStatus).map(entry =>
        <li key={entry.seq}><details><summary>{new Date(entry.time).toLocaleTimeString()} · {entry.type} · {entry.status}</summary>
          <pre>{JSON.stringify(entry, null, 2)}</pre></details></li>)}</ol>
    </details>
    {run.reasons.length > 0 && <details className={css.details}>
      <summary>{t('blockers')} · {run.reasons.length}</summary><ul>{run.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    </details>}
    {run.report !== undefined ? <section className={css.report}>
      <div className={css.reportHeader}><strong>{t(run.deliveryStatus ?? 'draft')}</strong>
        <div className={css.reportActions}>
          <button type="button" onClick={() => { downloadMarkdown(run.report as string) }}>{t('download')}</button>
          <button type="button" onClick={() => { downloadProductHtml(exportProductHtml(run, t)) }}>{t('downloadHtml')}</button>
        </div></div>
      <details open><summary>{t('reportContent')}</summary><ProductReport text={run.report}
        labels={{ code: { copyLabel: t('htmlCopy'), copiedLabel: t('htmlCopied') }, footnotes: t('htmlFootnotes') }} /></details>
    </section> : run.runState === 'completed' && <p role="note">{t('noReport')}</p>}
  </section>
}

/** Existing Conversation projection and Chat slot own updates and placement. */
export const inject = ['slots', 'locale', 'uiConversation']

/** Install the product investigation card in the standard Chat transcript. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('productRun', { zh, en }), 'productRun: locale')
  ctx.effect(() => ctx.uiConversation.events.register(productChatDefinition), 'productRun: chat definition')
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node', key: 'product-insight-run', locale: 'productRun',
  }, ProductRunCard))
}
