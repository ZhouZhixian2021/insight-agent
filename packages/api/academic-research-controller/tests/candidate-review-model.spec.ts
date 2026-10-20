import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LlmRuntime, { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { isExecutableResearchBrief } from '@deepseek-ai/dsh-academic-model'
import { WorkflowLogError } from '@deepseek-ai/dsh-academic-workflow'
import { draftFixture } from '../../../academic/workflow/tests/pipeline-fixture.ts'
import { approvedHybridSearchHandoff } from '../src/planned-retrieval.ts'
import { createModelCandidateReviewer, recordCandidateReviewSelection } from '../src/candidate-review-model.ts'

class ReviewAdapter extends LlmAdapter {
  readonly calls: GenerateOptions[] = []
  failure: 'TRANSPORT' | 'hang' | undefined
  response = JSON.stringify({ schemaVersion: 1, matchedQuestions: [{ question: 'Compare methods',
    quote: { source: 'title', text: 'Synthetic a' } }],
  scope: { status: 'potentially_relevant', reason: 'The title addresses the approved topic.' } })

  override resolveModel(provider: string, model: string) {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 10_000 } })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls.push(options)
    if (this.failure === 'TRANSPORT') {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'TRANSPORT', message: 'Connection error.' } } }
      return
    }
    if (this.failure === 'hang') {
      await new Promise<void>((resolve) => { options.signal?.addEventListener('abort', () => { resolve() }, { once: true }) })
      return
    }
    yield { type: 'text-delta', index: 0, text: this.response }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture(attemptTimeoutMs = 1000) {
  const root = await mkdtemp(join(tmpdir(), 'academic-candidate-review-'))
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  await ctx.plugin(SessionStore)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(TokenMeter)
  await ctx.plugin(JsonlPersistence, { root, compression: 'none' })
  const session = ctx.sessions.create()
  await ctx.sessionPersistence.create(session.header)
  const adapter = new ReviewAdapter()
  ctx.llm.registerAdapter(['fixture'], adapter)
  const sample = draftFixture(1)
  const brief = sample.input.brief
  if (!isExecutableResearchBrief(brief)) throw new Error('fixture requires an approved Brief')
  const plan = approvedHybridSearchHandoff(brief, [{ query: 'synthetic methods', purpose: 'Find methods',
    questions: brief.questions, retrieval: { channels: ['academic'], academicProviders: ['arxiv'],
      verificationProviders: ['arxiv'], maximumWebDiscoveryResults: 1,
      maximumReferenceVerifications: 1 } }]).plan
  const work = sample.records[0]!.academicWork
  const version = sample.records[0]!.workVersion
  const selectionSeq = await recordCandidateReviewSelection(ctx, session, {
    researchBriefId: brief.researchBriefId, researchBriefVersion: brief.version, roundIndex: 0,
    selection: { schemaVersion: 1, maximumModelReviews: 8, attemptedBefore: 0, remainingBudget: 8,
      decisions: [{ academicWorkId: work.academicWorkId, workVersionId: version.workVersionId,
        routedQuestions: brief.questions, status: 'selected', selectionOrder: 0, selectionReason: 'question_coverage' }] },
  })
  const input = { academicWorkId: work.academicWorkId, workVersionId: version.workVersionId,
    roundIndex: 0, selectionSeq, onDispatch: vi.fn(),
    title: 'Synthetic a', abstract: { status: 'available' as const, value: 'Methods are compared.' },
    brief, plan }
  const reviewer = createModelCandidateReviewer(ctx, session,
    { provider: 'fixture', model: 'fixture' }, { maxTokens: 512, attemptTimeoutMs })
  const read = async () => {
    await using handle = await ctx.sessionPersistence.open(session.id, 'read')
    return await handle.read()
  }
  return { ctx, session, adapter, input, reviewer, read }
}

describe('Session-backed candidate metadata review', () => {
  it('saves the exact model request and validated result before scoring', async () => {
    const f = await fixture()
    const outcome = await f.reviewer(f.input)
    expect(outcome).toMatchObject({ status: 'validated', screening: {
      signals: [{ question: f.input.brief.questions[0] }], surfaceKeywordHits: [] } })
    expect(f.input.onDispatch).toHaveBeenCalledTimes(1)
    expect(f.adapter.calls).toHaveLength(1)
    const events = await f.read()
    expect(events.filter(event => event.type === 'academic/candidate-semantic-review-request-v1')).toHaveLength(1)
    expect(events.filter(event => event.type === 'academic/candidate-semantic-review-result-v1')).toHaveLength(1)
    expect(events.find(event => event.type === 'academic/candidate-semantic-review-result-v1'))
      .toMatchObject({ data: { status: 'validated', academicWorkId: f.input.academicWorkId } })
    const request = events.find(event => event.type === 'academic/candidate-semantic-review-request-v1')!
    expect(request.data).toMatchObject({ selectionSeq: f.input.selectionSeq, roundIndex: 0 })
    expect(events.find(event => event.type === 'academic/candidate-semantic-review-verified-v1'))
      .toMatchObject({ data: { requestSeq: request.seq, selectionSeq: f.input.selectionSeq,
        review: { matchedQuestions: [{ question: f.input.brief.questions[0] }] } } })
    expect(events.filter(event => event.type.startsWith('academic/candidate-'))
      .map(event => ({ type: event.type, status: 'status' in event.data ? event.data.status : 'request' })))
      .toMatchInlineSnapshot(`
        [
          {
            "status": "request",
            "type": "academic/candidate-review-selection-v1",
          },
          {
            "status": "request",
            "type": "academic/candidate-semantic-review-request-v1",
          },
          {
            "status": "validated",
            "type": "academic/candidate-semantic-review-result-v1",
          },
          {
            "status": "request",
            "type": "academic/candidate-semantic-review-verified-v1",
          },
        ]
      `)
    const content = f.adapter.calls[0]!.messages[0]!.content
    expect(content).toMatchSnapshot()
  })

  it('records invalid model output and permits lexical fallback', async () => {
    const f = await fixture()
    f.adapter.response = '{broken'
    await expect(f.reviewer(f.input)).resolves.toEqual({ status: 'failed', code: 'CANDIDATE_REVIEW_INVALID_OUTPUT' })
    const events = await f.read()
    expect(events.find(event => event.type === 'academic/candidate-semantic-review-result-v1'))
      .toMatchObject({ data: { status: 'failed', errorCode: 'CANDIDATE_REVIEW_INVALID_OUTPUT',
        academicWorkId: f.input.academicWorkId } })
    expect(events.some(event => event.type === 'academic/candidate-semantic-review-verified-v1')).toBe(false)
  })

  it.each(['TRANSPORT', 'TIMEOUT'] as const)('preserves %s failure identity for the assessment and Session', async (code) => {
    const f = await fixture(code === 'TIMEOUT' ? 25 : 1000)
    f.adapter.failure = code === 'TIMEOUT' ? 'hang' : 'TRANSPORT'
    await expect(f.reviewer(f.input)).resolves.toEqual({ status: 'failed', code })
    const events = await f.read()
    expect(events.find(event => event.type === 'academic/candidate-semantic-review-result-v1'))
      .toMatchObject({ data: { status: 'failed', finish: { kind: 'error', failure: { code } } } })
    expect(events.some(event => event.type === 'academic/candidate-semantic-review-verified-v1')).toBe(false)
  })

  it('rejects extra scored fields from an otherwise valid minimal response', async () => {
    const f = await fixture()
    f.adapter.response = JSON.stringify({ schemaVersion: 1,
      signals: [{ kind: 'method', label: 'invented method', quote: { source: 'title', text: 'Synthetic a' } }],
      surfaceKeywordHits: [], uncertainties: [],
      scope: { status: 'unknown', reason: 'The abstract does not establish scope.' } })
    await expect(f.reviewer(f.input)).resolves.toMatchObject({ status: 'failed' })
    expect((await f.read()).find(event => event.type === 'academic/candidate-semantic-review-result-v1'))
      .toMatchObject({ data: { status: 'failed' } })
  })

  it('does not turn a missing durable request into a lexical fallback', async () => {
    const f = await fixture()
    vi.spyOn(f.ctx.sessions, 'flush').mockResolvedValue(false)
    await expect(f.reviewer(f.input)).rejects.toBeInstanceOf(WorkflowLogError)
    expect(f.adapter.calls).toHaveLength(0)
    expect(f.input.onDispatch).not.toHaveBeenCalled()
  })

  it('propagates failure to commit the verified judgment instead of scoring it', async () => {
    const f = await fixture()
    const flush = f.ctx.sessions.flush.bind(f.ctx.sessions)
    vi.spyOn(f.ctx.sessions, 'flush').mockImplementation(async (session) => {
      if (session.snapshotEvents().at(-1)?.type === 'academic/candidate-semantic-review-verified-v1') return false
      return flush(session)
    })
    await expect(f.reviewer(f.input)).rejects.toBeInstanceOf(WorkflowLogError)
  })
})
