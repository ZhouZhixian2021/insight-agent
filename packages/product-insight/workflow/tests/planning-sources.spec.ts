import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { planningSearchSources } from '../src/planning-sources.ts'

describe('planning search handoff', () => {
  it('uses only successful search results in the approved planning turn', () => {
    const call = (id: string, name = 'web_search') => ({ type: 'tool/call', data: { callId: id, name } })
    const result = (id: string, url: string, isError = false) => ({ type: 'tool/result',
      data: { message: { toolCallId: id, isError }, meta: { sources: [{ url, title: id }] } } })
    const events = [call('old'), result('old', 'https://old.test/'), { type: 'turn/start', data: { turn: 2 } },
      call('search'), result('search', 'https://example.com/release'),
      call('failed'), result('failed', 'https://failed.test/', true),
      call('other', 'web_fetch'), result('other', 'https://other.test/'),
      { type: 'tool/ptc-dispatch', data: { name: 'web_search', subCallId: 'ptc-search', isError: false,
        meta: { sources: [{ url: 'https://review.test/article' }, { title: 'missing url' }] } } },
      call('approved', 'exit_plan_mode'), call('later'), result('later', 'https://later.test/'),
    ] as SessionEvent[]
    expect(planningSearchSources(events, 'approved')).toEqual([
      { url: 'https://example.com/release', title: 'search' }, { url: 'https://review.test/article' },
    ])
    expect(planningSearchSources(events, 'absent')).toEqual([])
  })
})
