/** Read-only second-tier view derived from durable Session selection and verification facts. */
import type { AcademicEvidenceEnhancementRequest } from '@deepseek-ai/dsh-api-academic-research-controller/types'

/** A run is scoped by both its Session and retrieval identity. */
export type EnhancementKey = Pick<AcademicEvidenceEnhancementRequest, 'sessionId' | 'retrievalRunId'>
/** Display-only excerpts retain source identities; this is not a replacement evidence record. */
export interface EnhancementHistory {
  readonly workVersionId: string
  readonly selectedAt: string
  readonly status: 'unsettled' | 'completed' | 'partial_success' | 'failed' | 'cancelled'
  readonly addedEvidenceRecords: number | null
  readonly incompleteFragments: number | null
  readonly excerpts: readonly { readonly evidenceId: string
    readonly workVersionId: string
    readonly statement: string
    readonly excerpt: string | null
    readonly locator: string
    readonly level: string }[]
}
/** Browser journal envelope; untrusted event payloads are checked before display. */
export interface EnhancementJournalEntry {
  readonly event: { readonly type: string; readonly seq: number; readonly data: unknown }
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid enhancement journal object')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('Invalid enhancement journal text')
  return value
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid enhancement count')
  return value
}
/**
 * Read the selected run only, bounded by its selection and settlement sequences.
 * @param entries Complete Session history obtained from the existing Session Remote.
 * @param key Requested Session/run identity; the caller verifies the Session snapshot header.
 * @returns Persisted selection, terminal counts and verified supplemental excerpts, or no selection.
 */
export function projectEnhancement(entries: readonly EnhancementJournalEntry[], key: EnhancementKey): EnhancementHistory | null {
  const ordered = [...entries].sort((a, b) => a.event.seq - b.event.seq)
  const selections = ordered.filter(entry => entry.event.type === 'academic/evidence-enhancement-selection'
    && object(entry.event.data).retrievalRunId === key.retrievalRunId)
  if (selections.length === 0) return null
  if (selections.length !== 1) throw new Error('Ambiguous enhancement selection')
  const selection = selections[0] as EnhancementJournalEntry, data = object(selection.event.data)
  const workVersionId = text(data.workVersionId), selectedAt = text(data.selectedAt)
  const terminal = ordered.find(entry => entry.event.seq > selection.event.seq
    && entry.event.type === 'academic/evidence-enhancement-settlement'
    && object(entry.event.data).retrievalRunId === key.retrievalRunId
    && object(entry.event.data).workVersionId === workVersionId && object(entry.event.data).selectedAt === selectedAt)
  const nextSelection = ordered.find(entry => entry.event.seq > selection.event.seq
    && entry.event.type === 'academic/evidence-enhancement-selection')
  const settled = terminal === undefined ? null : object(terminal.event.data)
  const status = settled === null ? 'unsettled' : text(settled.status)
  if (!['unsettled', 'completed', 'partial_success', 'failed', 'cancelled'].includes(status)) throw new Error('Invalid enhancement status')
  const excerpts = new Map<string, EnhancementHistory['excerpts'][number]>()
  for (const entry of ordered) {
    if (entry.event.seq <= selection.event.seq || (terminal !== undefined && entry.event.seq >= terminal.event.seq)
      || (nextSelection !== undefined && entry.event.seq >= nextSelection.event.seq)
      || entry.event.type !== 'academic/evidence-fragment-verified') continue
    const fragment = object(entry.event.data)
    if (fragment.purpose !== 'enhancement' || object(fragment.source).workVersionId !== workVersionId) continue
    const records = object(fragment.evidence).evidenceRecords
    if (!Array.isArray(records)) throw new Error('Invalid verified enhancement records')
    for (const value of records) {
      const record = object(value), excerpt = object(record.verbatimExcerpt)
      if (record.workVersionId !== workVersionId) throw new Error('Enhancement version mismatch')
      const evidenceId = text(record.evidenceId), level = text(record.level)
      if (!['metadata', 'abstract', 'fulltext'].includes(level)) throw new Error('Invalid evidence level')
      excerpts.set(evidenceId, { evidenceId, workVersionId, level, statement: text(record.sourcedStatement),
        excerpt: excerpt.status === 'available' ? text(excerpt.value) : null, locator: text(record.sourceLocatorId) })
    }
  }
  return { workVersionId, selectedAt, status: status as EnhancementHistory['status'],
    addedEvidenceRecords: settled === null ? null : count(settled.addedEvidenceRecords),
    incompleteFragments: settled === null ? null : count(settled.incompleteFragments), excerpts: [...excerpts.values()] }
}
