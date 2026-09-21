/** Session-bound Academic Remote request form and result viewer. */
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AcademicResearchPlanView, AcademicResearchRunRequest, AcademicResearchRunValue } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import { RunPanel } from './RunPanel.tsx'
import type { RunView } from './run-types.ts'
import css from './RunPanel.module.css'

/** Transport callback supplied by the plugin's Remote injection. */
export interface ResearchEntryInjected {
  plan: (sessionId: AcademicResearchRunRequest['sessionId']) => Promise<AcademicResearchPlanView>
  run: (request: AcademicResearchRunRequest, signal: AbortSignal) => Promise<AcademicResearchRunValue>
}
/** Framework Session selection, locale and Remote callback. */
export type ResearchEntryProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'academicRun'> & ResearchEntryInjected

/**
 * Open research for the currently selected persisted Session.
 * @param props Framework selectors, localized copy and request callback.
 * @returns The sidebar trigger and Session-keyed request dialog.
 */
export function ResearchEntry({ t, useSessions, run, plan }: ResearchEntryProps) {
  const [open, setOpen] = useState(false)
  const sessionId = useSessions(s => s.current !== undefined && s.byId[s.current]?.blank === false ? s.current : undefined)
  return <>
    <button className={css.entry} type="button" title={t('entry')} onClick={() => { setOpen(true) }}>{t('entry')}</button>
    <Modal open={open} onClose={() => { setOpen(false) }} title={t('title')} closeLabel={t('close')}
      description={t('disclosure')} className={css.dialog} contentClassName={css.body}>
      {open && (sessionId === undefined ? <p role="status">{t('noSession')}</p>
        : <ResearchForm key={sessionId} sessionId={sessionId} run={run} plan={plan} t={t} />)}
    </Modal>
  </>
}

function ResearchForm({ sessionId, run, plan, t }: ResearchEntryInjected & PropsLocale<'academicRun'> & Pick<AcademicResearchRunRequest, 'sessionId'>) {
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
    try {
      const value = await run({ sessionId, researchBriefId: approved.researchBriefId, synthetic: false }, operation.signal)
      if (active.current === operation) setView({ phase: 'settled', value })
    } catch (error: unknown) {
      if (active.current === operation) setView({ phase: 'error', message: operation.signal.aborted
        ? t('cancelledRequest') : error instanceof Error ? error.message : t('requestFailed') })
    } finally {
      if (active.current === operation) active.current = null
    }
  }
  return <>
    <p>{t('session')}: {sessionId}</p><p className={css.notice}>{t('prerequisite')}</p>
    {planError !== null && <p role="alert">{planError}</p>}
    {approved === null && planError === null && <p role="status">{t('loadingPlan')}</p>}
    {approved !== null && <>
      <h3>{approved.topic}</h3>
      <ul>{approved.questions.map(question => <li key={question}>{question}</li>)}</ul>
      <h4>{t('searchDirections')}</h4>
      <ul>{approved.searches.map(search => <li key={search.query}>{search.purpose}</li>)}</ul>
      <form className={css.controls} onSubmit={(event) => { event.preventDefault(); void start() }}>
        <button type="submit" disabled={view?.phase === 'running'}>{t('start')}</button>
      </form>
    </>}
    {view !== null && <RunPanel view={view} t={t} onCancel={() => {
      active.current?.abort()
      setView({ phase: 'running', cancelling: true })
    }} />}
  </>
}
