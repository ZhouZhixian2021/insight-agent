/** Self-contained HTML delivery from the same settled report shown by the Web viewer. */
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AcademicResearchRunValue } from '@deepseek-ai/dsh-api-academic-research-controller/types'

type Report = NonNullable<AcademicResearchRunValue['report']>
const tags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
  'BLOCKQUOTE', 'PRE', 'CODE', 'STRONG', 'EM', 'DEL', 'BR', 'HR', 'A', 'SUP', 'SUB', 'SPAN', 'DIV'])
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

/**
 * Export the complete report, independent of current UI search/expanded state.
 * @param report Settled report including actual retrieval disclosure and quality facts.
 * @param t Localized labels, supplied by the caller.
 * @returns Script-free HTML with inline styles, local navigation and safe external citations; no external resources.
 */
export function exportAcademicHtml(report: Report, t: PropsLocale<'academicRun'>['t']): string {
  const template = document.createElement('template')
  template.innerHTML = renderToStaticMarkup(<MarkdownText text={report.markdown}
    labels={{ code: { copyLabel: t('htmlCopy'), copiedLabel: t('htmlCopied') }, footnotes: t('htmlFootnotes') }} />)
  const headings: { id: string; text: string }[] = []
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Only generator-owned numeric paragraph anchors are restored from literal Markdown HTML.
      return escape(node.textContent ?? '').replace(/&lt;a id=&quot;(academic-paragraph-\d+)&quot;&gt;&lt;\/a&gt;/gu, '<a id="$1"></a>')
    }
    if (!(node instanceof Element)) return ''
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'MATH', 'BUTTON'].includes(node.tagName)) return ''
    if (node.tagName === 'IMG') return escape(node.getAttribute('alt') ?? '')
    const children = [...node.childNodes].map(serialize).join('')
    if (!tags.has(node.tagName)) return children
    const tag = node.tagName.toLowerCase()
    let attributes = ''
    if (/^H[1-6]$/u.test(node.tagName)) {
      const id = `section-${headings.length + 1}`
      headings.push({ id, text: node.textContent }); attributes = ` id="${id}"`
    } else if (node.tagName === 'A') {
      const href = node.getAttribute('href')
      if (href !== null && (/^#[\w:.-]+$/u.test(href) || /^https?:\/\//iu.test(href))) {
        attributes = ` href="${escape(href)}"${href.startsWith('#') ? '' : ' target="_blank" rel="noopener noreferrer"'}`
      }
      const id = node.getAttribute('id')
      if (id !== null && /^[\w:.-]+$/u.test(id)) attributes += ` id="${escape(id)}"`
    }
    return ['BR', 'HR'].includes(node.tagName) ? `<${tag}>` : `<${tag}${attributes}>${children}</${tag}>`
  }
  const body = [...template.content.childNodes].map(serialize).join('')
  const list = (items: readonly string[]) => `<ul>${items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>`
  const evidence = report.evidence.map((item, index) => `<section id="evidence-${index + 1}"><h3>${escape(item.evidenceId)}</h3>
    <p>${escape(item.sourcedStatement)}</p>${item.verbatimExcerpt.status === 'available' ? `<blockquote>${escape(item.verbatimExcerpt.value)}</blockquote>` : `<p>${escape(t('excerptUnavailable'))}</p>`}
    <p>${escape(t('source'))}: ${/^https?:\/\//iu.test(item.sourceUrl) ? `<a href="${escape(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(item.sourceProvider)}</a>` : escape(item.sourceProvider)}</p>
    <p>${escape(t('version'))}: ${escape(item.workVersionId)} · ${escape(t('locator'))}: ${escape(item.sourceLocatorId)} · ${escape(t(item.level))}</p>
    <p>${escape(t('retrievedAt'))}: ${escape(item.retrievedAt)}</p>${list(item.qualityNotes)}</section>`).join('')
  const claims = report.claims.map(claim => `<section><h3>${escape(claim.text)}</h3><p>${escape(claim.scope)}</p>
    <p>${escape(t('confidence'))}: ${escape(t(claim.confidence))}</p>${list(claim.confidenceReasons)}
    <ul>${claim.evidenceSnapshot.evidenceItems.map((item) => {
      const index = report.evidence.findIndex(record => record.evidenceId === item.evidenceId)
      return `<li>${index < 0 ? escape(`${t('missingEvidence')}: ${item.evidenceId}`) : `<a href="#evidence-${index + 1}">${escape(item.evidenceId)}</a>`}</li>`
    }).join('')}</ul></section>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
    <title>${escape(report.title)}</title><style>body{font:16px/1.75 system-ui,sans-serif;max-width:1000px;margin:32px auto;padding:0 24px;color:#20242b}a{color:#175eb5;overflow-wrap:anywhere}table{border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid #cbd2da;padding:8px;vertical-align:top}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f7;padding:16px}blockquote,.notice{border-left:4px solid #889cb5;padding:12px;background:#f4f6f8}section{margin:24px 0}h1,h2,h3{line-height:1.4}@media print{body{max-width:none;margin:0}a{color:inherit}}</style></head><body>
    <h1>${escape(report.title)}</h1><aside class="notice"><p>${escape(t(report.mode))} · ${escape(t(report.evaluation.status))}${report.synthetic ? ` · ${escape(t('synthetic'))}` : ''}</p>
    <p>${escape(t('reviewNotice'))}</p>${report.evidence.length === 0 ? `<p>${escape(t('noEvidence'))}</p>` : ''}
    <h2>${escape(t('deliveryIssues'))}</h2>${list(report.evaluation.issues.filter(issue => issue.category !== 'content').map(issue => `${issue.code}: ${issue.message}`))}
    <h2>${escape(t('contentLimits'))}</h2>${list([...new Set([...report.limitations, ...report.evaluation.issues.filter(issue => issue.category === 'content').map(issue => issue.message)])])}</aside>
    <nav aria-label="${escape(t('htmlContents'))}"><h2>${escape(t('htmlContents'))}</h2><ul>${headings.map(h => `<li><a href="#${h.id}">${escape(h.text)}</a></li>`).join('')}</ul></nav><main>${body}</main><h2>${escape(t('claims'))}</h2>${claims}<h2>${escape(t('evidence'))}</h2>${evidence}</body></html>`
}

/** Download an inert report file.
 * @param html Complete export.
 */
export function downloadAcademicHtml(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'academic-report.html'; anchor.click()
  setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
}
