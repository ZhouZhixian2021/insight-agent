/** User-selected, bounded second-tier request; the original report stays mounted above. */
import { useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AcademicEvidenceEnhancementView, AcademicResearchRunValue } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import type { ResearchEntryInjected } from './ResearchEntry.tsx'
import type { EnhancementHistory } from './enhancement-history.ts'
import css from './RunPanel.module.css'

/** Explicit Remote commands and the immutable first-tier result. */
export type EnhancementPanelProps = PropsLocale<'academicRun'>
  & Pick<ResearchEntryInjected, 'enhanceEvidence' | 'enhancementHistory'> & { readonly value: AcademicResearchRunValue }

/**
 * Restore durable selection and display supplemental evidence without replacing the first-tier draft.
 * @param props Session/run-owned first-tier result and cancellable Remote callbacks.
 * @returns Paper selection, enhancement status and verified supplemental excerpts.
 */
export function EnhancementPanel({ value, enhanceEvidence, enhancementHistory, t }: EnhancementPanelProps) {
  const key = { sessionId: value.sessionId, retrievalRunId: value.retrievalRun.retrievalRunId }
  const papers = value.papers.filter(paper => (paper.status === 'extracted' || paper.status === 'partially_extracted')
    && paper.evidenceCount > 0)
  const [selected, setSelected] = useState('')
  const [history, setHistory] = useState<EnhancementHistory | null>(null)
  const [receipt, setReceipt] = useState<AcademicEvidenceEnhancementView | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef<AbortController | null>(null)
  const operation = useRef<AbortController | null>(null)
  const locked = useRef(false)

  const read = async (signal: AbortSignal) => {
    const next = await enhancementHistory(key, signal)
    if (signal.aborted) return
    if (next !== null && !papers.some(paper => paper.workVersionId === next.workVersionId)) throw new Error(t('streamMismatch'))
    setHistory(next)
    if (next !== null) { setSelected(next.workVersionId); locked.current = true }
    else if (operation.current === null && receipt === null) { locked.current = false; setAttempted(false) }
  }
  const reload = async () => {
    if (operation.current !== null) return
    active.current?.abort()
    const controller = new AbortController(); active.current = controller
    setLoading(true); setError(null)
    try { await read(controller.signal) }
    catch (cause: unknown) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : t('requestFailed')) }
    finally { if (active.current === controller) { setLoading(false); active.current = null } }
  }
  useEffect(() => {
    void reload()
    return () => {
      const reading = active.current, requesting = operation.current
      active.current = null; operation.current = null
      reading?.abort(); requesting?.abort()
    }
  }, [value.sessionId, value.retrievalRun.retrievalRunId])

  const start = async () => {
    const paper = papers.find(item => item.workVersionId === selected)
    if (paper === undefined || loading || locked.current || operation.current !== null || history !== null) return
    const controller = new AbortController(); operation.current = controller; locked.current = true
    setRunning(true); setAttempted(true); setError(null)
    try {
      const result = await enhanceEvidence({ ...key, workVersionId: paper.workVersionId }, controller.signal)
      if (operation.current !== controller) return
      if (result.sessionId !== key.sessionId || result.retrievalRunId !== key.retrievalRunId
        || result.workVersionId !== paper.workVersionId) throw new Error(t('streamMismatch'))
      setReceipt(result)
    } catch (cause: unknown) {
      if (operation.current === controller) setError(cause instanceof Error ? cause.message : t('requestFailed'))
    } finally {
      if (operation.current === controller) {
        try { await read(controller.signal) }
        catch (cause: unknown) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : t('requestFailed')) }
        if (operation.current === controller) { operation.current = null; setRunning(false) }
      }
    }
  }
  const status = running ? 'running' : history?.status ?? receipt?.status ?? (attempted ? 'unknown' : 'not_started')
  const added = history?.addedEvidenceRecords ?? receipt?.addedEvidenceRecords
  const incomplete = history?.incompleteFragments ?? receipt?.incompleteFragments
  return <section className={css.page} aria-label={t('enhance_title')} aria-busy={running || loading}>
    <h3>{t('enhance_title')}</h3><p className={css.notice}>{t('enhance_notice')}</p>
    <p>{t('enhance_lifetime')}</p>
    {loading && <p role="status">{t('enhance_loading')}</p>}
    <p role="status">{t(`enhance_${status}`)}</p>
    {error !== null && <p role="alert">{error}</p>}
    <label>{t('enhance_paper')}<select aria-label={t('enhance_paper')} value={selected}
      disabled={running || loading || history !== null || attempted} onChange={(event) => { setSelected(event.target.value) }}>
      <option value="">{t('enhance_choose')}</option>
      {papers.map(paper => <option key={paper.workVersionId} value={paper.workVersionId}>
        {value.q6?.candidates.state === 'available'
          ? value.q6.candidates.value.items.find(item => item.version.workVersionId === paper.workVersionId)?.work.title
            ?? paper.workVersionId
          : paper.workVersionId}
      </option>)}
    </select></label>
    {papers.length === 0 && <p>{t('enhance_noPapers')}</p>}
    <div className={css.controls}>
      <button type="button" disabled={loading || running || attempted || history !== null || error !== null || selected === ''}
        onClick={() => { void start() }}>{t('enhance_start')}</button>
      <button type="button" disabled={running || loading} onClick={() => { void reload() }}>{t('enhance_refresh')}</button>
    </div>
    {added !== undefined && <p>{t('enhance_added')}: {added}</p>}
    {incomplete !== undefined && <p>{t('enhance_incomplete')}: {incomplete}</p>}
    {history !== null && <p>{t('version')}: {history.workVersionId} · {history.selectedAt}</p>}
    <h4>{t('enhance_evidence')}</h4>
    {history?.excerpts.length ? history.excerpts.map(record => <details key={record.evidenceId} className={css.card}>
      <summary>{record.evidenceId} · {t(record.level === 'fulltext' ? 'fulltext' : record.level === 'abstract' ? 'abstract' : 'metadata')}</summary>
      <p>{record.statement}</p><blockquote>{record.excerpt ?? t('excerptUnavailable')}</blockquote>
      <p>{t('version')}: {record.workVersionId} · {t('locator')}: {record.locator}</p>
    </details>) : <p>{t('enhance_noEvidence')}</p>}
  </section>
}
