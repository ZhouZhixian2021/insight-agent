/** Fixed-material A/B writing outputs; no provider execution or production state mutation. */
import { readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { AcademicSynthesisInput } from '@deepseek-ai/dsh-academic-analysis'
import type { ReportInput } from '@deepseek-ai/dsh-academic-report'
import { writingExperimentPrompt } from '../../packages/academic/analysis/src/writing-experiment.ts'
import { parseWritingDraft, renderWritingExperiment } from '../../packages/academic/report/src/writing-experiment.ts'
import { artifact, digest, newDirectory, objectJson, verifyBundle } from './files.ts'
import { captureCode } from './code.ts'

/**
 * Compare two supplied writing documents over identical upstream material; selected citations are outputs.
 * @param bundle Verified frozen export.
 * @param variants Task-template and open-source-inspired JSON files, in that order.
 * @param output New destination outside the frozen export.
 * @returns Experiment directory; outputs are experimental drafts, never production reports.
 */
export function compareWriting(bundle: string, variants: readonly [string, string], output: string): string {
  const { root, manifest } = verifyBundle(bundle)
  const source = readFileSync(resolve(root, '分析输入.json'), 'utf8')
  const analysis = objectJson(source) as unknown as AcademicSynthesisInput
  const originalInput = objectJson(readFileSync(resolve(root, '报告输入.json'), 'utf8')) as unknown as ReportInput
  const input: ReportInput = { ...originalInput, evidence: analysis.analysisInput.evidenceRecords }
  const drafts = variants.map(file => parseWritingDraft(readFileSync(file, 'utf8')))
  if (drafts[0]?.strategy !== 'task_template' || drafts[1]?.strategy !== 'open_source_inspired') {
    throw new Error('Provide the task-template draft first and the open-source-inspired draft second.')
  }
  const reports = drafts.map(draft => renderWritingExperiment(input, draft))
  const dest = resolve(output)
  const offset = relative(root, dest)
  if (offset === '' || (!isAbsolute(offset) && offset !== '..' && !offset.startsWith(`..${sep}`))) {
    throw new Error('Output must be outside the frozen bundle.')
  }
  newDirectory(dest)
  artifact(dest, '共同分析输入.json', JSON.parse(source) as unknown)
  const metrics = reports.map((report, index) => {
    const label = index === 0 ? 'A-任务模板' : 'B-开源思路'
    artifact(dest, `${label}.md`, report.markdown)
    artifact(dest, `${label}.json`, report)
    artifact(dest, `${label}-写作输入.json`, drafts[index])
    artifact(dest, `${label}-提示.txt`, writingExperimentPrompt(analysis, index === 0 ? 'task_template' : 'open_source_inspired', 'comparison'))
    return { label, characters: [...new Intl.Segmenter('zh-CN').segment(report.markdown)].length,
      headings: report.markdown.match(/^#{1,6} /gmu)?.length ?? 0,
      paragraphJumps: report.markdown.match(/见\[分析段落/gu)?.length ?? 0,
      citedEvidence: report.evidence.length, citedWorks: new Set(report.evidence.map(record => record.academicWorkId)).size,
      mechanicalStatus: report.evaluation.status }
  })
  artifact(dest, '实验说明.json', { schemaVersion: 1, researchRunId: manifest.researchRunId,
    analysisInputSha256: digest(source), writingFiles: variants.map(file => ({ file, sha256: digest(readFileSync(file)) })),
    writer: '外部提供的写作文件；本离线命令不核实作者。真实模型比较需要另外提供请求、结果和参数记录。',
    promptProvenance: '提示文件为两种写法的可复用规范；当前实验稿由对话模型依据相同要求生成，不是这些提示经服务调用返回的日志。',
    code: captureCode(dest), networkCallsByScript: 0, semanticApproval: false, productionDelivery: false,
    metrics, note: '比较仅用于写作结构与可读性评估；机械检查通过不能证明语义正确。原始论文缺失不作为本轮优化目标。' })
  return dest
}
