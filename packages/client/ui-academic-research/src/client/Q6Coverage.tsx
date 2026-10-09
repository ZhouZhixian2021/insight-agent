/** Coverage and stop decisions are producer facts, independent of candidate relevance. */
import { useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Q6Sample } from './q6-types.ts'
import css from './RunPanel.module.css'

/**
 * Inspect absolute recorded funnel snapshots and the separately assessed evidence coverage.
 * @param props Fixed sample and localized labels.
 * @returns Snapshot selector, counts, per-question gaps and the observed stop decision.
 */
export function Q6Coverage({ data, t }: PropsLocale<'academicRun'> & { readonly data: Q6Sample }) {
  const [index, setIndex] = useState(0)
  const event = data.progressEvents[index]
  const counts = ['discoveredRecords', 'verifiedWorks', 'deduplicatedWorks', 'eligibleWorks', 'p0Works', 'p1Works', 'p2Works', 'excludedWorks', 'scheduledFulltextWorks', 'includedWorks'] as const
  return <>
    <section aria-label={t('q6_funnel')}><h3>{t('q6_funnel')}</h3><p>{t('q6_snapshotNotice')}</p>
      {data.progressEvents.length === 0 ? <p>{t('q6_noSnapshots')}</p> : <label>{t('q6_snapshot')}
        <select value={index} onChange={(e) => { setIndex(Number(e.target.value)) }}>
          {data.progressEvents.map((frame, i) => <option key={frame.sequence} value={i}>{t(`q6_phase_${frame.phase}`)} · {frame.sequence}</option>)}
        </select></label>}
      {event !== undefined && <>
        <p>{t(`q6_phase_${event.phase}`)} · {t(`progress_${event.status}`)} · {event.occurredAt}</p>
        <p>{t('q6_round')}: {event.roundIndex ?? t('progressUnknown')} · {t('q6_batch')}: {event.batchIndex ?? t('progressUnknown')}</p>
        <dl className={css.stats}>{counts.map(key => <div key={key}><dt>{t(`q6_count_${key}`)}</dt><dd>{event.candidateCounts[key]}</dd></div>)}
          <div><dt>{t('q6_extractionCount')}</dt><dd>{t('progressUnknown')}</dd></div>
        </dl>
        <p>{t('q6_snapshotCoverage')}: {t('q6_covered')} {event.questionCoverage.covered} / {event.questionCoverage.total}
          {' · '}{t('q6_partial')} {event.questionCoverage.partial} · {t('q6_uncovered')} {event.questionCoverage.uncovered}</p>
        <p>{t('q6_stop')}: {event.stopReason === null ? t('q6_noStopReported') : t(`q6_stop_${event.stopReason}`)}</p>
      </>}
    </section>
    <section aria-label={t('q6_coverage')}><h3>{t('q6_coverage')}</h3><p>{t('q6_coverageNotice')}</p>
      <p>{t('observedAt')}: {data.coverage.assessedAt}</p>
      <p>{t('q6_evidenceRequirements')}: {t(data.coverage.evidenceRequirementsMet ? 'q6_yes' : 'q6_no')}
        {' · '}{t('q6_allCovered')}: {t(data.coverage.allQuestionsCovered ? 'q6_yes' : 'q6_no')}</p>
      {data.coverage.questions.length === 0 && <p>{t('q6_noCoverage')}</p>}
      {data.coverage.questions.map(question => <article className={css.card} key={question.question}>
        <h4>{question.question}</h4><p>{t(`q6_${question.status}`)}</p>
        <p>{t('q6_supportingWorks')}: {question.supportingWorkIds.join(', ') || t('q6_none')}</p>
        <p>{t('evidence')}: {question.evidenceIds.join(', ') || t('q6_none')}</p>
        <h5>{t('q6_gaps')}</h5>{question.gaps.length === 0 ? <p>{t('q6_noGapReported')}</p>
          : <ul>{question.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul>}
      </article>)}
    </section>
    <section aria-label={t('q6_stop')}><h3>{t('q6_stop')}</h3>
      <p>{t(data.stopDecision.shouldStop ? `q6_stop_${data.stopDecision.reason}` : 'q6_continue')}</p>
      <ul>{data.stopDecision.details.map((detail, i) => <li key={i}>{detail}</li>)}</ul><p>{t('q6_gapActionUnknown')}</p>
    </section>
  </>
}
