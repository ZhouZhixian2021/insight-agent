/** Fixed-data lifecycle prototype; no Remote requests, timers or automatic synthetic progress. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PreviewState } from './run-experience-types.ts'
import { downloadMarkdown } from './RunPanel.tsx'
import css from './RunPanel.module.css'

/**
 * Render the phase-one funnel, failure and reopening prototype from fixed JSON.
 * @param props Parent-owned demo state and a synchronous local update callback.
 * @returns Stage inputs/outputs, separate connection/run state, retained draft and explicit demo cancellation.
 */
export function RunExperience({ state, onChange, t }: PropsLocale<'academicRun'> & {
  readonly state: PreviewState
  readonly onChange: (next: PreviewState) => void
}) {
  const run = state.runs.find(item => item.id === state.selected)
  if (run === undefined) return <p>{t('exp_noData')}</p>
  const number = (value: number | null) => value === null ? t('progressUnknown') : String(value)
  const terminal = run.status !== 'running' && run.status !== 'paused'
  const update = (changes: Partial<typeof run>) => { onChange({ ...state,
    runs: state.runs.map(item => item.id === run.id ? { ...item, ...changes } : item) }) }
  return <section className={css.page} aria-label={t('exp_title')}>
    <p role="note">{t('exp_notice')}</p>
    <label>{t('exp_scenario')}<select value={state.selected} onChange={(event) => {
      const selected = event.target.value
      onChange({ selected, runs: state.runs.map(item => ({ ...item, connected: item.id === selected })) })
    }}>{state.runs.map(item => <option value={item.id} key={item.id}>{item.id} · {t(`exp_${item.status}`)}</option>)}</select></label>
    <h3>{t('exp_title')}</h3>
    <dl className={css.stats}>
      <div><dt>{t('exp_runId')}</dt><dd>{run.id}</dd></div>
      <div><dt>{t('exp_runStatus')}</dt><dd>{t(`exp_${run.status}`)}</dd></div>
      <div><dt>{t('exp_connection')}</dt><dd>{t(run.connected ? 'exp_connected' : 'exp_disconnected')}</dd></div>
      <div><dt>{t('exp_elapsed')}</dt><dd>{run.elapsedMinutes} {t('exp_minutes')}</dd></div>
      <div><dt>{t('exp_cancelReason')}</dt><dd>{run.cancellationReason === null ? t('exp_notCancelled') : t(`exp_reason_${run.cancellationReason}`)}</dd></div>
    </dl>
    <p>{t('currentWork')}: {run.currentWork}</p>
    <div className={css.controls}>
      <button type="button" onClick={() => { update({ connected: !run.connected }) }}>
        {t(run.connected ? 'exp_disconnect' : 'exp_reconnect')}
      </button>
      <button type="button" disabled={terminal} onClick={() => { update({ status: 'cancelled', cancellationReason: 'user_cancelled' }) }}>
        {t('exp_cancel')}
      </button>
    </div>
    <p>{t('exp_cancelHelp')}</p>
    <h4>{t('exp_funnel')}</h4><p>{t('exp_countNotice')}</p>
    <dl className={css.stats}>
      {(['discovered', 'candidateLimit', 'scheduled', 'processed', 'failed', 'evidence', 'usable'] as const).map(key =>
        <div key={key}><dt>{t(`exp_count_${key}`)}</dt><dd>{number(run.counts[key])}</dd></div>)}
      <div><dt>{t('q6_coverage')}</dt><dd>{run.counts.coveredQuestions} / {run.counts.totalQuestions}</dd></div>
    </dl>
    <p>{t('exp_evidenceNotice')}</p>
    <h4>{t('exp_stages')}</h4>
    <ol aria-label={t('exp_stages')}>{run.stages.map(stage => <li key={stage.phase} className={css.card}>
      <strong>{t(`exp_phase_${stage.phase}`)}</strong> · {t(`progress_${run.status === 'cancelled'
        ? stage.status === 'running' ? 'cancelled' : stage.status === 'pending' ? 'not_run' : stage.status : stage.status}`)}
      <p>{t('exp_input')}: {number(stage.input)} · {t('exp_output')}: {number(stage.output)} · {t(`exp_unit_${stage.unit}`)}</p>
      <p>{t('exp_stageElapsed')}: {t('progressUnknown')}</p>
      {stage.reasons.length > 0 ? <><h5>{t('exp_reasons')}</h5><ul>{stage.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></>
        : <p>{t('exp_noReasons')}</p>}
    </li>)}</ol>
    <h4>{t('exp_limits')}</h4>
    {run.unmetRequirements.length === 0 ? <p>{t('exp_noLimits')}</p> : <ul>{run.unmetRequirements.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
    <h4>{t('exp_report')}</h4><p>{t(`exp_report_${run.report.state}`)}</p>
    {run.report.markdown !== null && <>
      <p>{t('exp_draftNotice')}</p>
      <button type="button" onClick={() => { downloadMarkdown(run.report.markdown ?? '', 'academic-demo-draft.md') }}>{t('exp_download')}</button>
      <details><summary>{t('markdown')}</summary><pre className={css.markdown}>{run.report.markdown}</pre></details>
    </>}
    <p>{t('exp_restoreNotice')}</p>
  </section>
}
