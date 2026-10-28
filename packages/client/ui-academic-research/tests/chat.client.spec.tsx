// @vitest-environment jsdom
import { StrictMode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { ConversationNodeAssembler } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionLiveEventEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import { processGroupDefinition } from '../../ui-chat/src/client/conversation-nodes/process-groups.ts'
import { chatViewDefinition } from '../../ui-chat/src/client/conversation-nodes/chat-snapshot-builder.ts'
import { academicChatDefinition } from '../src/client/chat-definition.ts'
import { ResearchForm, type ResearchEntryInjected } from '../src/client/ResearchEntry.tsx'
import { AcademicChatCard } from '../src/client/AcademicChatCard.tsx'
import { zh, type RunKey } from '../src/client/run-locales.ts'
import { initialTask } from './background.fixture.client.ts'
import { sampleRun } from './run-sample.ts'
import type { AcademicBackgroundRunView, AcademicResearchRunRequest } from '@deepseek-ai/dsh-api-academic-research-controller/types'

afterEach(cleanup)
const markdown = '# 本轮研究\n\n```academic-research-brief-json\n{}\n```'
it('keeps approved native and PTC research cards in their own turns and hides rejected or ordinary plans', () => {
  const assembler = new ConversationNodeAssembler({ entries: () => [academicChatDefinition], fallbackEntry: () => undefined },
    { entries: () => [chatViewDefinition] },
    { entries: () => [processGroupDefinition], forTarget: () => processGroupDefinition })
  const events = [
    { type: 'turn/start', data: { turn: 1 } }, { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'tool/call', data: { turn: 1, step: 1, name: 'exit_plan_mode', callId: 'first', arguments: JSON.stringify({ plan: markdown }) } },
    { type: 'tool/result', data: { message: { toolCallId: 'first', isError: false }, meta: { approved: true } } },
    { type: 'academic/background-run-state', data: { ...initialTask(), researchBriefId: `${initialTask().sessionId}:approved-plan:first`, backgroundRunId: 'saved:first' } },
    { type: 'turn/end', data: { turn: 1 } }, { type: 'turn/start', data: { turn: 2 } },
    { type: 'step/start', data: { turn: 2, step: 1 } },
    { type: 'tool/ptc-dispatch', data: { rootCallId: 'root', parentCallId: 'root', subCallId: 'second', name: 'exit_plan_mode',
      arguments: { plan: markdown }, isError: false, meta: { approved: true } } },
    { type: 'tool/call', data: { turn: 2, step: 1, name: 'exit_plan_mode', callId: 'rejected', arguments: JSON.stringify({ plan: markdown }) } },
    { type: 'tool/result', data: { message: { toolCallId: 'rejected', isError: false }, meta: { approved: false } } },
    { type: 'tool/call', data: { turn: 2, step: 1, name: 'exit_plan_mode', callId: 'ordinary', arguments: JSON.stringify({ plan: '# Ordinary' }) } },
  ]
  const entries = events.map((event, seq) => ({ type: 'event', event: { ...event, seq: seq + 1, time: seq } })) as SessionLiveEventEntry[]
  assembler.replaceWindow(entries, false); assembler.activateTarget('chat')
  const snapshot = assembler.snapshot('chat') as ChatSnapshot
  const cards = snapshot.nodes.values().filter(node => node.visibility === 'visible')
  expect(cards.map(node => node.id)).toEqual(['first', 'second'])
  const root = assembler.grouped('chat')!.entries
  for (const card of cards) {
    expect(card.groupTree).toBe('turn')
    expect(root.some(entry => entry.kind === 'node' && entry.key === card.key)).toBe(true)
  }
  expect(cards.map(node => node.location.kind === 'step' || node.location.kind === 'turn' ? node.location.turn.turn : null)).toEqual([1, 2])
  expect(cards[0]?.data).toMatchObject({ backgroundRunId: 'saved:first' })
  const restored = new ConversationNodeAssembler({ entries: () => [academicChatDefinition], fallbackEntry: () => undefined },
    { entries: () => [chatViewDefinition] })
  restored.replaceWindow(entries.filter(entry => entry.type === 'event' && entry.event.type === 'academic/background-run-state'), true)
  restored.activateTarget('chat')
  expect((restored.snapshot('chat') as ChatSnapshot).nodes.values()[0]?.location.kind).toBe('session')
  expect((restored.snapshot('chat') as ChatSnapshot).nodes.values()[0]?.data).toMatchObject({ callId: 'first', approved: true, backgroundRunId: 'saved:first' })
  assembler.replaceWindow(entries, true)
  expect((assembler.snapshot('chat') as ChatSnapshot).nodes.values().filter(node => node.visibility === 'visible')).toHaveLength(2)
})

it('starts two approved researches once each, preserves both reports, and remounts without rerunning', async () => {
  const sid = initialTask().sessionId
  const first = `${sid}:approved-plan:first` as AcademicResearchRunRequest['researchBriefId']
  const second = `${sid}:approved-plan:second` as typeof first
  let latest = first
  let busy = true
  const saved = new Map<string, AcademicBackgroundRunView>()
  const start = vi.fn<ResearchEntryInjected['startBackgroundRun']>(async (request) => {
    const value = sampleRun()
    const runId = `${value.retrievalRun.retrievalRunId}:${saved.size}` as typeof value.retrievalRun.retrievalRunId
    const task = { ...initialTask(), researchBriefId: request.researchBriefId, backgroundRunId: `background:${saved.size}`,
      state: 'completed' as const, retrievalRunId: runId,
      result: { ...value, retrievalRun: { ...value.retrievalRun, researchBriefId: request.researchBriefId, retrievalRunId: runId } } }
    saved.set(task.backgroundRunId, task); return task
  })
  const cancel = vi.fn()
  const remote: ResearchEntryInjected = {
    plan: async () => ({ researchBriefId: latest, topic: latest === first ? '第一轮' : '第二轮', questions: [], searches: [] }),
    startBackgroundRun: start, listBackgroundRuns: async () => [...saved.values()].slice(-1),
    getBackgroundRun: async key => saved.get(key.backgroundRunId)!,
    watchBackgroundRun: async function* () { throw new Error('Completed tasks must not be watched') },
    cancelBackgroundRun: cancel, traceList: vi.fn(), traceDetail: vi.fn(), enhanceEvidence: vi.fn(), enhancementHistory: async () => null,
  }
  const t = ((key: RunKey) => zh[key]) as Parameters<typeof ResearchForm>[0]['t']
  const form = (id: typeof first) => <AcademicChatCard key={id} sessionId={sid} useSession={select => select({ running: busy } as never)} useChat={select => select({ timeline: { turns: new Map([[1, { end: busy ? undefined : { data: { reason: { kind: 'completed' } } } }]]) } } as never)} node={{ id, location: { kind: 'step', turn: { turn: 1 } }, data: { callId: id === first ? 'first' : 'second', title: id === first ? '第一轮' : '第二轮', approved: true, backgroundRunId: [...saved.values()].find(task => task.researchBriefId === id)?.backgroundRunId } } as never} {...remote} t={t} />
  const ui = render(<StrictMode>{form(first)}</StrictMode>)
  await screen.findByText(zh.chatWaiting)
  expect(start).not.toHaveBeenCalled()
  busy = false
  ui.rerender(<StrictMode>{form(first)}</StrictMode>)
  await screen.findByRole('button', { name: zh.download })
  expect(start).toHaveBeenCalledTimes(1)
  latest = second
  ui.rerender(<StrictMode>{form(first)}{form(second)}</StrictMode>)
  await waitFor(() => { expect(screen.getAllByRole('button', { name: zh.download })).toHaveLength(2) })
  expect(start.mock.calls.map(([request]) => request.researchBriefId)).toEqual([first, second])
  const cards = [...ui.container.querySelectorAll('[data-academic-chat]')].map(card => ({
    title: card.querySelector('h3')?.textContent,
    downloads: [...card.querySelectorAll('button')].filter(button => button.textContent === zh.download).length,
    hasDialog: card.querySelector('[role=dialog]') !== null,
  }))
  await expect(JSON.stringify(cards, null, 2) + '\n').toMatchFileSnapshot('./expected/chat-research-cards.json')
  ui.unmount()
  render(<StrictMode>{form(first)}{form(second)}</StrictMode>)
  await waitFor(() => { expect(screen.getAllByRole('button', { name: zh.download })).toHaveLength(2) })
  expect(start).toHaveBeenCalledTimes(2)
  expect(cancel).not.toHaveBeenCalled()
})

it('keeps an approved but aborted turn available for explicit action without automatic admission', async () => {
  const task = initialTask(), start = vi.fn()
  render(<AcademicChatCard sessionId={task.sessionId} node={{ id: 'aborted', location: { kind: 'turn', turn: { turn: 1 } },
    data: { callId: 'aborted', title: '已中断', approved: true } } as never}
  useSession={select => select({ running: false } as never)}
  useChat={select => select({ timeline: { turns: new Map([[1, { end: { data: { reason: { kind: 'aborted' } } } }]]) } } as never)}
  plan={async () => ({ researchBriefId: `${task.sessionId}:approved-plan:aborted` as typeof task.researchBriefId,
    topic: '已中断', questions: [], searches: [] })} listBackgroundRuns={async () => []} startBackgroundRun={start}
  getBackgroundRun={vi.fn()} watchBackgroundRun={vi.fn()} cancelBackgroundRun={vi.fn()} enhanceEvidence={vi.fn()}
  enhancementHistory={vi.fn()} traceList={vi.fn()} traceDetail={vi.fn()}
  t={((key: RunKey) => zh[key]) as Parameters<typeof ResearchForm>[0]['t']} />)
  const button = await screen.findByRole<HTMLButtonElement>('button', { name: zh.start })
  await waitFor(() => { expect(button.disabled).toBe(false) })
  expect(start).not.toHaveBeenCalled()
})
