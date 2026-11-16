/** Request-local, content-free facts retained before pi-ai flattens HTTP errors. */
export interface TransportDiagnostic {
  readonly phase: 'request' | 'response-stream' | 'unknown'
  readonly errorName?: string
  readonly errorCode?: string
  readonly causeCodes: readonly string[]
  readonly status?: number
  readonly requestId?: string
  readonly elapsedMs: number
}

const SAFE_CODE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const SAFE_REQUEST_ID = /^[A-Za-z0-9_.:-]{1,128}$/

function safeCode(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_CODE.test(value) ? value : undefined
}

function errorFacts(error: unknown): Pick<TransportDiagnostic, 'errorName' | 'errorCode' | 'causeCodes'> {
  const seen = new Set<object>()
  const codes: string[] = []
  let current: unknown = error
  let name: string | undefined
  let code: string | undefined
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null && !seen.has(current); depth++) {
    seen.add(current)
    const value = current as { name?: unknown; code?: unknown; cause?: unknown }
    if (depth === 0) {
      name = safeCode(value.name)
      code = safeCode(value.code)
    } else {
      const causeCode = safeCode(value.code)
      if (causeCode !== undefined) codes.push(causeCode)
    }
    current = value.cause
  }
  return {
    ...name === undefined ? {} : { errorName: name },
    ...code === undefined ? {} : { errorCode: code },
    causeCodes: codes,
  }
}

/** Captures HTTP request and response-stream failures without retaining URLs, headers or payloads. */
export class TransportCapture {
  private readonly startedAt = Date.now()
  private phase: TransportDiagnostic['phase'] = 'unknown'
  private error: unknown
  private status: number | undefined
  private requestId: string | undefined

  /** Fetch implementation scoped to one model call. */
  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    let response: Response
    try {
      response = await globalThis.fetch(input, init)
    } catch (error: unknown) {
      this.record('request', error)
      throw error
    }
    this.status = response.status
    const id = response.headers.get('x-request-id') ?? response.headers.get('request-id')
    if (id !== null && SAFE_REQUEST_ID.test(id)) this.requestId = id
    if (response.body === null || !response.ok
      || !response.headers.get('content-type')?.includes('text/event-stream')) return response

    const reader = response.body.getReader()
    const monitored = new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        try {
          const result = await reader.read()
          if (result.done) controller.close()
          else controller.enqueue(result.value)
        } catch (error: unknown) {
          this.record('response-stream', error)
          controller.error(error)
        }
      },
      cancel: reason => reader.cancel(reason),
    })
    return new Response(monitored, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }

  private record(phase: TransportDiagnostic['phase'], error: unknown): void {
    this.phase = phase
    this.error = error
  }

  /**
   * Produce only bounded diagnostic metadata for a failed call.
   * @returns Content-free transport facts captured for this call.
   */
  snapshot(): TransportDiagnostic {
    return {
      phase: this.phase,
      ...errorFacts(this.error),
      ...this.status === undefined ? {} : { status: this.status },
      ...this.requestId === undefined ? {} : { requestId: this.requestId },
      elapsedMs: Date.now() - this.startedAt,
    }
  }
}
