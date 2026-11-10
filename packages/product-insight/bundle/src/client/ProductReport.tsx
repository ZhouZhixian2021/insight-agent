import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ComponentProps } from 'react'

const appendixTitles = new Set(['证据附录', '检索与取证范围', '原始交付诊断'])

/** Render saved product prose first; keep evidence and diagnostics expandable without discarding them. */
export function ProductReport({ text, labels }: ComponentProps<typeof MarkdownText>) {
  const sections: { title?: string; text: string }[] = []
  let current = ''
  let title: string | undefined
  let fence: string | undefined
  for (const line of text.split('\n')) {
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
  return <>{sections.map((section, index) => section.title === undefined
    ? <MarkdownText key={index} text={section.text} labels={labels} />
    : <details key={index}><summary>{section.title}</summary>
      <MarkdownText text={section.text} labels={labels} />
    </details>)}</>
}
