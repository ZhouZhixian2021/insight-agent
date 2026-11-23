import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import { createCandidatePageId, createProductId, createProductPlanId, createProductQuestionId, createSourceSnapshotId, type CandidatePage, type ProductPlan } from '@deepseek-ai/dsh-product-insight-model'
import type { ProductEvidenceDraft } from '@deepseek-ai/dsh-product-insight-source'
import { afterEach, expect, it, vi } from 'vitest'
import { pageSummaryModel, proposeEvidence } from '../src/session-tool.ts'
import { readReviewedProductPage, PAGE_REVIEW_INSTRUCTION } from '../src/page-summary.ts'

type Responses = readonly string[] | ((options: GenerateOptions) => Promise<string>)

class Adapter extends LlmAdapter {
  readonly calls: GenerateOptions[] = []
  constructor(readonly outputs: Responses) { super() }
  override resolveModel(provider: string, model: string) {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 100000 } })
  }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const index = this.calls.length
    this.calls.push(options)
    const text = typeof this.outputs === 'function' ? await this.outputs(options) : this.outputs[index]
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

async function fixture(outputs: Responses) {
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
  return { ctx, session, questions, page, adapter, run }
}

it('pairs interleaved full-page reviews with their own drafts and replays both requests from Session', async () => {
  const releaseFirst = Promise.withResolvers<undefined>()
  const releaseOthers = Promise.withResolvers<undefined>()
  let activeReviews = 0
  const f = await fixture(async (options) => {
    const block = options.messages[0]?.content[0]
    if (block?.type !== 'text') throw new Error('Expected a complete text input')
    const input = JSON.parse(block.text) as { pageText: string; paragraphs?: { id: number; text: string }[] }
    const name = input.pageText.split(' ')[0]
    if (options.system !== PAGE_REVIEW_INSTRUCTION) return '仅 ' + name + ' supports export.'
    expect(input.paragraphs).toEqual([{ id: 1, text: '仅 ' + name + ' supports export.' }])
    activeReviews++
    await (name === 'First' ? releaseFirst : releaseOthers).promise
    return JSON.stringify({ checked: [1], edits: [{ paragraph: 1, replacement: input.pageText, reason: 'The text does not exclude others.', quotes: [input.pageText] }] })
  })
  const plan: ProductPlan = { schemaVersion: 1, version: 1, productId: f.page.productId, planId: f.page.planId,
    scope: 'Export behavior', questions: f.questions, approval: { status: 'approved', approvedPlanVersion: 1,
      reviewedBy: 'user', reviewedAt: f.page.discoveredAt, comment: null } }
  const pages = ['First', 'Second', 'Third'].map((name) => {
    const body = name + ' supports export.'
    const page = { ...f.page, candidatePageId: createCandidatePageId(), url: f.page.url + '/' + name }
    const snapshot = { schemaVersion: 1, status: 'available', observedAt: page.discoveredAt, candidatePageId: page.candidatePageId,
      sourceSnapshotId: createSourceSnapshotId(), contentHash: name, contentRef: name } as const
    return () => readReviewedProductPage(page, snapshot, body, plan, pageSummaryModel(f.ctx, f.session,
      { provider: 'fixture', model: 'fixture', maxTokens: 100000 }, plan.planId, page.candidatePageId, name, f.session.snapshotEvents(), async () => {}))
  })
  const running = pages.map(run => run())
  const settled = Promise.allSettled(running)
  try {
    await vi.waitFor(() => expect(activeReviews).toBe(3))
    releaseOthers.resolve(undefined)
    await Promise.all(running.slice(1))
  } finally {
    releaseOthers.resolve(undefined)
    releaseFirst.resolve(undefined)
    await settled
  }
  const notes = await Promise.all(running)
  expect(notes.map(note => note.paragraphs)).toEqual([['First supports export.'], ['Second supports export.'], ['Third supports export.']])
  expect(await Promise.all(pages.map(run => run()))).toEqual(notes)
  expect(f.adapter.calls).toHaveLength(6)
  const events = f.session.snapshotEvents()
  const results = events.filter(event => event.type === 'product/page-summary-result-v1')
  expect(results).toHaveLength(6)
  for (const result of results) {
    expect(events.find(request => request.seq === result.data.requestSeq)).toMatchObject({ type: 'product/page-summary-request-v1',
      data: { candidatePageId: result.data.candidatePageId, phase: result.data.phase, maxTokens: expect.any(Number) } })
  }
  expect(results.filter(r => r.data.phase === 'review').at(-1)?.data.candidatePageId).toBe(notes[0]?.candidatePageId)
  expect(results.map(r => r.data.phase + '/' + r.data.status).join(' ')).toMatchInlineSnapshot(
    '"reading/completed reading/completed reading/completed review/completed review/completed review/completed"')
})

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
