import { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { createProductPlanId } from '@deepseek-ai/dsh-product-insight-model'
import { fetchProductImage, type ProductPageImage } from '@deepseek-ai/dsh-product-insight-source'
import SessionStore from '@deepseek-ai/dsh-session'
import { afterEach, expect, it, vi } from 'vitest'
import { collectProductImages } from '../src/visual-material.ts'

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
  return { run, persist, session }
}

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
