/** Session-bound Academic Remote request form and result viewer. */
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AcademicResearchPlanView, AcademicResearchRunRequest, AcademicResearchRunFrame, AcademicResearchProgressView } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import { RunPanel } from './RunPanel.tsx'
import { SearchPolicies } from './HybridRetrieval.tsx'
import type { RunView } from './run-types.ts'
import css from './RunPanel.module.css'
import { Q6DemoEntry } from './Q6Page.tsx'

/** Transport callback supplied by the plugin's Remote injection. */
export interface ResearchEntryInjected {
  plan: (sessionId: AcademicResearchRunRequest['sessionId']) => Promise<AcademicResearchPlanView>
  runStream: (request: AcademicResearchRunRequest, signal: AbortSignal) => AsyncIterable<AcademicResearchRunFrame>
}
/** Framework Session selection, locale and Remote callback. */
export type ResearchEntryProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'academicRun'> & ResearchEntryInjected

/**
 * Open research for the currently selected persisted Session.
 * @param props Framework selectors, localized copy and request callback.
 * @returns The sidebar trigger and Session-keyed request dialog.
 */
export function ResearchEntry({ t, useSessions, runStream, plan }: ResearchEntryProps) {
  const [open, setOpen] = useState(false)
  const sessionId = useSessions(s => s.current !== undefined && s.byId[s.current]?.blank === false ? s.current : undefined)
  return <>
    <Q6DemoEntry t={t} />
    <button className={css.entry} type="button" title={t('entry')} onClick={() => { setOpen(true) }}>{t('entry')}</button>
    <Modal open={open} onClose={() => { setOpen(false) }} title={t('title')} closeLabel={t('close')}
      description={t('disclosure')} className={css.dialog} contentClassName={css.body}>
      {open && (sessionId === undefined ? <p role="status">{t('noSession')}</p>
        : <ResearchForm key={sessionId} sessionId={sessionId} runStream={runStream} plan={plan} t={t} />)}
    </Modal>
  </>
}

function ResearchForm({ sessionId, runStream, plan, t }: ResearchEntryInjected & PropsLocale<'academicRun'> & Pick<AcademicResearchRunRequest, 'sessionId'>) {
  const [approved, setApproved] = useState<AcademicResearchPlanView | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    setApproved(null)
    setPlanError(null)
    void plan(sessionId).then((value) => { if (current) setApproved(value) }, (error: unknown) => {
      if (current) setPlanError(error instanceof Error ? error.message : t('planFailed'))
    })
    return () => { current = false }
  }, [sessionId, plan, t])
  const [view, setView] = useState<RunView | null>(null)
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => {
    const operation = active.current
    active.current = null
    operation?.abort()
  }, [])
  const start = async () => {
    if (active.current !== null || approved === null) return
    const operation = new AbortController()
    active.current = operation
    setView({ phase: 'running' })
    let progress: AcademicResearchProgressView | undefined
    let recent: AcademicResearchProgressView[] = []
    const observed = () => progress === undefined ? {} : { progress, recent }
    try {
      for await (const frame of runStream({ sessionId, researchBriefId: approved.researchBriefId, synthetic: false }, operation.signal)) {
        if (active.current !== operation) return
        if (frame.type === 'progress') {
          if (frame.progress.sessionId !== sessionId
            || (progress !== undefined && frame.progress.retrievalRunId !== progress.retrievalRunId)) {
            throw new Error(t('streamMismatch'))
          }
          if (progress !== undefined && frame.progress.sequence <= progress.sequence) continue
          progress = frame.progress
          recent = [...recent, progress].slice(-20)
          setView({ phase: 'running', cancelling: operation.signal.aborted, ...observed() })
        } else if (frame.type === 'result') {
          if (frame.value.sessionId !== sessionId || frame.retrievalRunId !== frame.value.retrievalRun.retrievalRunId
            || (progress !== undefined && frame.retrievalRunId !== progress.retrievalRunId)) throw new Error(t('streamMismatch'))
          setView({ phase: 'settled', value: frame.value, ...observed() })
          return
        }
      }
      if (active.current === operation) setView({ phase: 'error', reason: operation.signal.aborted ? 'cancelled' : 'connection',
        message: t(operation.signal.aborted ? 'cancelledRequest' : 'streamDisconnected'), ...observed() })
    } catch (error: unknown) {
      const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined
      const reason = operation.signal.aborted || code === 'gateway/cancelled' ? 'cancelled'
        : typeof code === 'string' && code !== 'gateway/internal' ? 'server' : 'connection'
      if (active.current === operation) setView({ phase: 'error', reason,
        message: reason === 'cancelled' ? t('cancelledRequest')
          : `${t(reason === 'server' ? 'serverError' : 'streamDisconnected')} ${error instanceof Error ? error.message : t('requestFailed')}`,
        ...observed() })
    } finally {
      if (active.current === operation) active.current = null
    }
  }
  return <>
    <p>{t('session')}: {sessionId}</p><p className={css.notice}>{t('prerequisite')}</p>
    {planError !== null && <p role="alert">{planError}</p>}
    {approved === null && planError === null && <p role="status">{t('loadingPlan')}</p>}
    {view !== null && <RunPanel view={view} t={t} plannedSearches={approved?.searches} onCancel={() => {
      active.current?.abort()
      setView(previous => previous?.phase === 'running' ? { ...previous, cancelling: true } : previous)
    }} />}

    {approved !== null && <>
      <h3>{approved.topic}</h3>
      <ul>{approved.questions.map(question => <li key={question}>{question}</li>)}</ul>
      <h4>{t('searchDirections')}</h4>
      <SearchPolicies searches={approved.searches} t={t} />
      <form className={css.controls} onSubmit={(event) => { event.preventDefault(); void start() }}>
        <button type="submit" disabled={view?.phase === 'running'}>{t('start')}</button>
      </form>
    </>}
  </>
}
