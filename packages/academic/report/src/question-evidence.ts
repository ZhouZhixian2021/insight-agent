/** Show extraction associations separately from model-proposed answers and semantic review. */
import type { EvidenceRecord, ResearchBrief } from '@deepseek-ai/dsh-academic-model'
import type { AcademicSynthesisDraft, AnalysisInput } from '@deepseek-ai/dsh-academic-analysis'
import { escapeMarkdown } from './markdown.ts'

/**
 * Render question-level evidence facts without promoting them to approved answers.
 * @param brief Approved question order.
 * @param draft Structurally checked analysis proposals, not reviewer decisions.
 * @param evidence Cited original records with immutable source levels.
 * @param links Producer extraction associations, absent when not forwarded by the workflow.
 * @returns An inspectable table and limitations on missing associations or question support.
 */
export function renderQuestionEvidence(brief: ResearchBrief, draft: AcademicSynthesisDraft,
  evidence: readonly EvidenceRecord[], links?: AnalysisInput['questionLinks']) {
  const lines = ['## 研究问题与证据核对', '',
    '证据关联仅说明抽取材料对应哪个问题；模型拟回答、逐字摘录核验与内容审核是不同状态。完整卡片未填满不等于零证据，已有原文证据也不代表二级增强或正式审核完成。', '',
    '| 已批准研究问题 | 模型回答提案 | 本题已引用的关联原文 | 内容审核 |', '|---|---|---|---|']
  const limitations: string[] = []
  if (links === undefined) limitations.push('未提供抽取阶段的逐题证据关联，不能把模型填写的问题索引视为已核实的覆盖；逐题回答仍需内容审核。')
  const states = { answered: '拟回答', partial: '部分回答', unanswered: '未回答' }
  for (const [index, question] of brief.questions.entries()) {
    const answer = draft.questionAnswers.find(item => item.questionIndex === index)
    const supporting = new Set(answer?.statementIndexes.flatMap(offset => draft.statements[offset]?.evidenceLinks
      .filter(link => link.relation === 'supports').map(link => link.evidenceId) ?? []) ?? [])
    const records = evidence.filter(record => supporting.has(record.evidenceId)
      && links?.some(link => link.evidenceId === record.evidenceId && link.question === question))
    const associated = links === undefined ? '未提供抽取关联' : records.length === 0 ? '无本题关联的支持证据'
      : records.map(record => `${record.evidenceId}（${record.level === 'fulltext' ? '全文' : record.level === 'abstract' ? '摘要' : '元数据'}）`).join('；')
    if (links !== undefined && records.length === 0) limitations.push(`问题 ${index + 1}：没有本题关联的已引用支持证据，不能据此认定已获回答。`)
    lines.push(`| ${index + 1}. ${escapeMarkdown(question)} | ${answer === undefined ? '未提供回答' : states[answer.status]} | ${escapeMarkdown(associated)} | 待审核 |`)
  }
  lines.push('', '证据不足时仅保留批准策略允许的受限草稿；关键数字、冲突结论和正式交付仍需相应证据增强及审核。', '')
  return { lines, limitations }
}
