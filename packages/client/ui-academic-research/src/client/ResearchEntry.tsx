/** Session-owned background research; browser disposal ends observation only. */
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AcademicResearchPlanView, AcademicResearchRunRequest, AcademicBackgroundRunView,
  AcademicEvidenceEnhancementRequest, AcademicEvidenceEnhancementView, AcademicBackgroundRunKey, AcademicBackgroundRunCancelRequest, AcademicBackgroundRunSummary } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import { RunPanel } from './RunPanel.tsx'
import { SearchPolicies } from './HybridRetrieval.tsx'
import type { RunView } from './run-types.ts'
import css from './RunPanel.module.css'
import { Q6DemoEntry } from './Q6Page.tsx'
import { EnhancementPanel } from './EnhancementPanel.tsx'
import type { EnhancementHistory, EnhancementKey } from './enhancement-history.ts'
import { backgroundView } from './background-view.ts'

/** Remote callbacks; watching and cancelling have independent lifetimes. */
export interface ResearchEntryInjected {
  enhanceEvidence: (request: AcademicEvidenceEnhancementRequest, signal: AbortSignal) => Promise<AcademicEvidenceEnhancementView>
  enhancementHistory: (key: EnhancementKey, signal: AbortSignal) => Promise<EnhancementHistory | null>
  plan: (sessionId: AcademicResearchRunRequest['sessionId']) => Promise<AcademicResearchPlanView>
  startBackgroundRun: (request: AcademicResearchRunRequest, signal: AbortSignal) => Promise<AcademicBackgroundRunView>
  listBackgroundRuns: (sessionId: AcademicResearchRunRequest['sessionId']) => Promise<readonly AcademicBackgroundRunSummary[]>
  getBackgroundRun: (key: AcademicBackgroundRunKey) => Promise<AcademicBackgroundRunView>
  watchBackgroundRun: (key: AcademicBackgroundRunKey, signal: AbortSignal) => AsyncIterable<AcademicBackgroundRunView>
  cancelBackgroundRun: (request: AcademicBackgroundRunCancelRequest) => Promise<AcademicBackgroundRunView>
}
/** Framework Session selection, locale and background Remote callbacks. */
export type ResearchEntryProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'academicRun'> & ResearchEntryInjected

/**
 * Recover research for the selected persisted Session when the dialog opens.
 * @param props Framework selectors, localized copy and Remote callbacks.
 * @returns Sidebar trigger and Session-keyed dialog.
 */
export function ResearchEntry({ t, useSessions, ...remote }: ResearchEntryProps) {
  const [open, setOpen] = useState(false)
  const sessionId = useSessions(s => s.current !== undefined && s.byId[s.current]?.blank === false ? s.current : undefined)
  return <>
    <Q6DemoEntry t={t} />
    <button className={css.entry} type="button" title={t('entry')} onClick={() => { setOpen(true) }}>{t('entry')}</button>
    <Modal open={open} onClose={() => { setOpen(false) }} title={t('title')} closeLabel={t('close')}
      description={t('disclosure')} className={css.dialog} contentClassName={css.body}>
      {open && (sessionId === undefined ? <p role="status">{t('noSession')}</p>
        : <ResearchForm key={sessionId} sessionId={sessionId} {...remote} t={t} />)}
    </Modal>
  </>
}

function ResearchForm({ sessionId, plan, startBackgroundRun, listBackgroundRuns, getBackgroundRun,
  watchBackgroundRun, cancelBackgroundRun, enhanceEvidence, enhancementHistory, t }: ResearchEntryInjected & PropsLocale<'academicRun'> & Pick<AcademicResearchRunRequest, 'sessionId'>) {
  const [approved, setApproved] = useState<AcademicResearchPlanView | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [runs, setRuns] = useState<readonly AcademicBackgroundRunSummary[]>([])
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [view, setView] = useState<RunView | null>(null)
  const [task, setTask] = useState<AcademicBackgroundRunView | null>(null)
  const [connected, setConnected] = useState(false)
  const active = useRef<AbortController | null>(null)
  const currentTask = useRef<AcademicBackgroundRunView | null>(null)

  const observe = async (operation: AbortController, initial: AcademicBackgroundRunView) => {
    let shown: RunView | null = null
    const receive = (next: AcademicBackgroundRunView) => {
      if (active.current !== operation) return false
      if (next.sessionId !== sessionId || next.backgroundRunId !== initial.backgroundRunId
        || next.researchBriefId !== initial.researchBriefId) throw new Error(t('streamMismatch'))
      if (currentTask.current !== null && currentTask.current.state !== 'running' && next.state === 'running') return true
      shown = backgroundView(next, shown, t('streamMismatch'), t('backgroundInterrupted'), t('cancelledRequest'), t('requestFailed'))
      currentTask.current = next
      setTask(next); setView(shown)
      setRuns(previous => [...previous.filter(row => row.backgroundRunId !== next.backgroundRunId), next])
      return true
    }
    try {
      if (!receive(initial) || initial.state !== 'running') return
      setConnected(true)
      for await (const next of watchBackgroundRun({ sessionId, backgroundRunId: initial.backgroundRunId }, operation.signal)) {
        if (!receive(next)) return
        if (next.state !== 'running') return
      }
      if (active.current === operation && currentTask.current?.state === 'running') setMessage(t('streamDisconnected'))
    } catch (error: unknown) {
      if (active.current === operation) setMessage(`${t('streamDisconnected')} ${error instanceof Error ? error.message : t('requestFailed')}`)
    } finally {
      if (active.current === operation) { setConnected(false); active.current = null }
    }
  }

  const select = async (backgroundRunId: string) => {
    active.current?.abort()
    const operation = new AbortController()
    active.current = operation
    currentTask.current = null
    setLoading(true); setMessage(null); setTask(null); setView(null); setConnected(false)
    try {
      const initial = await getBackgroundRun({ sessionId, backgroundRunId })
      if (active.current !== operation) return
      setLoading(false)
      await observe(operation, initial)
    } catch (error: unknown) {
      if (active.current === operation) {
        setMessage(error instanceof Error ? error.message : t('requestFailed')); active.current = null; setLoading(false)
      }
    }
  }

  useEffect(() => {
    let current = true
    setLoading(true); setMessage(null)
    void plan(sessionId).then((value) => { if (current) setApproved(value) }, (error: unknown) => {
      if (current) setPlanError(error instanceof Error ? error.message : t('planFailed'))
    })
    void listBackgroundRuns(sessionId).then((rows) => {
      if (!current) return
      setRuns(rows)
      const selected = rows.findLast(row => row.state === 'running') ?? rows.at(-1)
      if (selected === undefined) setLoading(false)
      else void select(selected.backgroundRunId)
    }, (error: unknown) => {
      if (current) setMessage(error instanceof Error ? error.message : t('requestFailed'))
      // Admission stays disabled until the Session's active task can be discovered.
    })
    return () => {
      current = false; currentTask.current = null
      const operation = active.current; active.current = null; operation?.abort()
    }
  }, [sessionId, plan, listBackgroundRuns, revision])

  const start = async () => {
    if (loading || active.current !== null || runs.some(row => row.state === 'running') || approved === null) return
    const operation = new AbortController()
    active.current = operation
    setLoading(true); setMessage(null); setView(null); setTask(null); currentTask.current = null
    try {
      const initial = await startBackgroundRun({ sessionId,
        researchBriefId: approved.researchBriefId, synthetic: false }, operation.signal)
      if (active.current !== operation) return
      setLoading(false)
      await observe(operation, initial)
    } catch (error: unknown) {
      if (active.current === operation) {
        setMessage(error instanceof Error ? error.message : t('requestFailed'))
        // An admission response may be lost after the task was persisted; rediscover before allowing another start.
        active.current = null
        const rows = await listBackgroundRuns(sessionId).catch(() => null)
        if (operation.signal.aborted) return
        if (rows !== null) { setRuns(rows); setLoading(false) }
      }
    }
  }
  const cancel = async () => {
    const selected = currentTask.current
    if (selected === null || selected.state !== 'running' || selected.cancelReason === 'user_requested') return
    setView(previous => previous?.phase === 'running' ? { ...previous, cancelling: true } : previous)
    try {
      const next = await cancelBackgroundRun({ sessionId, backgroundRunId: selected.backgroundRunId, reason: 'user_requested' })
      if (currentTask.current !== selected) return
      currentTask.current = next; setTask(next)
      setView(previous => backgroundView(next, previous, t('streamMismatch'), t('backgroundInterrupted'), t('cancelledRequest'), t('requestFailed')))
      setRuns(previous => previous.map(row => row.backgroundRunId === next.backgroundRunId ? next : row))
    } catch (error: unknown) {
      if (currentTask.current === selected) {
        setMessage(error instanceof Error ? error.message : t('requestFailed'))
        setView(previous => previous?.phase === 'running' ? { ...previous, cancelling: false } : previous)
      }
    }
  }
  return <>
    <p>{t('session')}: {sessionId}</p><p className={css.notice}>{t('backgroundNotice')}</p>
    {planError !== null && <p role="alert">{planError}</p>}
    {approved === null && planError === null && <p role="status">{t('loadingPlan')}</p>}
    {loading && <p>{t('backgroundLoading')}</p>}
    {message !== null && <p role="alert">{message}</p>}
    {loading && message !== null && task === null && <button type="button" onClick={() => { setRevision(previous => previous + 1) }}>
      {t('backgroundReconnect')}
    </button>}
    {runs.length > 0 && <label>{t('backgroundRecords')}<select aria-label={t('backgroundRecords')} value={task?.backgroundRunId ?? ''}
      onChange={(event) => { void select(event.target.value) }}>
      {task === null && <option value="" disabled>{t('backgroundLoading')}</option>}
      {runs.map(row => <option key={row.backgroundRunId} value={row.backgroundRunId}>
        {row.startedAt} · {t(`background_${row.state}`)} · {row.backgroundRunId}
      </option>)}
    </select></label>}
    {task !== null && <section aria-label={t('backgroundTask')}>
      <p>{t('backgroundTask')}: {task.backgroundRunId} · {t(`background_${task.state}`)}</p>
      <p>{t(connected ? 'backgroundConnected' : task.state === 'running' ? 'backgroundDisconnected' : 'backgroundSnapshot')}</p>
      {task.state === 'interrupted' && <p>{t('backgroundInterrupted')}</p>}
      {task.cancelReason !== null && <p>{t(`backgroundReason_${task.cancelReason}`)}</p>}
      {!connected && <button type="button" onClick={() => { void select(task.backgroundRunId) }}>{t('backgroundReconnect')}</button>}
    </section>}
    {view !== null && <RunPanel view={view} t={t}
      plannedSearches={task?.researchBriefId === approved?.researchBriefId ? approved?.searches : undefined}
      onCancel={() => { void cancel() }} />}
    {view?.phase === 'settled' && view.value.report !== null && view.value.status === 'completed' && <EnhancementPanel
      key={`${sessionId}:${view.value.retrievalRun.retrievalRunId}`} value={view.value}
      enhanceEvidence={enhanceEvidence} enhancementHistory={enhancementHistory} t={t} />}
    {approved !== null && <>
      <h3>{approved.topic}</h3><ul>{approved.questions.map(question => <li key={question}>{question}</li>)}</ul>
      <h4>{t('searchDirections')}</h4><SearchPolicies searches={approved.searches} t={t} />
      <form className={css.controls} onSubmit={(event) => { event.preventDefault(); void start() }}>
        <button type="submit" disabled={loading || runs.some(row => row.state === 'running')}>{t('start')}</button>
      </form>
    </>}
  </>
}
