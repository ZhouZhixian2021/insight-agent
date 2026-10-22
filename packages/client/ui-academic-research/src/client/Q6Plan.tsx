/** Read-only explanation of the approved query-planning contract. */
import type { HybridSearchPlan } from '@deepseek-ai/dsh-academic-model'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './RunPanel.module.css'

/**
 * Display query channels and constraints without offering a simulated approval.
 * @param props Shared plan and localized labels.
 * @returns Scope, distinct inclusion targets and channel-specific queries.
 */
export function Q6Plan({ plan, t, demo = true }: PropsLocale<'academicRun'> & { readonly plan: HybridSearchPlan; readonly demo?: boolean }) {
  const c = plan.constraints
  return <section aria-label={t('q6_plan')}>
    <h3>{t('q6_plan')}</h3><p>{plan.researchBriefId} · {t('version')}: {plan.researchBriefVersion}</p>
    <p className={css.notice}>{t(demo ? 'q6_approvalUnknown' : 'q6_boundPlan')}</p>
    <dl className={css.stats}>
      {(['minimum', 'target', 'maximum'] as const).map(key => <div key={key}><dt>{t(`q6_${key}`)}</dt><dd>{plan.inclusionTargets[key]}</dd></div>)}
      <div><dt>{t('q6_roundLimit')}</dt><dd>{plan.maximumSearchRounds}</dd></div>
    </dl>
    <p>{t('q6_dates')}: {c.publicationWindow.start?.iso ?? t('q6_unbounded')} — {c.publicationWindow.end?.iso ?? t('q6_unbounded')}</p>
    <p>{t('q6_dateBasis')}: {t(`q6_${c.publicationWindow.dateBasis}`)}</p>
    <p>{t('q6_workTypes')}: {c.includedWorkTypes.map(type => type === 'preprint' || type === 'accepted_manuscript'
      || type === 'version_of_record' ? t(`q6_${type}`) : type).join(', ')}</p>
    <h4>{t('q6_inclusion')}</h4><ul>{c.inclusionRules.map((rule, i) => <li key={i}>{rule}</li>)}</ul>
    <h4>{t('q6_exclusion')}</h4><ul>{c.exclusionRules.map((rule, i) => <li key={i}>{rule}</li>)}</ul>
    <p>{t('q6_requiredTerms')}: {c.requiredTerms.join(', ') || t('q6_none')}</p>
    <p>{t('q6_excludedTerms')}: {c.excludedTerms.join(', ') || t('q6_none')}</p>
    <h4>{t('q6_queries')}</h4>
    {plan.queries.length === 0 && <p>{t('q6_noQueries')}</p>}
    {plan.queries.map(query => <article className={css.card} key={query.searchQueryId}>
      <h5>{t(`q6_${query.kind}`)} · {t('q6_round')} {query.roundIndex}</h5>
      <p>{t('q6_purpose')}: {t(`q6_${query.purpose}`)}</p><pre className={css.markdown}>{query.expression}</pre>
      <p>{t('coveredQuestions')}: {query.questions.join('；')}</p>
      {query.kind === 'academic' ? <p>{t('directProviders')}: {query.providers.join(', ')}</p>
        : <p>{t('q6_queryLimit')}: {query.maximumResults}{query.kind === 'site_restricted' && <> · {t('q6_site')}: {query.siteHost}</>}</p>}
      <small>{query.searchQueryId}</small>
    </article>)}
    {plan.citationExpansionSeeds.length > 0 && <details><summary>{t('q6_seedPreview')}</summary>
      <p>{t('q6_seedNotice')}</p><ul>{plan.citationExpansionSeeds.map((seed, i) => <li key={i}>
        {seed.workVersionId} · {t(`q6_${seed.direction}`)} · {t('q6_round')} {seed.roundIndex} · {seed.maximumResults}
      </li>)}</ul></details>}
  </section>
}
