/** Academic attribution remains readable without producer-specific replay logic. */
import { describe, expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, SessionLogOffset, SessionSeq, SESSION_FORMAT_VERSION,
  type SessionEvent } from '@deepseek-ai/dsh-session'

const id = SessionId('academic-compatibility')
const header = { version: SESSION_FORMAT_VERSION, id, createdAt: 1, isSeeded: false } as const

describe('academic Session reader compatibility', () => {
  it.each(['user', 'academic-workflow', 'academic-research-controller', 'future-academic'])(
    'preserves %s attribution and message content without producer interpretation', (kind) => {
      const data = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Recorded research input' }] })
      const event = JSON.parse(JSON.stringify({
        type: 'user/message', seq: SessionSeq(0), time: 1, surfaceOp: 'append',
        data: { ...data, source: { kind, metadata: { retained: true } } },
      })) as SessionEvent
      const restored = Session.fromRestore(id, [event], header, SessionLogOffset(0), 'detached')
      expect(restored.snapshotEvents()[0]).toEqual(event)
      expect(restored.deriveMessages()).toMatchObject([{
        role: 'user', content: data.content, source: { kind, metadata: { retained: true } },
      }])
    },
  )
})
