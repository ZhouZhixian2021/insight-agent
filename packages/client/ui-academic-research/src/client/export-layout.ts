/** Reading layout applied only after the export allowlist has removed active content.
 * @param html Sanitized report markup.
 * @returns Narrative-first markup with expandable supplementary material.
 */
export function layoutReportBody(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html
  const root = template.content
  // Generator-owned support lists stay adjacent to their argument, without filling the reading column.
  for (const paragraph of root.querySelectorAll('p')) {
    if (!['主要依据', '相反证据', '背景材料'].includes(paragraph.textContent.trim())) continue
    const list = paragraph.nextElementSibling
    if (list?.tagName !== 'UL') continue
    const details = document.createElement('details')
    details.className = 'support'
    const summary = document.createElement('summary')
    summary.textContent = `${paragraph.textContent} · ${list.children.length}`
    paragraph.replaceWith(details)
    details.append(summary, list)
  }
  const supplementary = /^(报告信息与研究范围|研究问题与证据核对|技术总览（补充分析索引）|论文图景（补充分析索引）|关键发现（补充分析索引）|证据附录|检索渠道与覆盖说明)$/u
  const deferred: HTMLElement[] = []
  for (const heading of [...root.querySelectorAll('h2')]) {
    if (!supplementary.test(heading.textContent.trim())) continue
    const details = document.createElement('details')
    details.className = 'supplement'
    const summary = document.createElement('summary')
    summary.id = heading.id
    summary.textContent = heading.textContent
    let sibling = heading.nextSibling
    details.append(summary)
    while (sibling && !(sibling instanceof Element && sibling.tagName === 'H2')) {
      const next = sibling.nextSibling
      details.append(sibling)
      sibling = next
    }
    heading.remove()
    deferred.push(details)
  }
  root.append(...deferred)
  return template.innerHTML
}

/** Offline reading and print styles; no external fonts or scripts. */
export const reportReadingStyles = `
:root{color-scheme:light;--ink:#243340;--muted:#556575;--line:#dbe2e7;--accent:#176b70}
*{box-sizing:border-box}html{scroll-padding-top:24px}body{margin:0;background:#f4f6f5;color:var(--ink);font:16px/1.85 system-ui,"Microsoft YaHei",sans-serif}
a{color:var(--accent);text-underline-offset:3px;overflow-wrap:anywhere}a:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
.report-header{max-width:1180px;margin:0 auto;padding:48px 32px 24px}.report-header h1{font-size:32px;max-width:32em;margin:12px 0 20px;letter-spacing:-.02em}
h1,h2,h3,h4{line-height:1.5}h2{font-size:24px;margin:48px 0 20px;border-bottom:1px solid var(--line);padding-bottom:12px}h3{font-size:19px;margin-top:28px}
.status{display:inline-block;padding:4px 12px;background:#e4eeec;border-radius:6px;font-weight:600}.review-note{color:var(--muted);font-size:14px}
.reading-layout{max-width:1180px;margin:auto;display:grid;grid-template-columns:220px minmax(0,1fr);gap:36px;padding:0 32px 64px}
nav{position:sticky;top:24px;align-self:start;max-height:90vh;overflow:auto;font-size:13px;line-height:1.65;padding:12px 16px 12px 0}
nav h2{font-size:15px;margin:0 0 12px;border:0;padding:0}nav ul{list-style:none;padding:0;margin:0}nav li{margin:9px 0}nav a{text-decoration:none;color:var(--muted)}nav a:hover{color:var(--accent)}
.paper{min-width:0;background:#fff;border:1px solid var(--line);border-radius:8px;padding:28px 40px 48px}.paper main>h2:first-of-type{margin-top:12px}
p{margin:14px 0;overflow-wrap:anywhere}li{margin:6px 0}ul,ol{padding-left:1.5em}strong{font-weight:650}
table{border-collapse:collapse;display:block;overflow-x:auto;max-width:100%;font-size:14px;line-height:1.7;margin:24px 0}th,td{border-bottom:1px solid var(--line);padding:12px;vertical-align:top;min-width:100px}th{background:#edf3f2;text-align:left}tr:nth-child(even){background:#f8faf9}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f7;padding:16px}blockquote{border-left:3px solid #93b6b4;margin:20px 0;padding:8px 18px;color:var(--muted);background:#f7faf9}
details{border:1px solid var(--line);border-radius:6px;padding:12px 16px;margin:20px 0;font-size:14px}summary{cursor:pointer;font-weight:600;line-height:1.7;overflow-wrap:anywhere}details[open]>summary{margin-bottom:16px}
.support{background:#f8faf9}.supplement{margin-top:28px}.notice{border-left:4px solid #bd833b;padding:4px 20px;background:#fff9ee;margin:16px 0}.notice h2{font-size:17px;margin:12px 0;border:0;padding:0}
.evidence-record{border-top:1px solid var(--line);padding-top:16px;margin-top:24px}.evidence-record h3{font-size:15px;overflow-wrap:anywhere}.metadata{font-size:12px;color:var(--muted);overflow-wrap:anywhere}
@media(max-width:850px){.reading-layout{display:block;padding:0 16px 32px}.report-header{padding:24px 20px 12px}.report-header h1{font-size:25px}nav{position:static;max-height:200px;margin-bottom:20px;border-bottom:1px solid var(--line)}.paper{padding:20px}h2{font-size:21px}}
@media print{body{background:white;font-size:11pt}.report-header{padding:0}.report-header h1{font-size:22pt}.reading-layout{display:block;padding:0}nav{display:none}.paper{border:0;padding:0}details{break-inside:auto}details::details-content{display:block;content-visibility:visible}details>*{display:block}table{display:table;font-size:9pt}a{color:inherit}h2,h3,summary{break-after:avoid}blockquote{background:none}}
`
