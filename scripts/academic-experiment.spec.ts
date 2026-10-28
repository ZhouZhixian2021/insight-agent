import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseSynthesisDraft, synthesisAnalysis, type AcademicSynthesisInput } from '@deepseek-ai/dsh-academic-analysis'
import { generateReport } from '@deepseek-ai/dsh-academic-report'
import { compressZstdFrame } from '../packages/session/session-persistence-jsonl/src/zstd.ts'
import { exportExperiment } from './academic-experiment/export.ts'
import { replayExperiment, prepareAnalysisExperiment } from './academic-experiment/replay.ts'
import { digest, objectJson, verifyBundle } from './academic-experiment/files.ts'
import { responseText, sessionEvents } from './academic-experiment/session.ts'

const owned: string[] = []
afterEach(() => { for (const path of owned.splice(0)) rmSync(path, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'academic-c-experiment-')); owned.push(root)
  const sample = resolve('z-team_docs/interface-samples/academic-model-v1')
  const input = JSON.parse(readFileSync(join(sample, 'synthesis-input.sample.json'), 'utf8')) as AcademicSynthesisInput
  const raw = readFileSync(join(sample, 'synthesis-partial-output.sample.json'), 'utf8')
  const draft = parseSynthesisDraft(raw, input), analysis = synthesisAnalysis(input, draft, '2026-10-26T00:00:00Z')
  const material = input.analysisInput
  const report = generateReport({ brief: input.brief, claims: analysis.claims, links: analysis.links, evidence: material.evidenceRecords,
    admittedEvidence: material.evidenceRecords, versions: material.workVersions, sourceLocators: material.sourceLocators,
    works: material.academicWorks, reviews: [], assessedAt: '2026-10-26T00:00:00Z', synthesis: draft,
    coverage: input.coverageSummary, limitations: draft.limitations, mode: 'auto', synthetic: true })
  const started = Date.parse('2026-10-26T00:00:00Z'), runId = input.retrievalRunId
  const data = [
    { type: 'request/header', data: { headers: { authorization: 'PRIVATE-KEY-NOT-FOR-EXPORT' } } },
    { type: 'academic/recovery-checkpoint', data: { schemaVersion: 1, retrievalRunId: runId, plan: {}, assessments: [], ranking: {},
      decisions: [], settlements: [], rounds: [], works: material.academicWorks, versions: material.workVersions, candidates: [],
      papers: [{ status: 'extracted', evidence: { evidenceRecords: material.evidenceRecords } }] } },
    { type: 'academic/synthesis-request', data: { input, config: { provider: 'fixture', model: 'recorded', apiKey: 'PRIVATE-KEY-NOT-FOR-EXPORT' },
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Only recorded material.' }] }] } },
    { type: 'academic/synthesis-result', data: { retrievalRunId: runId, requestSeq: 2, status: 'validated',
      stream: [{ type: 'chunk', chunk: { type: 'reasoning-delta', text: 'PRIVATE-REASONING-NOT-FOR-EXPORT' } },
        { type: 'text-chunks', texts: [raw] }], elapsedMs: 1 } },
    { type: 'academic/background-run-state', data: { state: 'completed', sessionId: 'fixture-session', retrievalRunId: runId,
      startedAt: new Date(started).toISOString(), updatedAt: new Date(started + 1000).toISOString(),
      result: { report, papers: [], failures: [], retrievalRun: {} } } },
  ].map((e, seq) => ({ ...e, seq, time: started + seq }))
  const file = join(root, 'session.v2.jsonl')
  writeFileSync(file, `${data.map(e => JSON.stringify(e)).join('\n')}\n`)
  return { root, file, runId, raw, data }
}

describe('frozen Academic C experiments', () => {
  it('exports one run without changing the Session or copying credentials and reasoning', () => {
    const f = fixture(), before = digest(readFileSync(f.file)), bundle = exportExperiment({ sessionFile: f.file,
      runId: f.runId, output: join(f.root, 'frozen') })
    expect(digest(readFileSync(f.file))).toBe(before)
    expect(verifyBundle(bundle).manifest.schemaVersion).toBe(1)
    const files = readdirSync(bundle).map(name => readFileSync(join(bundle, name), 'utf8')).join('\n')
    expect(files).not.toContain('PRIVATE-KEY-NOT-FOR-EXPORT')
    expect(files).not.toContain('PRIVATE-REASONING-NOT-FOR-EXPORT')
    expect(objectJson(readFileSync(join(bundle, '分析输入.json'), 'utf8')).retrievalRunId).toBe(f.runId)
    expect(() => exportExperiment({ sessionFile: f.file, runId: 'other-run', output: join(f.root, 'wrong') })).toThrow('Selected run lacks')
    expect(() => exportExperiment({ sessionFile: f.file, runId: f.runId, output: bundle })).toThrow('already exists')
  })
  it('replays report and evaluation deterministically and refuses modified frozen evidence', () => {
    const f = fixture(), bundle = exportExperiment({ sessionFile: f.file, runId: f.runId, output: join(f.root, 'frozen') })
    const first = replayExperiment({ bundle, output: join(f.root, 'baseline') })
    const second = replayExperiment({ bundle, output: join(f.root, 'repeat'), comparison: first })
    expect(objectJson(readFileSync(join(second, '对比.json'), 'utf8')).changedFields).toEqual([])
    expect(readFileSync(join(first, '报告.md'), 'utf8')).toBe(readFileSync(join(second, '报告.md'), 'utf8'))
    expect(objectJson(readFileSync(join(second, '实验记录.json'), 'utf8')).networkCalls).toBe(0)
    expect(() => replayExperiment({ bundle, output: join(bundle, 'overwrite') })).toThrow('outside the frozen bundle')
    writeFileSync(join(bundle, '分析输入.json'), '{}')
    expect(() => replayExperiment({ bundle, output: join(f.root, 'tampered') })).toThrow('Frozen input changed')
  })
  it('prepares new analysis prompts and accepts a separate response without rerunning retrieval', () => {
    const f = fixture(), bundle = exportExperiment({ sessionFile: f.file, runId: f.runId, output: join(f.root, 'frozen') })
    const prompt = prepareAnalysisExperiment(bundle, join(f.root, 'prompts'))
    expect(readFileSync(join(prompt, '当前分析提示.txt'), 'utf8')).toContain('INPUT_JSON')
    const response = JSON.parse(f.raw) as { statements: { text: string }[] }
    response.statements[0]!.text += ' 仅在给定条件下讨论。'
    const file = join(f.root, 'new-response.json'); writeFileSync(file, JSON.stringify(response))
    const result = replayExperiment({ bundle, output: join(f.root, 'alternative'), responseFile: file })
    expect(readFileSync(join(result, '报告.md'), 'utf8')).toContain('仅在给定条件下讨论')
    expect(objectJson(readFileSync(join(result, '对比.json'), 'utf8')).changedFields).toContain('markdownSha256')
  })
  it('reads concatenated Zstandard frames and rejects an incomplete tail', async () => {
    const f = fixture(), file = join(f.root, 'session.v2.jsonl.zstd')
    const a = await compressZstdFrame(`${JSON.stringify(f.data[0])}\n`)
    const b = await compressZstdFrame(`${JSON.stringify(f.data[1])}\n`)
    writeFileSync(file, Buffer.concat([a, b]))
    expect([...sessionEvents(file)]).toHaveLength(2)
    writeFileSync(file, Buffer.concat([a, b.subarray(0, 6)]))
    expect(() => [...sessionEvents(file)]).toThrow('incomplete tail')
    expect(responseText([{ type: 'chunk', chunk: { type: 'text-delta', text: '{}' } }])).toBe('{}')
  })
})
