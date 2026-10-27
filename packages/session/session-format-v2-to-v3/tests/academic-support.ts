/** In-memory synthetic event histories shared by the two incoming-edge tests. */
import type { SessionFormatEvent, SessionFormatJsonObject } from '@deepseek-ai/dsh-session-format'
import { SessionFormatEventCollector } from '@deepseek-ai/dsh-session-format'
import { sessionFormatV2ToV3 } from '../src/index.ts'
import { academicSamples } from './academic-samples.ts'

export const academicHeader = { version: 2, id: 'session:code:retained', createdAt: 1, isSeeded: false, delegationDepth: 0 }

export function academicEvent(type: string, seq: number, data = structuredClone(academicSamples[type]!)): SessionFormatEvent {
  return { type, seq, time: seq + 1, data }
}

export function backgroundReportEvent(category?: string): SessionFormatEvent {
  return academicEvent('academic/background-run-state', 0, {
    ...structuredClone(academicSamples['academic/background-run-state']!), state: 'completed',
    retrievalRunId: 'retained:retrievalRunId',
    result: {
      synthesis: { status: 'completed', reasons: [] }, sessionId: 'retained:sessionId', status: 'completed', q6: null,
      stages: { search: 'success', fulltext: 'success', extraction: 'success' },
      retrievalRun: {
        schemaVersion: 1, retrievalRunId: 'retained:retrievalRunId', researchBriefId: 'retained:researchBriefId',
        researchBriefVersion: 1, startedAt: 'retained:startedAt', completedAt: 'retained:completedAt',
        queries: [], providers: [], academicWorkIds: [], failures: [], stage: 'completed', status: 'success',
        coverageSummary: {
          schemaVersion: 1, discoveredRecords: 0, deduplicatedWorks: 0, includedWorks: 0, availableFulltextWorks: 0,
          abstractOnlyWorks: 0, metadataOnlyWorks: 0, failedOperations: 0, truncated: false,
          limitations: [], providerBreakdown: null,
        },
      },
      papers: [], failures: [],
      report: {
        title: 'retained:title', mode: 'draft', synthetic: true, markdown: 'retained markdown',
        evaluation: { status: 'needs_review', assessments: [], issues: [{ claimId: null,
          ...category === undefined ? {} : { category }, code: 'retained:issue', message: 'retained issue' }] },
        claims: [], evidence: [], limitations: ['retained limitation'],
      },
    },
  })
}

export function migrateAcademicV2(events: readonly SessionFormatEvent[], seeded = false) {
  const sourceHeader = { ...academicHeader, isSeeded: seeded }
  const stage = sessionFormatV2ToV3.createStage({ sourceHeader,
    targetHeader: sessionFormatV2ToV3.migrateHeader(sourceHeader), sourceInheritedEventCount: undefined, sourceKind: 'decoded' })
  const output = new SessionFormatEventCollector()
  for (const event of events) stage.transformEvent(event, output)
  return { events: output.values, cut: stage.finish(output) }
}

export function semanticSelection(): SessionFormatJsonObject {
  const data = academicSamples['academic/candidate-review-selection-v1']!
  const identity = academicSamples['academic/candidate-semantic-review-request-v1']!
  return { ...data, selection: { schemaVersion: 1, maximumModelReviews: 1, attemptedBefore: 0, remainingBudget: 1,
    decisions: [{ academicWorkId: identity['academicWorkId']!, workVersionId: identity['workVersionId']!,
      routedQuestions: [], status: 'selected', selectionOrder: 0, selectionReason: 'lexical_fill' }] } }
}

export function referenceHistory(): SessionFormatEvent[] {
  return [
    academicEvent('academic/candidate-review-selection-v1', 0, semanticSelection()),
    academicEvent('academic/candidate-semantic-review-request-v1', 1,
      { ...academicSamples['academic/candidate-semantic-review-request-v1']!, selectionSeq: 0 }),
    academicEvent('academic/candidate-semantic-review-result-v1', 2,
      { ...academicSamples['academic/candidate-semantic-review-result-v1']!, selectionSeq: 0, requestSeq: 1 }),
    academicEvent('academic/candidate-semantic-review-verified-v1', 3,
      { ...academicSamples['academic/candidate-semantic-review-verified-v1']!, selectionSeq: 0, requestSeq: 1 }),
    academicEvent('academic/evidence-request', 4),
    academicEvent('academic/evidence-result', 5, { ...academicSamples['academic/evidence-result']!, requestSeq: 4 }),
    academicEvent('academic/synthesis-request', 6),
    academicEvent('academic/synthesis-result', 7, { ...academicSamples['academic/synthesis-result']!, requestSeq: 6 }),
    academicEvent('academic/candidate-screening-request', 8),
    academicEvent('academic/candidate-screening-result', 9, { ...academicSamples['academic/candidate-screening-result']!, requestSeq: 8 }),
  ]
}

export const academicReferencePositions = [
  { index: 1, field: 'selectionSeq' }, { index: 2, field: 'selectionSeq' }, { index: 2, field: 'requestSeq' },
  { index: 3, field: 'selectionSeq' }, { index: 3, field: 'requestSeq' },
  { index: 5, field: 'requestSeq' }, { index: 7, field: 'requestSeq' }, { index: 9, field: 'requestSeq' },
] as const
