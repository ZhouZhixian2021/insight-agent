/** Resolve Plan requirements and admit only verified evidence for model synthesis. */
import { isExecutableResearchBrief, type AcademicWorkId, type EvidenceCardItem, type ResearchBrief } from '@deepseek-ai/dsh-academic-model'
import { prepareAnalysisInput } from './prepare.ts'
import { SYNTHESIS_SECTIONS, SynthesisError, type AcademicSynthesisInput, type SynthesisSectionId } from './synthesis-types.ts'

/**
 * Resolve the supported report requirements before network work.
 * @param brief Approved research requirements.
 * @returns Canonical required section identifiers, in report order.
 */
export function synthesisSections(brief: ResearchBrief): readonly SynthesisSectionId[] {
  if (!isExecutableResearchBrief(brief)) throw new SynthesisError('Current Brief requires approval.', 'SYNTHESIS_BRIEF_NOT_APPROVED')
  return validateSynthesisRequirements(brief)
}

/**
 * Check executable report requirements without granting approval to a proposed Brief.
 * @param brief Proposed or approved report requirements and included version states.
 * @returns Canonical report sections when every requirement is supported.
 */
export function validateSynthesisRequirements(
  brief: Pick<ResearchBrief, 'reportRequirements' | 'includedWorkTypes'>,
): readonly SynthesisSectionId[] {
  const requirements = brief.reportRequirements
  const aliases: Readonly<Record<string, string>> = { research_scope: 'scope_and_method', directions: 'technology_overview' }
  const requested = requirements.requiredSections.map(section => aliases[section] ?? section)
  const errors: string[] = []
  if (requirements.language !== 'zh-CN') errors.push(`报告语言 language=${JSON.stringify(requirements.language)}；当前支持 zh-CN（简体中文）`)
  if (requirements.citationStyle !== 'numeric') errors.push(`引用格式 citationStyle=${JSON.stringify(requirements.citationStyle)}；当前支持 numeric（数字编号）`)
  if (requirements.targetLength.unit !== 'characters') {
    errors.push(`篇幅单位 targetLength.unit=${JSON.stringify(requirements.targetLength.unit)}；当前支持 characters（字符数）`)
  }
  const unsupportedSections = requirements.requiredSections.filter((_section, index) =>
    !SYNTHESIS_SECTIONS.some(known => known === requested[index]))
  if (unsupportedSections.length > 0) errors.push(`报告章节 requiredSections=${JSON.stringify(unsupportedSections)}；当前支持 ${[...SYNTHESIS_SECTIONS, ...Object.keys(aliases)].join(', ')}`)
  const unsupportedTypes = brief.includedWorkTypes.filter(type => !['preprint', 'accepted_manuscript', 'version_of_record'].includes(type))
  if (unsupportedTypes.length > 0) {
    errors.push(`论文版本 includedWorkTypes=${JSON.stringify(unsupportedTypes)}；当前支持 preprint（预印本）、accepted_manuscript（录用稿）、version_of_record（正式发表版本）。会议／期刊类别不能直接替换为版本状态`)
  }
  if (errors.length > 0) {
    throw new SynthesisError(`研究计划暂不支持以下要求：\n${errors.join('\n')}\n请修正计划并重新提交审核；不会自动更改已批准的研究范围。`, 'SYNTHESIS_UNSUPPORTED_PLAN')
  }
  const required = new Set([...requested, 'executive_summary', 'key_findings', 'references'])
  if (requirements.includeMethodology) required.add('scope_and_method')
  if (requirements.includeLimitations) required.add('limitations')
  if (requirements.includeResearchGaps) required.add('research_gaps')
  if (requirements.includeEvidenceAppendix) required.add('evidence_appendix')
  return SYNTHESIS_SECTIONS.filter(section => required.has(section))
}

/** Prepared evidence or an explicit reason why no insight report is permitted. */
export type SynthesisAdmission =
  | { readonly status: 'ready'; readonly input: AcademicSynthesisInput; readonly limitations: readonly string[]; readonly usableWorkIds: readonly AcademicWorkId[] }
  | { readonly status: 'blocked'; readonly reasons: readonly string[]; readonly usableWorkIds: readonly AcademicWorkId[] }

/**
 * Exclude invalid relationships and count independent works from usable evidence.
 * @param input Exact Brief and observed materials; downloaded full text alone does not count.
 * @returns Sanitized model input or unmet evidence thresholds without lowering the Plan.
 */
export function prepareSynthesisInput(input: AcademicSynthesisInput): SynthesisAdmission {
  synthesisSections(input.brief)
  const prepared = prepareAnalysisInput(input.analysisInput)
  const selected = prepared.works.flatMap((work) => {
    const version = work.versions.find(item => item.version.workVersionId === work.work.canonicalVersionId)
      ?? (work.versions.length === 1 ? work.versions[0] : undefined)
    if (!version || (!input.brief.evidenceRequirements.allowPreprints && version.version.versionType === 'preprint')) return []
    const records = version.evidenceRecords.filter(record => record.verbatimExcerpt.status === 'available'
      && record.contentHash.status === 'available' && version.version.contentHash.status === 'available'
      && version.sourceLocators.some(locator => locator.sourceLocatorId === record.sourceLocatorId && locator.contentHash !== null)
      && (input.brief.evidenceRequirements.minimumEvidenceLevel !== 'fulltext' || record.level === 'fulltext'))
    if (records.length === 0) return []
    const ids = new Set(records.map(record => record.evidenceId))
    const filter = <T extends EvidenceCardItem>(items: readonly T[]): readonly T[] =>
      items.filter(item => item.evidenceIds.length > 0 && item.evidenceIds.every(id => ids.has(id)))
    const cards = version.cards.map(card => ({ ...card, researchQuestions: filter(card.researchQuestions),
      methods: filter(card.methods), datasets: filter(card.datasets), metrics: filter(card.metrics),
      findings: filter(card.findings), limitations: filter(card.limitations) }))
    return [{ work: work.work, version: version.version, records, cards,
      locators: version.sourceLocators.filter(locator => records.some(record => record.sourceLocatorId === locator.sourceLocatorId)) }]
  })
  const fulltext = selected.filter(item => item.records.some(record => record.level === 'fulltext')).length
  const minimum = input.brief.evidenceRequirements
  const reasons: string[] = []
  if (selected.length === 0) reasons.push('没有可用于洞察分析的已核验证据。')
  if (selected.length < minimum.minimumIncludedWorks) reasons.push(`可用证据涉及 ${selected.length} 篇独立论文，Plan 至少要求 ${minimum.minimumIncludedWorks} 篇。`)
  if (fulltext < minimum.minimumFulltextWorks) reasons.push(`提供可用全文证据的论文有 ${fulltext} 篇，Plan 至少要求 ${minimum.minimumFulltextWorks} 篇。`)
  if (reasons.length > 0) return { status: 'blocked', usableWorkIds: selected.map(item => item.work.academicWorkId),
    reasons: [...reasons, `不足时策略：${minimum.insufficientEvidencePolicy}；保留已完成工作，不生成洞察报告。`] }
  const limitations = prepared.issues.map(issue => `${issue.code}: ${issue.message}`)
  if (selected.reduce((count, item) => count + item.records.length, 0) !== input.analysisInput.evidenceRecords.length) {
    limitations.push('部分材料未通过证据版本、原文或哈希检查，未提交给洞察模型。')
  }
  return { status: 'ready', usableWorkIds: selected.map(item => item.work.academicWorkId), limitations, input: { ...input, analysisInput: {
    academicWorks: selected.map(item => item.work), workVersions: selected.map(item => item.version),
    evidenceRecords: selected.flatMap(item => item.records), evidenceCards: selected.flatMap(item => item.cards),
    sourceLocators: selected.flatMap(item => item.locators),
  } } }
}
