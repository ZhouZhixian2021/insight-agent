/** Render the report-format hierarchy using validated references, never uncited generated prose. */
import type { AcademicSynthesisDraft, DirectionComponent, SynthesisDirection, SynthesisStatement } from '@deepseek-ai/dsh-academic-analysis'
import type { AcademicWorkId, EvidenceRecord, ResearchBrief } from '@deepseek-ai/dsh-academic-model'
import { escapeMarkdown } from './markdown.ts'
import { workBibliography, type ReportMetadata } from './bibliography.ts'

/**
 * Assemble opening insight, direction map, per-direction components and a question-linked conclusion.
 * @param brief Approved scope and report requirements.
 * @param draft Validated paragraphs and direction layout.
 * @param evidence Admitted source records.
 * @param references Host-owned numbered bibliography.
 * @param metadata Existing producer metadata; absent values remain explicit.
 * @param statement Render a paragraph once; later sections repeat its text with a link to evidence detail.
 * @param lines Shared report output buffer.
 * @returns Explicit coverage limits for omitted or rejected direction components.
 */
export function renderDirections(brief: ResearchBrief, draft: AcademicSynthesisDraft, evidence: readonly EvidenceRecord[],
  references: ReadonlyMap<AcademicWorkId, number>, metadata: ReportMetadata,
  statement: (index: number) => void, lines: string[]) {
  const unmet: string[] = []
  const directions = draft.directions ?? []
  const component = (direction: SynthesisDirection, label: string, item: DirectionComponent) => {
    if (item.statementIndexes.length === 0) {
      unmet.push(`${direction.title}／${label}：${item.missingReason ?? '缺少证据。'}`)
      return
    }
    lines.push(`### ${label}`, '')
    item.statementIndexes.forEach(index => statement(index))
  }
  const executive = draft.sections.find(section => section.sectionId === 'executive_summary')
  lines.push('## 执行洞察', '')
  if (executive !== undefined) for (const index of executive.statementIndexes) {
    const item = (draft.statements[index] as SynthesisStatement)
    const citations = [...new Set(item.evidenceLinks.map((link) => {
      const record = evidence.find(record => record.evidenceId === link.evidenceId) as EvidenceRecord
      return references.get(record.academicWorkId)
    }))]
    lines.push(`${escapeMarkdown(item.text)} ${citations.map(number => `[${number}]`).join(' ')}`,
      `适用范围：${escapeMarkdown(item.scope)}；主要不确定性：${escapeMarkdown(item.uncertainty ?? '未说明')}`, '')
  }
  if (executive === undefined || executive.statementIndexes.length === 0) {
    lines.push(`证据不足：${escapeMarkdown(executive?.missingReason ?? '缺少执行洞察依据。')}`, '')
  }
  lines.push('## 方向地图', '', '以下层次和方向是对批准问题的组织标签，不代表已经独立审核的领域分类。', '',
    '| 研究层次 | 研究方向 | 对应问题 | 当前关注 |', '| --- | --- | --- | --- |')
  for (const direction of directions) lines.push(`| ${escapeMarkdown(direction.layer)} | ${escapeMarkdown(direction.title)} | `
    + `${direction.questionIndexes.map(index => index + 1).join(', ')} | ${escapeMarkdown(direction.themes.map(theme => theme.title).join('；') || '证据不足')} |`)
  lines.push('')
  for (const [offset, direction] of directions.entries()) {
    lines.push(`## 方向 ${offset + 1}：${escapeMarkdown(direction.title)}`, '',
      `研究层次：${escapeMarkdown(direction.layer)}`, `对应问题：${escapeMarkdown(direction.questionIndexes
        .map(index => (brief.questions[index] as string)).join('；'))}`, '')
    component(direction, '方向概览', direction.overview)
    if (direction.themes.length > 0) lines.push('### 当前关注主题', '')
    for (const theme of direction.themes) {
      if (theme.statementIndexes.length === 0) { unmet.push(`${direction.title}／${theme.title}：${theme.missingReason}`); continue }
      lines.push(`#### ${escapeMarkdown(theme.title)}`, '')
      theme.statementIndexes.forEach(index => statement(index))
    }
    if (direction.themeLimit !== null) unmet.push(`${direction.title}／关注主题：${direction.themeLimit}`)
    const parts = [direction.overview, ...direction.themes, direction.mechanism, direction.keyResults,
      direction.judgment, direction.implications]
    const ids = new Set(parts.flatMap(item => item.statementIndexes).flatMap(index =>
      (draft.statements[index] as SynthesisStatement).evidenceLinks.map(link => link.evidenceId)))
    const cited = evidence.filter(record => ids.has(record.evidenceId))
    lines.push('### 代表论文', '')
    const works = metadata.works.filter(work => cited.some(record => record.academicWorkId === work.academicWorkId))
    if (works.length === 0) lines.push('未提供可引用的代表论文。', '')
    for (const work of works) lines.push(`- [${references.get(work.academicWorkId)}] ${workBibliography(work, metadata, cited)}`)
    lines.push('')
    component(direction, '核心机制', direction.mechanism)
    if (direction.keyResults.quantitative && direction.keyResults.statementIndexes.length > 0) {
      lines.push('### 可检查的定量结果', '', '| 结果描述 | 适用条件 | 全文依据 | 不确定性 |', '| --- | --- | --- | --- |')
      for (const index of direction.keyResults.statementIndexes) {
        const item = (draft.statements[index] as SynthesisStatement)
        const links = item.evidenceLinks.filter(link => link.relation === 'supports')
          .map(link => (evidence.find(record => record.evidenceId === link.evidenceId) as EvidenceRecord))
        lines.push(`| ${escapeMarkdown(item.text)} | ${escapeMarkdown(item.scope)} | `
          + `${links.map(record => `[${references.get(record.academicWorkId)}] ${escapeMarkdown(record.sourceLocatorId)}`).join('；')} | `
          + `${escapeMarkdown(item.uncertainty ?? '未说明')} |`)
      }
      lines.push('', '表格保留各项条件，不据此对不同数据集或指标建立统一排名。', '')
    }
    component(direction, direction.keyResults.quantitative ? '关键结果（全文证据与实验条件）' : '关键结果（定性）', direction.keyResults)
    if (direction.judgment.statementIndexes.length > 0) lines.push('以下段落明确标注论文观察或跨论文综合，不把综合解释当作原文事实。', '')
    component(direction, '方向判断', direction.judgment)
    component(direction, `工程或应用含义（面向${escapeMarkdown(brief.targetAudience)}）`, direction.implications)
  }
  lines.push('## 跨方向综合', '')
  const cross = draft.sections.find(section => section.sectionId === 'cross_paper_analysis')
  if (cross !== undefined) cross.statementIndexes.forEach(index => statement(index))
  if (cross === undefined || cross.statementIndexes.length === 0) lines.push(`证据不足：${escapeMarkdown(cross?.missingReason ?? '缺少跨方向综合依据。')}`, '')
  for (const section of draft.sections.filter(section => ['limitations', 'research_gaps'].includes(section.sectionId))) {
    lines.push(`## ${escapeMarkdown(section.title)}`, '')
    section.statementIndexes.forEach(index => statement(index))
    if (section.missingReason !== null) { unmet.push(`${section.title}：${section.missingReason}`); lines.push(`证据不足：${escapeMarkdown(section.missingReason)}`, '') }
  }
  for (const section of draft.sections.filter(section => ['technology_overview', 'paper_landscape', 'key_findings'].includes(section.sectionId))) {
    if (section.statementIndexes.length === 0) {
      if (section.missingReason !== null) unmet.push(`${section.title}：${section.missingReason}`)
      continue
    }
    lines.push(`## ${escapeMarkdown(section.title)}（补充分析索引）`, '')
    section.statementIndexes.forEach(index => statement(index))
  }
  lines.push('## 逐题研究结论', '', '回答状态是模型提议，仍需独立内容审核。', '')
  for (const answer of draft.questionAnswers) {
    lines.push(`### 问题 ${answer.questionIndex + 1}：${escapeMarkdown((brief.questions[answer.questionIndex] as string))}`, '',
      `回答状态：${{ answered: '已提出回答', partial: '部分回答', unanswered: '尚未回答' }[answer.status]}`, '')
    answer.statementIndexes.forEach(index => statement(index))
    if (answer.reason !== null) { unmet.push(`问题 ${answer.questionIndex + 1}：${answer.reason}`); lines.push(`证据缺口：${escapeMarkdown(answer.reason)}`, '') }
  }
  if (unmet.length > 0) lines.push('## 方法补充：方向覆盖限制', '', ...unmet.map(reason => `- ${escapeMarkdown(reason)}`), '')
  lines.push('未提供可核验图示来源及图注，本报告不生成机制图。', '')
  return { unmet }
}
