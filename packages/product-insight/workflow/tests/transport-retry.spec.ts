import { expect, it, vi } from 'vitest'
import { retryProductTransport } from '../src/transport-retry.ts'

it('backs off transient model failures and returns the complete later response', async () => {
  const transport = new Error('transport')
  const operation = vi.fn().mockRejectedValueOnce(transport).mockRejectedValueOnce(transport).mockResolvedValue('complete')
  await expect(retryProductTransport(operation, error => error === transport, undefined,
    { initialDelayMs: 1, maximumDelayMs: 2, random: () => 0.5 })).resolves.toBe('complete')
  expect(operation).toHaveBeenCalledTimes(3)
})

it('stops at the attempt bound and does not retry a semantic failure', async () => {
  const transport = new Error('transport')
  const operation = vi.fn().mockRejectedValue(transport)
  await expect(retryProductTransport(operation, () => true, undefined,
    { maximumAttempts: 3, initialDelayMs: 1, maximumDelayMs: 1 })).rejects.toBe(transport)
  expect(operation).toHaveBeenCalledTimes(3)
  const invalid = new Error('invalid evidence')
  const semantic = vi.fn().mockRejectedValue(invalid)
  await expect(retryProductTransport(semantic, () => false)).rejects.toBe(invalid)
  expect(semantic).toHaveBeenCalledOnce()
})

it('aborts one in-flight attempt when the total retry time expires', async () => {
  const operation = vi.fn((signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
    signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
  }))
  await expect(retryProductTransport(operation, () => true, undefined,
    { maximumElapsedMs: 10 })).rejects.toBeDefined()
  expect(operation).toHaveBeenCalledOnce()
})
