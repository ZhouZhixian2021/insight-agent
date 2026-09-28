/** Adapt approved plan searches to Session-owned Academic and DSH Web services. */
import { identifyAcademicReferences, type AcademicSourceRuntime, type AcademicSourceFullText } from '@deepseek-ai/dsh-academic-source'
import { executeHybridSearch, selectResearchPapers, type DraftPipelineAdapters } from '@deepseek-ai/dsh-academic-workflow'
import type { WebRuntime } from '@deepseek-ai/dsh-web'
import type { AcademicPlannedSearch } from './types.ts'

/**
 * Keep verified full-text candidates beside their owning source records for this run.
 * @param searches Approved query policies.
 * @param academicSource Session-owned source runtime, also used for direct-search candidates.
 * @param web Session-owned Web discovery runtime.
 * @returns Search and selection operations sharing only this run's verified resolution results.
 */
export function approvedPaperAdapters(
  searches: readonly AcademicPlannedSearch[], academicSource: AcademicSourceRuntime, web: WebRuntime,
): Pick<DraftPipelineAdapters, 'search' | 'selectPapers'> {
  const search = approvedSearchAdapter(searches, academicSource, web)
  const resolutions = new Map<string, AcademicSourceFullText | null>()
  const key = (provider: string, recordId: string) => JSON.stringify([provider, recordId])
  return {
    search: async (request, signal) => {
      const result = await search(request, signal)
      for (const outcome of result.hybridObservation?.verificationOutcomes ?? []) {
        if (outcome.status !== 'verified') continue
        for (const record of outcome.value.work.workVersion.sourceRecords) {
          if (record.provider !== outcome.value.verificationProvider) continue
          const identity = key(record.provider, record.recordId)
          if (resolutions.get(identity) == null) resolutions.set(identity, outcome.value.fullText)
        }
      }
      return result
    },
    selectPapers: (ingested, brief) => selectResearchPapers(ingested, brief, (_work, version) => {
      for (const record of version.sourceRecords) {
        const identity = key(record.provider, record.recordId)
        const resolved = resolutions.get(identity)
        const fullText = resolved === undefined ? academicSource.resolveFullText({ ...version, sourceRecords: [record] }) : resolved
        if (fullText !== null) return { ...fullText,
          extractionMethod: { method: 'dsh-academic-evidence', methodVersion: '1' }, hasHistoricalEvidence: false }
      }
      return null
    }),
  }
}

/**
 * Bind source execution to the exact queries and policies from the approved Session plan.
 * @param searches - reviewed expressions and optional version-3 policies.
 * @param academicSource - Session-owned scholarly search and verification service.
 * @param web - Session-owned Web discovery service; generated answers are discarded.
 * @returns a pipeline search operation forwarding its candidate bound and cancellation signal.
 */
export function approvedSearchAdapter(
  searches: readonly AcademicPlannedSearch[],
  academicSource: AcademicSourceRuntime,
  web: WebRuntime,
): DraftPipelineAdapters['search'] {
  const approvedSearches = new Map(searches.map(search => [search.query, search]))
  return async (search, operationSignal) => {
    const approved = approvedSearches.get(search.query)
    if (approved === undefined) throw new Error('Search expression is not in the approved plan.')
    if (approved.retrieval === undefined) return academicSource.searchAll(search, operationSignal)
    const result = await executeHybridSearch(search, approved.retrieval, {
      searchAcademic: (request, providers, signal) => academicSource.searchProviders(request, providers, signal),
      searchWeb: async (request, signal) => {
        const result = await web.search(request, signal)
        return { candidates: result.sources, truncated: result.truncated }
      },
      identifyReferences: identifyAcademicReferences,
      verifyReference: (reference, provider, signal) => academicSource.verifyReference(reference, [provider], signal),
    }, operationSignal)
    return { ...result.search, hybridObservation: result.observation }
  }
}
