/** Render producer facts without inferring progress, coverage or semantic approval. */
import { useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { RunView } from './run-types.ts'
import type { AcademicPlannedSearch, AcademicResearchRunValue } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import css from './RunPanel.module.css'
import { HybridRetrieval } from './HybridRetrieval.tsx'
import { reportWithRetrieval } from './retrieval-report.ts'

type Copy = PropsLocale<'academicRun'>

/** Presentation props; the caller owns request execution and cancellation. */
export type RunPanelProps = Copy & {
  readonly view: RunView
  readonly onCancel: () => void
  readonly plannedSearches?: readonly AcademicPlannedSearch[] | undefined
}

/**
 * Show a request or settled result, preserving the three independent status dimensions.
 * @param props Explicit view, localized copy and caller-owned cancel action.
 * @returns The running, error or settled content.
 */
export function RunPanel({ view, onCancel, t, plannedSearches }: RunPanelProps) {
  if (view.phase === 'running') return <section aria-busy="true">
    <p role="status">{t('running')}</p><p>{t('waiting')}</p>
    <button type="button" disabled={view.cancelling} onClick={onCancel}>{t(view.cancelling ? 'cancelling' : 'cancel')}</button>
  </section>
  if (view.phase === 'error') return <section role="alert"><h3>{t('error')}</h3><p>{view.message}</p></section>
  return <SettledRun value={view.value} t={t} plannedSearches={plannedSearches} />
}

function Lines({ values, empty }: { readonly values: readonly string[]; readonly empty: string }) {
  return values.length === 0 ? <p>{empty}</p> : <ul>{values.map((value, index) => <li key={index}>{value}</li>)}</ul>
}

function SettledRun({ value, t, plannedSearches }: Copy & {
  readonly value: AcademicResearchRunValue
  readonly plannedSearches: readonly AcademicPlannedSearch[] | undefined
}) {
  const { retrievalRun: run } = value
  const report = reportWithRetrieval(value, t, plannedSearches)
  const coverage = run.coverageSummary
  const counts = ['discoveredRecords', 'deduplicatedWorks', 'includedWorks', 'availableFulltextWorks',
    'abstractOnlyWorks', 'metadataOnlyWorks', 'failedOperations'] as const
  return <div className={css.page}>
    <dl className={css.stats} aria-label={t('runStatus')}>
      <div><dt>{t('runStatus')}</dt><dd>{t(value.status)}</dd></div>
      <div><dt>{t('processingStatus')}</dt><dd>{run.status === null ? t('running') : t(run.status)}</dd></div>
      <div><dt>{t('searchStage')}</dt><dd>{t(value.stages.search)}</dd></div>
      <div><dt>{t('fulltextStage')}</dt><dd>{t(value.stages.fulltext)}</dd></div>
      <div><dt>{t('extractionStage')}</dt><dd>{t(value.stages.extraction)}</dd></div>
      <div><dt>{t('synthesisStage')}</dt><dd>{t(value.synthesis.status)}</dd></div>
      <div><dt>{t('quality')}</dt><dd>{report === null ? t('noReport') : t(report.evaluation.status)}</dd></div>
    </dl>
    <p className={css.notice}>{t('reviewNotice')}</p>
    <HybridRetrieval value={value.hybridRetrieval} t={t} />
    {value.synthesis.reasons.length > 0 && <section><h3>{t('synthesisStage')}</h3>
      <Lines values={value.synthesis.reasons} empty={t('noLimits')} /></section>}
    <section><h3>{t('coverage')}</h3>
      <dl className={css.stats}>{counts.map(key => <div key={key}><dt>{t(key)}</dt><dd>{coverage[key]}</dd></div>)}</dl>
      <p>{t('providers')}: {run.providers.join(', ')}</p><p>{t('noBreakdown')}</p>
      <p>{t(coverage.truncated ? 'truncated' : 'notTruncated')}</p>
      <h4>{t('limits')}</h4><Lines values={coverage.limitations} empty={t('noLimits')} />
    </section>
    <section><h3>{t('sourceFailures')}</h3>
      {run.failures.length === 0 ? <p>{t('noFailures')}</p> : <ul>{run.failures.map(failure => <li key={failure.failureId}>
        <strong>{failure.provider}</strong> · {failure.operation} · {failure.category}<p>{failure.message}</p>
        <p>{t(failure.retryable ? 'retryable' : 'notRetryable')}</p>
        {failure.retryAfter !== null && <p>{t('retryAfter')}: {failure.retryAfter}</p>}
      </li>)}</ul>}
      <h4>{t('paperFailures')}</h4>
      {value.failures.length === 0 ? <p>{t('noFailures')}</p> : <ul>{value.failures.map((failure, index) =>
        <li key={index}>{failure.workVersionId} · {failure.stage}</li>)}</ul>}
    </section>
    <section><h3>{t('papers')}</h3>
      {value.papers.length === 0 ? <p>{t('emptyPapers')}</p> : <ul>{value.papers.map(paper => <li key={paper.workVersionId}>
        <strong>{t(paper.status)}</strong> · {paper.workVersionId}
        {paper.status === 'paused' || paper.status === 'excluded' ? <p>{paper.reason}</p> : <>
          <p>{t('evidenceCount')}: {paper.evidenceCount}</p>
          {paper.rejectedDrafts.length > 0 && <><p>{t('rejectedEvidence')}: {paper.rejectedDrafts.length}</p>
            <ul>{paper.rejectedDrafts.map(rejection => <li key={rejection.draftIndex}>
              {t('evidenceItem')} {rejection.draftIndex + 1} · {t(rejection.code)}
            </li>)}</ul></>}
        </>}
      </li>)}</ul>}
    </section>
    {report === null ? <p>{t('noReport')}</p> : <ReportView report={report} t={t} />}
  </div>
}

/**
 * Download exactly the returned Markdown; the caller decides whether it is a draft.
 * @param markdown Producer-owned report text.
 */
export function downloadMarkdown(markdown: string): void {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'academic-report.md'
  anchor.click()
  setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
}

function ReportView({ report, t }: Copy & { readonly report: NonNullable<AcademicResearchRunValue['report']> }) {
  const [query, setQuery] = useState('')
  const [openedEvidence, setOpenedEvidence] = useState<string | null>(null)
  const matches = (text: string) => text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  const claims = report.claims.filter(claim => matches(`${claim.text} ${claim.scope} ${claim.claimId}`))
  const evidence = report.evidence.filter(record => matches(`${record.evidenceId} ${record.sourcedStatement} ${record.sourceProvider} ${record.verbatimExcerpt.status === 'available' ? record.verbatimExcerpt.value : ''}`))
  return <section><h3>{t('report')}: {report.title}</h3>
    {report.mode === 'draft' && report.evaluation.issues.some(issue => issue.code === 'insufficient_coverage')
      && <p role="note">{t('limitedDraft')}</p>}
    <p>{t(report.mode)} · {t(report.evaluation.status)} {report.synthetic && <strong>· {t('synthetic')}</strong>}</p>
    <button type="button" onClick={() => { downloadMarkdown(report.markdown) }}>{t('download')}</button>
    <h4>{t('issues')}</h4><Lines values={report.evaluation.issues.map(issue => `${issue.claimId === null ? '' : `${issue.claimId}: `}${issue.code} — ${issue.message}`)} empty={t('noIssues')} />
    <h4>{t('assessments')}</h4><p>{t('reviewMethodNotice')}</p>
    {report.evaluation.assessments.length === 0 ? <p>{t('noAssessments')}</p> : <ul>{report.evaluation.assessments.map(assessment => <li key={assessment.claimAssessmentId}>
      {assessment.claimId} · {t(assessment.status)}<p>{assessment.reason}</p>
      <p>{t('method')}: {assessment.method} · {assessment.methodVersion} · {assessment.assessedAt}</p>
    </li>)}</ul>}
    <h4>{t('claims')}</h4>
    <label>{t('search')}<input type="search" value={query} onChange={(event) => { setQuery(event.target.value) }} /></label>
    {claims.length === 0 && evidence.length === 0 && <p>{t('noMatches')}</p>}
    {report.claims.length === 0 && <p>{t('noClaims')}</p>}
    {claims.map(claim => <article key={claim.claimId} className={css.card}>
      <h5>{claim.text}</h5><p>{t('scope')}: {claim.scope}</p>
      <p>{t('validity')}: {t(claim.validity)}</p><p>{t('confidence')}: {t(claim.confidence)}</p>
      <Lines values={claim.confidenceReasons} empty={t('insufficient')} />
      {claim.uncertainty !== null && <p>{t('uncertainty')}: {claim.uncertainty}</p>}
      <ul>{claim.evidenceSnapshot.evidenceItems.map((item) => {
        const found = report.evidence.some(record => record.evidenceId === item.evidenceId)
        return <li key={item.evidenceId}>{found ? <a href={`#academic-evidence-${item.evidenceId}`} onClick={() => {
          setQuery('')
          setOpenedEvidence(item.evidenceId)
        }}>{t('evidence')}: {item.evidenceId}</a> : <span>{t('missingEvidence')}: {item.evidenceId}</span>}</li>
      })}</ul>
    </article>)}
    <h4>{t('evidence')}</h4>{report.evidence.length === 0 && <p>{t('noEvidence')}</p>}
    {evidence.map(record => <details key={record.evidenceId} id={`academic-evidence-${record.evidenceId}`} open={openedEvidence === record.evidenceId ? true : undefined} className={css.card}>
      <summary>{record.evidenceId} · {t(record.level)}</summary><p>{record.sourcedStatement}</p>
      {record.verbatimExcerpt.status === 'available' ? <blockquote>{record.verbatimExcerpt.value}</blockquote> : <p>{t('excerptUnavailable')}</p>}
      <p>{t('source')}: {record.sourceProvider} · {/^(https?):\/\//i.test(record.sourceUrl)
        ? <a href={record.sourceUrl} target="_blank" rel="noopener noreferrer">{record.sourceUrl}</a> : record.sourceUrl}</p>
      <p>{t('version')}: {record.workVersionId}</p><p>{t('locator')}: {record.sourceLocatorId}</p>
      <p>{t('retrievedAt')}: {record.retrievedAt}</p>
      {record.qualityNotes.length > 0 && <><h5>{t('qualityNotes')}</h5><Lines values={record.qualityNotes} empty={t('noIssues')} /></>}
    </details>)}
    <h4>{t('reportLimits')}</h4><Lines values={report.limitations} empty={t('noLimits')} />
    <details><summary>{t('markdown')}</summary><pre className={css.markdown}>{report.markdown}</pre></details>
  </section>
}
