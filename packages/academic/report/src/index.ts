/** Markdown delivery with mandatory current-evidence evaluation and visible limitations. */
import { evaluateClaims, type EvaluationInput, type EvaluationResult } from '@deepseek-ai/dsh-academic-eval'
import type { AcademicWork, ClaimRecord, EvidenceRecord } from '@deepseek-ai/dsh-academic-model'
import type { AcademicSynthesisDraft } from '@deepseek-ai/dsh-academic-analysis'
import type { CoverageSummary } from '@deepseek-ai/dsh-academic-model'
import { escapeMarkdown, renderSynthesis } from './synthesis-render.ts'
import { appendRetrievalDisclosure, type RetrievalDisclosure } from './retrieval-disclosure.ts'
export { appendRetrievalDisclosure } from './retrieval-disclosure.ts'
export type { RetrievalDisclosure } from './retrieval-disclosure.ts'

/** Report-owned delivery format, not a second paper or Claim model. */
export interface ResearchReport {
  readonly title: string
  readonly mode: 'draft' | 'final'
  readonly synthetic: boolean
  readonly markdown: string
  readonly evaluation: EvaluationResult
  readonly claims: readonly ClaimRecord[]
  readonly evidence: readonly EvidenceRecord[]
  readonly limitations: readonly string[]
}

/** Caller explicitly selects publication mode and discloses synthetic data. */
export interface ReportInput extends EvaluationInput {
  /** Producer-observed retrieval facts; omitted by legacy callers. */
  readonly retrievalDisclosure?: RetrievalDisclosure
  /** Validated question-driven model analysis; legacy extractive callers may omit it. */
  readonly synthesis?: AcademicSynthesisDraft
  /** Observed retrieval counts, required with synthesis. */
  readonly coverage?: CoverageSummary
  readonly works: readonly AcademicWork[]
  readonly limitations: readonly string[]
  readonly mode: 'draft' | 'final'
  readonly synthetic: boolean
}

/**
 * Produce a Chinese Markdown research report and retain inspectable source records.
 * @param input Current evidence and reviews; final mode requires a ready evaluation.
 * @returns A report that discloses evidence and semantic-review limitations.
 * @throws Error if final publication is requested while evaluation is not ready.
 */
export function generateReport(input: ReportInput): ResearchReport {
  let evaluation = evaluateClaims({ ...input,
    ...input.synthesis === undefined ? {} : { sourceStatements: input.synthesis.statements.filter(statement => statement.kind === 'source_statement') },
  })
  if (evaluation.issues.some(issue => issue.code === 'evidence_not_admitted')) {
    throw new Error('Unadmitted evidence cannot enter report claims or references, including drafts.')
  }
  if (input.mode === 'final' && (evaluation.status !== 'ready' || input.synthetic)) {
    throw new Error('Final report requires supporting reviews, current evidence, sufficient coverage and non-synthetic data.')
  }
  const supportedSections = new Set(['executive_summary', 'scope_and_method', 'cross_paper_analysis', 'limitations', 'references', 'evidence_appendix'])
  if (input.synthesis === undefined && input.mode === 'final' && (input.brief.reportRequirements.language !== 'zh-CN'
    || input.brief.reportRequirements.citationStyle !== 'numeric'
    || input.brief.reportRequirements.includeResearchGaps
    || input.brief.reportRequirements.requiredSections.some(section => !supportedSections.has(section)))) {
    throw new Error('Requested report language, citation style or sections require a different renderer.')
  }
  const byWork = new Map(input.works.map(work => [work.academicWorkId, work]))
  if (byWork.size !== input.works.length) throw new Error('Duplicate work identities in report input.')
  const cited = new Set([...input.links.map(link => link.evidenceId),
    ...input.synthesis?.statements.flatMap(statement => statement.evidenceLinks.map(link => link.evidenceId)) ?? []])
  const evidence = input.evidence.filter(record => cited.has(record.evidenceId))
  if (evidence.some(record => !byWork.has(record.academicWorkId))) throw new Error('Cited work bibliography is missing.')
  const workIds = [...new Set(evidence.map(record => record.academicWorkId))]
  const references = new Map(workIds.map((id, index) => [id, index + 1]))
  const limitations = [...input.limitations, ...evaluation.issues.map(issue => issue.message)]
  const lines = [`# ${escapeMarkdown(input.brief.topic)}`, '',
    input.mode === 'draft' ? '> 草稿：未经完整审核，不作为最终研究结论。' : '> 已完成当前证据与语义审核。',
    input.synthetic ? '> 合成基准样例：论文和结果均为虚构，仅用于验证软件流程。' : '> 来源为调用方提供的研究材料。', '']
  if (input.synthesis !== undefined) {
    if (input.coverage === undefined) throw new Error('Synthesis report requires observed coverage.')
    const rendered = renderSynthesis(input.brief, input.synthesis, evidence, references, input.coverage)
    lines.push(...rendered.lines)
    limitations.push(...rendered.unmet, '问题回答与单篇论文陈述尚未经过独立语义审核。')
    evaluation = { ...evaluation, status: evaluation.status === 'blocked' ? 'blocked' : 'needs_review',
      issues: [...evaluation.issues, { claimId: null, code: 'question_review_required', message: '逐题回答仍需内容审核。' },
        ...rendered.unmet.map(message => ({ claimId: null, code: 'unmet_plan', message }))] }
    if (input.mode === 'final') throw new Error('Question-driven synthesis requires independent question review before final publication.')
  } else {
    lines.push(
      '## 管理层摘要', '', `纳入 ${workIds.length} 项研究，形成 ${input.claims.length} 条对比记录。质量状态：${evaluation.status}。`, '',
      '## 范围与方法', '', escapeMarkdown(input.brief.questions.join('；')),
      '仅整理给定材料，不执行补充搜索；结论范围限于纳入的论文与实验条件。', '', '## 论文对比与证据', '')
    for (const [index, claim] of input.claims.entries()) {
      const assessmentStatus = evaluation.assessments.filter(item => item.claimId === claim.claimId).map(item => item.status).join(', ')
      const links = input.links.filter(link => link.claimId === claim.claimId)
      lines.push(`### ${index + 1}. ${escapeMarkdown(claim.category)}`, '', escapeMarkdown(claim.text), '',
        `适用范围：${escapeMarkdown(claim.scope)}`, `置信度：${claim.confidence}；评测：${assessmentStatus}`,
        `依据：${escapeMarkdown(claim.confidenceReasons.join('；'))}`,
        `不确定性：${escapeMarkdown(claim.uncertainty ?? '未说明')}`, '')
      for (const link of links) {
        const record = evidence.find(item => item.evidenceId === link.evidenceId)
        lines.push(`- ${link.relation}：${record ? `[${references.get(record.academicWorkId)}]` : '缺失来源'}；证据 ${escapeMarkdown(link.evidenceId)}；${escapeMarkdown(link.rationale)}`)
      }
      lines.push('')
    }
    if (input.claims.length === 0) lines.push('证据不足，未形成可用的跨论文结论。', '')
  }
  lines.push('## 局限与质量检查', '', ...limitations.map(text => `- ${escapeMarkdown(text)}`), '',
    '## 参考文献', '')
  for (const work of input.works.filter(item => references.has(item.academicWorkId))) {
    lines.push(`${references.get(work.academicWorkId)}. ${escapeMarkdown(work.title)} — ${escapeMarkdown(work.authors.join(', '))}；正式引用版本：${escapeMarkdown(work.canonicalVersionId)}`)
  }
  lines.push('', '## 证据附录', '')
  for (const record of evidence) {
    let url = '来源 URL 不可用'
    try {
      const parsed = new URL(record.sourceUrl)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') url = parsed.href.replace(/[<>\s]/gu, encodeURIComponent)
    } catch { /* An invalid provider URL is retained in the raw record but never emitted as an active link. */ }
    lines.push(`### ${escapeMarkdown(record.evidenceId)}`, '',
      `实际证据版本：${escapeMarkdown(record.workVersionId)}；证据等级：${record.level}；获取时间：${escapeMarkdown(record.retrievedAt)}`,
      `来源：${url.startsWith('http') ? `<${url}>` : url}；定位：${escapeMarkdown(record.sourceLocatorId)}`, '',
      `> ${escapeMarkdown(record.verbatimExcerpt.status === 'available' ? record.verbatimExcerpt.value : '原文不可用，无法直接核验。')}`, '')
  }
  const body = `${lines.join('\n').trimEnd()}\n`
  const markdown = input.retrievalDisclosure === undefined ? body : appendRetrievalDisclosure(body, input.retrievalDisclosure)
  const target = input.brief.reportRequirements.targetLength
  if (input.mode === 'final' && (target.minimum !== null || target.maximum !== null)) {
    if (target.unit !== 'characters') throw new Error('Final length checks support characters only.')
    const length = Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(markdown)).length
    if ((target.minimum !== null && length < target.minimum) || (target.maximum !== null && length > target.maximum)) {
      throw new Error('Final report does not meet the approved length limits.')
    }
  }
  return { title: input.brief.topic, mode: input.mode, synthetic: input.synthetic, markdown,
    evaluation, claims: input.claims, evidence, limitations }
}
