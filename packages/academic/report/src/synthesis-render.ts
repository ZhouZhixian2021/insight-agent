/** Render validated question answers while keeping Plan gaps and source attribution visible. */
import { synthesisSections, type AcademicSynthesisDraft, type SynthesisStatement } from '@deepseek-ai/dsh-academic-analysis'
import type { AcademicWorkId, CoverageSummary, EvidenceRecord, ResearchBrief } from '@deepseek-ai/dsh-academic-model'

import { escapeMarkdown } from './markdown.ts'
import { renderDirections } from './direction-render.ts'
import type { ReportMetadata } from './bibliography.ts'
export { escapeMarkdown } from './markdown.ts'

/**
 * Render one structurally validated synthesis; references and appendix remain host-owned.
 * @param brief Approved requirements and question order.
 * @param draft Validated model statements, coverage proposals and section placements.
 * @param evidence Exact admitted records.
 * @param references Host-owned numeric bibliography map.
 * @param coverage Observed retrieval counts.
 * @param metadata Original bibliography, versions and report date; required for direction-level display.
 * @returns Markdown body and every mechanically detectable unmet Plan requirement.
 */
export function renderSynthesis(brief: ResearchBrief, draft: AcademicSynthesisDraft, evidence: readonly EvidenceRecord[],
  references: ReadonlyMap<AcademicWorkId, number>, coverage: CoverageSummary, metadata?: ReportMetadata) {
  const lines: string[] = [], unmet: string[] = [], body: string[] = []
  const rendered = new Set<number>()
  const required = synthesisSections(brief)
  const records = new Map(evidence.map(record => [record.evidenceId, record]))
  const supportingIds = new Set(draft.statements.flatMap(item => item.evidenceLinks
    .filter(link => link.relation === 'supports').map(link => link.evidenceId)))
  const supporting = evidence.filter(record => supportingIds.has(record.evidenceId))
  const citedWorks = new Set(supporting.map(record => record.academicWorkId)).size
  const citedFulltext = new Set(supporting.filter(record => record.level === 'fulltext').map(record => record.academicWorkId)).size
  const minimum = brief.evidenceRequirements
  if (citedWorks < minimum.minimumIncludedWorks) unmet.push(`正文支持证据涉及 ${citedWorks} 篇独立论文，Plan 至少要求 ${minimum.minimumIncludedWorks} 篇。`)
  if (citedFulltext < minimum.minimumFulltextWorks) unmet.push(`正文支持证据涉及 ${citedFulltext} 篇全文论文，Plan 至少要求 ${minimum.minimumFulltextWorks} 篇。`)
  if (unmet.length > 0) lines.push('> 证据有限的研究草稿：未满足 Plan 的证据数量要求，不作为最终交付。',
    ...unmet.map(reason => `> ${escapeMarkdown(reason)}`), '')
  lines.push(`本轮纳入分析 ${coverage.includedWorks} 篇论文；正文引用 ${references.size} 篇，其中 ${citedWorks} 篇用于支持正文、${citedFulltext} 篇提供全文支持证据。`, '')
  for (const rejection of draft.rejectedStatements) {
    unmet.push(`模型候选段落 ${rejection.statementIndex + 1} 未纳入报告：${rejection.code} — ${rejection.reason}`)
  }
  function statement(index: number): void {
    const item = draft.statements[index] as SynthesisStatement
    if (rendered.has(index)) {
      const citations = [...new Set(item.evidenceLinks.map(link =>
        references.get((records.get(link.evidenceId) as EvidenceRecord).academicWorkId)))]
      lines.push(`${escapeMarkdown(item.text)} ${citations.map(number => `[${number}]`).join(' ')}`,
        `适用范围：${escapeMarkdown(item.scope)}；不确定性：${escapeMarkdown(item.uncertainty ?? '未说明；不代表不存在限制')}`, '',
        `[查看证据详情](#academic-paragraph-${index + 1})`, '')
      return
    }
    rendered.add(index)
    body.push(item.text, item.scope, ...(item.uncertainty === null ? [] : [item.uncertainty]))
    lines.push(`<a id="academic-paragraph-${index + 1}"></a>`, '', `**分析段落 ${index + 1} · ${item.kind === 'source_statement' ? '论文陈述' : '跨论文综合'}**`, '',
      escapeMarkdown(item.text), '', `适用范围：${escapeMarkdown(item.scope)}`)
    lines.push(`不确定性：${escapeMarkdown(item.uncertainty ?? '未说明；不代表不存在限制')}`)
    const roles = [
      ['supports', '主要依据'], ['contradicts', '不同发现／相反证据'], ['background', '背景材料（不直接支持结论）'],
    ] as const
    for (const [relation, label] of roles) {
      const links = item.evidenceLinks.filter(link => link.relation === relation)
      if (links.length === 0) continue
      lines.push('', `**${label}**`, '')
      for (const link of links) {
        const record = records.get(link.evidenceId) as EvidenceRecord
        lines.push(`- [${references.get(record.academicWorkId)}] 证据 ${escapeMarkdown(link.evidenceId)}：${escapeMarkdown(link.rationale)}`,
          `  - 原文定位：版本 ${escapeMarkdown(record.workVersionId)}；定位 ${escapeMarkdown(record.sourceLocatorId)}。`,
          record.verbatimExcerpt.status === 'available'
            ? `  - 原文摘录：${escapeMarkdown(record.verbatimExcerpt.value)}` : '  - 原文摘录：未提供。')
      }
    }
    if (!item.evidenceLinks.some(link => link.relation === 'contradicts')) {
      lines.push('', '本段未关联相反证据；不代表文献中不存在不同发现。')
    }
    lines.push('')
  }
  if (draft.directions !== undefined && metadata !== undefined) {
    const renderedDirections = renderDirections(brief, draft, evidence, references, metadata, statement, lines)
    unmet.push(...renderedDirections.unmet)
  } else {
    unmet.push('缺少经校验的方向布局或书目信息，本报告未完整满足方向级报告格式。')
    lines.push('> 方向布局尚未提供；以下为问题分析草稿，不表示完整方向级报告。', '')
    lines.push('## 逐题研究结论', '', '以下问题覆盖状态由模型提议，尚未经过独立内容审核。', '')
    for (const answer of draft.questionAnswers) {
      lines.push(`### 问题 ${answer.questionIndex + 1}：${escapeMarkdown(brief.questions[answer.questionIndex] as string)}`, '',
        `回答状态：${{ answered: '已提出回答', partial: '部分回答', unanswered: '尚未回答' }[answer.status]}`, '')
      if (answer.statementIndexes.length > 0) lines.push('**当前回答与适用条件**', '')
      answer.statementIndexes.forEach(index => statement(index))
      if (answer.reason !== null) {
        const gap = `问题 ${answer.questionIndex + 1}：${answer.reason}`
        unmet.push(gap)
        lines.push(`尚未回答／证据缺口：${escapeMarkdown(answer.reason)}`, '')
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
      section.statementIndexes.forEach(index => statement(index))
      if (section.missingReason !== null) {
        unmet.push(`${section.title}：${section.missingReason}`)
        lines.push(`证据不足：${escapeMarkdown(section.missingReason)}`, '')
      }
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
