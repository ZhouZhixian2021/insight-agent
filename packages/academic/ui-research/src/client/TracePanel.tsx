/** Manual, scoped diagnostic queries never own or cancel the research task. */
import { useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AcademicTraceQuery } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import type { AcademicTracePage, AcademicTraceSpan, AcademicTraceStatus, AcademicTraceStage } from '@deepseek-ai/dsh-academic-model'

/** Safe Remote callbacks owned by the Academic client plugin. */
export interface TraceRemote {
  traceList: (query: AcademicTraceQuery, signal: AbortSignal) => Promise<AcademicTracePage>
  traceDetail: (query: AcademicTraceQuery, signal: AbortSignal) => Promise<AcademicTracePage>
}

/**
 * Query one run's saved diagnostics, with explicit refresh and stable page cursors.
 * @param props Run scope, localized copy and safe Remote callbacks.
 * @returns Filters, operation timeline, attempt details and export of the current page.
 */
export function TracePanel({ sessionId, researchRunId, traceList, traceDetail, t }:
  Pick<AcademicTraceQuery, 'sessionId' | 'researchRunId'> & TraceRemote & PropsLocale<'academicRun'>) {
  const [page, setPage] = useState<AcademicTracePage | null>(null)
  const [detail, setDetail] = useState<AcademicTracePage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [stage, setStage] = useState<AcademicTraceStage | ''>('')
  const [state, setState] = useState<AcademicTraceStatus | ''>('')
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => { active.current?.abort() }, [])
  const load = async (cursor: string | null = null, span?: AcademicTraceSpan) => {
    active.current?.abort()
    const controller = new AbortController(); active.current = controller
    setBusy(true); setError(false)
    if (cursor === null && span === undefined) { setPage(null); setDetail(null) }
    try {
      const query: AcademicTraceQuery = { sessionId, researchRunId, stage: stage || null, status: state || null, cursor, limit: 50,
        ...(span === undefined ? {} : { spanId: span.spanId }) }
      const next = await (span === undefined ? traceList : traceDetail)(query, controller.signal)
      if (controller.signal.aborted) return
      if (span !== undefined) setDetail(next)
      else setPage(previous => cursor !== null && previous?.snapshotId === next.snapshotId
        ? { ...next, items: [...previous.items, ...next.items] } : next)
    } catch {
      if (!controller.signal.aborted) setError(true)
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }
  const reset = () => { active.current?.abort(); setBusy(false); setError(false); setPage(null); setDetail(null) }
  return <section aria-label={t('traceTitle')}>
    <h3>{t('traceTitle')}</h3><p>{t('traceNotice')}</p>
    <label>{t('traceStage')}<select value={stage} onChange={(event) => { reset(); setStage(event.target.value as AcademicTraceStage | '') }}>
      <option value="">{t('traceAll')}</option>{(['retrieval', 'screening', 'fulltext', 'extraction', 'analysis', 'report'] as const)
        .map(value => <option key={value} value={value}>{t(`trace_stage_${value}`)}</option>)}
    </select></label>
    <label>{t('traceState')}<select value={state} onChange={(event) => { reset(); setState(event.target.value as AcademicTraceStatus | '') }}>
      <option value="">{t('traceAll')}</option>{(['queued', 'running', 'retry_wait', 'succeeded', 'partial_success', 'failed', 'cancelled', 'skipped', 'unknown'] as const)
        .map(value => <option key={value} value={value}>{t(`trace_state_${value}`)}</option>)}
    </select></label>
    <button type="button" disabled={busy} onClick={() => { void load() }}>{t(page === null ? 'traceLoad' : 'traceRefresh')}</button>
    {busy && <p role="status">{t('traceLoading')}</p>}{error && <p role="alert">{t('traceError')}</p>}
    {page?.status === 'not_found' && <p>{t('traceUnavailable')}</p>}
    {page !== null && page.status === 'ok' && <>
      <p>{t('traceCalls')}: {page.summary.logicalCalls} · {t('traceAttempts')}: {page.summary.attempts}
        {' · '}{t('traceTotal')}: {page.summary.runTotalMs.value ?? t('traceUnknown')}</p>
      <button type="button" onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(page, null, 2)], { type: 'application/json' }))
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'academic-trace-page.json'; anchor.click()
        setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
      }}>{t('traceExport')}</button>
      <ol>{page.items.map(span => <li key={span.spanId}>
        <strong>{t(`trace_kind_${span.kind}`)}</strong> · {t(`trace_op_${span.operation}`)} · {t(`trace_state_${span.status}`)}
        <p>{t('traceId')}: {span.spanId} · {t('traceParent')}: {span.parentSpanId ?? t('traceUnknown')}</p>
        <p>{t('traceModel')}: {span.model ?? t('traceUnknown')} · {t('providers')}: {span.providerId ?? t('traceUnknown')}</p>
        {span.workVersionId !== null && <p>{t('version')}: {span.workVersionId}</p>}
        <p>{t('traceAttempt')}: {span.attemptIndex ?? t('traceUnknown')} · {t('traceDuration')}: {span.timing.totalMs.value ?? t('traceUnknown')}</p>
        {span.gaps.length > 0 && <p>{t('traceMissing')}: {span.gaps.map(gap => gap.code).join(', ')}</p>}
        <button type="button" disabled={busy} onClick={() => { setDetail(null); void load(null, span) }}>{t('traceDetails')}</button>
      </li>)}</ol>
      {page.nextCursor !== null && <button type="button" disabled={busy} onClick={() => { void load(page.nextCursor) }}>{t('traceMore')}</button>}
    </>}
    {detail !== null && <section aria-label={t('traceDetails')}>
      {detail.events.map(event => <article key={event.eventId}>
        <p>{event.sequence} · {event.observedAt ?? t('traceUnknown')} · {t(`trace_state_${event.span.status}`)}</p>
        <p>{t('traceQueue')}: {event.span.timing.queueMs.value ?? t('traceUnknown')}
          {' · '}{t('traceExecution')}: {event.span.timing.executionMs.value ?? t('traceUnknown')}
          {' · '}{t('traceBasis')}: {t(`trace_basis_${event.span.timing.totalMs.basis}`)}</p>
        {event.span.failure !== null && <p>{event.span.failure.code} · {event.span.failure.phase}</p>}
      </article>)}
      {detail.nextCursor !== null && detail.items[0] !== undefined && <button type="button" disabled={busy}
        onClick={() => { void load(detail.nextCursor, detail.items[0]) }}>{t('traceMore')}</button>}
    </section>}
  </section>
}
