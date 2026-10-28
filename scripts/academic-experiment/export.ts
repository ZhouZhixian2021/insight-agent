/** Export one completed scholarly run into private, checksummed C-module experiment material. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSynthesisDraft, prepareSynthesisInput, synthesisAnalysis } from '@deepseek-ai/dsh-academic-analysis'
import type { ReportInput, RetrievalDisclosure } from '@deepseek-ai/dsh-academic-report'
import type { AcademicBackgroundRunView } from '../../packages/api/academic-research-controller/src/types.ts'
import type { AcademicResearchRecoveryCheckpoint } from '../../packages/academic/workflow/src/recovery-checkpoint.ts'
import type { SynthesisModelRequest, SynthesisModelResult } from '../../packages/academic/workflow/src/synthesis-model.ts'
import { captureCode } from './code.ts'
import { artifact, digest, newDirectory } from './files.ts'
import { modelConfig, responseText, sessionEvents, type RecordedEvent } from './session.ts'

/** Explicit source and run identity prevent accidentally exporting a different conversation. */
export interface ExportOptions {
  readonly sessionFile: string
  readonly runId: string
  readonly output: string
  readonly htmlFile?: string
}

function disclosure(markdown: string): RetrievalDisclosure | undefined {
  const marker = '\n\n## 检索渠道与覆盖说明\n\n', at = markdown.lastIndexOf(marker)
  if (at < 0) return undefined
  const lines = markdown.slice(at + marker.length).trimEnd().split('\n')
  const unescape = (text: string) => text.replace(/\\([\\`*_{}\[\]<>#|])/gu, '$1')
  return { title: '检索渠道与覆盖说明', scopeNotice: unescape(lines[0] ?? ''), observations: [], failures: [],
    limitations: lines.filter(line => line.startsWith('- ')).map(line => unescape(line.slice(2))) }
}

/** Export recorded facts and reconstructed module inputs without starting Harness or calling a model.
 * @param options Exact Session generation, research run, and new destination.
 * @returns New experiment root; no existing file or Session is changed.
 */
export function exportExperiment(options: ExportOptions): string {
  const sourceHash = digest(readFileSync(options.sessionFile))
  let background: AcademicBackgroundRunView | undefined
  let checkpoint: AcademicResearchRecoveryCheckpoint | undefined
  const requests = new Map<number, { request: SynthesisModelRequest; time: number }>()
  let accepted: { result: SynthesisModelResult; time: number } | undefined
  for (const event of sessionEvents(options.sessionFile)) {
    if (event.type === 'academic/background-run-state' && event.data.retrievalRunId === options.runId) {
      background = event.data as unknown as AcademicBackgroundRunView
    }
    if (event.type === 'academic/recovery-checkpoint' && event.data.retrievalRunId === options.runId) {
      checkpoint = event.data as unknown as AcademicResearchRecoveryCheckpoint
    }
    if (event.type === 'academic/synthesis-request') {
      const request = event.data as unknown as SynthesisModelRequest
      if (request.input.retrievalRunId === options.runId) requests.set(event.seq, { request, time: event.time })
    }
    if (event.type === 'academic/synthesis-result' && event.data.retrievalRunId === options.runId
      && ['validated', 'partially_validated'].includes(String(event.data.status))) {
      accepted = { result: event.data as unknown as SynthesisModelResult, time: event.time }
    }
  }
  if (background?.state !== 'completed' || background.result?.report == null || checkpoint === undefined || accepted === undefined) {
    throw new Error('Selected run lacks a completed report, recovery checkpoint or validated synthesis result; no export was created.')
  }
  const selected = requests.get(Number(accepted.result.requestSeq))
  if (selected === undefined) throw new Error('Synthesis result has no matching recorded request.')
  const input = selected.request.input, admission = prepareSynthesisInput(input)
  if (admission.status === 'blocked') throw new Error(`Recorded analysis input cannot be replayed: ${admission.reasons.join('; ')}`)
  const text = responseText(accepted.result.stream), draft = parseSynthesisDraft(text, input)
  const original = background.result.report
  const assessedAt = original.evaluation.assessments[0]?.assessedAt
    ?? background.progress?.stages.analysis.startedAt ?? background.updatedAt
  const analysis = synthesisAnalysis(input, draft, assessedAt)
  const claims = original.claims.map((claim) => {
    const [first, ...rest] = claim.confidenceReasons
    if (first === undefined) throw new Error('Recorded Claim lacks a confidence rationale.')
    return { ...claim, confidenceReasons: [first, ...rest] as const }
  })
  const mapping = new Map(analysis.claims.map((claim) => {
    const found = original.claims.filter(saved => saved.text === claim.text && saved.scope === claim.scope
      && saved.category === claim.category)
    const saved = found[0]
    if (found.length !== 1 || saved === undefined) throw new Error('Reconstructed Claim does not uniquely match the recorded report; preserve the source and inspect parser drift.')
    return [claim.claimId, saved.claimId]
  }))
  if (analysis.claims.length !== original.claims.length) throw new Error('Recorded and reconstructed Claim counts differ.')
  const admittedEvidence = checkpoint.papers.flatMap(paper => 'evidence' in paper ? paper.evidence.evidenceRecords : [])
  const retrievedDisclosure = disclosure(original.markdown)
  const reportInput: ReportInput = { brief: input.brief, claims,
    links: analysis.links.map((link) => {
      const claimId = mapping.get(link.claimId)
      if (claimId === undefined) throw new Error('Missing recorded Claim for reconstructed link.')
      return { ...link, claimId }
    }),
    admittedEvidence, evidence: input.analysisInput.evidenceRecords, versions: input.analysisInput.workVersions,
    sourceLocators: input.analysisInput.sourceLocators, works: input.analysisInput.academicWorks,
    ...input.analysisInput.questionLinks === undefined ? {} : { questionLinks: input.analysisInput.questionLinks },
    synthesis: draft, coverage: input.coverageSummary, reviews: [], assessedAt, limitations: original.limitations,
    mode: 'auto', synthetic: original.synthetic, ...retrievedDisclosure === undefined ? {} : { retrievalDisclosure: retrievedDisclosure } }
  const root = newDirectory(options.output), files: Record<string, string> = {}
  const save = (name: string, data: unknown) => { files[name] = artifact(root, name, data) }
  save('研究计划.json', { brief: input.brief, searchPlan: checkpoint.plan })
  save('候选论文与筛选结果.json', { assessments: checkpoint.assessments, ranking: checkpoint.ranking,
    decisions: checkpoint.decisions, settlements: checkpoint.settlements, rounds: checkpoint.rounds })
  save('论文版本与来源.json', { works: checkpoint.works, versions: checkpoint.versions, candidates: checkpoint.candidates })
  save('全文获取.json', { papers: background.result.papers, failures: background.result.failures,
    providerFailures: checkpoint.providerFailures, note: '保存来源与处理事实；原始 PDF/HTML 字节未从 Session 中恢复，不把片段冒充完整全文。' })
  save('证据记录与证据卡.json', checkpoint.papers)
  save('分析输入.json', input)
  save('分析输出.json', draft)
  save('原始模型回答.txt', text)
  save('分析调用.json', { requestSeq: Number(accepted.result.requestSeq), requestTime: selected.time, resultTime: accepted.time,
    config: modelConfig(selected.request.config), messages: selected.request.messages,
    status: accepted.result.status, usage: accepted.result.usage, elapsedMs: accepted.result.elapsedMs })
  save('报告输入.json', reportInput)
  save('原始报告.json', original)
  save('原始报告.md', original.markdown)
  save('评测结果.json', original.evaluation)
  save('检索运行.json', background.result.retrievalRun)
  if (options.htmlFile !== undefined) {
    const html = readFileSync(options.htmlFile, 'utf8')
    if (original.evidence.some(record => !html.includes(record.evidenceId))) throw new Error('HTML evidence IDs do not match the selected run.')
    save('原始报告.html', html)
  }
  const trace: unknown[] = [], progress: unknown[] = [], calls: unknown[] = []
  const start = Date.parse(background.startedAt), end = Date.parse(background.updatedAt)
  for (const event of sessionEvents(options.sessionFile)) {
    if (event.type === 'academic/trace-v1' && event.data.researchRunId === options.runId) trace.push(event.data)
    if (event.type === 'academic/background-run-state' && event.data.retrievalRunId === options.runId) {
      const state = event.data as unknown as AcademicBackgroundRunView
      progress.push({ time: event.time, state: state.state, progress: state.progress })
    }
    if (event.time >= start && event.time <= end && event.type.startsWith('academic/') && /(?:request|result)(?:-v1)?$/u.test(event.type)) {
      const requestInput = event.data.input as { retrievalRunId?: string } | undefined
      const explicitRun = event.data.retrievalRunId ?? requestInput?.retrievalRunId
      if (typeof explicitRun !== 'string' || explicitRun === options.runId) calls.push(safeCall(event))
    }
  }
  save('Trace.json', trace)
  save('阶段进度.json', progress)
  save('模型调用记录.json', calls)
  if (digest(readFileSync(options.sessionFile)) !== sourceHash) throw new Error('Session changed while exporting; discard this incomplete export and retry after the run stops.')
  const code = captureCode(root)
  files['代码快照.json'] = code.sourceSha256
  artifact(root, '实验说明.json', { schemaVersion: 1, kind: 'academic-c-experiment', sessionId: background.sessionId,
    researchRunId: options.runId, topic: input.brief.topic, startedAt: background.startedAt, completedAt: background.updatedAt,
    exportedAt: new Date().toISOString(), sourceFile: resolve(options.sessionFile), sourceSha256: sourceHash,
    exportCodeRevision: code.revision, exportWorktreeDirty: code.worktreeDirty,
    cSourceSha256: code.sourceSha256, originalRunCodeRevision: null,
    provenance: { analysisInput: 'exact-recorded-request', analysisOutput: 'parsed-from-recorded-response',
      reportInput: 'reconstructed; original Claim IDs preserved; links recreated; limitations from final report; retrieval disclosure flattened from original Markdown',
      originalReport: 'exact-recorded-result', rawFulltext: 'not-archived',
      modelCalls: 'academic requests/results during the selected run; no chat headers, credentials or reasoning streams' }, files })
  return root
}

function safeCall(event: RecordedEvent): Record<string, unknown> {
  const data = event.data
  const request = event.type.includes('request')
  return { type: event.type, seq: event.seq, time: event.time, phase: data.phase, source: data.source,
    workVersionId: data.workVersionId, academicWorkId: data.academicWorkId, fragment: data.fragment,
    attempt: data.attempt, maxAttempts: data.maxAttempts, status: data.status, requestSeq: data.requestSeq,
    elapsedMs: data.elapsedMs, usage: data.usage, errorCode: data.errorCode,
    ...request ? { config: modelConfig(data.config), messages: data.messages }
      : { outputText: Array.isArray(data.stream) ? responseText(data.stream) : null } }
}
