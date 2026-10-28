/** Offline C-module replay, with immutable inputs and separate comparison outputs. */
import { readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { compactSynthesisPrompt, parseSynthesisDraft, prepareSynthesisInput, synthesisAnalysis, synthesisPrompt,
  type AcademicSynthesisInput } from '@deepseek-ai/dsh-academic-analysis'
import { generateReport, type ReportInput, type ResearchReport } from '@deepseek-ai/dsh-academic-report'
import { renderResearchPage } from '@deepseek-ai/dsh-academic-report'
import { captureCode } from './code.ts'
import { artifact, digest, newDirectory, objectJson, verifyBundle } from './files.ts'

/** Stable comparison facts exclude freshly minted assessment IDs and execution timestamps.
 * @param report Original or replayed report.
 * @returns Status, substantive content and exact Markdown identity.
 */
export function reportSummary(report: ResearchReport) {
  return { mode: report.mode, status: report.evaluation.status, synthetic: report.synthetic,
    claims: report.claims.map(claim => ({ text: claim.text, scope: claim.scope, confidence: claim.confidence })),
    evidenceIds: report.evidence.map(record => record.evidenceId).toSorted(),
    deliveryIssues: report.evaluation.issues.filter(issue => issue.category !== 'content').map(issue => ({ code: issue.code, message: issue.message })),
    contentIssues: report.evaluation.issues.filter(issue => issue.category === 'content').map(issue => ({ code: issue.code, message: issue.message })),
    limitations: [...new Set(report.limitations)], markdownCharacters: [...new Intl.Segmenter('zh-CN').segment(report.markdown)].length,
    markdownSha256: digest(report.markdown) }
}

/** Replay flags never select or authenticate a live provider. */
export interface ReplayOptions {
  readonly bundle: string
  readonly output: string
  readonly responseFile?: string
  readonly comparison?: string
}

function destination(bundle: string, output: string): string {
  const offset = relative(bundle, resolve(output))
  if (offset === '' || (offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset))) {
    throw new Error('Replay output must be outside the frozen bundle.')
  }
  return newDirectory(output)
}

/** Run current report/eval/standalone-view code on frozen upstream material; no network calls occur.
 * @param options Frozen bundle, new output directory, and optional externally generated analysis response.
 * @returns Replay directory with report, evaluation, summary and comparison.
 */
export function replayExperiment(options: ReplayOptions): string {
  const { root, manifest } = verifyBundle(options.bundle)
  const sourceInput = objectJson(readFileSync(resolve(root, '分析输入.json'), 'utf8')) as unknown as AcademicSynthesisInput
  if (prepareSynthesisInput(sourceInput).status === 'blocked') throw new Error('Frozen analysis input is not admissible under current rules.')
  let input = objectJson(readFileSync(resolve(root, '报告输入.json'), 'utf8')) as unknown as ReportInput
  if (options.responseFile !== undefined) {
    const draft = parseSynthesisDraft(readFileSync(options.responseFile, 'utf8'), sourceInput)
    const analysis = synthesisAnalysis(sourceInput, draft, input.assessedAt)
    input = { ...input, claims: analysis.claims, links: analysis.links, synthesis: draft,
      limitations: draft.limitations }
  }
  const reportStarted = performance.now()
  const report = generateReport(input), reportMs = performance.now() - reportStarted, summary = reportSummary(report)
  const baseline = options.comparison === undefined
    ? reportSummary(objectJson(readFileSync(resolve(root, '原始报告.json'), 'utf8')) as unknown as ResearchReport)
    : objectJson(readFileSync(resolve(options.comparison, '汇总.json'), 'utf8'))
  const changes = Object.keys(summary).filter(key => JSON.stringify(summary[key as keyof typeof summary])
    !== JSON.stringify(baseline[key as keyof typeof baseline]))
  const output = destination(root, options.output)
  artifact(output, '报告.md', report.markdown)
  artifact(output, '报告.json', report)
  artifact(output, '评测结果.json', report.evaluation)
  const previewStarted = performance.now()
  const preview = renderResearchPage(report, 'zh-CN'), previewMs = performance.now() - previewStarted
  artifact(output, '页面预览.html', preview)
  artifact(output, '汇总.json', summary)
  artifact(output, '对比.json', { schemaVersion: 1, researchRunId: manifest.researchRunId,
    comparison: options.comparison ?? 'recorded-original-report', changedFields: changes, before: baseline, after: summary,
    note: '自动差异不是质量评分；独立评估可读性、逐题回答与证据支持。原始报告输入含重建字段，详见实验说明。' })
  artifact(output, '实验记录.json', { schemaVersion: 1, researchRunId: manifest.researchRunId,
    code: captureCode(output),
    inputSha256: digest(readFileSync(resolve(root, '报告输入.json'))),
    responseSha256: options.responseFile === undefined ? null : digest(readFileSync(options.responseFile)),
    completedAt: new Date().toISOString(), networkCalls: 0, timing: { evaluationAndReportMs: reportMs, standalonePreviewMs: previewMs },
    preview: '使用现有独立页面渲染器，不代替主 Web 页面和正式 HTML 导出的浏览器验收。' })
  return output
}

/** Produce current synthesis prompts for a controlled future model experiment, without dispatching them.
 * @param bundle Frozen upstream material.
 * @param output New experiment directory outside the bundle.
 * @returns Directory containing exact current prompts and input.
 */
export function prepareAnalysisExperiment(bundle: string, output: string): string {
  const { root } = verifyBundle(bundle)
  const input = objectJson(readFileSync(resolve(root, '分析输入.json'), 'utf8')) as unknown as AcademicSynthesisInput
  const full = synthesisPrompt(input), compact = compactSynthesisPrompt(input)
  const result = destination(root, output)
  artifact(result, '分析输入.json', input)
  artifact(result, '当前分析提示.txt', full)
  artifact(result, '当前压缩恢复提示.txt', compact)
  artifact(result, '说明.json', { code: captureCode(result), networkCalls: 0, note: '只准备提示，没有重新生成分析。若比较模型效果，保持模型与参数一致，并保存实际模型输出后通过 replay --response 重放。' })
  return result
}
