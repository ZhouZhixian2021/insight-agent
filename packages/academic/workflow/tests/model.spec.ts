import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LlmRuntime, { LlmAdapter, ReasoningEffortId, ToolCallId, expandAssistantStream, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { createAcademicWorkId, createWorkVersionId, type WorkVersion } from '@deepseek-ai/dsh-academic-model'
import type { EvidenceExtractionInput, EvidenceGenerationRequest } from '@deepseek-ai/dsh-academic-evidence'
import { createModelEvidenceGenerator, extractPaperEvidence, runAcademicResearchDraft, runModelResearchDraft, WorkflowLogError } from '../src/index.ts'
import { draftFixture } from './pipeline-fixture.ts'
import { evidenceMessages } from '../src/model-prompt.ts'

const output = JSON.stringify({ scope: { status: 'included', reason: 'The paper answers the approved question.' }, evidence: [
  { segmentIndex: 0, sourcedStatement: 'Uses Method X.', verbatimExcerpt: 'Uses Method X.',
    cardItems: [{ section: 'methods', statement: 'Uses Method X.', methodName: { status: 'available', value: 'Method X' },
      methodRole: { status: 'available', value: 'proposed' } }] }] })
const script: StreamChunk[] = [{ type: 'text-delta', index: 0, text: output },
  { type: 'usage', usage: { inputTokens: 100, outputTokens: 30 } }, { type: 'finish', reason: { kind: 'stop' } }]
const config = { provider: 'fixture', model: 'fixture', maxTokens: 500 }
const scope = { inclusionRules: [], exclusionRules: [] }

class Adapter extends LlmAdapter {
  calls: GenerateOptions[] = []
  contextWindow: number | undefined = 10000
  script = script
  beforeDispatch?: () => Promise<void>
  afterChunk?: () => void
  supportsReasoning = true
  override resolveModel(provider: string, model: string) {
    return Promise.resolve({ provider, id: model, name: model,
      ...this.supportsReasoning ? { reasoning: { efforts: [
        { id: ReasoningEffortId('low'), name: 'Low' }, { id: ReasoningEffortId('high'), name: 'High' },
      ] } } : {},
      ...this.contextWindow === undefined ? {} : { context: { contextWindow: this.contextWindow } } })
  }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    await this.beforeDispatch?.()
    this.calls.push(options)
    for (const chunk of this.script) { yield chunk; this.afterChunk?.() }
  }
}
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture(writer = true) {
  const root = await mkdtemp(join(tmpdir(), 'academic-model-test-'))
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  await ctx.plugin(SessionStore)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(TokenMeter)
  await ctx.plugin(JsonlPersistence, { root, compression: 'none' })
  const session = ctx.sessions.create()
  if (writer) await ctx.sessionPersistence.create(session.header)
  const adapter = new Adapter()
  ctx.llm.registerAdapter(['fixture'], adapter)
  const source: EvidenceExtractionInput = { academicWorkId: createAcademicWorkId(), workVersionId: createWorkVersionId(),
    contentHash: 'fixture-content-hash', sourceProvider: 'fixture', sourceUrl: 'https://example.org/paper',
    retrievedAt: '2026-09-15T00:00:00Z', extractionMethod: { method: 'fixture', methodVersion: '1' },
    segments: [{ text: 'Uses Method X.', locator: { kind: 'paragraph', paragraphNumber: 1 } }] }
  const request: EvidenceGenerationRequest = { instruction: 'Extract supported methods.', focusQuestions: ['Which method?'], segments: source.segments }
  const generate = createModelEvidenceGenerator(ctx, session, config)
  const read = async () => {
    await using handle = await ctx.sessionPersistence.open(session.id, 'read')
    return await handle.read()
  }
  const version: WorkVersion = { schemaVersion: 1, academicWorkId: source.academicWorkId, workVersionId: source.workVersionId,
    versionType: 'preprint', versionLabel: { status: 'available', value: 'v1' }, releaseDate: { status: 'unknown', reason: 'fixture' },
    externalIdentifiers: [], sourceRecords: [], contentHash: { status: 'not_extracted' }, supersedesWorkVersionId: null, status: 'active' }
  return { ctx, session, adapter, source, request, generate, read, version, root }
}

describe('durable academic model extraction', () => {
  it('scopes the model request to a bounded answer for the supplied focus questions', async () => {
    const f = await fixture()
    const block = evidenceMessages(f.request, scope)[0]?.content[0]
    if (block?.type !== 'text') throw new Error('missing model-visible evidence instructions')
    const visible = block.text
    expect(visible).toContain('select only evidence that directly answers the supplied')
    expect(visible).toContain(`Return at most 6 entries total and
at most 3 entries primarily supporting any one focus question.`)
    expect(visible).toContain('Do not catalogue every extractable statement.')
    expect(visible).toContain('"inclusionRules":[]')
    expect(visible).toContain('"focusQuestions":["Which method?"]')
  })
  it('runs two parsed papers through the model and B evidence into C evaluated draft', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    const result = await runModelResearchDraft(f.ctx, f.session, config, draft.input, draft.adapters)
    expect(result.status).toBe('completed')
    expect(result.failures).toEqual([])
    expect(result.papers.map(paper => paper.status)).toEqual(['extracted', 'extracted'])
    expect(result.analysis?.claims).toHaveLength(1)
    expect(result.report?.mode).toBe('draft')
    expect(result.report?.evaluation.status).toBe('needs_review')
    expect(result.report?.evidence).toHaveLength(2)
    expect(result.report?.markdown).toContain('合成基准样例')
    expect(draft.events).toEqual(['search', 'select', 'fetch:a', 'fetch:b'])
    expect(draft.adapters.generator).not.toHaveBeenCalled()
    expect(f.adapter.calls).toHaveLength(2)
    const saved = await f.read()
    expect(saved.map(event => event.type)).toEqual(['academic/evidence-request', 'academic/evidence-result',
      'academic/evidence-request', 'academic/evidence-result'])
    const requests = saved.filter(event => event.type === 'academic/evidence-request')
    expect(new Set(requests.map(event => event.data.source.academicWorkId)).size).toBe(2)
    for (const record of result.report!.evidence) {
      const request = requests.find(event => event.data.source.workVersionId === record.workVersionId)
      expect(record.contentHash).toEqual({ status: 'available', value: request?.data.source.contentHash })
    }
  })
  it('offers one formal entry with the model default reasoning and durable Session identity', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    const result = await runAcademicResearchDraft({
      ctx: f.ctx, session: f.session, model: config, input: draft.input, adapters: draft.adapters,
    })
    expect(result).toMatchObject({ status: 'completed', sessionId: f.session.id, failures: [] })
    expect(f.adapter.calls).toHaveLength(2)
    expect(f.adapter.calls.every(call => call.reasoningEffort === undefined)).toBe(true)
  })
  it('allows a model without configurable reasoning when the caller omits an effort', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.supportsReasoning = false
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    await expect(runAcademicResearchDraft({
      ctx: f.ctx, session: f.session, model: config, input: draft.input, adapters: draft.adapters,
    })).resolves.toMatchObject({ status: 'completed', sessionId: f.session.id })
    expect(draft.adapters.search).toHaveBeenCalledOnce()
    expect(f.adapter.calls).toHaveLength(2)
    expect(f.adapter.calls.every(call => call.reasoningEffort === undefined)).toBe(true)
  })
  it('rejects an explicit unsupported reasoning effort before external work begins', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.supportsReasoning = false
    await expect(runAcademicResearchDraft({
      ctx: f.ctx, session: f.session, model: { ...config, reasoningEffort: ReasoningEffortId('low') },
      input: draft.input, adapters: draft.adapters,
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_REASONING_EFFORT' })
    expect(draft.adapters.search).not.toHaveBeenCalled()
    expect(f.adapter.calls).toHaveLength(0)
  })
  it('preserves an explicit caller reasoning effort', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    await runAcademicResearchDraft({ ctx: f.ctx, session: f.session,
      model: { ...config, reasoningEffort: ReasoningEffortId('high') }, input: draft.input, adapters: draft.adapters })
    expect(f.adapter.calls).toHaveLength(2)
    expect(f.adapter.calls.every(call => call.reasoningEffort === 'high')).toBe(true)
  })
  it('continues the next paper after real model admission pauses an oversized first paper', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    const fetch = draft.adapters.fetcher
    draft.adapters.fetcher = async (url, signal) => url.endsWith('/a')
      ? { url, statusCode: 200, truncated: false, body: { kind: 'html', content: `<article><h2>Methods</h2><p>${'oversized '.repeat(20000)}</p></article>` } }
      : fetch(url, signal)
    const result = await runModelResearchDraft(f.ctx, f.session, config, draft.input, draft.adapters)
    expect(result.papers.map(paper => paper.status)).toEqual(['paused', 'extracted'])
    expect(result.report?.limitations.join(' ')).toContain('input_too_large')
    expect(f.adapter.calls).toHaveLength(1)
    expect((await f.read()).filter(event => event.type === 'academic/evidence-result').map(event => event.data.status))
      .toEqual(['skipped', 'validated'])
  })
  it('stops the model-backed pass on a result checkpoint failure before fetching the next paper', async () => {
    const f = await fixture(), draft = draftFixture()
    const flush = f.ctx.sessions.flush.bind(f.ctx.sessions)
    vi.spyOn(f.ctx.sessions, 'flush').mockImplementation(async (session) => {
      if (session.snapshotEvents().at(-1)?.type === 'academic/evidence-result') throw new Error('disk failure')
      return flush(session)
    })
    await expect(runModelResearchDraft(f.ctx, f.session, config, draft.input, draft.adapters)).rejects.toBeInstanceOf(WorkflowLogError)
    expect(draft.adapters.fetcher).toHaveBeenCalledOnce()
    expect(f.adapter.calls).toHaveLength(1)
  })
  it('persists the exact request before dispatch and the lossless stream before returning evidence', async () => {
    const f = await fixture()
    f.adapter.beforeDispatch = async () => { expect((await f.read())[0]?.type).toBe('academic/evidence-request') }
    const extracted = await extractPaperEvidence(f.version, f.source, false, f.generate, scope)
    expect(extracted.status).toBe('extracted')
    if (extracted.status !== 'extracted') throw new Error('unexpected paper pause')
    expect(extracted.evidence.evidenceRecords).toHaveLength(1)
    expect(extracted.evidence.evidenceRecords[0]).toMatchObject({
      workVersionId: f.version.workVersionId,
      contentHash: { status: 'available', value: f.source.contentHash },
    })
    expect(extracted.evidence.evidenceCard.workVersionId).toBe(f.version.workVersionId)
    expect(extracted.evidence.sourceLocators[0]).toMatchObject({
      workVersionId: f.version.workVersionId, contentHash: f.source.contentHash,
    })
    const [request, response] = await f.read()
    if (request?.type !== 'academic/evidence-request' || response?.type !== 'academic/evidence-result') throw new Error('missing records')
    expect(f.adapter.calls[0]?.messages).toEqual(request.data.messages)
    expect(f.adapter.calls[0]?.model).toBe(request.data.config.model)
    expect(request.data.source.workVersionId).toBe(f.version.workVersionId)
    expect(request.data.source.contentHash).toBe(f.source.contentHash)
    expect(response.data.requestSeq).toBe(request.seq)
    expect(response.data.status).toBe('validated')
    expect(expandAssistantStream(response.data.stream).map(entry => entry.chunk)).toEqual(script)
    expect(response.data.usage).toEqual({ inputTokens: 100, outputTokens: 30 })
    expect(f.session.deriveMessages()).toEqual([])
    const files = await readdir(f.root, { recursive: true })
    const log = files.find(file => file.endsWith('session.v2.jsonl'))
    if (!log) throw new Error('missing physical log')
    const disk = await readFile(join(f.root, log), 'utf8')
    expect(disk).toContain('academic/evidence-request')
    expect(disk).toContain('academic/evidence-result')
    expect(disk).toContain('fixture-content-hash')
  })
  it('counts framing and output reserve at the exact admission boundary', async () => {
    const f = await fixture()
    const tokens = evidenceMessages(f.request, scope).reduce((sum, message) => sum + f.ctx.tokenMeter.estimateMessage(message), 0)
    f.adapter.contextWindow = tokens + config.maxTokens
    await expect(f.generate(f.request, f.source, scope)).resolves.toMatchObject({ scope: { status: 'included' }, evidence: { length: 1 } })
    f.adapter.contextWindow--
    await expect(f.generate(f.request, f.source, scope)).rejects.toMatchObject({ code: 'EVIDENCE_INPUT_TOO_LARGE' })
    expect(f.adapter.calls).toHaveLength(1)
    expect((await f.read()).at(-1)?.data).toMatchObject({ status: 'skipped', errorCode: 'EVIDENCE_INPUT_TOO_LARGE' })
  })
  it('pauses oversized papers without filling their version hash', async () => {
    const f = await fixture()
    f.adapter.contextWindow = 501
    expect(await extractPaperEvidence(f.version, f.source, false, f.generate, scope)).toMatchObject({ status: 'paused', pause: { reason: 'input_too_large' } })
    expect(f.version.contentHash.status).toBe('not_extracted')
    expect(f.adapter.calls).toHaveLength(0)
  })
  it('records bad JSON without turning it into empty evidence', async () => {
    const f = await fixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: 'not JSON' }, { type: 'finish', reason: { kind: 'stop' } }]
    await expect(f.generate(f.request, f.source, scope)).rejects.toMatchObject({ code: 'EVIDENCE_INVALID_MODEL_OUTPUT' })
    expect((await f.read()).at(-1)?.data).toMatchObject({ status: 'failed', errorCode: 'EVIDENCE_INVALID_MODEL_OUTPUT' })
  })
  it.each(['max-tokens', 'tool-calls'] as const)('records and rejects %s despite valid JSON', async (kind) => {
    const f = await fixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: '[]' }, { type: 'finish', reason: { kind } }]
    await expect(f.generate(f.request, f.source, scope)).rejects.toMatchObject({ code: 'EVIDENCE_MODEL_INCOMPLETE' })
    expect((await f.read()).at(-1)?.data).toMatchObject({ status: 'failed', finish: { kind } })
  })
  it('retains rejected tool chunks without executing them', async () => {
    const f = await fixture()
    f.adapter.script = [{ type: 'block-start', index: 0, blockType: 'tool-call' }, { type: 'finish', reason: { kind: 'tool-calls' } }]
    await expect(f.generate(f.request, f.source, scope)).rejects.toThrow()
    const event = (await f.read()).at(-1)
    if (event?.type !== 'academic/evidence-result') throw new Error('missing result')
    expect(expandAssistantStream(event.data.stream).map(entry => entry.chunk)).toEqual(f.adapter.script)
  })
  it('records cancellation after saving the request without dispatch', async () => {
    const f = await fixture(), controller = new AbortController()
    const flush = f.ctx.sessions.flush.bind(f.ctx.sessions)
    vi.spyOn(f.ctx.sessions, 'flush').mockImplementation(async (session) => { const saved = await flush(session); controller.abort(); return saved })
    await expect(f.generate({ ...f.request, signal: controller.signal }, f.source, scope)).rejects.toThrow()
    expect(f.adapter.calls).toHaveLength(0)
    expect((await f.read()).at(-1)?.data).toMatchObject({ status: 'cancelled' })
  })
  it('retains streamed text on cancellation', async () => {
    const f = await fixture(), controller = new AbortController()
    f.adapter.afterChunk = () => { controller.abort() }
    await expect(f.generate({ ...f.request, signal: controller.signal }, f.source, scope)).rejects.toThrow()
    const event = (await f.read()).at(-1)
    if (event?.type !== 'academic/evidence-result') throw new Error('missing result')
    expect(event.data.status).toBe('cancelled')
    expect(expandAssistantStream(event.data.stream).some(entry => entry.chunk.type === 'text-delta')).toBe(true)
  })
  it('does no work for an already-cancelled request', async () => {
    const f = await fixture()
    await expect(f.generate({ ...f.request, signal: AbortSignal.abort() }, f.source, scope)).rejects.toThrow()
    expect(f.adapter.calls).toHaveLength(0)
    expect(f.session.snapshotEvents()).toEqual([])
  })
  it('records unavailable model capacity as a preparation failure', async () => {
    const f = await fixture()
    f.adapter.contextWindow = undefined
    await expect(f.generate(f.request, f.source, scope)).rejects.toMatchObject({ code: 'EVIDENCE_MODEL_BUDGET_UNKNOWN' })
    expect((await f.read()).at(-1)?.data).toMatchObject({ requestSeq: null, status: 'failed' })
    expect(f.adapter.calls).toHaveLength(0)
  })
  it.each(['request', 'result'] as const)('stops on %s checkpoint failure', async (phase) => {
    const f = await fixture()
    const flush = f.ctx.sessions.flush.bind(f.ctx.sessions)
    vi.spyOn(f.ctx.sessions, 'flush').mockImplementation(async (session) => {
      if (session.snapshotEvents().at(-1)?.type === `academic/evidence-${phase}`) throw new Error('Disk unavailable')
      return flush(session)
    })
    await expect(f.generate(f.request, f.source, scope)).rejects.toBeInstanceOf(WorkflowLogError)
    expect(f.adapter.calls).toHaveLength(phase === 'request' ? 0 : 1)
  })
  it('refuses a persistence listener with no active writer', async () => {
    const f = await fixture(false)
    await expect(f.generate(f.request, f.source, scope)).rejects.toBeInstanceOf(WorkflowLogError)
    expect(f.adapter.calls).toHaveLength(0)
  })
  it('refuses missing runtime services at binding time', async () => {
    const f = await fixture()
    expect(() => createModelEvidenceGenerator(new Context(), f.session, config)).toThrow('requires')
  })
  it('gives a storage failure priority over concurrent cancellation', async () => {
    const f = await fixture(), controller = new AbortController()
    vi.spyOn(f.ctx.sessions, 'flush').mockImplementation(async () => { controller.abort(); throw new Error('Disk failure') })
    await expect(f.generate({ ...f.request, signal: controller.signal }, f.source, scope)).rejects.toBeInstanceOf(WorkflowLogError)
    expect(f.adapter.calls).toHaveLength(0)
  })
  it('refuses a checkpoint with no participating listener', async () => {
    const f = await fixture()
    vi.spyOn(f.ctx.sessions, 'flush').mockResolvedValue(false)
    await expect(f.generate(f.request, f.source, scope)).rejects.toBeInstanceOf(WorkflowLogError)
    expect(f.adapter.calls).toHaveLength(0)
  })
  it('refuses an acknowledged checkpoint whose stored record is missing', async () => {
    const f = await fixture()
    const open = f.ctx.sessionPersistence.open.bind(f.ctx.sessionPersistence)
    vi.spyOn(f.ctx.sessionPersistence, 'open').mockImplementation(async (id, access, options) => {
      const handle = await open(id, access, options)
      vi.spyOn(handle, 'read').mockResolvedValue([])
      return handle
    })
    await expect(f.generate(f.request, f.source, scope)).rejects.toBeInstanceOf(WorkflowLogError)
    expect(f.adapter.calls).toHaveLength(0)
  })
  it('keeps reasoning in the log while parsing text only', async () => {
    const f = await fixture()
    f.adapter.script = [{ type: 'reasoning-delta', index: 1, text: 'Inspecting evidence.' }, ...script]
    await expect(f.generate(f.request, f.source, scope)).resolves.toMatchObject({ evidence: { length: 1 } })
    const event = (await f.read()).at(-1)
    if (event?.type !== 'academic/evidence-result') throw new Error('missing result')
    expect(expandAssistantStream(event.data.stream)[0]?.chunk.type).toBe('reasoning-delta')
  })
  it('rejects tool content even when the terminal reason claims normal completion', async () => {
    const f = await fixture()
    f.adapter.script = [{ type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('fixture-call'), name: 'never_execute', arguments: '{}' } },
      { type: 'finish', reason: { kind: 'stop' } }]
    await expect(f.generate(f.request, f.source, scope)).rejects.toMatchObject({ code: 'EVIDENCE_MODEL_UNEXPECTED_CONTENT' })
  })
})
