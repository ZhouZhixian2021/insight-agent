/** B-style prose and results tables over the existing validated statement model. */
import type { AcademicSynthesisDraft } from '@deepseek-ai/dsh-academic-analysis'
import type { AcademicWorkId, EvidenceRecord, ResearchBrief } from '@deepseek-ai/dsh-academic-model'
import { escapeMarkdown } from './markdown.ts'

/**
 * Give each retained argument one visible placement, preserving conditions and opposition notices.
 * @param brief Approved questions for content-gap disclosure.
 * @param draft Validated model text and section assignments.
 * @param evidence Exact admitted records for numbered citations.
 * @param references Stable report bibliography numbers.
 * @returns Narrative lines and non-blocking content limitations.
 */
export function renderEvidenceNarrative(brief: ResearchBrief, draft: AcademicSynthesisDraft,
  evidence: readonly EvidenceRecord[], references: ReadonlyMap<AcademicWorkId, number>) {
  const lines: string[] = [], unmet = [...draft.limitations]
  const used = new Set<number>()
  const citations = (index: number) => {
    const ids = new Set(draft.statements[index]?.evidenceLinks.map(link => link.evidenceId))
    return [...new Set(evidence.filter(record => ids.has(record.evidenceId)).map(record => references.get(record.academicWorkId)))]
      .map(number => `[${number}]`).join('')
  }
  const caveat = (index: number) => {
    const statement = draft.statements[index]
    return [statement?.scope, statement?.uncertainty].filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      .filter((value, offset, all) => all.indexOf(value) === offset).map(escapeMarkdown).join('；')
  }
  for (const section of draft.sections) {
    if (['scope_and_method', 'references', 'evidence_appendix'].includes(section.sectionId)) continue
    const indexes = section.statementIndexes.filter(index => !used.has(index))
    if (indexes.length === 0) {
      if (section.missingReason !== null) unmet.push(`${section.title}：${section.missingReason}`)
      continue
    }
    lines.push(`## ${escapeMarkdown(section.title)}`, '')
    if (section.sectionId === 'key_findings') {
      lines.push('| 已报告结果 | 研究与实验条件 | 来源 | 比较限制 |', '| --- | --- | --- | --- |')
      for (const index of indexes) {
        const item = draft.statements[index]
        if (item === undefined) continue
        lines.push(`| ${escapeMarkdown(item.text)} | ${escapeMarkdown(item.scope)} | ${citations(index)} | `
          + `${escapeMarkdown(item.uncertainty ?? '本段未提供额外限制；不代表结果可普遍推广。')} |`)
        used.add(index)
      }
      lines.push('')
    } else {
      for (const index of indexes) {
        const item = draft.statements[index]
        if (item === undefined) continue
        lines.push(`${escapeMarkdown(item.text)}${citations(index)}`, '', `适用条件与限制：${caveat(index)}`, '')
        used.add(index)
      }
    }
  }
  // A question-only argument must remain visible even when the model omitted a section assignment.
  const remaining = draft.statements.map((_, index) => index).filter(index => !used.has(index))
  if (remaining.length > 0) {
    lines.push('## 补充回答', '')
    for (const index of remaining) {
      const item = draft.statements[index]
      if (item !== undefined) lines.push(`${escapeMarkdown(item.text)}${citations(index)}`, '', `适用条件与限制：${caveat(index)}`, '')
    }
  }
  for (const answer of draft.questionAnswers) {
    if (answer.reason !== null) unmet.push(`${brief.questions[answer.questionIndex]}：${answer.reason}`)
  }
  return { lines, unmet: [...new Set(unmet)] }
}
