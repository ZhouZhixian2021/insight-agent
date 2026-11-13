import { afterEach, describe, expect, it, vi } from 'vitest'
import { TransportCapture } from '../src/transport-diagnostics.ts'

afterEach(() => vi.unstubAllGlobals())

describe('TransportCapture', () => {
  it('retains bounded cause codes but no request content or exception message', async () => {
    const cause = Object.assign(new Error('secret upstream address'), { code: 'ECONNRESET' })
    const error = Object.assign(new TypeError('secret API key'), { cause })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error))
    const capture = new TransportCapture()

    await expect(capture.fetch('https://example.test/private')).rejects.toBe(error)
    expect(capture.snapshot()).toMatchObject({
      phase: 'request', errorName: 'TypeError', causeCodes: ['ECONNRESET'],
    })
    expect(JSON.stringify(capture.snapshot())).not.toMatch(/secret|example\.test/)
  })

  it('retains status and request ID when the response stream fails', async () => {
    const cause = Object.assign(new Error('private response bytes'), { code: 'UND_ERR_SOCKET' })
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([1])) },
      pull(controller) { controller.error(cause) },
    }), { headers: { 'x-request-id': 'request-123', 'content-type': 'text/event-stream' }, status: 200 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    const capture = new TransportCapture()

    const result = await capture.fetch('https://example.test/')
    await expect(result.arrayBuffer()).rejects.toBe(cause)
    expect(capture.snapshot()).toMatchObject({
      phase: 'response-stream', errorCode: 'UND_ERR_SOCKET', status: 200, requestId: 'request-123',
    })
    expect(JSON.stringify(capture.snapshot())).not.toContain('private response bytes')
  })

  it('discards unsafe provider request IDs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', {
      headers: { 'x-request-id': 'token secret value' },
    })))
    const capture = new TransportCapture()
    await (await capture.fetch('https://example.test/')).text()
    expect(capture.snapshot().requestId).toBeUndefined()
  })

  it('sends the product trace ID and records response timing and stream position without content', async () => {
    const fetched = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close() },
    }), { status: 200, headers: { 'content-type': 'text/event-stream', 'x-request-id': 'gateway-123' } }))
    vi.stubGlobal('fetch', fetched)
    const capture = new TransportCapture('client-123')
    const response = await capture.fetch('https://example.test/private', { method: 'POST', body: 'secret prompt' })
    await response.arrayBuffer()
    expect(new Headers(fetched.mock.calls[0]?.[1]?.headers).get('x-request-id')).toBe('client-123')
    expect(capture.snapshot()).toMatchObject({ status: 200, requestId: 'gateway-123', streamBytes: 3 })
    expect(capture.snapshot().responseAtMs).toBeGreaterThanOrEqual(0)
    expect(capture.snapshot().firstByteAtMs).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(capture.snapshot())).not.toMatch(/secret|example\.test/u)
  })
})
