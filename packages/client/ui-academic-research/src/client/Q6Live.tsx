/** Formal Q6 snapshots share views with the demo but never use synthetic fallback data. */
import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AcademicQ6Projection, AcademicQ6Section } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import { Q6Plan } from './Q6Plan.tsx'
import { Q6Candidates } from './Q6Candidates.tsx'
import { Q6EvidenceCoverage } from './Q6Coverage.tsx'
import css from './RunPanel.module.css'

function Section<T>({ value, t, children }: PropsLocale<'academicRun'> & {
  readonly value: AcademicQ6Section<T>
  readonly children: (data: T) => ReactNode
}) {
  if (value.state === 'pending') return <p role="status">{t('q6_sectionPending')}</p>
  if (value.state === 'failed') return <p role="alert">{t('q6_sectionFailed')}: {value.code} · {value.message}</p>
  return <>
    {value.state === 'truncated' && <p role="note">{t('q6_sectionTruncated')}: {value.reason}</p>}
    {children(value.value)}
  </>
}

/**
 * Show authoritative candidates, batches and evidence coverage for the current run.
 * @param props One formal Remote projection and localized labels.
 * @returns Read-only views preserving section availability, queue order and missing evidence.
 */
export function Q6Live({ projection: p, t }: PropsLocale<'academicRun'> & { readonly projection: AcademicQ6Projection }) {
  const [tab, setTab] = useState<'plan' | 'candidates' | 'coverage'>('coverage')
  return <section className={css.page} aria-label={t('q6_liveTitle')}>
    <h3>{t('q6_liveTitle')}</h3><p>{p.retrievalRunId} · {t('observedAt')}: {p.updatedAt}</p>
    <nav className={css.controls} aria-label={t('q6_liveTitle')}>
      {(['plan', 'candidates', 'coverage'] as const).map(key => <button key={key} type="button" aria-pressed={tab === key}
        onClick={() => { setTab(key) }}>{t(`q6_${key}`)}</button>)}
    </nav>
    {tab === 'plan' && <Q6Plan plan={p.plan} demo={false} t={t} />}
    {tab === 'candidates' && <Section value={p.candidates} t={t}>{data => <Q6Candidates t={t} data={{
      plan: p.plan, rankingResult: { ...data.ranking, evaluations: data.items.map(item => item.evaluation) },
      assessments: data.items.map(item => item.assessment), works: data.items.map(item => item.work),
      versions: data.items.map(item => item.version),
    }} />}</Section>}
    {tab === 'coverage' && <>
      <h4>{t('q6_coverage')}</h4>
      <Section value={p.coverage} t={t}>{coverage => <Q6EvidenceCoverage coverage={coverage} demo={false} t={t} />}</Section>
      <h4>{t('q6_rounds')}</h4>
      <Section value={p.rounds} t={t}>{rounds => rounds.length === 0 ? <p>{t('q6_noRounds')}</p> : <ul>
        {rounds.map(round => <li key={round.roundIndex}>{t('q6_round')} {round.roundIndex} · {t(`q6_${round.purpose}`)}
          {' · '}{t(`q6_round_${round.status}`)}<p>{round.searchQueryIds.join(', ')}</p></li>)}
      </ul>}</Section>
      <h4>{t('q6_batches')}</h4>
      <Section value={p.batches} t={t}>{batches => <>
        {batches.decisions.length === 0 && <p>{t('q6_noBatches')}</p>}
        <ul>{batches.decisions.map((decision, index) => <li key={index}>
          {t(`q6_action_${decision.action}`)} · {t('q6_liveBatch')}: {decision.batchIndex === null ? t('progressUnknown') : decision.batchIndex + 1}
          <p>{decision.workVersionIds.join(', ')}</p><p>{decision.searchQuestions.join('；')}</p>
          {decision.reason !== null && <p>{decision.reason}</p>}
        </li>)}</ul>
        <ul>{batches.settlements.map(batch => <li key={batch.batchIndex}>
          {t('q6_liveBatch')} {batch.batchIndex + 1} · {t('validatedEvidence')}: {batch.admittedEvidence} · {batch.completedAt}
        </li>)}</ul>
      </>}</Section>
      <h4>{t('q6_stop')}</h4>
      <Section value={p.stopDecision} t={t}>{decision => <>
        <p>{t(decision.shouldStop ? `q6_stop_${decision.reason}` : 'q6_continue')}</p>
        <ul>{decision.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>
      </>}</Section>
    </>}
    {p.limitations.length > 0 && <><h4>{t('limits')}</h4><ul>{p.limitations.map((limit, index) => <li key={index}>{limit}</li>)}</ul></>}
  </section>
}
