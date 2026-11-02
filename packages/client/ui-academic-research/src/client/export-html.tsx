/** Self-contained HTML delivery from the same settled report shown by the Web viewer. */
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AcademicResearchRunValue } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import { layoutReportBody, reportReadingStyles } from './export-layout.ts'
import { reportLimitations, hasLimitationGroups } from './report-limitations.ts'

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
  const headings: { id: string; text: string; level: number }[] = []
  const evidenceNumbers = new Map<string, number>(report.evidence.map((item, index) => [item.evidenceId, index + 1]))
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Only generator-owned numeric paragraph anchors are restored from literal Markdown HTML.
      const text = escape(node.textContent ?? '').replace(/&lt;a id=&quot;(academic-paragraph-\d+)&quot;&gt;&lt;\/a&gt;/gu, '<a id="$1"></a>')
      if (node.parentElement?.closest('a,code,pre')) return text
      return text.replace(/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}/giu, (id) => {
        const number = evidenceNumbers.get(id)
        return number === undefined ? id : `<a href="#evidence-${number}" title="${id}">E${number}</a>`
      })
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
      headings.push({ id, text: node.textContent, level: Number(node.tagName.slice(1)) }); attributes = ` id="${id}"`
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
  const title = template.content.querySelector('h1')
  if (title?.textContent === report.title) title.remove()
  const body = layoutReportBody([...template.content.childNodes].map(serialize).join(''))
  const list = (items: readonly string[]) => `<ul>${items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>`
  const evidence = report.evidence.map((item, index) => `<section class="evidence-record" id="evidence-${index + 1}"><h3>${escape(t('evidence'))} ${index + 1} · ${escape(item.sourceProvider)}</h3><p class="metadata">${escape(item.evidenceId)}</p>
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
  const deliveryIssues = report.evaluation.issues.filter(issue => issue.category !== 'content')
  const organized = reportLimitations(report)
  const groupedInBody = report.markdown.includes('\n## 关键限制\n') || report.markdown.includes('\n## 运行诊断（原始记录）\n')
  const contents = headings.filter(heading => heading.level <= 2)
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
    <title>${escape(report.title)}</title><style>${reportReadingStyles}</style></head><body>
    <header class="report-header"><span class="status">${escape(t(report.mode))} · ${escape(t(report.evaluation.status))}${report.synthetic ? ` · ${escape(t('synthetic'))}` : ''}</span>
    <h1>${escape(report.title)}</h1><p class="review-note">${escape(t('reviewNotice'))}</p><p class="review-note">${escape(t('htmlEvidenceKey'))}</p>
    ${report.evidence.length === 0 ? `<p class="notice">${escape(t('noEvidence'))}</p>` : ''}
    ${deliveryIssues.length ? `<aside class="notice"><h2>${escape(t('deliveryIssues'))}</h2>${list(deliveryIssues.map(issue => `${issue.code}: ${issue.message}`))}</aside>` : ''}
    ${groupedInBody ? '' : `${!hasLimitationGroups(report) ? `<aside class="notice">${escape(t('legacyLimits'))}</aside>` : ''}
    ${organized.keyLimitations.length ? `<aside class="notice"><h2>${escape(t('keyLimits'))}</h2>${list(organized.keyLimitations)}</aside>` : ''}
    ${organized.questionGaps.length ? `<details><summary>${escape(t('questionGaps'))}</summary>${list(organized.questionGaps)}</details>` : ''}
    ${organized.processingNotes.length ? `<details><summary>${escape(t('processingNotes'))}</summary>${list(organized.processingNotes)}</details>` : ''}
    ${organized.diagnostics.length ? `<details><summary>${escape(t('rawDiagnostics'))}</summary>${list(organized.diagnostics)}</details>` : ''}`}</header>
    <div class="reading-layout"><nav aria-label="${escape(t('htmlContents'))}"><h2>${escape(t('htmlContents'))}</h2><ul>${contents.map(h => `<li><a href="#${h.id}">${escape(h.text)}</a></li>`).join('')}
    <li><a href="#claim-records">${escape(t('claims'))}</a></li><li><a href="#evidence-records">${escape(t('evidence'))}</a></li></ul></nav>
    <article class="paper"><main>${body}</main>
    <details><summary id="claim-records">${escape(t('claims'))} · ${report.claims.length}</summary>${claims}</details>
    <section id="evidence-records"><h2>${escape(t('evidence'))} · ${report.evidence.length}</h2>${evidence}</section></article></div></body></html>`

}

/** Download an inert report file.
 * @param html Complete export.
 */
export function downloadAcademicHtml(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'academic-report.html'; anchor.click()
  setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
}
