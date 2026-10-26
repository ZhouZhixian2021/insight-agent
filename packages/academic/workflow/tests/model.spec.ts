import { createLoggedModelRunner } from '../src/model-call.ts'
import type { AcademicTraceSpan } from '@deepseek-ai/dsh-academic-model'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
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
import { createModelEvidenceGenerator, extractPaperEvidence, runAcademicResearchDraft, runModelResearchDraft,
  parsePaperModelResponse, WorkflowLogError,
  type PaperEvidenceGenerator, type PaperEvidenceProgressObservation } from '../src/index.ts'
import type { AcademicSynthesisInput, AcademicSynthesisDraft } from '@deepseek-ai/dsh-academic-analysis'
import { draftFixture, synthesisFixture } from './pipeline-fixture.ts'
import { evidenceMessages, scopeMessages } from '../src/model-prompt.ts'
import { createModelFragmentEvidenceEnhancer, createModelFragmentEvidenceGenerator } from '../src/fragment-model.ts'

const output = JSON.stringify({ scope: { status: 'included', reason: 'The paper answers the approved question.' }, evidence: [
  { segmentIndex: 0, questionIndexes: [0], sourcedStatement: 'Uses Method X.', verbatimExcerpt: 'Uses Method X.',
    cardItems: [{ section: 'methods', statement: 'Uses Method X.', methodName: { status: 'available', value: 'Method X' },
      methodRole: { status: 'available', value: 'proposed' } }] }] })
const script: StreamChunk[] = [{ type: 'text-delta', index: 0, text: output },
  { type: 'usage', usage: { inputTokens: 100, outputTokens: 30 } }, { type: 'finish', reason: { kind: 'stop' } }]
const config = { provider: 'fixture', model: 'fixture', maxTokens: 500 }
const policy = { maxAttempts: 1 }
const policies = { evidence: policy, synthesis: policy }
const scope = { inclusionRules: [], exclusionRules: [] }

class Adapter extends LlmAdapter {
  calls: GenerateOptions[] = []
  scopeCalls: GenerateOptions[] = []
  contextWindow: number | undefined = 10000
  script = script
  scopeScript?: StreamChunk[]
  synthesisScript?: StreamChunk[]
  synthesisTransform?: (draft: AcademicSynthesisDraft) => AcademicSynthesisDraft
  beforeDispatch?: () => Promise<void>
  afterChunk?: () => void
  waitForAbort = false
  ignoreAbort = false
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
    const prompt = options.messages[0]?.content[0]
    const admission = prompt?.type === 'text' && prompt.text.startsWith('Decide whether the paper satisfies')
    if (admission) this.scopeCalls.push(options)
    else this.calls.push(options)
    if (this.ignoreAbort && !admission) await new Promise<void>(() => {})
    if (this.waitForAbort && !admission) {
      await new Promise<void>((_resolve, reject) => {
        const signal = options.signal
        if (signal === undefined) {
          reject(new Error('missing attempt signal'))
          return
        }
        const rejectSignal = () => {
          reject(signal.reason instanceof Error ? signal.reason : new Error('model attempt aborted'))
        }
        if (signal.aborted) {
          rejectSignal()
          return
        }
        signal.addEventListener('abort', () => { rejectSignal() }, { once: true })
      })
    }
    const synthesis = prompt?.type === 'text' && prompt.text.includes('INPUT_JSON\n')
      ? JSON.stringify(this.synthesisTransform === undefined
        ? synthesisFixture(JSON.parse(prompt.text.split('INPUT_JSON\n')[1]!) as AcademicSynthesisInput)
        : this.synthesisTransform(synthesisFixture(JSON.parse(prompt.text.split('INPUT_JSON\n')[1]!) as AcademicSynthesisInput)),
      (key, value: unknown) => key === 'rejectedStatements' ? undefined : value) : null
    const chunks: StreamChunk[] = admission
      ? this.scopeScript ?? [{ type: 'text-delta', index: 0, text: JSON.stringify({ status: 'included', reason: 'Matches scope.' }) },
        { type: 'finish', reason: { kind: 'stop' } }]
      : synthesis === null ? compactEvidenceScript(this.script) : this.synthesisScript
      ?? [{ type: 'text-delta', index: 0, text: synthesis }, { type: 'finish', reason: { kind: 'stop' } }]
    for (const chunk of chunks) { yield chunk; if (!admission) this.afterChunk?.() }
  }
}

function compactEvidenceScript(chunks: StreamChunk[]): StreamChunk[] {
  return chunks.map((chunk) => {
    if (chunk.type !== 'text-delta') return chunk
    let value: { scope?: unknown; evidence?: Array<Record<string, unknown>> }
    try { value = JSON.parse(chunk.text) as typeof value } catch { return chunk }
    if (!Array.isArray(value.evidence) || value.scope === undefined) return chunk
    return { ...chunk, text: JSON.stringify({ evidence: value.evidence.map(draft => ({
      segmentIndex: draft.segmentIndex, questionIndexes: draft.questionIndexes,
      sourcedStatement: draft.sourcedStatement, verbatimExcerpt: draft.verbatimExcerpt,
      section: Array.isArray(draft.cardItems) && typeof (draft.cardItems as unknown[])[0] === 'object'
        ? ((draft.cardItems as Array<{ section?: unknown }>)[0]?.section ?? 'findings') : 'findings',
    })) }) }
  })
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
    focusQuestions: ['Which method?'],
    segments: [{ text: 'Uses Method X.', locator: { kind: 'paragraph', paragraphNumber: 1 } }] }
  const request: EvidenceGenerationRequest = { instruction: 'Extract supported methods.', focusQuestions: ['Which method?'], segments: source.segments }
  const generate = createModelEvidenceGenerator(ctx, session, config, policy)
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
  it('traces real transport retry attempts without copying prompts or overwriting the first failure', async () => {
    const f = await fixture()
    const spans: AcademicTraceSpan[] = []
    f.adapter.script = [{ type: 'finish', reason: { kind: 'error', failure: { code: 'TRANSPORT', message: 'secret upstream detail' } } }]
    f.adapter.afterChunk = () => { f.adapter.script = script }
    const run = createLoggedModelRunner(f.ctx, f.session, config, { maxAttempts: 2,
      transientRetry: { failureCodes: ['TRANSPORT'], initialDelayMs: 0 } }, (span) => { spans.push(span) })
    const source = { academicWorkId: f.source.academicWorkId, workVersionId: f.source.workVersionId }
    await run({ trace: { stage: 'extraction', operation: 'evidence_extract', ...source },
      messages: [createUserMessage({ source: { kind: 'plugin', plugin: 'fixture' }, content: [{ type: 'text', text: 'private prompt' }] })],
      parse: JSON.parse,
      appendRequest: data => f.session.append('academic/evidence-request', { source: f.source, ...data }),
      appendResult: data => f.session.append('academic/evidence-result', { source: f.source, ...data }),
    })
    const attempts = spans.filter(span => span.kind === 'attempt' && span.endedAt !== null)
    expect(attempts.map(span => [span.attemptIndex, span.status])).toEqual([[1, 'failed'], [2, 'succeeded']])
    expect(new Set(attempts.map(span => span.parentSpanId)).size).toBe(1)
    expect(spans.some(span => span.status === 'retry_wait')).toBe(true)
    expect(JSON.stringify(spans)).not.toContain('private prompt')
    expect(JSON.stringify(spans)).not.toContain('secret upstream detail')
    expect(attempts[0]?.timing.queueMs).toEqual({ value: null, basis: 'unknown' })
  })

  it('supplements committed minimal evidence without replacing its identity or scope decision', async () => {
    const f = await fixture()
    const source = { ...f.source, segments: [{ text: 'Uses Method X. Uses Method Y.',
      locator: { kind: 'paragraph' as const, paragraphNumber: 1 } }] }
    const minimal = await createModelFragmentEvidenceGenerator(f.ctx, f.session, config,
      { ...policy, depth: 'minimal' })(source, scope)
    expect(minimal.evidence.evidenceRecords).toHaveLength(1)
    f.adapter.script = [{ type: 'text-delta', index: 0, text: JSON.stringify({ evidence: [{ segmentIndex: 0,
      questionIndexes: [0], sourcedStatement: 'Uses Method Y.', verbatimExcerpt: 'Uses Method Y.', section: 'methods' }] }) },
    { type: 'finish', reason: { kind: 'stop' } }]
    const enhanced = await createModelFragmentEvidenceEnhancer(f.ctx, f.session, config, policy)(source, minimal.evidence)
    expect(enhanced.evidence.evidenceRecords).toHaveLength(2)
    expect(enhanced.evidence.evidenceRecords[0]).toEqual(minimal.evidence.evidenceRecords[0])
    expect(enhanced.evidence.evidenceCard.evidenceCardId).toBe(minimal.evidence.evidenceCard.evidenceCardId)
    expect(f.adapter.scopeCalls).toHaveLength(1)
    expect((await f.read()).filter(event => event.type === 'academic/evidence-fragment-verified'
      && event.data.purpose === 'enhancement')).toHaveLength(1)
  })
  it('saves a verified fragment before a later transport failure and retries only that range', async () => {
    const f = await fixture()
    const source = { ...f.source, segments: [{ text: `Uses Method X. ${'a'.repeat(3980)}Uses Method X.`,
      locator: { kind: 'abstract' as const } }] }
    f.adapter.afterChunk = () => {
      if (f.adapter.calls.length === 1) f.adapter.script = [
        { type: 'finish', reason: { kind: 'error', failure: { code: 'TRANSPORT', message: 'temporary' } } },
      ]
      if (f.adapter.calls.length === 2) f.adapter.script = script
    }
    const generate = createModelFragmentEvidenceGenerator(f.ctx, f.session, config, policy)
    const result = await generate(source, scope)
    expect(result.scope.status).toBe('included')
    expect(result.incompleteFragmentCount).toBe(0)
    expect(f.adapter.calls).toHaveLength(3)
    const saved = await f.read()
    const ranges = saved.flatMap(event => event.type === 'academic/evidence-request' && event.data.fragment
      ? [event.data.fragment] : [])
    expect(ranges.map(range => range.characterStart)).toEqual([0, 3744, 3744])
    const verified = saved.filter(event => event.type === 'academic/evidence-fragment-verified')
    expect(verified).toHaveLength(2)
    expect(verified[0]?.data.evidence.evidenceRecords).toHaveLength(1)
    expect(result.evidence.evidenceRecords).toHaveLength(2)
  })
  it('uses minimal depth for one paper without treating the five-record cap as a failed fragment', async () => {
    const f = await fixture()
    const facts = Array.from({ length: 5 }, (_, index) => `Fact ${index + 1}.`)
    const source = { ...f.source, segments: [
      { text: `${facts.join(' ')}${' x'.repeat(1_600)}`, locator: { kind: 'paragraph' as const, paragraphNumber: 1 } },
      { text: `Later material.${' y'.repeat(1_600)}`, locator: { kind: 'paragraph' as const, paragraphNumber: 2 } },
    ] }
    f.adapter.script = [{ type: 'text-delta', index: 0, text: JSON.stringify({ evidence: facts.map(fact => ({
      segmentIndex: 0, questionIndexes: [0], sourcedStatement: fact, verbatimExcerpt: fact, section: 'findings',
    })) }) }, { type: 'finish', reason: { kind: 'stop' } }]
    const generate = createModelFragmentEvidenceGenerator(f.ctx, f.session, config, { ...policy, depth: 'minimal' })
    const result = await generate(source, scope)
    expect(result.evidence.evidenceRecords).toHaveLength(5)
    expect(result.incompleteFragmentCount).toBe(0)
    expect(f.adapter.calls).toHaveLength(1)
    const prompt = f.adapter.calls[0]?.messages[0]?.content[0]
    expect(prompt?.type === 'text' ? prompt.text : '').toContain('Return at most 5 entries')
    expect((await f.read()).filter(event => event.type === 'academic/evidence-fragment-verified')).toHaveLength(1)
  })
  it('prioritizes reviewed question aliases when dispatching minimal source fragments', async () => {
    const f = await fixture()
    const source = { ...f.source, focusQuestions: ['哪种方法有效？'], segments: [
      { text: `Unrelated background. ${'a'.repeat(2_500)}`,
        locator: { kind: 'paragraph' as const, paragraphNumber: 1 } },
      { text: `Uses Method X. Faithfulness improved. ${'b'.repeat(2_500)}`,
        locator: { kind: 'paragraph' as const, paragraphNumber: 2 } },
    ] }
    await createModelFragmentEvidenceGenerator(f.ctx, f.session, config,
      { ...policy, depth: 'minimal', questionTerms: [['faithfulness']] })(source, scope)
    const ranges = (await f.read()).flatMap(event => event.type === 'academic/evidence-request'
      && event.data.phase === 'evidence' && event.data.fragment ? [event.data.fragment] : [])
    expect(ranges[0]?.segmentIndex).toBe(1)
  })
  it('stops formal extraction when a verified fragment cannot be durably saved', async () => {
    const f = await fixture(), draft = draftFixture()
    const flush = f.ctx.sessions.flush.bind(f.ctx.sessions)
    vi.spyOn(f.ctx.sessions, 'flush').mockImplementation(async (session) => {
      if (session.snapshotEvents().at(-1)?.type === 'academic/evidence-fragment-verified') {
        throw new Error('disk failure')
      }
      return flush(session)
    })
    await expect(runModelResearchDraft(f.ctx, f.session, config, policies, draft.input, draft.adapters))
      .rejects.toBeInstanceOf(WorkflowLogError)
    expect(draft.adapters.fetcher).toHaveBeenCalledOnce()
    expect(f.adapter.calls).toHaveLength(1)
  })
  it('excludes a paper before evidence extraction and records only the scope request', async () => {
    const f = await fixture()
    f.adapter.scopeScript = [{ type: 'text-delta', index: 0,
      text: JSON.stringify({ status: 'excluded', reason: 'Outside the approved topic.' }) },
    { type: 'finish', reason: { kind: 'stop' } }]
    const result = await extractPaperEvidence(f.version, f.source, false, f.generate, scope)
    expect(result).toMatchObject({ status: 'excluded', exclusion: { reason: 'Outside the approved topic.' } })
    expect(f.adapter.scopeCalls).toHaveLength(1)
    expect(f.adapter.calls).toHaveLength(0)
    expect((await f.read()).flatMap(event => event.type === 'academic/evidence-request'
      || event.type === 'academic/evidence-result' ? [event.data.phase] : [])).toEqual(['scope', 'scope'])
  })
  it('pauses a paper without evidence when the supplied text cannot establish scope', async () => {
    const f = await fixture()
    f.adapter.scopeScript = [{ type: 'text-delta', index: 0,
      text: JSON.stringify({ status: 'needs_more_context', reason: 'The abstract does not establish the study design.' }) },
    { type: 'finish', reason: { kind: 'stop' } }]
    expect(await extractPaperEvidence(f.version, f.source, false, f.generate, scope))
      .toMatchObject({ status: 'paused', pause: { reason: 'scope_needs_more_context' } })
    expect(f.adapter.calls).toHaveLength(0)
  })
  it('persists overlapping paper calls with distinct request-result and source identities', async () => {
    const f = await fixture()
    let release!: () => void
    const barrier = new Promise<void>((resolve) => { release = resolve })
    let entered = 0
    f.adapter.beforeDispatch = async () => { entered++; await barrier }
    const sources = Array.from({ length: 3 }, () => ({ ...f.source,
      academicWorkId: createAcademicWorkId(), workVersionId: createWorkVersionId() }))
    const calls = sources.map(source => f.generate(f.request, source, scope))
    const settled = Promise.allSettled(calls)
    try { await vi.waitFor(() => { expect(entered).toBe(3) }) } finally { release() }
    expect((await settled).map(value => value.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled'])
    const rows = await f.read()
    const requests = rows.filter(row => row.type === 'academic/evidence-request')
    const results = rows.filter(row => row.type === 'academic/evidence-result')
    expect(requests).toHaveLength(6)
    expect(results).toHaveLength(6)
    expect(requests.filter(row => row.data.phase === 'scope')).toHaveLength(3)
    expect(requests.filter(row => row.data.phase === 'evidence')).toHaveLength(3)
    for (const result of results) {
      const request = requests.find(row => row.seq === result.data.requestSeq)
      expect(request?.data.source).toEqual(result.data.source)
      expect(result.data.status).toBe('validated')
    }
    expect(new Set(results.map(row => row.data.requestSeq)).size).toBe(6)
  })
  it.each(['partial', 'all_rejected'] as const)('persists %s synthesis and only reports accepted paragraphs', async (mode) => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    f.adapter.synthesisTransform = (value) => {
      const bad = { ...value.statements[0]!, text: 'Unsupported paragraph must not appear.', evidenceLinks: [] }
      if (mode === 'all_rejected') return { ...value, statements: [bad] }
      return { ...value, statements: [...value.statements, bad],
        questionAnswers: value.questionAnswers.map((answer, index) => index === 0
          ? { ...answer, statementIndexes: [...answer.statementIndexes, value.statements.length] } : answer),
      }
    }
    const result = await runModelResearchDraft(f.ctx, f.session, config, policies, draft.input, draft.adapters)
    expect(result.papers.map(paper => paper.status)).toEqual(['extracted', 'extracted'])
    expect(result.synthesis.status).toBe(mode === 'partial' ? 'partial_success' : 'failed')
    expect(result.synthesis.reasons.join(' ')).toContain('未纳入报告')
    if (mode === 'partial') {
      expect(result.report?.markdown).not.toContain('Unsupported paragraph')
      expect(result.report?.markdown).toContain('部分回答')
      expect(result.report?.evaluation.status).toBe('needs_review')
      expect(result.report?.evaluation.issues.some(issue => issue.code === 'unmet_plan')).toBe(true)
      expect(result.analysis?.claims).toHaveLength(1)
    } else expect(result.report).toBeNull()
    const events = await f.read()
    const response = events.find(event => event.type === 'academic/synthesis-result')
    expect(response?.data).toMatchObject({ status: mode === 'partial' ? 'partially_validated' : 'failed',
      rejectedStatements: [{ statementIndex: mode === 'partial' ? 1 : 0, code: 'SYNTHESIS_INVALID_MODEL_OUTPUT' }] })
    expect(f.adapter.calls).toHaveLength(3)
  })
  it('retains papers and persists rejected synthesis output without publishing a template report', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    f.adapter.synthesisScript = [{ type: 'text-delta', index: 0, text: '{"invented":"answer"}' }, script[2]!]
    f.adapter.beforeDispatch = async () => {
      const saved = await f.read()
      expect(saved.at(-1)?.type.endsWith('-request')).toBe(true)
    }
    const result = await runModelResearchDraft(f.ctx, f.session, config, policies, draft.input, draft.adapters)
    expect(result.papers.map(paper => paper.status)).toEqual(['extracted', 'extracted'])
    expect(result.report).toBeNull()
    expect(result.synthesis.status).toBe('failed')
    const events = await f.read()
    const request = events.find(event => event.type === 'academic/synthesis-request')
    const response = events.find(event => event.type === 'academic/synthesis-result')
    expect(response?.data).toMatchObject({ status: 'failed', errorCode: 'SYNTHESIS_INVALID_MODEL_OUTPUT', requestSeq: request?.seq })
    if (request?.type !== 'academic/synthesis-request') throw new Error('missing synthesis request')
    expect(request.data.messages).toEqual(f.adapter.calls[2]?.messages)
    expect(request.data.input.analysisInput.evidenceRecords).toHaveLength(2)
    expect(request.data.input.brief).toEqual(draft.input.brief)
  })
  it('scopes the model request to a bounded answer for the supplied focus questions', async () => {
    const f = await fixture()
    const source = {
      ...f.source, sourceProvider: 'arxiv', sourceUrl: 'https://arxiv.org/html/2309.15217v2',
    }
    const block = evidenceMessages(f.request)[0]?.content[0]
    if (block?.type !== 'text') throw new Error('missing model-visible evidence instructions')
    const visible = block.text
    expect(visible).toContain('Extract only facts directly answering the focus questions')
    expect(visible).toContain('Return at most 6 entries')
    expect(visible).not.toContain('inclusionRules')
    expect(visible).toContain('"segments":[{"segmentIndex":0,"text":"Uses Method X."')
    expect(visible).toContain('"focusQuestions":["Which method?"]')
    const admission = scopeMessages(f.request, scope, source, true)[0]?.content[0]
    expect(admission?.type === 'text' ? admission.text : '').toContain('"inclusionRules":[]')
    expect(admission?.type === 'text' ? admission.text : '').toContain('"programOwnedSource":{"sourceProvider":"arxiv"')
  })
  it('runs two parsed papers through the model and B evidence into C evaluated draft', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    const result = await runModelResearchDraft(f.ctx, f.session, config, policies, draft.input, draft.adapters)
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
    expect(f.adapter.calls).toHaveLength(3)
    const saved = await f.read()
    expect(saved.map(event => event.type)).toEqual(['academic/evidence-request', 'academic/evidence-result',
      'academic/evidence-request', 'academic/evidence-result', 'academic/evidence-fragment-verified',
      'academic/evidence-request', 'academic/evidence-result',
      'academic/evidence-request', 'academic/evidence-result', 'academic/evidence-fragment-verified',
      'academic/synthesis-request', 'academic/synthesis-result'])
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
      ctx: f.ctx, session: f.session, model: config, modelPolicies: policies, input: draft.input, adapters: draft.adapters,
    })
    expect(result).toMatchObject({ status: 'completed', sessionId: f.session.id, failures: [] })
    expect(f.adapter.calls).toHaveLength(3)
    expect(f.adapter.calls.every(call => call.reasoningEffort === undefined)).toBe(true)
  })
  it('uses a separate output cap only for final synthesis', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    await runAcademicResearchDraft({ ctx: f.ctx, session: f.session, model: config,
      synthesisModel: { ...config, maxTokens: 1_000 }, modelPolicies: policies,
      input: draft.input, adapters: draft.adapters })
    expect(f.adapter.calls.map(call => call.maxTokens)).toEqual([500, 500, 1_000])
    const requests = (await f.read()).filter(event => event.type === 'academic/synthesis-request')
    expect(requests[0]?.data.outputTokens).toBe(1_000)
  })
  it('allows a model without configurable reasoning when the caller omits an effort', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.supportsReasoning = false
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    await expect(runAcademicResearchDraft({
      ctx: f.ctx, session: f.session, model: config, modelPolicies: policies, input: draft.input, adapters: draft.adapters,
    })).resolves.toMatchObject({ status: 'completed', sessionId: f.session.id })
    expect(draft.adapters.search).toHaveBeenCalledOnce()
    expect(f.adapter.calls).toHaveLength(3)
    expect(f.adapter.calls.every(call => call.reasoningEffort === undefined)).toBe(true)
  })
  it('rejects an explicit unsupported reasoning effort before external work begins', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.supportsReasoning = false
    await expect(runAcademicResearchDraft({
      ctx: f.ctx, session: f.session, model: { ...config, reasoningEffort: ReasoningEffortId('low') }, modelPolicies: policies,
      input: draft.input, adapters: draft.adapters,
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_REASONING_EFFORT' })
    expect(draft.adapters.search).not.toHaveBeenCalled()
    expect(f.adapter.calls).toHaveLength(0)
  })
  it('preserves an explicit caller reasoning effort', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    await runAcademicResearchDraft({ ctx: f.ctx, session: f.session,
      model: { ...config, reasoningEffort: ReasoningEffortId('high') }, modelPolicies: policies,
      input: draft.input, adapters: draft.adapters })
    expect(f.adapter.calls).toHaveLength(3)
    expect(f.adapter.calls.every(call => call.reasoningEffort === 'high')).toBe(true)
  })
  it('bounds a long first paper into fragments and continues after its unsupported drafts', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    const fetch = draft.adapters.fetcher
    draft.adapters.fetcher = async (url, signal) => url.endsWith('/a')
      ? { url, statusCode: 200, truncated: false, body: { kind: 'html', content: `<article><h2>Methods</h2><p>${'oversized '.repeat(2000)}</p></article>` } }
      : fetch(url, signal)
    const result = await runModelResearchDraft(f.ctx, f.session, config, policies, draft.input, draft.adapters)
    expect(result.papers.map(paper => paper.status)).toEqual(['extraction_failed', 'extracted'])
    expect(result.report?.evaluation.status).toBe('blocked')
    expect(result.report?.claims).toHaveLength(0)
    expect(result.report?.markdown).toContain('证据有限的研究草稿')
    expect(result.synthesis.status).toBe('partial_success')
    const ranges = (await f.read()).flatMap(event => event.type === 'academic/evidence-request'
      && event.data.phase === 'evidence' && event.data.fragment ? [event.data.fragment] : [])
    expect(ranges.length).toBeGreaterThan(1)
    expect(ranges.every(range => range.characterEnd - range.characterStart <= 4000)).toBe(true)
  })
  it('stops the model-backed pass on a result checkpoint failure before fetching the next paper', async () => {
    const f = await fixture(), draft = draftFixture()
    const flush = f.ctx.sessions.flush.bind(f.ctx.sessions)
    vi.spyOn(f.ctx.sessions, 'flush').mockImplementation(async (session) => {
      if (session.snapshotEvents().at(-1)?.type === 'academic/evidence-result') throw new Error('disk failure')
      return flush(session)
    })
    await expect(runModelResearchDraft(f.ctx, f.session, config, policies, draft.input, draft.adapters))
      .rejects.toBeInstanceOf(WorkflowLogError)
    expect(draft.adapters.fetcher).toHaveBeenCalledOnce()
    expect(f.adapter.scopeCalls).toHaveLength(1)
    expect(f.adapter.calls).toHaveLength(0)
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
    const [, , request, response] = await f.read()
    if (request?.type !== 'academic/evidence-request' || response?.type !== 'academic/evidence-result') throw new Error('missing records')
    expect(f.adapter.calls[0]?.messages).toEqual(request.data.messages)
    expect(f.adapter.calls[0]?.model).toBe(request.data.config.model)
    expect(request.data.source.workVersionId).toBe(f.version.workVersionId)
    expect(request.data.source.contentHash).toBe(f.source.contentHash)
    expect(response.data.requestSeq).toBe(request.seq)
    expect(response.data.status).toBe('validated')
    expect(expandAssistantStream(response.data.stream).map(entry => entry.chunk)).toEqual(compactEvidenceScript(script))
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
    const source = {
      academicWorkId: f.source.academicWorkId, workVersionId: f.source.workVersionId,
      contentHash: f.source.contentHash, sourceProvider: f.source.sourceProvider, sourceUrl: f.source.sourceUrl,
      retrievedAt: f.source.retrievedAt, extractionMethod: f.source.extractionMethod,
    }
    const tokens = Math.max(...[evidenceMessages(f.request), scopeMessages(f.request, scope, source, true)]
      .map(messages => messages.reduce((sum, message) => sum + f.ctx.tokenMeter.estimateMessage(message), 0)))
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
  it('extracts ordered long-paper batches and maps local segment indexes back to the paper', async () => {
    const f = await fixture()
    const segments = [
      { text: 'Uses Method X. First segment.', locator: { kind: 'paragraph' as const, paragraphNumber: 1 } },
      { text: 'Uses Method X. Second segment.', locator: { kind: 'paragraph' as const, paragraphNumber: 2 } },
    ]
    const source = { ...f.source, segments }
    const request = { ...f.request, segments }
    const oneSegmentTokens = Math.max(...segments.map(segment => evidenceMessages(
      { ...request, segments: [segment] },
    ).reduce((sum, message) => sum + f.ctx.tokenMeter.estimateMessage(message), 0)))
    const generate = createModelEvidenceGenerator(f.ctx, f.session, config,
      { maxAttempts: 1, inputBatchTokenLimit: oneSegmentTokens })
    const progress: PaperEvidenceProgressObservation[] = []
    const response = await generate(request, source, scope, observation => progress.push(observation))
    expect(f.adapter.scopeCalls).toHaveLength(1)
    expect(f.adapter.calls).toHaveLength(2)
    expect(response.evidence.map(draft => draft.segmentIndex)).toEqual([0, 1])
    expect(progress.filter(observation => observation.attempt === null).map(observation => ({
      batchIndex: observation.batchIndex, batchCount: observation.batchCount,
    }))).toEqual([{ batchIndex: 1, batchCount: 2 }, { batchIndex: 2, batchCount: 2 }])
    expect(progress.filter(observation => observation.attempt === 1)).toHaveLength(4)
  })
  it.each([
    { first: [0], second: [1], accepted: 2, rejected: 0, questions: ['Which method?', 'Which architecture?'] },
    { first: [2], second: [0], accepted: 1, rejected: 1, questions: ['Which method?'] },
    { first: [0, 1], second: [1, 0], accepted: 1, rejected: 0, questions: ['Which method?', 'Which architecture?'] },
  ])('preserves distinct question associations across overlapping batches: $first then $second', async ({ first, second, accepted, rejected, questions }) => {
    const f = await fixture()
    vi.spyOn(f.ctx.tokenMeter, 'estimateMessage').mockImplementation(message => JSON.stringify(message).length)
    const segments = [{ ...f.source.segments[0]!, text: 'Uses Method X.' + ' '.repeat(100) + 'Uses Method X.' }]
    const focusQuestions = ['Which method?', 'Which architecture?']
    const source = { ...f.source, segments, focusQuestions }

    const parsedOutput = parsePaperModelResponse(output)
    const response = (questionIndexes: number[]): StreamChunk[] => [
      { type: 'text-delta', index: 0, text: JSON.stringify({ ...parsedOutput, evidence: [
        { ...parsedOutput.evidence[0]!, questionIndexes },
      ] }) },
      { type: 'finish', reason: { kind: 'stop' } },
    ]
    f.adapter.script = response(first)
    f.adapter.afterChunk = () => { if (f.adapter.calls.length === 1) f.adapter.script = response(second) }
    const generate: PaperEvidenceGenerator = (request, parsed, rules, onProgress) => {
      const inputBatchTokenLimit = evidenceMessages({ ...request,
        segments: [{ ...segments[0]!, text: segments[0]!.text.slice(0, 100) }] })
        .reduce((sum, message) => sum + f.ctx.tokenMeter.estimateMessage(message), 0)
      return createModelEvidenceGenerator(f.ctx, f.session, config,
        { maxAttempts: 1, inputBatchTokenLimit, inputBatchOverlapCharacters: 20 })(request, parsed, rules, onProgress)
    }
    const result = await extractPaperEvidence(f.version, source, false, generate, scope)
    expect(f.adapter.calls).toHaveLength(2)
    for (const call of f.adapter.calls) {
      const prompt = call.messages[0]?.content[0]
      expect(prompt?.type === 'text' ? prompt.text : '').toContain('Uses Method X.')
    }
    expect(result.status).toBe(rejected === 0 ? 'extracted' : 'partially_extracted')
    if (result.status !== 'extracted' && result.status !== 'partially_extracted') throw new Error('expected accepted evidence')
    expect(result.evidence.evidenceRecords).toHaveLength(accepted)
    expect(result.evidence.rejectedDrafts).toHaveLength(rejected)
    expect(result.evidence.questionLinks.map(link => link.question)).toEqual(questions)
    const recorded = (await f.read()).filter(event => event.type === 'academic/evidence-result')
    expect(recorded).toHaveLength(3)
  })
  it('keeps evidence from successful batches when another batch fails', async () => {
    const f = await fixture()
    const segments = [
      { text: 'Uses Method X. First segment.', locator: { kind: 'paragraph' as const, paragraphNumber: 1 } },
      { text: 'Uses Method X. Second segment.', locator: { kind: 'paragraph' as const, paragraphNumber: 2 } },
    ]
    const source = { ...f.source, segments }
    const request = { ...f.request, segments }
    const oneSegmentTokens = Math.max(...segments.map(segment => evidenceMessages(
      { ...request, segments: [segment] },
    ).reduce((sum, message) => sum + f.ctx.tokenMeter.estimateMessage(message), 0)))
    f.adapter.script = [{ type: 'finish', reason: { kind: 'error', failure: { code: 'TRANSPORT', message: 'batch failed' } } }]
    f.adapter.afterChunk = () => { if (f.adapter.calls.length === 1) f.adapter.script = script }
    const generate = createModelEvidenceGenerator(f.ctx, f.session, config,
      { maxAttempts: 1, inputBatchTokenLimit: oneSegmentTokens })
    await expect(generate(request, source, scope)).resolves.toMatchObject({
      incompleteBatchCount: 1,
      evidence: [{ segmentIndex: 1 }],
    })
    expect(f.adapter.calls).toHaveLength(2)
  })
  it('settles one hanging model attempt as a retryable timeout', async () => {
    const f = await fixture()
    f.adapter.waitForAbort = true
    const generate = createModelEvidenceGenerator(f.ctx, f.session, config,
      { maxAttempts: 1, attemptTimeoutMs: 500 })
    const progress: PaperEvidenceProgressObservation[] = []
    await expect(generate(f.request, f.source, scope, observation => progress.push(observation)))
      .rejects.toMatchObject({ code: 'EVIDENCE_MODEL_TIMEOUT' })
    expect(f.adapter.calls).toHaveLength(1)
    expect((await f.read()).at(-1)?.data).toMatchObject({
      status: 'failed', errorCode: 'EVIDENCE_MODEL_TIMEOUT',
      finish: { kind: 'error', failure: { code: 'TIMEOUT' } },
      failurePhase: 'before_content', elapsedMs: expect.any(Number) as number,
    })
    expect(progress.at(-1)).toMatchObject({ operation: 'evidence_extract', attempt: 1,
      maximumAttempts: 1, lastFailure: 'timeout' })
  })
  it('enforces the model deadline when a gateway ignores the abort signal', async () => {
    const f = await fixture()
    f.adapter.ignoreAbort = true
    const generate = createModelEvidenceGenerator(f.ctx, f.session, config,
      { maxAttempts: 1, attemptTimeoutMs: 100 })
    await expect(generate(f.request, f.source, scope)).rejects.toMatchObject({ code: 'EVIDENCE_MODEL_TIMEOUT' })
    expect((await f.read()).at(-1)?.data).toMatchObject({
      status: 'failed', errorCode: 'EVIDENCE_MODEL_TIMEOUT',
      finish: { kind: 'error', failure: { code: 'TIMEOUT' } },
    })
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
  it('retries output-limit exhaustion once and records both complete attempts', async () => {
    const f = await fixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: '{' },
      { type: 'finish', reason: { kind: 'max-tokens' } }]
    f.adapter.afterChunk = () => {
      if (f.adapter.calls.length === 1) f.adapter.script = script
    }
    const generate = createModelEvidenceGenerator(f.ctx, f.session, config, { maxAttempts: 2, retryOutputLimit: true })
    const progress: PaperEvidenceProgressObservation[] = []
    await expect(generate(f.request, f.source, scope, observation => progress.push(observation)))
      .resolves.toMatchObject({ scope: { status: 'included' } })
    expect(f.adapter.calls).toHaveLength(2)
    const attempts = (await f.read()).flatMap((event) => {
      if (event.type !== 'academic/evidence-request' && event.type !== 'academic/evidence-result') return []
      if (event.data.phase !== 'evidence') return []
      return [{ type: event.type, attempt: event.data.attempt, maxAttempts: event.data.maxAttempts }]
    })
    expect(attempts).toEqual([
      { type: 'academic/evidence-request', attempt: 1, maxAttempts: 2 },
      { type: 'academic/evidence-result', attempt: 1, maxAttempts: 2 },
      { type: 'academic/evidence-request', attempt: 2, maxAttempts: 2 },
      { type: 'academic/evidence-result', attempt: 2, maxAttempts: 2 },
    ])
    expect(progress).toContainEqual(expect.objectContaining({ operation: 'waiting_retry', attempt: 1,
      maximumAttempts: 2, lastFailure: 'output_limit' }))
    expect(progress).toContainEqual(expect.objectContaining({ operation: 'evidence_extract', attempt: 2,
      maximumAttempts: 2, lastFailure: null }))
  })
  it.each(['TRANSPORT', 'TIMEOUT'] as const)('retries one paper after transient %s and keeps its successful evidence', async (code) => {
    const f = await fixture()
    f.adapter.script = [{ type: 'finish', reason: { kind: 'error', failure: { code, message: 'temporary failure' } } }]
    f.adapter.afterChunk = () => {
      if (f.adapter.calls.length === 1) f.adapter.script = script
    }
    const generate = createModelEvidenceGenerator(f.ctx, f.session, config, { maxAttempts: 2,
      transientRetry: { failureCodes: ['TRANSPORT', 'TIMEOUT'], initialDelayMs: 0 } })
    await expect(generate(f.request, f.source, scope)).resolves.toMatchObject({
      scope: { status: 'included' }, evidence: [{ sourcedStatement: 'Uses Method X.' }],
    })
    expect(f.adapter.calls).toHaveLength(2)
    const events = await f.read()
    const attempts = events.flatMap((event) => {
      if (event.type !== 'academic/evidence-request' && event.type !== 'academic/evidence-result') return []
      if (event.data.phase !== 'evidence') return []
      return [{ type: event.type, attempt: event.data.attempt,
        status: 'status' in event.data ? event.data.status : undefined }]
    })
    expect(attempts).toEqual([
      { type: 'academic/evidence-request', attempt: 1, status: undefined },
      { type: 'academic/evidence-result', attempt: 1, status: 'failed' },
      { type: 'academic/evidence-request', attempt: 2, status: undefined },
      { type: 'academic/evidence-result', attempt: 2, status: 'validated' },
    ])
    const failed = events.find(event => event.type === 'academic/evidence-result'
      && event.data.phase === 'evidence' && event.data.status === 'failed')
    expect(failed?.data).toMatchObject({ failurePhase: 'before_content', elapsedMs: expect.any(Number) as number })
  })
  it('splits a timed-out evidence batch instead of repeating the same full input', async () => {
    const f = await fixture()
    const segments = [
      { text: 'Uses Method X. First segment.', locator: { kind: 'paragraph' as const, paragraphNumber: 1 } },
      { text: 'Uses Method X. Second segment.', locator: { kind: 'paragraph' as const, paragraphNumber: 2 } },
    ]
    const request = { ...f.request, segments }
    const source = { ...f.source, segments }
    f.adapter.waitForAbort = true
    f.adapter.beforeDispatch = async () => { if (f.adapter.calls.length > 0) f.adapter.waitForAbort = false }
    const generate = createModelEvidenceGenerator(f.ctx, f.session, config, { maxAttempts: 2, attemptTimeoutMs: 100,
      transientRetry: { failureCodes: ['TRANSPORT', 'TIMEOUT'], initialDelayMs: 0 } })
    const progress: PaperEvidenceProgressObservation[] = []
    const result = await generate(request, source, scope, observation => progress.push(observation))
    expect(result).toMatchObject({ scope: { status: 'included' },
      evidence: [{ segmentIndex: 0 }, { segmentIndex: 1 }] })
    expect(f.adapter.calls).toHaveLength(3)
    const texts = f.adapter.calls.map(call => call.messages[0]?.content[0])
    expect(texts.every(part => part?.type === 'text')).toBe(true)
    expect(texts[0]?.type === 'text' ? texts[0].text : '').toContain('First segment.')
    expect(texts[0]?.type === 'text' ? texts[0].text : '').toContain('Second segment.')
    expect(texts[1]?.type === 'text' ? texts[1].text : '').not.toContain('Second segment.')
    expect(texts[2]?.type === 'text' ? texts[2].text : '').not.toContain('First segment.')
    expect(progress).toContainEqual(expect.objectContaining({ operation: 'waiting_retry', batchCount: 2,
      lastFailure: 'timeout' }))
    expect((await f.read()).filter(event => event.type === 'academic/evidence-result').map(event => event.data.status))
      .toEqual(['validated', 'failed', 'validated', 'validated'])
  })
  it('recovers a timed-out single segment with shorter exact source slices', async () => {
    const f = await fixture()
    const sourceText = 'Uses Method X. ' + 'a'.repeat(100) + ' Second half.'
    const segments = [{ text: sourceText, locator: { kind: 'paragraph' as const, paragraphNumber: 1 } }]
    const request = { ...f.request, segments }
    f.adapter.waitForAbort = true
    f.adapter.beforeDispatch = async () => { if (f.adapter.calls.length > 0) f.adapter.waitForAbort = false }
    f.adapter.afterChunk = () => {
      if (f.adapter.calls.length === 2) f.adapter.script = [
        { type: 'text-delta', index: 0, text: JSON.stringify({ evidence: [] }) },
        { type: 'finish', reason: { kind: 'stop' } },
      ]
    }
    const generate = createModelEvidenceGenerator(f.ctx, f.session, config,
      { maxAttempts: 2, attemptTimeoutMs: 100, inputBatchOverlapCharacters: 8 })
    const result = await generate(request, { ...f.source, segments }, scope)
    expect(result.evidence).toMatchObject([{ segmentIndex: 0, verbatimExcerpt: 'Uses Method X.' }])
    expect(f.adapter.calls).toHaveLength(3)
    const parts = f.adapter.calls.slice(1).map(call => call.messages[0]?.content[0])
    const submitted = parts.map((part) => {
      if (part?.type !== 'text') throw new Error('missing recovery input')
      return (JSON.parse(part.text.slice(part.text.lastIndexOf('\n{') + 1)) as { segments: Array<{ text: string }> }).segments[0]!.text
    })
    expect(submitted.every(text => text.length < sourceText.length && sourceText.includes(text))).toBe(true)
    expect(submitted[0]?.slice(-8)).toBe(submitted[1]?.slice(0, 8))
  })
  it('keeps successful recovery evidence when the other smaller batch fails', async () => {
    const f = await fixture()
    const segments = [
      { text: 'Uses Method X. First segment.', locator: { kind: 'paragraph' as const, paragraphNumber: 1 } },
      { text: 'Uses Method X. Second segment.', locator: { kind: 'paragraph' as const, paragraphNumber: 2 } },
    ]
    f.adapter.waitForAbort = true
    f.adapter.beforeDispatch = async () => { if (f.adapter.calls.length > 0) f.adapter.waitForAbort = false }
    f.adapter.afterChunk = () => {
      if (f.adapter.calls.length === 2) f.adapter.script = [
        { type: 'finish', reason: { kind: 'error', failure: { code: 'TRANSPORT', message: 'unavailable' } } },
      ]
    }
    const generate = createModelEvidenceGenerator(f.ctx, f.session, config, { maxAttempts: 2, attemptTimeoutMs: 100,
      transientRetry: { failureCodes: ['TIMEOUT'], initialDelayMs: 0 } })
    await expect(generate({ ...f.request, segments }, { ...f.source, segments }, scope)).resolves.toMatchObject({
      incompleteBatchCount: 1, evidence: [{ segmentIndex: 0 }],
    })
    expect(f.adapter.calls).toHaveLength(3)
  })
  it('stops after one timeout split when both smaller inputs also time out', async () => {
    const f = await fixture()
    f.adapter.waitForAbort = true
    const segments = [{ ...f.source.segments[0]!, text: 'Uses Method X. ' + 'a'.repeat(80) }]
    const generate = createModelEvidenceGenerator(f.ctx, f.session, config,
      { maxAttempts: 2, attemptTimeoutMs: 100 })
    await expect(generate({ ...f.request, segments }, { ...f.source, segments }, scope))
      .rejects.toMatchObject({ code: 'EVIDENCE_MODEL_TIMEOUT' })
    expect(f.adapter.calls).toHaveLength(3)
    expect((await f.read()).filter(event => event.type === 'academic/evidence-result').map(event => event.data.status))
      .toEqual(['validated', 'failed', 'failed', 'failed'])
  })
  it.each(['TRANSPORT', 'TIMEOUT'] as const)('retries final synthesis after %s without repeating paper work', async (code) => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    f.adapter.synthesisScript = [{ type: 'finish', reason: { kind: 'error', failure: { code, message: 'temporary failure' } } }]
    f.adapter.afterChunk = () => {
      if (f.adapter.calls.length === 3) delete f.adapter.synthesisScript
    }
    const retryPolicies = { evidence: policy, synthesis: { maxAttempts: 3,
      transientRetry: { failureCodes: ['TRANSPORT', 'TIMEOUT'] as const, initialDelayMs: 0 } } }
    const result = await runModelResearchDraft(f.ctx, f.session, config, retryPolicies, draft.input, draft.adapters)
    expect(result.report?.markdown).toContain('合成基准样例')
    expect(f.adapter.calls).toHaveLength(4)
    expect(draft.adapters.search).toHaveBeenCalledOnce()
    expect(draft.adapters.fetcher).toHaveBeenCalledTimes(2)
    const attempts = (await f.read()).flatMap(event => event.type === 'academic/synthesis-request'
      || event.type === 'academic/synthesis-result'
      ? [{ type: event.type, attempt: event.data.attempt, maxAttempts: event.data.maxAttempts }]
      : [])
    expect(attempts).toEqual([
      { type: 'academic/synthesis-request', attempt: 1, maxAttempts: 3 },
      { type: 'academic/synthesis-result', attempt: 1, maxAttempts: 3 },
      { type: 'academic/synthesis-request', attempt: 2, maxAttempts: 3 },
      { type: 'academic/synthesis-result', attempt: 2, maxAttempts: 3 },
    ])
  })
  it('regenerates complete synthesis JSON after a structural validation failure', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    f.adapter.synthesisTransform = value => ({ ...value, sections: value.sections.map(section =>
      section.sectionId === 'limitations' ? { ...section, missingReason: 'conflicts with cited statements' } : section) })
    f.adapter.afterChunk = () => { if (f.adapter.calls.length === 3) delete f.adapter.synthesisTransform }
    const retryPolicies = { evidence: policy, synthesis: { maxAttempts: 3, retryInvalidOutput: true } }
    const result = await runModelResearchDraft(f.ctx, f.session, config, retryPolicies, draft.input, draft.adapters)
    expect(result.report?.markdown).toContain('合成基准样例')
    expect(f.adapter.calls).toHaveLength(4)
    expect(draft.adapters.search).toHaveBeenCalledOnce()
    expect(draft.adapters.fetcher).toHaveBeenCalledTimes(2)
    const events = (await f.read()).filter(event => event.type === 'academic/synthesis-request'
      || event.type === 'academic/synthesis-result')
    expect(events.map(event => ({ type: event.type, attempt: event.data.attempt, status: 'status' in event.data
      ? event.data.status : undefined, errorCode: 'errorCode' in event.data ? event.data.errorCode : undefined }))).toEqual([
      { type: 'academic/synthesis-request', attempt: 1, status: undefined, errorCode: undefined },
      { type: 'academic/synthesis-result', attempt: 1, status: 'failed', errorCode: 'SYNTHESIS_INVALID_MODEL_OUTPUT' },
      { type: 'academic/synthesis-request', attempt: 2, status: undefined, errorCode: undefined },
      { type: 'academic/synthesis-result', attempt: 2, status: 'validated', errorCode: undefined },
    ])
    const repair = events[2]?.type === 'academic/synthesis-request' ? events[2].data.messages[0]?.content[0] : undefined
    expect(repair?.type === 'text' ? repair.text : '').toContain('Section "limitations" statements and missing-evidence reason disagree.')
  })
  it('stops after the bounded invalid-synthesis attempts are exhausted', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    f.adapter.synthesisTransform = value => ({ ...value, sections: value.sections.map(section =>
      section.sectionId === 'limitations' ? { ...section, missingReason: 'conflicts with cited statements' } : section) })
    const retryPolicies = { evidence: policy, synthesis: { maxAttempts: 3, retryInvalidOutput: true } }
    const result = await runModelResearchDraft(f.ctx, f.session, config, retryPolicies, draft.input, draft.adapters)
    expect(result.report).toBeNull()
    expect(result.synthesis.reasons.join(' ')).toContain('SYNTHESIS_INVALID_MODEL_OUTPUT')
    expect(f.adapter.calls).toHaveLength(5)
    const results = (await f.read()).filter(event => event.type === 'academic/synthesis-result')
    expect(results.map(event => ({ attempt: event.data.attempt, status: event.data.status,
      errorCode: event.data.errorCode }))).toEqual([
      { attempt: 1, status: 'failed', errorCode: 'SYNTHESIS_INVALID_MODEL_OUTPUT' },
      { attempt: 2, status: 'failed', errorCode: 'SYNTHESIS_INVALID_MODEL_OUTPUT' },
      { attempt: 3, status: 'failed', errorCode: 'SYNTHESIS_INVALID_MODEL_OUTPUT' },
    ])
  })
  it('does not repeat an identical final synthesis request after output-limit exhaustion', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    f.adapter.synthesisScript = [{ type: 'text-delta', index: 0, text: '{' },
      { type: 'finish', reason: { kind: 'max-tokens' } }]
    const retryPolicies = { evidence: policy, synthesis: { maxAttempts: 3, retryOutputLimit: false,
      transientRetry: { failureCodes: ['TRANSPORT', 'TIMEOUT'] as const, initialDelayMs: 0 } } }
    const result = await runModelResearchDraft(f.ctx, f.session, config, retryPolicies, draft.input, draft.adapters)
    expect(result.report).toBeNull()
    expect(result.synthesis.status).toBe('failed')
    expect(f.adapter.calls).toHaveLength(3)
    const events = (await f.read()).filter(event => event.type === 'academic/synthesis-request'
      || event.type === 'academic/synthesis-result')
    expect(events.map(event => ({ type: event.type, attempt: event.data.attempt }))).toEqual([
      { type: 'academic/synthesis-request', attempt: 1 },
      { type: 'academic/synthesis-result', attempt: 1 },
    ])
  })
  it('retries output-limited synthesis once with smaller citable materials', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    f.adapter.synthesisScript = [{ type: 'text-delta', index: 0, text: '{' },
      { type: 'finish', reason: { kind: 'max-tokens' } }]
    f.adapter.afterChunk = () => { if (f.adapter.calls.length === 3) delete f.adapter.synthesisScript }
    const retryPolicies = { evidence: policy, synthesis: { maxAttempts: 3, retryOutputLimit: true,
      transientRetry: { failureCodes: ['TRANSPORT', 'TIMEOUT'] as const, initialDelayMs: 0 } } }
    const result = await runModelResearchDraft(f.ctx, f.session, config, retryPolicies, draft.input, draft.adapters)
    expect(result.report?.markdown).toContain('合成基准样例')
    expect(f.adapter.calls).toHaveLength(4)
    const requests = (await f.read()).filter(event => event.type === 'academic/synthesis-request')
    expect(requests).toHaveLength(2)
    expect(requests.map(event => event.data.attempt)).toEqual([1, 2])
    expect(requests[1]!.data.estimatedInputTokens).toBeLessThan(requests[0]!.data.estimatedInputTokens)
    const recovery = requests[1]!.data.messages[0]?.content[0]
    expect(recovery?.type === 'text' ? recovery.text : '').toContain('output_limit_compact')
  })
  it('stops after one compact synthesis recovery and reports the output limit', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    f.adapter.synthesisScript = [{ type: 'text-delta', index: 0, text: '{' },
      { type: 'finish', reason: { kind: 'max-tokens' } }]
    const retryPolicies = { evidence: policy, synthesis: { maxAttempts: 3, retryOutputLimit: true,
      transientRetry: { failureCodes: ['TRANSPORT', 'TIMEOUT'] as const, initialDelayMs: 0 } } }
    const result = await runModelResearchDraft(f.ctx, f.session, config, retryPolicies, draft.input, draft.adapters)
    expect(result.report).toBeNull()
    expect(result.synthesis).toMatchObject({ status: 'failed' })
    expect(result.synthesis.reasons.join(' ')).toContain('SYNTHESIS_MODEL_OUTPUT_LIMIT')
    expect(f.adapter.calls).toHaveLength(4)
    const events = (await f.read()).filter(event => event.type === 'academic/synthesis-request'
      || event.type === 'academic/synthesis-result')
    expect(events.map(event => ({ type: event.type, attempt: event.data.attempt }))).toEqual([
      { type: 'academic/synthesis-request', attempt: 1 },
      { type: 'academic/synthesis-result', attempt: 1 },
      { type: 'academic/synthesis-request', attempt: 2 },
      { type: 'academic/synthesis-result', attempt: 2 },
    ])
  })
  it('stops after the bounded synthesis connection attempts are exhausted', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    f.adapter.synthesisScript = [{ type: 'finish', reason: { kind: 'error',
      failure: { code: 'TRANSPORT', message: 'connection unavailable' } } }]
    const retryPolicies = { evidence: policy, synthesis: { maxAttempts: 3,
      transientRetry: { failureCodes: ['TRANSPORT', 'TIMEOUT'] as const, initialDelayMs: 0 } } }
    const result = await runModelResearchDraft(f.ctx, f.session, config, retryPolicies, draft.input, draft.adapters)
    expect(result.report).toBeNull()
    expect(result.synthesis.status).toBe('failed')
    expect(f.adapter.calls).toHaveLength(5)
    const results = (await f.read()).filter(event => event.type === 'academic/synthesis-result')
    expect(results).toHaveLength(3)
    expect(results.map(event => event.data.attempt)).toEqual([1, 2, 3])
    expect(results.at(-1)?.data).toMatchObject({ status: 'failed', errorCode: 'EVIDENCE_MODEL_INCOMPLETE',
      finish: { kind: 'error', failure: { code: 'TRANSPORT' } } })
  })
  it('does not retry a non-transient synthesis failure', async () => {
    const f = await fixture(), draft = draftFixture()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    f.adapter.synthesisScript = [{ type: 'finish', reason: { kind: 'error',
      failure: { code: 'AUTH', message: 'invalid credentials' } } }]
    const retryPolicies = { evidence: policy, synthesis: { maxAttempts: 3,
      transientRetry: { failureCodes: ['TRANSPORT', 'TIMEOUT'] as const, initialDelayMs: 0 } } }
    const result = await runModelResearchDraft(f.ctx, f.session, config, retryPolicies, draft.input, draft.adapters)
    expect(result.report).toBeNull()
    expect(f.adapter.calls).toHaveLength(3)
    expect((await f.read()).filter(event => event.type === 'academic/synthesis-result')).toHaveLength(1)
  })
  it('cancels synthesis during retry backoff without dispatching another attempt', async () => {
    const f = await fixture(), draft = draftFixture(), controller = new AbortController()
    f.adapter.script = [{ type: 'text-delta', index: 0, text: output.replaceAll('Method X', 'reranking') }, script[2]!]
    f.adapter.synthesisScript = [{ type: 'finish', reason: { kind: 'error',
      failure: { code: 'TIMEOUT', message: 'temporary timeout' } } }]
    const retryPolicies = { evidence: policy, synthesis: { maxAttempts: 3,
      transientRetry: { failureCodes: ['TRANSPORT', 'TIMEOUT'] as const, initialDelayMs: 60_000 } } }
    const running = runModelResearchDraft(f.ctx, f.session, config, retryPolicies, draft.input, draft.adapters, controller.signal)
    await vi.waitFor(() => { expect(f.adapter.calls).toHaveLength(3) })
    controller.abort()
    await expect(running).resolves.toMatchObject({ status: 'cancelled', report: null })
    expect(f.adapter.calls).toHaveLength(3)
    expect((await f.read()).filter(event => event.type === 'academic/synthesis-result')).toHaveLength(1)
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
    expect(f.adapter.calls).toHaveLength(0)
    expect(f.adapter.scopeCalls).toHaveLength(phase === 'request' ? 0 : 1)
  })
  it('refuses a persistence listener with no active writer', async () => {
    const f = await fixture(false)
    await expect(f.generate(f.request, f.source, scope)).rejects.toBeInstanceOf(WorkflowLogError)
    expect(f.adapter.calls).toHaveLength(0)
  })
  it('refuses missing runtime services at binding time', async () => {
    const f = await fixture()
    expect(() => createModelEvidenceGenerator(new Context(), f.session, config, policy)).toThrow('requires')
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
