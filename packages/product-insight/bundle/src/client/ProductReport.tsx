import { MarkdownText, parseGfmWithMath } from '@deepseek-ai/dsh-client-ui-primitives'
import { type ComponentProps, useMemo } from 'react'
import { productPriceMarkdown } from './report-prices.ts'
import css from './ProductRunCard.module.css'

/** Resolve historical source footnotes for both the preview and the Markdown download. */
export function productReportMarkdown(saved: string): string {
  const text = productPriceMarkdown(saved)
  if (!text.includes('[^product-source-')) return text
  const { children } = parseGfmWithMath(text)
  const sources = new Map<string, string>()
  const edits: { start: number; end: number; value: string; punctuation?: string }[] = []
  for (const node of children) {
    if (node.type !== 'footnoteDefinition' || !/^product-source-\d+$/u.test(node.identifier)) continue
    const start = node.position?.start.offset, end = node.position?.end.offset
    if (start === undefined || end === undefined) continue
    const paragraph = node.children[0]
    const link = paragraph?.type === 'paragraph' && paragraph.children.length === 1 ? paragraph.children[0] : undefined
    if (node.children.length !== 1 || link?.type !== 'link') continue
    if (!URL.canParse(link.url)) continue
    const url = new URL(link.url)
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password) continue
    if (!sources.has(node.identifier)) sources.set(node.identifier, url.href)
    edits.push({ start, end, value: '' })
  }
  function visit(node: typeof children[number]): void {
    if (node.type === 'footnoteDefinition') return
    if (node.type === 'footnoteReference' && node.position) {
      const number = /^product-source-(\d+)$/u.exec(node.identifier)?.[1]
      if (!number) return
      const url = sources.get(node.identifier)
      const label = `\\[${number}\\]`
      const value = url ? `[${label}](<${url}>)` : label
      const start = node.position.start.offset, end = node.position.end.offset
      if (start === undefined || end === undefined) return
      const last = edits.at(-1)
      if (last?.end === start && last.punctuation !== undefined) { last.value += value; last.end = end; return }
      const previous = text.charAt(start - 1)
      const punctuation = /[。！？；.!?;]/u.test(previous) ? previous : ''
      edits.push({ start: start - punctuation.length, end, value, punctuation })
    } else if ('children' in node) node.children.forEach(visit)
  }
  children.forEach(visit)
  let offset = 0, result = ''
  for (const edit of edits.sort((a, b) => a.start - b.start)) {
    result += text.slice(offset, edit.start) + edit.value + (edit.punctuation ?? '')
    offset = edit.end
  }
  return result + text.slice(offset)
}

/** Only captured raster data can be embedded, never arbitrary remote or active content. */
export const productRaster = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/u

const appendixTitles = new Set(['调查问题覆盖情况', '证据附录', '检索与取证范围', '原始交付诊断'])

/** Render saved product prose first; keep evidence and diagnostics expandable without discarding them. */
export function ProductReport({ text, labels }: ComponentProps<typeof MarkdownText>) {
  const renderBody = (body: string) => body.split(/^(?=!\[I\d+\]\(data:image\/)/gmu).map((part, index) => {
    const end = part.indexOf('\n')
    const line = end === -1 ? part : part.slice(0, end)
    const match = /^!\[(I\d+)\]\(([^\s)]+)\)$/u.exec(line)
    if (!match?.[2] || !productRaster.test(match[2])) return <MarkdownText key={index} text={part} labels={labels} />
    return <div key={index}><img src={match[2]} alt={match[1]} style={{ maxWidth: '100%', height: 'auto' }} />
      <MarkdownText text={end < 0 ? '' : part.slice(end + 1)} labels={labels} /></div>
  })
  const sections: { title?: string; text: string }[] = []
  let current = ''
  let title: string | undefined
  let fence: string | undefined
  let legacyCoverage = false
  let skip = -1
  const lines = useMemo(() => productReportMarkdown(text).split('\n'), [text])
  for (const [index, original] of lines.entries()) {
    if (index === skip) continue
    let line = original
    // Recognize only our historical wrapper; never enable arbitrary report HTML.
    if (fence === undefined && /^\s*\\?<details>\s*/u.test(line)) {
      const rest = line.replace(/^\s*\\?<details>\s*/u, '')
      const summary = /^\\?<summary>调查问题覆盖情况\\?<\/summary>\s*$/u
      if (summary.test(rest) || !rest && summary.test((lines[index + 1] ?? '').trim())) {
        if (!rest) skip = index + 1
        line = '## 调查问题覆盖情况'
        legacyCoverage = true
      }
    } else if (fence === undefined && legacyCoverage && /^\s*\\?<\/details>\s*(?:&#x20;\s*)?$/u.test(line)) {
      if (current) sections.push({ text: current, ...(title === undefined ? {} : { title }) })
      current = ''
      title = undefined
      legacyCoverage = false
      continue
    }
    const marker = /^\s*(`{3,}|~{3,})/u.exec(line)?.[1]
    if (marker !== undefined) {
      if (fence === undefined) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined
    }
    const heading = fence === undefined ? /^## (.+)\s*$/u.exec(line)?.[1]?.trim() : undefined
    if (heading !== undefined) {
      if (current) sections.push({ text: current, ...(title === undefined ? {} : { title }) })
      title = appendixTitles.has(heading) ? heading : undefined
      current = title === undefined ? `${line}\n` : ''
    } else current += `${line}\n`
  }
  if (current) sections.push({ text: current, ...(title === undefined ? {} : { title }) })
  return <div className={css.prose} ref={(element) => {
    // The shared Markdown renderer owns anchors; decorate only numbered report citations.
    element?.querySelectorAll('a').forEach((anchor) => {
      if (/^\[\d+\]$/u.test(anchor.textContent)) anchor.setAttribute('data-product-citation', '')
    })
  }}>{sections.map((section, index) => section.title === undefined
      ? <div key={index}>{renderBody(section.text)}</div>
      : <details key={index}><summary>{section.title}</summary>
        <MarkdownText text={section.text} labels={labels} />
      </details>)}</div>
}
