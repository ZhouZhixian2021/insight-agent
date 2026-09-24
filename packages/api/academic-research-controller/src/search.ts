/** Adapt approved plan searches to Session-owned Academic and DSH Web services. */
import { identifyAcademicReferences, type AcademicSourceRuntime } from '@deepseek-ai/dsh-academic-source'
import { executeHybridSearch, type DraftPipelineAdapters } from '@deepseek-ai/dsh-academic-workflow'
import type { WebRuntime } from '@deepseek-ai/dsh-web'
import type { AcademicPlannedSearch } from './types.ts'

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
