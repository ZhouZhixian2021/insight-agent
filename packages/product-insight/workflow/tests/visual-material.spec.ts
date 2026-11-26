import { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { createCandidatePageId, createProductId, createProductPlanId, type CandidatePage } from '@deepseek-ai/dsh-product-insight-model'
import { fetchProductImage, type ProductPageImage } from '@deepseek-ai/dsh-product-insight-source'
import SessionStore from '@deepseek-ai/dsh-session'
import { afterEach, expect, it, vi } from 'vitest'
import { collectProductImages, openProductImageReader } from '../src/visual-material.ts'
import { ProductWorkQueue, reviewCapturedPages } from '../src/page-pipeline.ts'

vi.mock('@deepseek-ai/dsh-product-insight-source', async importOriginal => ({
  ...await importOriginal<typeof import('@deepseek-ai/dsh-product-insight-source')>(), fetchProductImage: vi.fn(),
}))

const plan = { planId: createProductPlanId(), scope: 'Compare performance' }
const model = { provider: 'test', model: 'deepseek-v4.1-flash' }
const image = (id: string, caption = id): ProductPageImage => ({
  pageUrl: 'https://example.test/pages/' + id, imageUrl: 'https://example.test/' + id, caption, context: 'Same test',
})
const roots: Context[] = []
afterEach(async () => { vi.resetAllMocks(); for (const ctx of roots.splice(0)) await ctx.fiber.dispose() })

async function fixture(stream: (source: ProductPageImage, signal?: AbortSignal) => Promise<string[]>) {
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(SessionStore)
  const session = ctx.sessions.create()
  ctx.provide('attachments', { saveImage: async () => ({ attachmentId: 'test-image' }) } as never)
  ctx.provide('llm', { prepareCall: async () => ({ config: model, inputModalities: ['image'],
    async * stream(request: GenerateOptions): AsyncIterable<StreamChunk> {
      const part = request.messages[0]?.content[0]
      if (part?.type !== 'text') throw new Error('Missing image source')
      const source = JSON.parse(part.text) as ProductPageImage
      const facts = await stream(source, request.signal)
      yield { type: 'text-delta', index: 0, text: JSON.stringify({ summary: source.caption, facts }) }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }) } as never)
  const persist = vi.fn(async () => {})
  const run = (images: ProductPageImage[], signal?: AbortSignal) => collectProductImages(ctx, session, model, plan,
    images, session.snapshotEvents(), persist, () => {}, signal)
  return { run, persist, session, ctx }
}

it('lends six model slots in either direction, reclaims them as work finishes and commits in candidate order', async () => {
  const urls = Array.from({ length: 9 }, (_, i) => 'https://example.test/page' + String(i))
  const photos = Array.from({ length: 8 }, (_, i) => 'photo' + String(i + 1))
  const productId = createProductId(), date = '2026-11-24T00:00:00Z'
  const candidates: CandidatePage[] = urls.map(url => ({ schemaVersion: 1, planId: plan.planId, productId,
    candidatePageId: createCandidatePageId(), url, sourceType: 'other', discoveredAt: date, questionIds: [],
    screening: { status: 'selected', reason: 'research', screenedAt: date } }))
  const fetches = urls.map(() => Promise.withResolvers<undefined>())
  const saved = new Set<string>(), active = new Set<string>(), releases = new Map<string, () => void>()
  let peak = 0, releasing = false
  const hold = async (name: string) => {
    active.add(name)
    peak = Math.max(peak, active.size)
    if (!releasing) await new Promise<void>(resolve => releases.set(name, resolve))
    active.delete(name)
  }
  const expectActive = async (texts: number, images: number) => vi.waitFor(() => {
    expect([...active].filter(id => urls.includes(id))).toHaveLength(texts)
    expect(active.size).toBe(texts + images)
  })
  const allowDownloads = Promise.withResolvers<undefined>()
  vi.mocked(fetchProductImage).mockImplementation(async (url) => {
    await allowDownloads.promise
    return { mediaType: 'image/png', data: Buffer.from(url) }
  })
  const f = await fixture(async (source) => { await hold(source.caption); return [source.caption] })
  const committed: string[] = []
  let captured = false
  const run = reviewCapturedPages({ candidates, maximumCharacters: Number.MAX_SAFE_INTEGER,
    adapters: { now: () => date, web: { fetch: async ({ url }) => {
      const index = urls.indexOf(url)
      await fetches[index]!.promise
      const pictures = (index === 0 ? ['slow-image'] : index === 1 ? photos : [])
        .map(id => '<figure><img src="/' + id + '.png"><figcaption>' + id + '</figcaption></figure>').join('')
      return { url, statusCode: 200, truncated: false, body: { kind: 'html', content: '<article><p>Article</p>' + pictures + '</article>' } }
    } }, saveText: async (page) => { saved.add(page.url); return page.url }, readText: async () => { throw Error('capture already in memory') },
    openImageReader: (signal, schedule, capacity) =>
      openProductImageReader(f.ctx, f.session, model, plan, [], f.persist, () => {}, signal, schedule, capacity),
    },
    summarize: async (page, snapshot) => {
      expect(saved.has(page.url)).toBe(true)
      await hold(page.url)
      return { sourceSnapshotId: snapshot.sourceSnapshotId, candidatePageId: page.candidatePageId,
        contentHash: snapshot.contentHash, paragraphs: [page.url] }
    },
    onCaptured: async () => { captured = true },
    onSettled: async (_next, outcome) => { if (outcome && 'summary' in outcome) committed.push(...outcome.summary.paragraphs) },
  })
  try {
    fetches[1]!.resolve(undefined)
    await vi.waitFor(() => { expect(fetchProductImage).toHaveBeenCalledTimes(3) })
    allowDownloads.resolve(undefined)
    await expectActive(1, 5)
    expect(captured).toBe(false)
    releases.get(urls[1]!)!()
    await expectActive(0, 6)
    for (const gate of fetches.slice(2)) gate.resolve(undefined)
    await vi.waitFor(() => { expect(saved.size).toBe(8) })
    await expectActive(0, 6)
    for (const name of photos.slice(0, 3)) releases.get(name)!()
    await expectActive(3, 3)
    const finishedText = [...active].find(id => urls.includes(id))!
    releases.get(finishedText)!()
    await vi.waitFor(() => { expect(active.has(finishedText)).toBe(false) })
    await expectActive(3, 3)
    for (const name of photos.slice(3, 5)) releases.get(name)!()
    await vi.waitFor(() => { expect(active.has(photos[7]!)).toBe(true) })
    await expectActive(3, 3)
    for (const name of photos.slice(5, 7)) releases.get(name)!()
    await expectActive(5, 1)
    releases.get(photos[7]!)!()
    await expectActive(6, 0)
  } finally {
    releasing = true
    allowDownloads.resolve(undefined)
    for (const gate of fetches) gate.resolve(undefined)
    for (const release of releases.values()) release()
    await run
  }
  const result = await run
  expect(committed).toEqual(urls)
  expect(peak).toBe(6)
  expect(result.images.map(card => [card.id, card.caption])).toEqual(['slow-image', ...photos].map((caption, i) => ['I' + String(i + 1), caption]))
})

it('returns a borrowed slot between model requests and wakes a suspended review after an image fails', async () => {
  const queue = new ProductWorkQueue(2, new AbortController().signal)
  const reading = Promise.withResolvers<undefined>()
  const releaseImage = Promise.withResolvers<undefined>(), nextText = Promise.withResolvers<undefined>()
  const order: string[] = []
  const first = queue.run('text', async () => nextText.promise)
  const page = queue.run('text', async (beforeReview) => {
    order.push('reading')
    await reading.promise
    await beforeReview()
    order.push('review')
  })
  const imageWork = queue.run('image', async () => {
    order.push('image')
    await releaseImage.promise
    throw Error('image failed')
  })
  const failed = expect(imageWork).rejects.toThrow('image failed')
  try {
    reading.resolve(undefined)
    await vi.waitFor(() => { expect(order).toEqual(['reading', 'image']) })
    releaseImage.resolve(undefined)
    await failed
    await page
    expect(order).toEqual(['reading', 'image', 'review'])
  } finally {
    nextText.resolve(undefined)
    releaseImage.resolve(undefined)
    await Promise.allSettled([first, page, failed])
  }
})

it('refills three slots as reads finish, coalesces matching originals and retains source IDs on resume', async () => {
  const sources = [image('slow'), image('second'), image('third'), image('mirror', 'slow'), image('fourth'),
    { ...image('slow'), pageUrl: 'https://second.test/product' }, image('translation', 'translated')]
  const gates = new Map<string, () => void>()
  let active = 0, peak = 0
  const stream = vi.fn(async (source: ProductPageImage) => {
    peak = Math.max(peak, ++active)
    await new Promise<void>((resolve) => { gates.set(source.caption, resolve) })
    active--
    return source.caption === 'second' ? [] : [source.caption]
  })
  vi.mocked(fetchProductImage).mockImplementation(async url => ({
    mediaType: 'image/png', data: Buffer.from(/slow|mirror|translation/u.test(url) ? 'identical pixels' : url),
  }))
  const f = await fixture(stream)
  const running = f.run(sources)
  await vi.waitFor(() => { expect(gates.size).toBe(3) })
  gates.get('third')?.()
  // The mirror shares the slow in-flight reading without holding up the fourth distinct image.
  await vi.waitFor(() => { expect(gates.has('fourth')).toBe(true) })
  gates.get('fourth')?.()
  await vi.waitFor(() => { expect(gates.has('translated')).toBe(true) })
  for (const release of gates.values()) release()
  const result = await running
  expect(peak).toBe(3)
  expect(stream).toHaveBeenCalledTimes(5)
  expect(fetchProductImage).toHaveBeenCalledTimes(6)
  expect(result.map(card => card.id)).toEqual(['I1', 'I3', 'I4', 'I5', 'I6', 'I7'])
  expect(result[2]).toMatchObject({ ...sources[3], summary: 'slow', facts: ['slow'], dataUrl: result[0]!.dataUrl })
  expect(result[4]).toMatchObject({ ...sources[5], facts: ['slow'] })
  expect(result[5]?.facts).toEqual(['translated'])
  expect(f.session.snapshotEvents().filter(e => e.type === 'product/image-reading-v1')).toHaveLength(7)
  const resumed = await f.run([...sources, { ...image('second'), pageUrl: 'https://other.test/decorative' }])
  expect(resumed).toEqual(result)
  expect(fetchProductImage).toHaveBeenCalledTimes(7)
  expect(stream).toHaveBeenCalledTimes(5)
})

it('keeps other images when a read fails, and makes the failed reading eligible on resume', async () => {
  vi.mocked(fetchProductImage).mockImplementation(async url => ({ mediaType: 'image/png', data: Buffer.from(url) }))
  const stream = vi.fn(async (source: ProductPageImage): Promise<string[]> => [source.caption])
    .mockRejectedValueOnce(new Error('transport unavailable'))
  const f = await fixture(stream)
  const sources = [image('one'), image('two')]
  expect(await f.run(sources)).toHaveLength(1)
  expect(await f.run(sources)).toHaveLength(2)
  expect(stream).toHaveBeenCalledTimes(3)
})

it('stops starting new images on cancellation and waits for in-flight reads', async () => {
  vi.mocked(fetchProductImage).mockImplementation(async url => ({ mediaType: 'image/png', data: Buffer.from(url) }))
  const stream = vi.fn((_source: ProductPageImage, signal?: AbortSignal) =>
    new Promise<string[]>((_resolve, reject) => {
      if (!signal) throw new Error('Missing cancellation signal')
      signal.throwIfAborted()
      signal.addEventListener('abort', () => { reject(new Error('Image read aborted')) }, { once: true })
    }))
  const f = await fixture(stream)
  const controller = new AbortController()
  const running = f.run(['a', 'b', 'c', 'd'].map(id => image(id)), controller.signal)
  await vi.waitFor(() => { expect(stream).toHaveBeenCalledTimes(3) })
  controller.abort()
  expect(await running).toEqual([])
  expect(fetchProductImage).toHaveBeenCalledTimes(3)
  expect(f.persist).not.toHaveBeenCalled()
})

it('interrupts sibling reads and drains them when image persistence fails', async () => {
  const writing = Promise.withResolvers<undefined>()
  const active = new Set<string>()
  vi.mocked(fetchProductImage).mockImplementation(async url => ({ mediaType: 'image/png', data: Buffer.from(url) }))
  const f = await fixture(async (source, signal) => {
    if (source.caption === 'ready') { await writing.promise; return ['ready'] }
    active.add(source.caption)
    try {
      await new Promise<void>((_resolve, reject) => {
        signal!.throwIfAborted()
        signal!.addEventListener('abort', () => { reject(new Error('Image read aborted')) }, { once: true })
      })
    } finally { active.delete(source.caption) }
    return []
  })
  f.persist.mockRejectedValueOnce(new Error('image storage unavailable'))
  const attempt = f.run(['ready','second','third'].map(id => image(id)))
  const stopped = expect(attempt).rejects.toThrow('image storage unavailable')
  try { await vi.waitFor(() => { expect(active.size).toBe(2) }) }
  finally { writing.resolve(undefined); await stopped }
  expect(active.size).toBe(0)
})
