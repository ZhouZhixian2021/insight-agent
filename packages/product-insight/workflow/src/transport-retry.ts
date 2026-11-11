/** Bounded retry for complete, independently logged product model requests. */
import { setTimeout as delay } from 'node:timers/promises'

export interface ProductTransportRetryOptions {
  readonly maximumAttempts?: number
  readonly maximumElapsedMs?: number
  readonly initialDelayMs?: number
  readonly maximumDelayMs?: number
  readonly random?: () => number
  /** Optional caller-owned operation budget; returning false ends retries. */
  readonly onRetry?: () => boolean
}

/** Retry only caller-classified transport failures within one total time budget. */
export async function retryProductTransport<T>(operation: (signal: AbortSignal) => Promise<T>,
  retryable: (error: unknown) => boolean, signal?: AbortSignal,
  options: ProductTransportRetryOptions = {}): Promise<T> {
  const maximumAttempts = options.maximumAttempts ?? 5
  const maximumElapsedMs = options.maximumElapsedMs ?? 120_000
  const initialDelayMs = options.initialDelayMs ?? 500
  const maximumDelayMs = options.maximumDelayMs ?? 8_000
  const random = options.random ?? Math.random
  if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1
    || !Number.isFinite(maximumElapsedMs) || maximumElapsedMs <= 0
    || !Number.isFinite(initialDelayMs) || initialDelayMs < 0
    || !Number.isFinite(maximumDelayMs) || maximumDelayMs < initialDelayMs) {
    throw new RangeError('Invalid product transport retry limits')
  }
  const deadline = AbortSignal.timeout(maximumElapsedMs)
  const active = signal === undefined ? deadline : AbortSignal.any([signal, deadline])
  for (let attempt = 1; ; attempt++) {
    active.throwIfAborted()
    try { return await operation(active) }
    catch (error) {
      if (active.aborted || attempt >= maximumAttempts || !retryable(error)
        || options.onRetry?.() === false) throw error
      const backoff = Math.min(initialDelayMs * 2 ** (attempt - 1), maximumDelayMs)
      const jitter = 0.8 + 0.4 * Math.min(1, Math.max(0, random()))
      await delay(Math.ceil(backoff * jitter), undefined, { signal: active })
    }
  }
}
