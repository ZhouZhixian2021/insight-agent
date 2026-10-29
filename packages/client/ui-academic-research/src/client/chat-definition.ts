/** Replayable academic plan approvals, one Chat card per tool invocation. */
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-tools/types'
import type {} from '@deepseek-ai/dsh-api-academic-research-controller/src/background-run.ts'

/** A submitted academic plan remains hidden until its own explicit approval settles. */
export interface AcademicChatPlan {
  readonly callId: string
  readonly title: string
  readonly backgroundRunId?: string
  readonly approved: boolean
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** Explicitly approved academic plan, keyed by its original invocation. */
    'academic-research': AcademicChatPlan
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function submitted(event: Parameters<ConversationNodeDefinition['match']>[0]): AcademicChatPlan | null {
  if (event.type !== 'tool/call' && event.type !== 'tool/ptc-dispatch-start' && event.type !== 'tool/ptc-dispatch') return null
  if (event.data.name !== 'exit_plan_mode') return null
  let args: unknown = event.data.arguments
  if (typeof args === 'string') {
    try { args = JSON.parse(args) }
    catch (_error) { return null /* Invalid model JSON is retained by the generic tool view. */ }
  }
  if (!record(args) || typeof args.plan !== 'string' || !args.plan.includes('```academic-research-brief-json')) return null
  const approved = event.type === 'tool/ptc-dispatch' && !event.data.isError
    && record(event.data.meta) && event.data.meta.approved === true
  return { callId: String(event.type === 'tool/call' ? event.data.callId : event.data.subCallId),
    title: /^#\s+([^\r\n]+)/mu.exec(args.plan)?.[1] ?? '', approved }
}

/** Only the tool result's explicit approval makes a research card visible. */
export const academicChatDefinition: ConversationNodeDefinition<AcademicChatPlan> = {
  kind: 'academic-research', target: 'chat',
  match: (event) => {
    if (event.type === 'academic/background-run-state') {
      const prefix = `${event.data.sessionId}:approved-plan:`
      return event.data.researchBriefId.startsWith(prefix)
        ? { id: event.data.researchBriefId.slice(prefix.length), role: 'start' } : null
    }
    const plan = submitted(event)
    if (plan !== null) return { id: plan.callId, role: 'start' }
    return event.type === 'tool/result' && record(event.data.meta) && event.data.meta.approved === true
      ? { id: String(event.data.message.toolCallId), role: 'update' } : null
  },
  start: (_context, match) => {
    if (match.event.type === 'academic/background-run-state') {
      return { callId: match.event.data.researchBriefId.slice(`${match.event.data.sessionId}:approved-plan:`.length),
        title: '', approved: true, backgroundRunId: match.event.data.backgroundRunId }
    }
    const plan = submitted(match.event)
    if (plan === null) throw new Error('Academic Chat requires a submitted academic plan')
    return plan
  },
  update: (context, match) => {
    const state = context.state
    if (match.event.type === 'academic/background-run-state') return { ...state, backgroundRunId: match.event.data.backgroundRunId }
    if (match.event.type === 'tool/result') {
      const { message, meta } = match.event.data
      return { ...state, approved: !message.isError && record(meta) && meta.approved === true }
    }
    return submitted(match.event) ?? state
  },
  buildViewNode: (context) => {
    const start = context.start ?? context.matches[0]
    if (context.state === undefined || start === undefined) return null
    return { key: context.key, kind: 'academic-research', id: context.id, target: 'chat',
      groupTree: 'turn',
      anchorSeq: (start.location.kind === 'step' || start.location.kind === 'turn' ? start.location.turn.end?.seq : undefined)
        ?? start.event.seq, location: start.event.type === 'academic/background-run-state' ? { kind: 'session' } : start.location,
      visibility: context.state.approved ? 'visible' : 'hidden', data: context.state } satisfies ChatNode<'academic-research'>
  },
}
