/** Reviewed domain reconnaissance and its source-grounded direction map. */
import { useEffect, useRef, useState } from 'react'
import type { AcademicDomainSurveyPlanView, AcademicDomainSurveyRequest, AcademicDomainSurveyView }
  from '@deepseek-ai/dsh-api-academic-research-controller/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './RunPanel.module.css'

/** Browser Remote operations for one approved metadata survey. */
export interface DomainSurveyRemote {
  domainSurveyPlan: (sessionId: AcademicDomainSurveyRequest['sessionId']) => Promise<AcademicDomainSurveyPlanView>
  getDomainSurvey: (request: AcademicDomainSurveyRequest) => Promise<AcademicDomainSurveyView>
  runDomainSurvey: (request: AcademicDomainSurveyRequest, signal: AbortSignal) => Promise<AcademicDomainSurveyView>
}

/** Show the reviewed query budget and persistently readable survey outcome. */
export function DomainSurveyCard({ sessionId, expectedPlanId, autoStart, domainSurveyPlan, getDomainSurvey,
  runDomainSurvey, t }: DomainSurveyRemote & PropsLocale<'academicRun'> & {
    sessionId: AcademicDomainSurveyRequest['sessionId']
    expectedPlanId: string
    autoStart: boolean
  }) {
  const [plan, setPlan] = useState<AcademicDomainSurveyPlanView | null>(null)
  const [view, setView] = useState<AcademicDomainSurveyView | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const attempt = useRef(false)
  const operation = useRef<AbortController | null>(null)
  useEffect(() => {
    let current = true
    setBusy(true); setError(null)
    void (async () => {
      let saved: AcademicDomainSurveyView | null = null
      try { saved = await getDomainSurvey({ sessionId, planId: expectedPlanId }) }
      catch { /* A reviewed plan may not have been executed yet. */ }
      if (!current) return
      if (saved !== null) setView(saved)
      try {
        const latest = await domainSurveyPlan(sessionId)
        if (!current) return
        if (latest.planId === expectedPlanId) setPlan(latest)
        else if (saved === null) setError(t('surveyHistorical'))
      } catch (cause: unknown) {
        if (current && saved === null) setError(cause instanceof Error ? cause.message : t('planFailed'))
      }
    })().finally(() => { if (current) setBusy(false) })
    return () => { current = false; operation.current?.abort() }
  }, [sessionId, expectedPlanId, domainSurveyPlan, getDomainSurvey, t])

  const start = async () => {
    if (plan === null || plan.planId !== expectedPlanId || view !== null || busy || operation.current !== null) return
    const controller = new AbortController()
    operation.current = controller
    setBusy(true); setError(null)
    try { setView(await runDomainSurvey({ sessionId, planId: expectedPlanId }, controller.signal)) }
    catch (cause: unknown) {
      if (!controller.signal.aborted) {
        try { setView(await getDomainSurvey({ sessionId, planId: expectedPlanId })) }
        catch { setError(cause instanceof Error ? cause.message : t('requestFailed')) }
      }
    } finally {
      if (operation.current === controller) { operation.current = null; setBusy(false) }
    }
  }
  useEffect(() => {
    if (!autoStart || attempt.current || busy || plan === null || view !== null) return
    attempt.current = true
    void start()
  }, [autoStart, busy, plan, view])
  const paperById = new Map(view?.result.papers.map(paper => [paper.workId, paper]) ?? [])
  return <>
    {(plan ?? view) !== null && <details open={view === null || undefined}><summary>{t('surveyPlan')}</summary>
      <p>{(plan ?? view)?.topic} · {(plan ?? view)?.scope}</p>
      <p>{(plan ?? view)?.selection.startYear}–{(plan ?? view)?.selection.endYear} · {(plan ?? view)?.selection.dateBasis} · {(plan ?? view)?.selection.includedVersionTypes.join(', ')}</p>
      <p>{t('surveyBudget')}: {(plan?.queries ?? view?.result.queries)?.length} / {(plan ?? view)?.limits.maximumCandidates} / {(plan ?? view)?.limits.maximumElapsedMinutes}</p>
      <ol>{(plan?.queries ?? view?.result.queries ?? []).map(query => <li key={`${query.roundIndex}:${query.expression}`}>
        {t(query.purpose === 'discovery' ? 'surveyDiscovery' : 'surveyOmission')} · {query.expression}
      </li>)}</ol>
    </details>}
    {busy && <p role="status">{t(view === null ? 'surveyRunning' : 'backgroundLoading')}</p>}
    {error !== null && <p role="alert">{error}</p>}
    {plan !== null && view === null && !busy && <button type="button" onClick={() => { void start() }}>{t('surveyStart')}</button>}
    {view !== null && <section aria-label={t('surveyMap')}>
      <h4>{t('surveyMap')} · {t(view.result.status === 'mapped' ? 'surveyMapped' : 'surveyIncomplete')}</h4>
      <p>{t('surveyCandidates')}: {view.result.papers.length} · {t('surveyDirections')}: {view.result.map.directions.length}</p>
      <p>{t('surveyExcluded')}: {view.result.excludedByPolicy ?? 0}</p>
      {view.result.map.directions.map(direction => <details key={direction.directionId}>
        <summary>{direction.label} · {direction.supports.length} {t('surveySupports')}</summary>
        <p>{direction.definition}</p>
        <ul>{direction.supports.map((support, index) => <li key={`${support.workId}:${index}`}>
          <strong>{paperById.get(support.workId)?.title ?? support.workId}</strong>
          <blockquote>{support.quote}</blockquote>
          <small>{support.field} · {paperById.get(support.workId)?.workVersionId} · {paperById.get(support.workId)?.publicationDate ?? t('surveyUnknownDate')} · {paperById.get(support.workId)?.sourceRecords?.map(record => `${record.provider}:${record.recordId}`).join(', ')}</small>
        </li>)}</ul>
      </details>)}
      {view.result.map.unclassifiedWorkIds.length > 0 && <details><summary>{t('surveyUnclassified')} · {view.result.map.unclassifiedWorkIds.length}</summary>
        <ul>{view.result.map.unclassifiedWorkIds.map(id => <li key={id}>{paperById.get(id)?.title ?? id}</li>)}</ul>
      </details>}
      {view.result.limitations.length > 0 && <details open><summary>{t('surveyLimitations')}</summary>
        <ul>{view.result.limitations.map((limit, index) => <li key={index}>{limit}</li>)}</ul>
      </details>}
      <p className={css.notice}>{t('surveyNext')}</p>
    </section>}
  </>
}
