/** Project settled hybrid observations without exposing raw Web snippets, answers or errors. */
import type { HybridRunObservation, HybridSearchStageStatus } from '@deepseek-ai/dsh-academic-workflow'
import type { AcademicReference } from '@deepseek-ai/dsh-academic-source'
import type { AcademicHybridRetrievalView, AcademicReferenceView } from './types.ts'

/**
 * Build the existing browser projection from completed searches and real ingestion facts.
 * @param run - completed query observations, before the aggregate work cap.
 * @returns separate URL, reference, attempt and work counts, with safe per-query details.
 */
export function hybridRetrievalView(run: HybridRunObservation): AcademicHybridRetrievalView {
  const observations = run.queries.map(entry => entry.observation)
  const sum = (field: 'academicDiscoveredRecords' | 'webDiscoveredUrls' | 'identifiedReferences'
    | 'attemptedVerifications' | 'verifiedReferences' | 'failedVerifications' | 'discardedWebCandidates') =>
    observations.reduce((total, value) => total + value[field], 0)
  const references: AcademicReferenceView[] = []
  for (const { query, observation } of run.queries) {
    const outcomes = new Map(observation.verificationOutcomes.map((outcome, index) => [
      referenceKey(outcome.status === 'verified' ? outcome.value.reference : outcome.failure.reference), { outcome, index },
    ]))
    const skipped = new Map(observation.skippedReferences.map(entry => [referenceKey(entry.reference), entry.reason]))
    const seen = new Set<string>()
    for (const { result } of observation.identifications) {
      for (const reference of result.references) {
        const key = referenceKey(reference)
        const repeated = seen.has(key)
        seen.add(key)
        const settled = repeated ? undefined : outcomes.get(key)
        const outcome = settled?.outcome
        let status: AcademicReferenceView['status'] = 'identified'
        let verificationProvider: string | null = null
        let message: string | null = repeated ? 'Repeated reference in this query; no additional verification was started.'
          : skipped.get(key) === 'provider_not_approved' ? 'The required verification provider was not approved.'
            : skipped.get(key) === 'verification_limit' ? 'The approved verification attempt limit was reached.' : null
        if (outcome?.status === 'failed') {
          status = 'verification_failed'
          verificationProvider = outcome.failure.verificationProvider
          message = `Reference verification failed (${outcome.failure.category}).`
        } else if (outcome?.status === 'verified') {
          verificationProvider = outcome.value.verificationProvider
          const retained = settled !== undefined && observation.retainedVerificationIndexes.includes(settled.index)
          status = retained && run.mergedRecords.includes(outcome.value.work) ? 'merged_duplicate' : 'verified'
          message = !retained
            ? 'Verified, but omitted by the per-query result limit before ingestion.'
            : status === 'merged_duplicate' ? 'Ingestion grouped this record with another record by exact scholarly identifiers.' : null
        }
        references.push({ query, kind: reference.kind === 'provider_record' ? reference.provider : reference.kind,
          normalizedValue: reference.kind === 'provider_record'
            ? reference.provider === 'cvf' ? safeDiscoveryUrl(reference.recordId) : reference.recordId : reference.normalizedValue,
          discoveryUrl: safeDiscoveryUrl(reference.discoveryUrl), verificationProvider, status, message })
      }
    }
  }
  return { schemaVersion: 1,
    stages: {
      academicSearch: combine(observations.map(value => value.stages.academicSearch)),
      webDiscovery: combine(observations.map(value => value.stages.webDiscovery)),
      referenceIdentification: combine(observations.map(value => value.stages.referenceIdentification)),
      referenceVerification: combine(observations.map(value => value.stages.referenceVerification)),
      deduplication: run.returnedRecords.length === 0 ? 'not_run' : 'success',
    },
    counts: { academicDiscoveredRecords: sum('academicDiscoveredRecords'), webDiscoveredUrls: sum('webDiscoveredUrls'),
      identifiedReferences: sum('identifiedReferences'), attemptedVerifications: sum('attemptedVerifications'),
      verifiedReferences: sum('verifiedReferences'), failedVerifications: sum('failedVerifications'),
      discardedWebCandidates: sum('discardedWebCandidates'), mergedDuplicates: run.mergedDuplicates,
      deduplicatedWorks: run.deduplicatedWorks },
    webCandidates: run.queries.flatMap(({ query, observation }) => observation.identifications.map(({ candidate, result }) => ({
      query, url: safeDiscoveryUrl(candidate.url), title: candidate.title ?? null,
      status: result.status === 'identified' ? 'references_identified' as const : 'discarded_non_paper' as const,
      identifiedReferenceCount: result.references.length,
      message: result.issues.length === 0 ? null : `Reference identification: ${result.issues.map(issue => issue.code).join(', ')}.`,
    }))), references }
}

function referenceKey(reference: AcademicReference): string {
  return reference.kind === 'provider_record' ? `${reference.provider}:${reference.recordId}`
    : `${reference.kind}:${reference.normalizedValue}`
}

function combine(stages: readonly HybridSearchStageStatus[]): HybridSearchStageStatus {
  const ran = stages.filter(stage => stage !== 'not_run')
  if (ran.length === 0) return 'not_run'
  if (ran.every(stage => stage === 'success')) return 'success'
  if (ran.every(stage => stage === 'failed')) return 'failed'
  return 'partial_success'
}

function safeDiscoveryUrl(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { return '' }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  return url.href
}
