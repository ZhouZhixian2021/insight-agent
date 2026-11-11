import { describe, expect, it, vi } from 'vitest'
import { ProductModelRouteSelector } from '../src/model-route.ts'

describe('ProductModelRouteSelector', () => {
  it('switches only after three consecutive failures to a validated backup', async () => {
    const selector = new ProductModelRouteSelector({ provider: 'main', model: 'model-a', maxTokens: 50 }, [
      { provider: 'main', model: 'model-a' }, { provider: 'backup', model: 'model-b' },
    ])
    const validate = vi.fn(async () => {})
    expect(await selector.failed(validate)).toBeUndefined()
    expect(await selector.failed(validate)).toBeUndefined()
    expect(selector.route.provider).toBe('main')
    expect(await selector.failed(validate)).toEqual({
      from: { provider: 'main', model: 'model-a' }, to: { provider: 'backup', model: 'model-b' },
    })
    expect(selector.route).toMatchObject({ provider: 'backup', model: 'model-b', maxTokens: 50 })
    expect(validate).toHaveBeenCalledOnce()
  })

  it('resets after success and skips unavailable routes', async () => {
    const selector = new ProductModelRouteSelector({ provider: 'main', model: 'a' }, [
      { provider: 'bad', model: 'b' }, { provider: 'good', model: 'c' },
    ])
    const validate = vi.fn(async (route: { provider: string }) => {
      if (route.provider === 'bad') throw new Error('not configured')
    })
    await selector.failed(validate)
    selector.succeeded()
    await selector.failed(validate)
    await selector.failed(validate)
    expect(selector.route.provider).toBe('main')
    expect(await selector.failed(validate)).toMatchObject({ to: { provider: 'good' } })
    expect(validate).toHaveBeenCalledTimes(2)
  })

  it('keeps the primary route when no backup is configured', async () => {
    const selector = new ProductModelRouteSelector({ provider: 'main', model: 'a' }, [])
    for (let i = 0; i < 6; i++) await selector.failed(async () => {})
    expect(selector.route.provider).toBe('main')
  })
})
