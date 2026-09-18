/** Session-bound Academic Remote request form and result viewer. */
import { useEffect, useId, useRef, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AcademicResearchRunRequest, AcademicResearchRunValue } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import { RunPanel } from './RunPanel.tsx'
import type { RunView } from './run-types.ts'
import css from './RunPanel.module.css'

/** Transport callback supplied by the plugin's Remote injection. */
export interface ResearchEntryInjected {
  run: (request: AcademicResearchRunRequest, signal: AbortSignal) => Promise<AcademicResearchRunValue>
}
/** Framework Session selection, locale and Remote callback. */
export type ResearchEntryProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'academicRun'> & ResearchEntryInjected

/**
 * Open research for the currently selected persisted Session.
 * @param props Framework selectors, localized copy and request callback.
 * @returns The sidebar trigger and Session-keyed request dialog.
 */
export function ResearchEntry({ t, useSessions, run }: ResearchEntryProps) {
  const [open, setOpen] = useState(false)
  const sessionId = useSessions(s => s.current !== undefined && s.byId[s.current]?.blank === false ? s.current : undefined)
  return <>
    <button className={css.entry} type="button" title={t('entry')} onClick={() => { setOpen(true) }}>{t('entry')}</button>
    <Modal open={open} onClose={() => { setOpen(false) }} title={t('title')} closeLabel={t('close')}
      description={t('disclosure')} className={css.dialog} contentClassName={css.body}>
      {open && (sessionId === undefined ? <p role="status">{t('noSession')}</p>
        : <ResearchForm key={sessionId} sessionId={sessionId} run={run} t={t} />)}
    </Modal>
  </>
}

function ResearchForm({ sessionId, run, t }: ResearchEntryInjected & PropsLocale<'academicRun'> & Pick<AcademicResearchRunRequest, 'sessionId'>) {
  const queryHelpId = useId()
  const [query, setQuery] = useState('')
  const [view, setView] = useState<RunView | null>(null)
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => {
    const operation = active.current
    active.current = null
    operation?.abort()
  }, [])
  const start = async () => {
    if (active.current !== null || query.trim() === '') return
    const operation = new AbortController()
    active.current = operation
    setView({ phase: 'running' })
    try {
      const value = await run({ sessionId, query: query.trim(), synthetic: false }, operation.signal)
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
    <form className={css.controls} onSubmit={(event) => { event.preventDefault(); void start() }}>
      <label>{t('query')}<textarea rows={4} aria-describedby={queryHelpId} required value={query} disabled={view?.phase === 'running'} onChange={(event) => { setQuery(event.target.value) }} /></label>
      <p id={queryHelpId} className={css.notice}>{t('queryHelp')}</p>
      <button type="submit" disabled={query.trim() === '' || view?.phase === 'running'}>{t('start')}</button>
    </form>
    {view !== null && <RunPanel view={view} t={t} onCancel={() => {
      active.current?.abort()
      setView({ phase: 'running', cancelling: true })
    }} />}
  </>
}
