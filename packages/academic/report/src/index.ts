/** Markdown delivery with mandatory current-evidence evaluation and visible limitations. */
import { evaluateClaims, type EvaluationInput, type EvaluationResult } from '@deepseek-ai/dsh-academic-eval'
import type { AcademicWork, ClaimRecord, EvidenceRecord, ClaimEvidenceRelation } from '@deepseek-ai/dsh-academic-model'
import type { AcademicSynthesisDraft, AnalysisInput } from '@deepseek-ai/dsh-academic-analysis'
import type { CoverageSummary } from '@deepseek-ai/dsh-academic-model'
import { escapeMarkdown, renderSynthesis } from './synthesis-render.ts'
import { renderQuestionEvidence } from './question-evidence.ts'
import { workBibliography, type ReportMetadata } from './bibliography.ts'
import { appendRetrievalDisclosure, type RetrievalDisclosure } from './retrieval-disclosure.ts'
import { summarizeReportLimitations } from './limitation-summary.ts'
export { summarizeReportLimitations } from './limitation-summary.ts'
export type { ReportLimitationSummary } from './limitation-summary.ts'

const relationLabels: Record<ClaimEvidenceRelation, string> = {
  supports: '支持依据', contradicts: '不同发现／相反证据', background: '背景材料（不直接支持结论）',
}
export { renderResearchPage } from './html-preview.ts'
export { appendRetrievalDisclosure } from './retrieval-disclosure.ts'
export type { RetrievalDisclosure } from './retrieval-disclosure.ts'

/** Report-owned delivery format, not a second paper or Claim model. */
export interface ResearchReport {
  /** True when Markdown already includes the producer's retrieval disclosure appendix. */
  readonly retrievalDisclosureIncluded?: true
  readonly title: string
  readonly mode: 'draft' | 'final'
  readonly synthetic: boolean
  readonly markdown: string
  readonly evaluation: EvaluationResult
  readonly claims: readonly ClaimRecord[]
  readonly evidence: readonly EvidenceRecord[]
  readonly limitations: readonly string[]
}

/** Caller selects automatic delivery or an explicit mode and discloses synthetic data. */
export interface ReportInput extends EvaluationInput {
  /** Producer-observed retrieval facts; omitted by legacy callers. */
  readonly retrievalDisclosure?: RetrievalDisclosure
  /** Producer question associations; omission is disclosed and never inferred from model prose. */
  readonly questionLinks?: AnalysisInput['questionLinks']
  /** Validated question-driven model analysis; legacy extractive callers may omit it. */
  readonly synthesis?: AcademicSynthesisDraft
  /** Observed retrieval counts, required with synthesis. */
  readonly coverage?: CoverageSummary
  readonly works: readonly AcademicWork[]
  readonly limitations: readonly string[]
  readonly mode: 'draft' | 'final' | 'auto'
  readonly synthetic: boolean
}

/** Report-local operation observed at its actual execution point. */
export type ReportGenerationOperation = 'evaluation' | 'rendering'

/** Synchronous observer for report generation operations. */
export type ReportGenerationObserver = (operation: ReportGenerationOperation) => void

/**
 * Produce a Chinese Markdown research report and retain inspectable source records.
 * @param input Current evidence and optional reviews; auto selects final only when delivery checks pass.
 * @param onOperation Optional observer called before evaluation and before Markdown rendering; observer errors are ignored.
 * @returns A report that discloses evidence and semantic-review limitations.
 * @throws Error if final publication is requested while evaluation is not ready.
 */
export function generateReport(input: ReportInput, onOperation?: ReportGenerationObserver): ResearchReport {
  reportOperation(onOperation, 'evaluation')
  let evaluation = evaluateClaims({ ...input,
    ...input.synthesis === undefined ? {} : { sourceStatements: input.synthesis.statements.filter(statement => statement.kind === 'source_statement') },
  })
  if (evaluation.issues.some(issue => issue.code === 'evidence_not_admitted')) {
    throw new Error('Unadmitted evidence cannot enter report claims or references, including drafts.')
  }
  if (input.synthetic) evaluation = { ...evaluation, status: 'blocked', issues: [...evaluation.issues,
    { claimId: null, category: 'delivery', code: 'synthetic_data', message: '合成测试材料不能作为正式报告交付。' }] }
  const supportedSections = new Set(['executive_summary', 'scope_and_method', 'cross_paper_analysis', 'limitations', 'references', 'evidence_appendix'])
  if (input.synthesis === undefined && (input.brief.reportRequirements.language !== 'zh-CN'
    || input.brief.reportRequirements.citationStyle !== 'numeric'
    || input.brief.reportRequirements.includeResearchGaps
    || input.brief.reportRequirements.requiredSections.some(section => !supportedSections.has(section)))) {
    evaluation = { ...evaluation, status: 'blocked', issues: [...evaluation.issues,
      { claimId: null, category: 'delivery', code: 'unsupported_format', message: 'Requested report language, citation style or sections require a different renderer.' }] }
  }
  const byWork = new Map(input.works.map(work => [work.academicWorkId, work]))
  if (byWork.size !== input.works.length) throw new Error('Duplicate work identities in report input.')
  const cited = new Set([...input.links.map(link => link.evidenceId),
    ...input.synthesis?.statements.flatMap(statement => statement.evidenceLinks.map(link => link.evidenceId)) ?? []])
  const evidence = input.evidence.filter(record => cited.has(record.evidenceId))
  if (evidence.some(record => !byWork.has(record.academicWorkId))) throw new Error('Cited work bibliography is missing.')
  if (input.synthesis !== undefined && evidence.length === 0) throw new Error('No cited evidence is available for a research draft.')
  const synthesisInput = input.synthesis === undefined ? null
    : { draft: input.synthesis, coverage: requiredCoverage(input.coverage) }
  const workIds = [...new Set(evidence.map(record => record.academicWorkId))]
  const references = new Map(workIds.map((id, index) => [id, index + 1]))
  const limitations = [...input.limitations]
  const metadata: ReportMetadata = { works: input.works, versions: input.versions, reportDate: input.assessedAt }
  reportOperation(onOperation, 'rendering')
  const lines = [`# ${escapeMarkdown(input.brief.topic)}`, '',
    '> 基于本轮证据自动生成；交付检查通过不代表独立语义审核通过。',
    input.synthetic ? '> 合成基准样例：论文和结果均为虚构，仅用于验证软件流程。' : '> 来源为调用方提供的研究材料。', '']
  const openingEnd = lines.length
  if (synthesisInput !== null) {
    const scopeStart = lines.length
    lines.push('## 报告信息与研究范围', '', `技术范围：${escapeMarkdown(input.brief.topic)}`,
      `发表时间窗口：${escapeMarkdown(input.brief.publicationWindow.start?.iso ?? '未限定')}—${escapeMarkdown(input.brief.publicationWindow.end?.iso ?? '未限定')}；`
        + `日期口径：${input.brief.publicationWindow.dateBasis === 'published' ? '所选版本发布日期' : '首次公开日期'}`, `报告日期：${escapeMarkdown(metadata.reportDate.slice(0, 10))}`,
      `面向读者：${escapeMarkdown(input.brief.targetAudience)}`,
      `引用证据来源：${escapeMarkdown([...new Set(evidence.map(record => record.sourceProvider))].join(', ') || '未提供')}`,
      `纳入规则：${escapeMarkdown(input.brief.inclusionRules.join('；') || '未提供')}`,
      `排除规则：${escapeMarkdown(input.brief.exclusionRules.join('；') || '未提供')}`,
      `发表版本政策：${escapeMarkdown(input.brief.includedWorkTypes.join(', '))}；允许预印本：${input.brief.evidenceRequirements.allowPreprints ? '是' : '否'}`,
      '证据范围限于本轮已核验材料；未满足的方向与实验条件在方法补充及局限中披露。',
      input.retrievalDisclosure === undefined ? '未提供实际检索渠道明细，不能据此宣称来源覆盖完整。'
        : '实际检索渠道、来源失败及数量上限见本次检索披露；引用证据来源不代表全部检索来源。', '')
    const rendered = renderSynthesis(input.brief, synthesisInput.draft, evidence, references, synthesisInput.coverage, metadata)
    const questions = renderQuestionEvidence(input.brief, synthesisInput.draft, evidence, input.questionLinks)
    if (synthesisInput.draft.writingStyle === 'evidence_narrative') {
      const scope = lines.splice(scopeStart)
      lines.push(...rendered.lines, ...scope, ...questions.lines)
    } else lines.push(...questions.lines, ...rendered.lines)
    limitations.push(...questions.limitations, ...rendered.unmet)
    const deliveryIssues = rendered.deliveryFailures.map(message => ({ claimId: null, category: 'delivery' as const, code: 'unmet_plan', message }))
    const contentIssues = [...new Set([...questions.limitations, ...rendered.unmet])]
      .map(message => ({ claimId: null, category: 'content' as const, code: 'content_limitation', message }))
    evaluation = { ...evaluation, status: evaluation.status === 'blocked' || deliveryIssues.length > 0 ? 'blocked' : 'ready',
      issues: [...evaluation.issues, ...deliveryIssues, ...contentIssues] }
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
        lines.push(`- ${relationLabels[link.relation]}：${record ? `[${references.get(record.academicWorkId)}]` : '缺失来源'}；证据 ${escapeMarkdown(link.evidenceId)}；${escapeMarkdown(link.rationale)}`)
      }
      lines.push('')
    }
    if (input.claims.length === 0) lines.push('证据不足，未形成可用的跨论文结论。', '')
  }
  const deliveryIssues = evaluation.issues.filter(issue => issue.category !== 'content')
  const contentIssues = [...new Set([...limitations, ...evaluation.issues.filter(issue => issue.category === 'content').map(issue => issue.message)])]
  const versionTitles = new Map(input.versions.flatMap((version) => {
    const work = byWork.get(version.academicWorkId)
    return work === undefined ? [] : [[String(version.workVersionId), work.title] as const]
  }))
  const organized = summarizeReportLimitations(contentIssues, versionTitles)
  if (organized.keyLimitations.length > 0) lines.splice(openingEnd, 0, '## 关键限制', '',
    ...organized.keyLimitations.map(text => `- ${escapeMarkdown(text)}`), '')
  lines.push('## 交付未达标原因', '', ...(deliveryIssues.length === 0 ? ['无；当前已执行的交付检查通过。'] : deliveryIssues.map(issue => `- ${escapeMarkdown(issue.message)}`)), '',
    '## 逐题内容缺口', '', ...(organized.questionGaps.length === 0 ? ['本轮未记录额外逐题缺口；不代表独立语义审核通过。'] : organized.questionGaps.map(text => `- ${escapeMarkdown(text)}`)), '',
    '## 筛选与处理记录', '', ...(organized.processingNotes.length === 0 ? ['未记录额外处理说明。'] : organized.processingNotes.map(text => `- ${escapeMarkdown(text)}`)), '',
    '## 运行诊断（原始记录）', '', '以下保留去重后的生产方原始说明，包含内部字段及批次信息；不是新增的内容结论。', '',
    ...organized.diagnostics.map(text => `- ${escapeMarkdown(text)}`), '',
    '## 参考文献', '')
  for (const work of input.works.filter(item => references.has(item.academicWorkId))) {
    lines.push(`${references.get(work.academicWorkId)}. ${workBibliography(work, metadata, evidence)}`)
  }
  lines.push('', '## 证据附录', '')
  const appendixWorks = input.works.filter(work => references.has(work.academicWorkId)).toSorted((a, b) =>
    a.title.localeCompare(b.title, 'zh-CN') || a.academicWorkId.localeCompare(b.academicWorkId, 'en'))
  for (const work of appendixWorks) {
    lines.push(`### [${references.get(work.academicWorkId)}] ${escapeMarkdown(work.title || work.academicWorkId)}`, '')
    const versions = [...new Set(evidence.filter(record => record.academicWorkId === work.academicWorkId)
      .map(record => record.workVersionId))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    for (const version of versions) {
      lines.push(`#### 版本 ${escapeMarkdown(version)}`, '')
      for (const record of evidence.filter(record => record.academicWorkId === work.academicWorkId && record.workVersionId === version)) {
        let url = '来源 URL 不可用'
        try {
          const parsed = new URL(record.sourceUrl)
          if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.username === '' && parsed.password === '') url = parsed.href.replace(/[<>\s]/gu, encodeURIComponent)
        } catch { /* An invalid provider URL is retained in the raw record but never emitted as an active link. */ }
        lines.push(`##### ${escapeMarkdown(record.evidenceId)}`, '',
          `实际证据版本：${escapeMarkdown(record.workVersionId)}；证据等级：${record.level}；获取时间：${escapeMarkdown(record.retrievedAt)}`,
          `来源：${url.startsWith('http') ? `<${url}>` : url}；定位：${escapeMarkdown(record.sourceLocatorId)}`, '',
          `> ${escapeMarkdown(record.verbatimExcerpt.status === 'available' ? record.verbatimExcerpt.value : '原文不可用，无法直接核验。')}`, '')
      }
    }
  }
  const body = `${lines.join('\n').trimEnd()}\n`
  const markdown = input.retrievalDisclosure === undefined ? body : appendRetrievalDisclosure(body, input.retrievalDisclosure)
  const mode = input.mode === 'auto' ? evaluation.status === 'ready' ? 'final' : 'draft' : input.mode
  if (mode === 'final' && evaluation.status !== 'ready') throw new Error(`Final report requires passing delivery checks: ${evaluation.issues.filter(issue => issue.category !== 'content').map(issue => issue.message).join(' ')}`)
  const notice = mode === 'draft' ? '> 草稿：交付条件尚未全部满足或调用方选择草稿。' : '> 报告已生成：当前交付检查通过。'
  const deliveredMarkdown = markdown.replace('\n\n', `\n\n${notice}\n`)
  return { title: input.brief.topic, mode, synthetic: input.synthetic, markdown: deliveredMarkdown,
    ...input.retrievalDisclosure === undefined ? {} : { retrievalDisclosureIncluded: true as const },
    evaluation, claims: input.claims, evidence, limitations }
}

function reportOperation(observer: ReportGenerationObserver | undefined, operation: ReportGenerationOperation): void {
  if (observer === undefined) return
  try {
    observer(operation)
  } catch {
    // Report progress is observational; a broken subscriber cannot change the generated report.
  }
}

function requiredCoverage(coverage: CoverageSummary | undefined): CoverageSummary {
  if (coverage === undefined) throw new Error('Synthesis report requires observed coverage.')
  return coverage
}
