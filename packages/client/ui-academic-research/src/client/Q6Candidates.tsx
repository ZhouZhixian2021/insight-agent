/** Filters change only the visible subset; producer queue order and scoring remain intact. */
import { useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AcademicCandidateEvaluation } from '@deepseek-ai/dsh-academic-model'
import type { Q6Sample } from './q6-types.ts'
import css from './RunPanel.module.css'

const priorities = ['p0', 'p1', 'p2', 'excluded'] as const
const scores = ['topicRelevance', 'questionMatch', 'evidencePotential', 'methodMatch', 'workTypeFit', 'sourceQuality', 'recency', 'fulltextAvailability'] as const

/**
 * Explain the authoritative queues using shared evaluations and trusted metadata.
 * @param props Synthetic input and localized copy.
 * @returns Read-only priority groups with local search and inspectable reasons.
 */
export function Q6Candidates({ data, t }: PropsLocale<'academicRun'> & { readonly data: Q6Sample }) {
  const [query, setQuery] = useState('')
  const [priority, setPriority] = useState('all')
  const ranking = data.rankingResult
  const evaluations = new Map(ranking.evaluations.map(item => [item.workVersionId, item]))
  const matches = (item: AcademicCandidateEvaluation) => [item.academicWorkId, item.workVersionId, t(`q6_${item.classification}`),
    ...item.decisionReasons, ...item.matchedQuestions].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  const visible = priorities.filter(key => priority === 'all' || priority === key)
  const noMatches = visible.every(key => ranking.queues[key].every((id) => {
    const item = evaluations.get(id)
    return item !== undefined && !matches(item)
  }))
  return <section aria-label={t('q6_candidates')}>
    <h3>{t('q6_candidates')}</h3><p className={css.notice}>{t('q6_candidateNotice')}</p>
    <div className={css.controls}>
      <label>{t('q6_candidateSearch')}<input type="search" value={query} onChange={(e) => { setQuery(e.target.value) }} /></label>
      <label>{t('q6_priorityFilter')}<select value={priority} onChange={(e) => { setPriority(e.target.value) }}>
        <option value="all">{t('q6_allQueues')}</option>{priorities.map(key => <option key={key} value={key}>{t(`q6_${key}`)}</option>)}
      </select></label>
    </div>
    <p>{t('q6_missingTitles')}</p>
    {visible.map(key => <section key={key} aria-label={t(`q6_${key}`)}>
      <h4>{t(`q6_${key}`)} · {ranking.queues[key].length}</h4>
      {ranking.queues[key].length === 0 && <p>{t('q6_emptyQueue')}</p>}
      <ol>{ranking.queues[key].map((id, index) => {
        const item = evaluations.get(id)
        if (item === undefined) return <li key={id}>{id} · {t('q6_missingEvaluation')}</li>
        if (!matches(item)) return null
        const assessment = data.assessments.find(a => a.academicWorkId === item.academicWorkId)
        return <li className={css.card} key={id} value={index + 1}>
          <h5>{item.workVersionId}</h5><p>{item.academicWorkId} · {t(`q6_${item.classification}`)}</p>
          <p>{t('q6_totalScore')}: {item.score.total} · {t('q6_hardFilter')}: {t(`q6_${item.hardFilter.status}`)}</p>
          <p>{t('coveredQuestions')}: {item.matchedQuestions.join('；') || t('q6_none')}</p>
          <ul>{item.decisionReasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
          <ul>{item.hardFilter.reasons.map((reason, i) => <li key={i}>{t(`q6_reason_${reason.code}`)}{reason.detail !== undefined && <> · {reason.detail}</>}</li>)}</ul>
          <p>{t('q6_fulltextFact')}: {t(`q6_${item.fulltextAvailability.status}`)}</p>
          {item.fulltextAvailability.status !== 'resolvable' && <p>{item.fulltextAvailability.reason}</p>}
          <details><summary>{t('q6_details')}</summary>
            <dl className={css.stats}>{scores.map(score => <div key={score}><dt>{t(`q6_score_${score}`)}</dt>
              <dd>{item.score[score]} / {data.plan.rankingPolicy.weights[score]}</dd></div>)}</dl>
            <p>{t('q6_thresholds')}: {(['p0', 'p1', 'p2'] as const).map(p => `${t(`q6_${p}`)} ≥ ${data.plan.rankingPolicy.thresholds[p]}`).join(' · ')}</p>
            <p>{t('q6_diversity')}: {item.diversityTags.join(', ') || t('q6_none')}</p>
            <h5>{t('q6_discoveredBy')}</h5>
            <ul>{item.discoveredBy.map(source => <li key={source}>
              {source} · {data.plan.queries.find(q => q.searchQueryId === source)?.expression ?? t('progressUnknown')}
            </li>)}</ul>
            <h5>{t('q6_abstract')}</h5><p>{assessment === undefined ? t('progressUnknown')
              : assessment.abstract.status === 'available' ? assessment.abstract.value : `${t(`q6_${assessment.abstract.status}`)}: ${assessment.abstract.reason ?? t('progressUnknown')}`}</p>
            <h5>{t('q6_keywords')}</h5><p>{assessment === undefined ? t('progressUnknown')
              : assessment.keywords.status === 'available' ? assessment.keywords.value.join(', ') : `${t(`q6_${assessment.keywords.status}`)}: ${assessment.keywords.reason ?? t('progressUnknown')}`}</p>
          </details>
        </li>
      })}</ol>
    </section>)}
    {noMatches && <p role="status">{t('q6_noMatches')}</p>}
    <h4>{t('limits')}</h4><ul>{ranking.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul>
  </section>
}
