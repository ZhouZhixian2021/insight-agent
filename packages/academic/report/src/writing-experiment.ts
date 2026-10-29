/** C-owned writing experiments over frozen evidence; never substitutes for production delivery. */
import { evaluateClaims } from '@deepseek-ai/dsh-academic-eval'
import type { EvidenceId } from '@deepseek-ai/dsh-academic-model'
import type { ReportInput, ResearchReport } from './index.ts'
import { escapeMarkdown } from './markdown.ts'
import { scholarlyLink } from './bibliography.ts'

/** One evidence-linked prose block or table row; qualifications remain beside the claim. */
export interface WritingUnit {
  readonly text: readonly string[]
  readonly evidenceIds: readonly EvidenceId[]
  readonly qualification: string | null
}

/** Experimental writing instructions do not alter the approved Brief or shared evidence. */
export interface WritingDraft {
  readonly strategy: 'task_template' | 'open_source_inspired'
  readonly title: string
  readonly sections: readonly {
    readonly title: string
    readonly paragraphs: readonly WritingUnit[]
    readonly table: { readonly headers: readonly string[]; readonly rows: readonly WritingUnit[] } | null
  }[]
  readonly limitations: readonly string[]
}

/**
 * Isolate model units with unknown evidence IDs without guessing replacements or rewriting prose.
 * @param input Frozen evidence made available to both treatments.
 * @param draft Parsed raw model document; the caller retains it separately.
 * @returns Renderable units and explicit rejection diagnostics; no extra model call is performed.
 */
export function quarantineWritingUnits(input: ReportInput, draft: WritingDraft): {
  draft: WritingDraft
  rejected: readonly { sectionIndex: number; kind: string; unitIndex: number; unknownIds: readonly string[] }[]
} {
  const known = new Set(input.evidence.map(record => record.evidenceId))
  const rejected: { sectionIndex: number; kind: string; unitIndex: number; unknownIds: readonly string[] }[] = []
  const sections = draft.sections.map((section, sectionIndex) => {
    const retain = (items: readonly WritingUnit[], kind: string) => items.filter((unit, unitIndex) => {
      const unknownIds = unit.evidenceIds.filter(id => !known.has(id))
      if (unknownIds.length === 0 && unit.evidenceIds.length > 0 && unit.text.length > 0
        && unit.text.every(text => text.trim() !== '')) return true
      rejected.push({ sectionIndex, kind, unitIndex, unknownIds })
      return false
    })
    return { ...section, paragraphs: retain(section.paragraphs, 'paragraph'),
      table: section.table === null ? null : { ...section.table, rows: retain(section.table.rows, 'table_row') } }
  })
  const notices = rejected.map(item => `第 ${item.sectionIndex + 1} 节的${item.kind === 'paragraph' ? '段落' : '表格行'} ${item.unitIndex + 1} 因引用无效或缺失未展示；原始输出和拒绝记录另存，未猜测修复。`)
  return { draft: { ...draft, sections, limitations: [...draft.limitations, ...notices] }, rejected }
}

/**
 * Render a cited experimental draft from an externally authored, structurally checked document.
 * @param input Unchanged frozen module inputs and admission records.
 * @param draft Writing variant; text is generated analysis, never a new source excerpt.
 * @returns Draft report with fresh mechanical evidence checks; no semantic approval is implied.
 */
export function renderWritingExperiment(input: ReportInput, draft: WritingDraft): ResearchReport {
  const units = draft.sections.flatMap(section => [...section.paragraphs, ...section.table?.rows ?? []])
  const records = new Map(input.evidence.map(record => [record.evidenceId, record]))
  const ids = new Set(units.flatMap(unit => unit.evidenceIds))
  const evidence = input.evidence.filter(record => ids.has(record.evidenceId))
  if (units.length === 0 || units.some(unit => unit.evidenceIds.length === 0 || unit.text.length === 0
    || unit.text.some(text => text.trim() === '') || unit.evidenceIds.some(id => !records.has(id)))) {
    throw new Error('Every writing unit requires text and admitted evidence references.')
  }
  if (draft.sections.some(section => section.table?.rows.some(row => row.text.length !== section.table?.headers.length))) {
    throw new Error('Comparison rows must match their declared columns.')
  }
  const evaluation = evaluateClaims({ ...input, claims: [], links: [], reviews: [],
    sourceStatements: units.map(unit => ({ evidenceLinks: unit.evidenceIds.map(evidenceId => ({ evidenceId, relation: 'supports' as const })) })) })
  const works = input.works.filter(work => evidence.some(record => record.academicWorkId === work.academicWorkId))
  const numbers = new Map(works.map((work, index) => [work.academicWorkId, index + 1]))
  const cites = (unit: WritingUnit) => [...new Set(evidence.filter(record => unit.evidenceIds.includes(record.evidenceId))
    .map(record => numbers.get(record.academicWorkId)))]
    .map(number => `[${number}]`).join('')
  const lines = [`# ${escapeMarkdown(draft.title)}`, '',
    '> 固定材料写作实验稿：用于比较报告表达，不是新的真实研究运行，也未经过独立内容核验。', '']
  for (const section of draft.sections) {
    lines.push(`## ${escapeMarkdown(section.title)}`, '')
    for (const unit of section.paragraphs) {
      lines.push(`${escapeMarkdown(unit.text.join(''))}${cites(unit)}`, '')
      if (unit.qualification !== null) lines.push(`适用限制：${escapeMarkdown(unit.qualification)}`, '')
    }
    if (section.table !== null) {
      lines.push(`| ${section.table.headers.map(escapeMarkdown).join(' | ')} |`,
        `| ${section.table.headers.map(() => '---').join(' | ')} |`)
      for (const row of section.table.rows) lines.push(`| ${row.text.map((text, index) => escapeMarkdown(text)
        + (index === row.text.length - 1 ? ` ${cites(row)}${row.qualification === null ? '' : `；${escapeMarkdown(row.qualification)}`}` : '')).join(' | ')} |`)
      lines.push('')
    }
  }
  lines.push('## 本次材料的限制', '', ...draft.limitations.map(text => `- ${escapeMarkdown(text)}`), '', '## 参考文献', '')
  for (const work of works) lines.push(`${numbers.get(work.academicWorkId)}. ${escapeMarkdown(work.title)} — `
    + `${escapeMarkdown(work.authors.join(', ') || '作者未提供')}；${scholarlyLink(work, input.versions, evidence)}`)
  if (evaluation.issues.length > 0) lines.push('', '## 证据检查记录', '', ...evaluation.issues.map(issue => `- ${escapeMarkdown(issue.message)}`))
  return { title: draft.title, markdown: `${lines.join('\n')}\n`, mode: 'draft', synthetic: input.synthetic,
    claims: [], evidence, evaluation, limitations: draft.limitations }
}

/**
 * Parse a developer-authored JSON writing document before it reaches the typed renderer.
 * @param text JSON from an experiment file; unknown evidence IDs are rejected by rendering.
 * @returns Structurally checked writing draft.
 */
export function parseWritingDraft(text: string): WritingDraft {
  const object = (value: unknown): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Writing draft requires objects.')
    return value as Record<string, unknown>
  }
  const string = (value: unknown): string => {
    if (typeof value !== 'string' || value.trim() === '') throw new Error('Writing draft requires non-empty strings.')
    return value
  }
  const array = (value: unknown): unknown[] => {
    if (!Array.isArray(value)) throw new Error('Writing draft requires arrays.')
    return value
  }
  const unit = (value: unknown): WritingUnit => {
    const item = object(value)
    return { text: array(item.text).map(string), evidenceIds: array(item.evidenceIds).map(string) as EvidenceId[],
      qualification: item.qualification === null ? null : string(item.qualification) }
  }
  const root = object(JSON.parse(text))
  if (!['task_template', 'open_source_inspired'].includes(string(root.strategy))) throw new Error('Unknown writing strategy.')
  return { strategy: root.strategy as WritingDraft['strategy'], title: string(root.title), limitations: array(root.limitations).map(string),
    sections: array(root.sections).map((value) => {
      const section = object(value), table = section.table === null ? null : object(section.table)
      return { title: string(section.title), paragraphs: array(section.paragraphs).map(unit),
        table: table === null ? null : { headers: array(table.headers).map(string), rows: array(table.rows).map(unit) } }
    }) }
}
