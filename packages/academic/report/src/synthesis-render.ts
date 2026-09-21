/** Render validated question answers while keeping Plan gaps and source attribution visible. */
import { synthesisSections, type AcademicSynthesisDraft, type SynthesisStatement } from '@deepseek-ai/dsh-academic-analysis'
import type { AcademicWorkId, CoverageSummary, EvidenceRecord, ResearchBrief } from '@deepseek-ai/dsh-academic-model'

/**
 * Escape model and provider prose before embedding it in generated Markdown.
 * @param text Untrusted plain text.
 * @returns One escaped Markdown line without active markup.
 */
export function escapeMarkdown(text: string): string {
  return text.replaceAll('\\', '\\\\').replace(/([`*_{}\[\]<>#|])/gu, '\\$1').replace(/\r?\n/gu, ' ')
}

/**
 * Render one structurally validated synthesis; references and appendix remain host-owned.
 * @param brief Approved requirements and question order.
 * @param draft Validated model statements, coverage proposals and section placements.
 * @param evidence Exact admitted records.
 * @param references Host-owned numeric bibliography map.
 * @param coverage Observed retrieval counts.
 * @returns Markdown body and every mechanically detectable unmet Plan requirement.
 */
export function renderSynthesis(brief: ResearchBrief, draft: AcademicSynthesisDraft, evidence: readonly EvidenceRecord[],
  references: ReadonlyMap<AcademicWorkId, number>, coverage: CoverageSummary) {
  const lines: string[] = [], unmet: string[] = [], body: string[] = []
  const rendered = new Set<number>()
  const required = synthesisSections(brief)
  const records = new Map(evidence.map(record => [record.evidenceId, record]))
  for (const rejection of draft.rejectedStatements) {
    unmet.push(`模型候选段落 ${rejection.statementIndex + 1} 未纳入报告：${rejection.code} — ${rejection.reason}`)
  }
  function statement(index: number): void {
    if (rendered.has(index)) { lines.push(`见分析段落 ${index + 1}。`, ''); return }
    rendered.add(index)
    const item = draft.statements[index] as SynthesisStatement
    body.push(item.text, item.scope, ...(item.uncertainty === null ? [] : [item.uncertainty]))
    lines.push(`**分析段落 ${index + 1} · ${item.kind === 'source_statement' ? '论文陈述' : '跨论文综合'}**`, '',
      escapeMarkdown(item.text), '', `适用范围：${escapeMarkdown(item.scope)}`)
    if (item.uncertainty !== null) lines.push(`不确定性：${escapeMarkdown(item.uncertainty)}`)
    for (const link of item.evidenceLinks) {
      const record = records.get(link.evidenceId) as EvidenceRecord
      lines.push(`- [${references.get(record.academicWorkId)}] ${link.relation}；证据 ${escapeMarkdown(link.evidenceId)}：${escapeMarkdown(link.rationale)}`)
    }
    lines.push('')
  }
  lines.push('## 逐题研究结论', '', '以下问题覆盖状态由模型提议，尚未经过独立内容审核。', '')
  for (const answer of draft.questionAnswers) {
    lines.push(`### 问题 ${answer.questionIndex + 1}：${escapeMarkdown(brief.questions[answer.questionIndex] as string)}`, '',
      `覆盖：${{ answered: '已提出回答', partial: '部分回答', unanswered: '尚未回答' }[answer.status]}`, '')
    answer.statementIndexes.forEach(statement)
    if (answer.reason !== null) {
      const gap = `问题 ${answer.questionIndex + 1}：${answer.reason}`
      unmet.push(gap)
      lines.push(`证据缺口：${escapeMarkdown(answer.reason)}`, '')
    }
  }
  for (const section of draft.sections) {
    if (['references', 'evidence_appendix'].includes(section.sectionId)) continue
    lines.push(`## ${escapeMarkdown(section.title)}`, '')
    if (section.sectionId === 'scope_and_method') {
      lines.push(`研究问题：${escapeMarkdown(brief.questions.join('；'))}`, '',
        `检索发现 ${coverage.discoveredRecords} 条记录，去重后 ${coverage.deduplicatedWorks} 篇，纳入 ${coverage.includedWorks} 篇，获取全文 ${coverage.availableFulltextWorks} 篇。`,
        '本报告只分析本轮核验通过的证据；全文获取数量不等于可用证据数量。', '')
    }
    section.statementIndexes.forEach(statement)
    if (section.missingReason !== null) {
      unmet.push(`${section.title}：${section.missingReason}`)
      lines.push(`证据不足：${escapeMarkdown(section.missingReason)}`, '')
    }
  }
  for (const section of required) {
    if (!draft.sections.some(item => item.sectionId === section)) unmet.push(`Plan 要求的章节尚未生成：${section}。`)
  }
  const target = brief.reportRequirements.targetLength
  const length = [...new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(body.join(''))].length
  if ((target.minimum !== null && length < target.minimum) || (target.maximum !== null && length > target.maximum)) {
    unmet.push(`分析正文 ${length} 字，未满足批准的篇幅范围 ${target.minimum ?? '不限'}—${target.maximum ?? '不限'} 字；标题、引用、附录及重复段落不计入。`)
  }
  if (brief.reportRequirements.requiredSections.some(section => ['research_scope', 'directions'].includes(section))) {
    lines.push('Plan 章节映射：research_scope → scope_and_method；directions → technology_overview。', '')
  }
  return { lines, unmet }
}
