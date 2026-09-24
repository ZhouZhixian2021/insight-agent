/** Adapt the formal Remote projection to the report's localized disclosure renderer. */
import type { RetrievalDisclosure } from '@deepseek-ai/dsh-academic-report'
import type { AcademicPlannedSearch, AcademicResearchRunValue } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * Preserve the server report and append actual retrieval facts for display and export.
 * @param value Settled server result.
 * @param t Localized presentation labels.
 * @param searches Approved policies from the same request's plan preview, when available.
 * @returns A display report, or null when the server produced none; quality is unchanged.
 */
export function reportWithRetrieval(
  value: AcademicResearchRunValue, t: PropsLocale<'academicRun'>['t'], searches?: readonly AcademicPlannedSearch[],
): AcademicResearchRunValue['report'] {
  if (value.report === null) return null
  const hybrid = value.hybridRetrieval
  const coverage = value.retrievalRun.coverageSummary
  const counts = ['academicDiscoveredRecords', 'webDiscoveredUrls', 'identifiedReferences', 'attemptedVerifications',
    'verifiedReferences', 'failedVerifications', 'discardedWebCandidates', 'mergedDuplicates', 'deduplicatedWorks'] as const
  const stages = ['academicSearch', 'webDiscovery', 'referenceIdentification', 'referenceVerification', 'deduplication'] as const
  const observations = hybrid === undefined ? [{ label: t('hybrid'), value: t('hybridUnavailable') }] : [
    ...stages.map(key => ({ label: t(key), value: t(hybrid.stages[key]) })),
    ...counts.map(key => ({ label: t(key), value: hybrid.counts[key] })),
    { label: t('verificationProvider'), value: [...new Set(hybrid.references.flatMap(item => item.verificationProvider === null ? [] : [item.verificationProvider]))].join(', ') || t('notVerified') },
  ]
  const disclosure: RetrievalDisclosure = {
    title: t('retrievalAppendix'), observations: [...observations,
      { label: t('providers'), value: value.retrievalRun.providers.join(', ') },
      { label: t('availableFulltextWorks'), value: coverage.availableFulltextWorks },
      { label: t('includedWorks'), value: coverage.includedWorks },
    ], scopeNotice: `${t('discoveryOnly')} ${t('coverageNotProven')}`,
    limitations: [t(coverage.truncated ? 'truncated' : 'notTruncated'), ...coverage.limitations,
      ...(searches ?? []).map(search => search.retrieval === undefined ? t('legacyPolicy')
        : `${search.query} — ${t('channels')}: ${search.retrieval.channels.map(channel => t(channel)).join(', ')}; ${t('webLimit')}: ${search.retrieval.maximumWebDiscoveryResults}; ${t('verificationLimit')}: ${search.retrieval.maximumReferenceVerifications}`),
    ],
    failures: [...value.retrievalRun.failures.map(item => `${item.provider}: ${item.category} — ${item.message}`),
      ...value.failures.map(item => `${item.workVersionId}: ${item.stage}`)],
  }
  // Browser bundles cannot import host report execution; only localized disclosure text is rendered here.
  const escape = (text: string) => text.replaceAll('\\', '\\\\').replace(/([`*_{}\[\]<>#|])/gu, '\\$1').replace(/\r?\n/gu, ' ')
  const rows = [...disclosure.observations.map(row => `${row.label}: ${row.value}`), ...disclosure.limitations, ...disclosure.failures]
  const markdown = `${value.report.markdown}\n\n## ${escape(disclosure.title)}\n\n${escape(disclosure.scopeNotice)}\n\n${rows.map(row => `- ${escape(row)}`).join('\n')}\n`
  return { ...value.report, markdown }
}
