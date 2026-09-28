/** Render observed snapshots; elapsed time is never converted into completion estimates. */
import type { AcademicResearchProgressView } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './RunPanel.module.css'

const stages = ['retrieval', 'screening', 'fulltext', 'extraction', 'analysis', 'report'] as const

/**
 * Show concurrent activities and bounded event history without inventing unknown counts.
 * @param props Latest complete producer snapshot, retained observations and localized copy.
 * @returns Six stage settlements, current activities and recent events.
 */
export function ProgressPanel({ progress, recent = [], t }: PropsLocale<'academicRun'> & {
  readonly progress: AcademicResearchProgressView
  readonly recent?: readonly AcademicResearchProgressView[] | undefined
}) {
  const number = (value: number | null) => value === null ? t('progressUnknown') : String(value)
  const pair = (done: number | null, total: number | null) => `${number(done)} / ${number(total)}`
  return <section aria-label={t('liveProgress')}>
    <h3>{t('liveProgress')}: {progress.primaryStage === null ? t('progressSettled') : t(`progress_${progress.primaryStage}`)}</h3>
    <p>{t('observedElapsed')}: {Math.floor(progress.elapsedMs / 1000)} {t('seconds')} · {t('observedAt')}: {progress.updatedAt}</p>
    <p>{t('activeStages')}: {progress.activeStages.map(stage => t(`progress_${stage}`)).join(' / ') || t('noActiveWork')}</p>
    <ol className={css.stats}>{stages.map(stage => <li key={stage} className={css.card}>
      <strong>{t(`progress_${stage}`)}</strong><p>{t(`progress_${progress.stages[stage].status}`)}</p>
      <p>{pair(progress.stages[stage].completedItems, progress.stages[stage].totalItems)}
        {' '}{progress.stages[stage].unit === null ? '' : t(`unit_${progress.stages[stage].unit}`)}</p>
    </li>)}</ol>
    <dl className={css.stats}>
      <div><dt>{t('progressQueries')}</dt><dd>{pair(progress.counts.completedQueries, progress.counts.totalQueries)}</dd></div>
      <div><dt>{t('progressPapers')}</dt><dd>{pair(progress.counts.completedPapers, progress.counts.totalPapers)}</dd></div>
      <div><dt>{t('includedWorks')}</dt><dd>{progress.counts.includedPapers}</dd></div>
      <div><dt>{t('availableFulltextWorks')}</dt><dd>{progress.counts.availableFulltextPapers}</dd></div>
      <div><dt>{t('validatedEvidence')}</dt><dd>{progress.counts.validatedEvidenceRecords}</dd></div>
      <div><dt>{t('rejectedEvidence')}</dt><dd>{progress.counts.rejectedEvidenceDrafts}</dd></div>
      <div><dt>{t('progressQuestions')}</dt><dd>{pair(progress.counts.completedQuestions, progress.counts.totalQuestions)}</dd></div>
    </dl>
    <h4>{t('currentWork')}</h4>
    {progress.activities.length === 0 ? <p>{t('noActiveWork')}</p> : <ul>{progress.activities.map((activity, index) => <li key={index} className={css.card}>
      <strong>{t(`progress_${activity.stage}`)}</strong>
      {activity.kind === 'query' && <><p>{activity.query}</p><p>{pair(activity.queryIndex, activity.queryCount)}</p>
        <p>{activity.channels.map(channel => t(channel)).join(' / ')}</p></>}
      {activity.kind === 'screening' && <p>{t(`operation_${activity.operation}`)}</p>}
      {activity.kind === 'question' && <><p>{activity.question}</p><p>{pair(activity.questionIndex, activity.questionCount)}</p></>}
      {activity.kind === 'paper' && <>
        <p>{activity.title ?? t('untitledCandidate')} · {activity.workVersionId}</p><p>{t(`operation_${activity.operation}`)}</p>
        <p>{t('progressBatches')}: {pair(activity.batchIndex, activity.batchCount)}</p>
        <p>{t('progressAttempts')}: {pair(activity.attempt, activity.maximumAttempts)}</p>
        <p>{t('validatedEvidence')}: {activity.validatedEvidenceRecords} · {t('rejectedEvidence')}: {activity.rejectedEvidenceDrafts}</p>
        {activity.lastFailure !== null && <p>{t('lastFailure')}: {t(`failure_${activity.lastFailure}`)}</p>}
      </>}
      {activity.kind === 'report' && <><p>{t(`operation_${activity.operation}`)}</p>
        <p>{t('progressAttempts')}: {pair(activity.attempt, activity.maximumAttempts)}</p>
        {activity.lastFailure !== null && <p>{t('lastFailure')}: {t(`failure_${activity.lastFailure}`)}</p>}</>}
    </li>)}</ul>}
    <h4>{t('recentProgress')}</h4>
    <ol aria-label={t('recentProgress')}>{recent.map(snapshot => <li key={snapshot.sequence}>
      {snapshot.latestEvent.occurredAt} · {t(`progress_${snapshot.latestEvent.stage}`)} · {t(`event_${snapshot.latestEvent.code}`)}
      {snapshot.latestEvent.workVersionId !== null && <> · {snapshot.latestEvent.workVersionId}</>}
      {snapshot.latestEvent.failureCode !== null && <> · {t(`failure_${snapshot.latestEvent.failureCode}`)}</>}
    </li>)}</ol>
  </section>
}
