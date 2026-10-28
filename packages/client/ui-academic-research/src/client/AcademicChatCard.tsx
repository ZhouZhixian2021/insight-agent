/** Each approved plan owns an independent research viewer in the transcript. */
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AcademicResearchRunRequest } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import { ResearchForm, type ResearchEntryInjected } from './ResearchEntry.tsx'
import type {} from './chat-definition.ts'
import css from './RunPanel.module.css'

/**
 * Show and recover only this approved invocation's research; later requests keep their own cards.
 * @param props Framework Session and approved plan, localized copy and Remote operations.
 * @returns Inline progress, evidence and original report downloads without a dialog.
 */
export function AcademicChatCard({ node, sessionId, useSession, useChat, t, ...remote }:
  Pick<ChatNodeViewProps<'academic-research'>, 'node' | 'sessionId' | 'useSession' | 'useChat'>
  & PropsLocale<'academicRun'> & ResearchEntryInjected) {
  const admissionBlocked = useSession(snapshot => snapshot.running)
  const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn.turn : undefined
  const ending = useChat(snapshot => turn === undefined ? undefined : snapshot.timeline.turns.get(turn)?.end?.data.reason.kind)
  if (!node.data.approved) return null
  // The Controller assigns this identity to the explicitly approved tool invocation.
  const briefId = `${sessionId}:approved-plan:${node.data.callId}` as AcademicResearchRunRequest['researchBriefId']
  return <section className={`${css.page} ${css.chat}`} aria-label={t('chatResearch')} data-academic-chat={node.id}>
    <h3>{node.data.title || t('chatResearch')}</h3>
    <ResearchForm key={briefId} sessionId={sessionId} expectedBriefId={briefId}
      knownTaskId={node.data.backgroundRunId} admissionBlocked={admissionBlocked} autoStart={ending === 'completed'} {...remote} t={t} />
    <p className={css.notice}>{t('chatNext')}</p>
  </section>
}
