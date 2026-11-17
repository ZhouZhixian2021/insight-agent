import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import { createCandidatePageId, createProductId, createProductPlanId, createProductQuestionId, type CandidatePage } from '@deepseek-ai/dsh-product-insight-model'
import type { ProductEvidenceDraft } from '@deepseek-ai/dsh-product-insight-source'
import { afterEach, expect, it } from 'vitest'
import { proposeEvidence } from '../src/session-tool.ts'

class Adapter extends LlmAdapter {
  readonly calls: GenerateOptions[] = []
  constructor(readonly outputs: readonly string[]) { super() }
  override resolveModel(provider: string, model: string) {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 100000 } })
  }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const text = this.outputs[this.calls.length]
    this.calls.push(options)
    if (text === undefined) throw new Error('Unexpected additional extraction call')
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const roots: Context[] = []
afterEach(async () => { for (const ctx of roots.splice(0)) await ctx.fiber.dispose() })
const text = 'Enterprise supports offline use. Basic costs $10.'
const good = { verbatimExcerpt: 'Enterprise supports offline use.', sourcedStatement: 'Enterprise supports offline use.', questionIds: ['Q1'] }
const bad = { verbatimExcerpt: 'Basic costs $10.', questionIds: ['Q2'] }
const corrected = { ...bad, sourcedStatement: 'Basic costs $10.', repairIndex: 1 }

async function fixture(outputs: readonly string[]) {
  const ctx = new Context(); roots.push(ctx)
  await ctx.plugin(SessionStore); await ctx.plugin(LlmRuntime)
  const adapter = new Adapter(outputs); ctx.llm.registerAdapter(['fixture'], adapter)
  const session = ctx.sessions.create()
  const questions = [{ questionId: createProductQuestionId(), text: 'How is it deployed?' }, { questionId: createProductQuestionId(), text: 'What does it cost?' }]
  const page: CandidatePage = { schemaVersion: 1, candidatePageId: createCandidatePageId(),
    planId: createProductPlanId(), productId: createProductId(),
    url: 'https://example.test/product', sourceType: 'official_product_page', discoveredAt: '2026-11-17T00:00:00Z', questionIds: questions.map(q => q.questionId),
    screening: { status: 'selected', reason: 'Fixture', screenedAt: '2026-11-17T00:00:00Z' } }
  const cache = new Map<string, { pageId: string; drafts: readonly ProductEvidenceDraft[] }>()
  const run = (candidate = page, body = text) => proposeEvidence(ctx, session, { provider: 'fixture', model: 'fixture' }, candidate,
    body, questions, async () => {}, session.snapshotEvents(), undefined, { start: 0, end: body.length, text: body }, undefined, cache)
  return { session, questions, page, adapter, run }
}

it('repairs only invalid siblings and persists short-ID requests and full-ID drafts', async () => {
  const f = await fixture([JSON.stringify([good, bad]), JSON.stringify([corrected])])
  const drafts = await f.run()
  expect(drafts).toEqual([{ ...good, questionIds: [f.questions[0]!.questionId] },
    { verbatimExcerpt: bad.verbatimExcerpt, sourcedStatement: corrected.sourcedStatement, questionIds: [f.questions[1]!.questionId] }])
  const requests = f.session.snapshotEvents().filter(e => e.type === 'product/model-request-v1')
  expect(requests).toHaveLength(2)
  const first: unknown = JSON.parse(requests[0]!.data.user)
  const second: unknown = JSON.parse(requests[1]!.data.user)
  expect(first).toMatchObject({ pageText: text, questions: [{ questionId: 'Q1' }, { questionId: 'Q2' }] })
  expect(second).toMatchObject({ repair: [{ repairIndex: 1, reason: 'missing_statement', draft: bad }] })
  expect(f.session.snapshotEvents().filter(e => e.type === 'product/extraction-inspection-v1').map(e => ({
    kind: e.data.kind, accepted: e.data.accepted, issues: e.data.issues, error: e.data.error,
  }))).toMatchSnapshot()
})

it('keeps valid siblings when the targeted repair fails and does not split or re-extract them', async () => {
  const f = await fixture([JSON.stringify([good, bad]), '[{'])
  const drafts = await f.run()
  expect(drafts).toHaveLength(1)
  expect(drafts[0]?.verbatimExcerpt).toBe(good.verbatimExcerpt)
  expect(f.adapter.calls).toHaveLength(2)
  expect(f.session.snapshotEvents().some(e => e.type === 'product/extraction-inspection-v1' && e.data.kind === 'repair' && e.data.error !== null)).toBe(true)
})

it('reuses exact same-site text but records the new source and rereads changed text', async () => {
  const f = await fixture(['```json\n' + JSON.stringify([good]) + '\n```', JSON.stringify([good])])
  const first = await f.run()
  const duplicate = { ...f.page, candidatePageId: createCandidatePageId(), url: 'https://example.test/duplicate' }
  expect(await f.run(duplicate)).toEqual(first)
  expect(f.adapter.calls).toHaveLength(1)
  expect(f.session.snapshotEvents().find(e => e.type === 'product/extraction-inspection-v1' && e.data.kind === 'reuse')?.data)
    .toMatchObject({ candidatePageId: duplicate.candidatePageId, reusedFrom: f.page.candidatePageId })
  await f.run({ ...duplicate, candidatePageId: createCandidatePageId() }, text + ' Available in the US only.')
  expect(f.adapter.calls).toHaveLength(2)
})
