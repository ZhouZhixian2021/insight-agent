/** Approved retrieval policies and producer-settled observations. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AcademicHybridRetrievalView, AcademicPlannedSearch } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import css from './RunPanel.module.css'

type Copy = PropsLocale<'academicRun'>

/**
 * Preview approved channels without treating legacy omissions as disabled channels.
 * @param props Approved searches and localized copy.
 * @returns Read-only policies; changes require another plan review.
 */
export function SearchPolicies({ searches, t }: Copy & { readonly searches: readonly AcademicPlannedSearch[] }) {
  return <section aria-label={t('searchDirections')}>
    <p className={css.notice}>{t('discoveryOnly')}</p>
    {searches.map(search => <article key={search.query} className={css.card}>
      <h5>{search.purpose}</h5>
      <p>{t('coveredQuestions')}: {search.questions.join('；')}</p>
      <details><summary>{t('queryExpression')}</summary><pre className={css.markdown}>{search.query}</pre></details>
      {search.retrieval === undefined ? <p>{t('legacyPolicy')}</p> : <dl className={css.stats}>
        <div><dt>{t('channels')}</dt><dd>{search.retrieval.channels.map(channel => t(channel)).join(' / ')}</dd></div>
        <div><dt>{t('directProviders')}</dt><dd>{search.retrieval.academicProviders.join(', ') || t('noneApproved')}</dd></div>
        <div><dt>{t('verificationProviders')}</dt><dd>{search.retrieval.verificationProviders.join(', ') || t('noneApproved')}</dd></div>
        <div><dt>{t('webLimit')}</dt><dd>{search.retrieval.maximumWebDiscoveryResults}</dd></div>
        <div><dt>{t('verificationLimit')}</dt><dd>{search.retrieval.maximumReferenceVerifications}</dd></div>
      </dl>}
    </article>)}
  </section>
}

/**
 * Render terminal observations with distinct URL, reference and work units.
 * @param props Optional formal projection and localized copy.
 * @returns Observed stages and details, or an explicit unavailable notice.
 */
export function HybridRetrieval({ value, t }: Copy & { readonly value: AcademicHybridRetrievalView | undefined }) {
  if (value === undefined) return <section><h3>{t('hybrid')}</h3><p>{t('hybridUnavailable')}</p></section>
  const stages = ['academicSearch', 'webDiscovery', 'referenceIdentification', 'referenceVerification', 'deduplication'] as const
  const counts = ['academicDiscoveredRecords', 'webDiscoveredUrls', 'identifiedReferences', 'attemptedVerifications',
    'verifiedReferences', 'failedVerifications', 'discardedWebCandidates', 'mergedDuplicates', 'deduplicatedWorks'] as const
  return <section aria-label={t('hybrid')}>
    <h3>{t('hybrid')}</h3><p>{t('settledStages')}</p>
    <dl className={css.stats}>{stages.map(key => <div key={key}><dt>{t(key)}</dt><dd>{t(value.stages[key])}</dd></div>)}</dl>
    <dl className={css.stats}>{counts.map(key => <div key={key}><dt>{t(key)}</dt><dd>{value.counts[key]}</dd></div>)}</dl>
    <p className={css.notice}>{t('referenceUnits')}</p>
    <h4>{t('webCandidates')}</h4>
    {value.webCandidates.length === 0 ? <p>{t('noCandidates')}</p> : <ul>{value.webCandidates.map((candidate, index) => <li key={index}>
      <strong>{t(candidate.status)}</strong> · {candidate.title ?? t('untitledCandidate')}
      <p><SourceLink url={candidate.url} /></p>
      <p>{t('queryExpression')}: {candidate.query ?? t('queryUnavailable')}</p>
      <p>{t('identifiedReferences')}: {candidate.identifiedReferenceCount}</p>
      {candidate.message !== null && <p>{candidate.message}</p>}
    </li>)}</ul>}
    <h4>{t('referenceResults')}</h4>
    {value.references.length === 0 ? <p>{t('noReferences')}</p> : <ul>{value.references.map((reference, index) => <li key={index}>
      <strong>{t(reference.status)}</strong> · {reference.kind} · {reference.normalizedValue}
      <p>{t('verificationProvider')}: {reference.verificationProvider ?? t('notVerified')}</p>
      <p>{t('queryExpression')}: {reference.query ?? t('queryUnavailable')}</p>
      <p><SourceLink url={reference.discoveryUrl} /></p>
      {reference.message !== null && <p>{reference.message}</p>}
    </li>)}</ul>}
    <p>{t('discoveryOnly')}</p>
  </section>
}

function SourceLink({ url }: { readonly url: string }) {
  return /^https?:\/\//iu.test(url) ? <a href={url} target="_blank" rel="noopener noreferrer">{url}</a> : <span>{url}</span>
}
