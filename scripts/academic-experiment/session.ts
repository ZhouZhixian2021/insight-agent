/** Read the append-only Session container without loading all decoded events at once. */
import { readFileSync } from 'node:fs'
import { createZstdFrameDecoder, scanZstdFrames } from '../../packages/session/session-persistence-jsonl/src/zstd.ts'
import { objectJson } from './files.ts'

/** Minimal durable envelope; the owning academic parsers validate selected payloads. */
export interface RecordedEvent {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: Record<string, unknown>
}

/** Iterate a completed, unmodified Session generation; a torn tail is rejected.
 * @param file Exact Session JSONL or concatenated Zstandard file.
 * @returns Parsed event envelopes, skipping the generation header.
 */
export function* sessionEvents(file: string): Generator<RecordedEvent> {
  const bytes = readFileSync(file)
  function* lines(text: string): Generator<RecordedEvent> {
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue
      const value = objectJson(line)
      if (value.type === 'session') continue
      if (typeof value.type !== 'string' || !Number.isSafeInteger(value.seq) || typeof value.time !== 'number'
        || value.data === null || typeof value.data !== 'object' || Array.isArray(value.data)) throw new Error('Invalid Session event envelope.')
      yield value as unknown as RecordedEvent
    }
  }
  if (!file.endsWith('.zstd')) { yield* lines(bytes.toString('utf8')); return }
  const scan = scanZstdFrames(bytes)
  if (scan.tornStart !== undefined) throw new Error('Session has an incomplete tail; stop the run and export a complete generation.')
  const decoder = createZstdFrameDecoder()
  try { for (const frame of decoder.decode(bytes, scan.frames)) yield* lines(frame.toString('utf8')) } finally { decoder.close() }
}

/** Extract visible response text without copying reasoning streams or transport metadata.
 * @param stream Persisted model stream.
 * @returns Concatenated text output.
 */
export function responseText(stream: unknown): string {
  if (!Array.isArray(stream)) throw new Error('Missing recorded response stream.')
  let text = ''
  for (const raw of stream) {
    const item = raw as Record<string, unknown>
    if (item.type === 'text-chunks' && Array.isArray(item.texts)) text += item.texts.join('')
    else if (item.type === 'chunk' && item.chunk !== null && typeof item.chunk === 'object') {
      const chunk = item.chunk as Record<string, unknown>
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    }
  }
  return text
}

/** Keep model identity and generation settings, excluding credentials, endpoints and headers.
 * @param config Persisted call configuration.
 * @returns Safe generation configuration.
 */
export function modelConfig(config: unknown): Record<string, unknown> {
  if (config === null || typeof config !== 'object') return {}
  const keys = new Set(['provider', 'model', 'maxTokens', 'temperature', 'topP', 'seed', 'reasoningEffort'])
  return Object.fromEntries(Object.entries(config).filter(([key]) => keys.has(key)))
}
