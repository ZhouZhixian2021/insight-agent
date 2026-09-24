/** Retain completed hybrid queries beside the ingestion decisions that actually ran. */
import { dedupKeys, type IngestOutcome } from '@deepseek-ai/dsh-academic-ingestion'
import type { AcademicSourceWork } from '@deepseek-ai/dsh-academic-source'
import type { HybridSearchObservation } from './hybrid-search.ts'
import type { DraftSearchResult } from './pipeline-types.ts'

/** Internal facts for browser projection; raw Web text must not be returned directly. */
export interface HybridRunObservation {
  readonly queries: readonly { readonly query: string; readonly observation: HybridSearchObservation }[]
  /** Records admitted to ingestion before the run-wide work cap. */
  readonly returnedRecords: readonly AcademicSourceWork[]
  /** Input records belonging to an exact-identifier group with more than one record. */
  readonly mergedRecords: readonly AcademicSourceWork[]
  readonly mergedDuplicates: number
  readonly deduplicatedWorks: number
}

/**
 * Retain query observations and count work merges from the complete ingestion result.
 * @param results - completed queries and their source batches, after per-query bounds.
 * @param ingested - ingestion before the aggregate candidate-work bound.
 * @returns hybrid facts, or undefined for a run with no completed hybrid search.
 */
export function collectHybridRun(
  results: readonly (DraftSearchResult & { readonly query: string })[], ingested: IngestOutcome,
): HybridRunObservation | undefined {
  const observations = results.flatMap(result => result.hybridObservation === undefined ? []
    : [{ query: result.query, observation: result.hybridObservation }])
  if (observations.length === 0) return undefined
  const returnedRecords = results.flatMap(result => result.hybridObservation?.admittedRecords ?? result.batch.items)
  const groups = new Map<string, AcademicSourceWork[]>()
  for (const record of returnedRecords) {
    const id = dedupKeys(record.academicWork).exact.map(key => ingested.index.byExactKey.get(key))
      .find(value => value !== undefined)
    // No exact key means ingestion did not merge this record by title similarity.
    if (id === undefined) continue
    const group = groups.get(id) ?? []
    group.push(record)
    groups.set(id, group)
  }
  return { queries: observations, returnedRecords,
    mergedRecords: [...groups.values()].filter(group => group.length > 1).flat(),
    mergedDuplicates: returnedRecords.length - ingested.works.length,
    deduplicatedWorks: ingested.works.length }
}
