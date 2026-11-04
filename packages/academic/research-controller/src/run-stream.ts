/** Single-consumer queue for one bounded Academic research Remote stream. */
import type { AcademicResearchRunFrame } from './types.ts'

/** Bridges synchronous workflow progress notifications to an async Remote stream. */
export class AcademicResearchRunQueue {
  private readonly frames: AcademicResearchRunFrame[] = []
  private offset = 0
  private waiting: (() => void) | undefined
  private closed = false
  private failed = false
  private failure: unknown

  /**
   * Append one ordered frame while the stream is open.
   * @param frame - complete progress snapshot or the sole terminal result.
   */
  push(frame: AcademicResearchRunFrame): void {
    if (this.closed) return
    this.frames.push(frame)
    this.wake()
  }

  /** Close after all already queued frames have been consumed. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.wake()
  }

  /**
   * Close with the workflow failure that the Remote carrier must expose.
   * @param cause - terminal workflow or admission failure.
   */
  fail(cause: unknown): void {
    if (this.closed) return
    this.failed = true
    this.failure = cause
    this.closed = true
    this.wake()
  }

  /**
   * Consume frames once until completion, failure, or caller cancellation.
   * @param signal - lifetime of the owning Remote stream.
   * @returns ordered progress frames followed by at most one result frame.
   */
  async *read(signal: AbortSignal): AsyncIterable<AcademicResearchRunFrame> {
    const abort = (): void => { this.wake() }
    signal.addEventListener('abort', abort, { once: true })
    try {
      while (!signal.aborted) {
        const frame = this.frames[this.offset]
        if (frame !== undefined) {
          this.offset += 1
          yield frame
          continue
        }
        if (this.closed) {
          if (this.failed) throw this.failure
          return
        }
        await new Promise<void>((resolve) => { this.waiting = resolve })
        this.waiting = undefined
      }
    } finally {
      signal.removeEventListener('abort', abort)
      this.close()
    }
  }

  private wake(): void {
    const waiting = this.waiting
    this.waiting = undefined
    waiting?.()
  }
}
