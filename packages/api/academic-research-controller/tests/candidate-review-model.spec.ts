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
import { approvedCandidateScreeningCriteria } from '../src/candidate-screening.ts'
import { createModelCandidateReviewer } from '../src/candidate-review-model.ts'

class ReviewAdapter extends LlmAdapter {
  readonly calls: GenerateOptions[] = []
  response = JSON.stringify({ schemaVersion: 1, signals: [{ kind: 'question', question: 'Compare methods',
    quote: { source: 'title', text: 'Synthetic a' } }], surfaceKeywordHits: [], uncertainties: [],
  scope: { status: 'potentially_relevant', reason: 'The title addresses the approved topic.' } })

  override resolveModel(provider: string, model: string) {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 10_000 } })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls.push(options)
    yield { type: 'text-delta', index: 0, text: this.response }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture() {
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
  const input = { academicWorkId: sample.records[0]!.academicWork.academicWorkId,
    title: 'Synthetic a', abstract: { status: 'available' as const, value: 'Methods are compared.' },
    keywords: { status: 'available' as const, value: ['methods'] }, brief, plan,
    criteria: approvedCandidateScreeningCriteria(brief, plan) }
  const reviewer = createModelCandidateReviewer(ctx, session,
    { provider: 'fixture', model: 'fixture' }, { maxTokens: 512, attemptTimeoutMs: 1000 })
  const read = async () => {
    await using handle = await ctx.sessionPersistence.open(session.id, 'read')
    return await handle.read()
  }
  return { ctx, session, adapter, input, reviewer, read }
}

describe('Session-backed candidate metadata review', () => {
  it('saves the exact model request and validated result before scoring', async () => {
    const f = await fixture()
    const screening = await f.reviewer(f.input)
    expect(screening?.signals).toMatchObject([{ question: f.input.brief.questions[0] }])
    expect(f.adapter.calls).toHaveLength(1)
    const events = await f.read()
    expect(events.filter(event => event.type === 'academic/candidate-screening-request')).toHaveLength(1)
    expect(events.filter(event => event.type === 'academic/candidate-screening-result')).toHaveLength(1)
    expect(events.find(event => event.type === 'academic/candidate-screening-result'))
      .toMatchObject({ data: { status: 'validated', academicWorkId: f.input.academicWorkId } })
    expect(events.filter(event => event.type.startsWith('academic/candidate-screening-'))
      .map(event => ({ type: event.type, status: 'status' in event.data ? event.data.status : 'request' })))
      .toMatchInlineSnapshot(`
        [
          {
            "status": "request",
            "type": "academic/candidate-screening-request",
          },
          {
            "status": "validated",
            "type": "academic/candidate-screening-result",
          },
        ]
      `)
  })

  it('records invalid model output and permits lexical fallback', async () => {
    const f = await fixture()
    f.adapter.response = '{broken'
    await expect(f.reviewer(f.input)).resolves.toBeUndefined()
    expect((await f.read()).find(event => event.type === 'academic/candidate-screening-result'))
      .toMatchObject({ data: { status: 'failed', academicWorkId: f.input.academicWorkId } })
  })

  it('rejects an unapproved scored label from an otherwise valid model response', async () => {
    const f = await fixture()
    f.adapter.response = JSON.stringify({ schemaVersion: 1,
      signals: [{ kind: 'method', label: 'invented method', quote: { source: 'title', text: 'Synthetic a' } }],
      surfaceKeywordHits: [], uncertainties: [],
      scope: { status: 'unknown', reason: 'The abstract does not establish scope.' } })
    await expect(f.reviewer(f.input)).resolves.toBeUndefined()
    expect((await f.read()).find(event => event.type === 'academic/candidate-screening-result'))
      .toMatchObject({ data: { status: 'failed' } })
  })

  it('does not turn a missing durable request into a lexical fallback', async () => {
    const f = await fixture()
    vi.spyOn(f.ctx.sessions, 'flush').mockResolvedValue(false)
    await expect(f.reviewer(f.input)).rejects.toBeInstanceOf(WorkflowLogError)
    expect(f.adapter.calls).toHaveLength(0)
  })
})
