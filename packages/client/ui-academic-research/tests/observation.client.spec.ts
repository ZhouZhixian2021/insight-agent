import { ConversationEventRegistry } from '@deepseek-ai/dsh-client-ui-conversation/client'
/** The UI callback uses Gateway generations while the server retains task ownership. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, onTestFinished, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { RemoteStream, RemoteStreamCarrierError } from '@deepseek-ai/dsh-api-gateway/client'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import type { ResearchEntryInjected } from '../src/client/ResearchEntry.tsx'
import { initialTask } from './background.fixture.client.ts'
import { sampleRun } from './run-sample.ts'

async function observerFixture() {
  const ctx = new Context()
  ctx.provide('uiConversation', { events: new ConversationEventRegistry(ctx) })
  const viewer = new AbortController()
  onTestFinished(async () => { viewer.abort(); await ctx.fiber.dispose() })
  await ctx.plugin(SlotRegistry).await()
  const listeners = new Set<() => void>()
  let ready: object | undefined = {}
  const connection = { generation: { getSnapshot: () => ready, subscribe: (listener: () => void) => {
    listeners.add(listener); return () => { listeners.delete(listener) }
  } } }
  const raw = vi.fn<ResearchEntryInjected['watchBackgroundRun']>()
  const start = vi.fn(), cancel = vi.fn()
  const $stream: ClientRemote['$stream'] = options => new RemoteStream(connection as never, options)
  const remote = { watchBackgroundRun: raw, startBackgroundRun: start, cancelBackgroundRun: cancel }
  ctx.provide('remote', { academicResearch: remote, session: {}, $stream } as never)
  ctx.provide('remote.academicResearch', remote as never)
  ctx.provide('remote.session', {} as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: { 'conversation.chat.node': { kind: 'keyed', scope: 'session' } } } as never, () => null)
  await ctx.plugin({ inject, apply }).await()
  const face = slots.entries('conversation.chat.node')[0]!.inject!() as Readonly<ResearchEntryInjected>
  const key = { sessionId: initialTask().sessionId, backgroundRunId: initialTask().backgroundRunId }
  const completed = { ...initialTask(), state: 'completed' as const, result: sampleRun() }
  const setReady = (value: boolean) => { ready = value ? {} : undefined; for (const listener of listeners) listener() }
  return { face, key, completed, raw, start, cancel, viewer, listeners, setReady }
}

it('reopens the same task after a carrier generation recovers and closes at its terminal view', async () => {
  const f = await observerFixture()
  const signals: AbortSignal[] = []
  let opened = 0, closed = 0
  f.raw.mockImplementation(async function* (_key, signal) {
    signals.push(signal)
    try {
      if (++opened === 1) {
        yield initialTask()
        f.setReady(false)
        throw new RemoteStreamCarrierError('synthetic carrier loss')
      }
      yield f.completed
    } finally { closed++ }
  })
  const stream = f.face.watchBackgroundRun(f.key, f.viewer.signal)[Symbol.asyncIterator]()
  expect((await stream.next()).value).toEqual(initialTask())
  const terminal = stream.next()
  await vi.waitFor(() => { expect(f.listeners.size).toBe(1) })
  expect(f.raw).toHaveBeenCalledTimes(1)
  f.setReady(true)
  expect((await terminal).value).toEqual(f.completed)
  expect((await stream.next()).done).toBe(true)
  expect(f.raw.mock.calls.map(([key]) => key)).toEqual([f.key, f.key])
  expect(signals.every(signal => signal.aborted)).toBe(true)
  expect(closed).toBe(2)
  expect(f.listeners.size).toBe(0)
  expect(f.start).not.toHaveBeenCalled()
  expect(f.cancel).not.toHaveBeenCalled()
})

it('viewer abort releases a generation wait without restarting or cancelling the task', async () => {
  const f = await observerFixture()
  f.raw.mockImplementation(async function* () {
    yield initialTask()
    f.setReady(false)
    throw new RemoteStreamCarrierError('synthetic carrier loss')
  })
  const stream = f.face.watchBackgroundRun(f.key, f.viewer.signal)[Symbol.asyncIterator]()
  await stream.next()
  const waiting = stream.next()
  await vi.waitFor(() => { expect(f.listeners.size).toBe(1) })
  f.viewer.abort()
  expect((await waiting).done).toBe(true)
  expect(f.listeners.size).toBe(0)
  f.setReady(true)
  expect(f.raw).toHaveBeenCalledTimes(1)
  expect(f.start).not.toHaveBeenCalled()
  expect(f.cancel).not.toHaveBeenCalled()
})

it('a business failure remains terminal for the observation instead of reopening automatically', async () => {
  const f = await observerFixture()
  const failure = new RemoteError('gateway/bad-request', 'synthetic denial', {})
  f.raw.mockImplementation(async function* () { throw failure })
  const stream = f.face.watchBackgroundRun(f.key, f.viewer.signal)[Symbol.asyncIterator]()
  await expect(stream.next()).rejects.toBe(failure)
  f.setReady(false); f.setReady(true)
  expect(f.raw).toHaveBeenCalledTimes(1)
  expect(f.listeners.size).toBe(0)
  expect(f.cancel).not.toHaveBeenCalled()
})

it('a normal end before settlement requires an explicit new observation', async () => {
  const f = await observerFixture()
  f.raw.mockImplementation(async function* () { yield initialTask() })
  const stream = f.face.watchBackgroundRun(f.key, f.viewer.signal)[Symbol.asyncIterator]()
  expect((await stream.next()).value).toHaveProperty('state', 'running')
  await expect(stream.next()).rejects.toMatchObject({ code: 'gateway/internal' })
  expect(f.raw).toHaveBeenCalledTimes(1)
  expect(f.start).not.toHaveBeenCalled()
  expect(f.cancel).not.toHaveBeenCalled()
})
