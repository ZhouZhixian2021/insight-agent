import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AcademicResearchRunFrame } from '../src/types.ts'

type ProgressFrame = Extract<AcademicResearchRunFrame, { readonly type: 'progress' }>

interface AcademicResearchProgressSample {
  readonly sampleSchemaVersion: 1
  readonly synthetic: true
  readonly frames: readonly ProgressFrame[]
}

const sample = JSON.parse(readFileSync(new URL(
  '../../../../z-team_docs/interface-samples/academic-model-v1/academic-research-progress-v1.sample.json',
  import.meta.url,
), 'utf8')) as AcademicResearchProgressSample

describe('Academic research progress contract fixture', () => {
  it('uses full monotone snapshots for one run', () => {
    expect(sample.frames.map(frame => frame.progress.sequence)).toEqual([0, 18, 42])
    expect(new Set(sample.frames.map(frame => frame.progress.retrievalRunId))).toEqual(
      new Set(['retrieval-run-progress-1']),
    )
    expect(sample.frames.every(frame => frame.progress.schemaVersion === 1)).toBe(true)
  })

  it('represents overlapping full-text and extraction work without a fabricated percentage', () => {
    const progress = sample.frames[1]?.progress
    expect(progress).toMatchObject({
      primaryStage: 'extraction',
      activeStages: ['fulltext', 'extraction'],
      stages: {
        fulltext: { status: 'running', completedItems: 7, totalItems: 15, unit: 'papers' },
        extraction: { status: 'running', completedItems: 4, totalItems: 15, unit: 'papers' },
      },
    })
    expect(progress).not.toHaveProperty('percent')
    expect(progress?.activities).toHaveLength(3)
  })

  it('represents one provider operation independently from its query', () => {
    expect(sample.frames[0]?.progress.activities).toContainEqual({
      kind: 'provider',
      stage: 'retrieval',
      queryIndex: 1,
      queryCount: 3,
      providerId: 'openalex',
      operation: 'academic_search',
      status: 'running',
      itemIndex: null,
      itemCount: null,
      discoveredRecords: null,
      failureCode: null,
      startedAt: '2026-09-28T01:00:00.000Z',
      completedAt: null,
    })
    expect(sample.frames[0]?.progress.activities).toContainEqual(expect.objectContaining({
      kind: 'provider', providerId: 'web', operation: 'web_discovery', status: 'running',
    }))
  })

  it('keeps one-based batch and retry facts with a sanitized failure code', () => {
    expect(sample.frames[1]?.progress.activities[0]).toEqual({
      kind: 'paper',
      stage: 'extraction',
      academicWorkId: 'academic-work-progress-a',
      workVersionId: 'work-version-progress-a',
      title: 'Synthetic Paper A',
      operation: 'waiting_retry',
      batchIndex: 3,
      batchCount: 6,
      attempt: 1,
      maximumAttempts: 2,
      lastFailure: 'timeout',
      validatedEvidenceRecords: 8,
      rejectedEvidenceDrafts: 2,
      startedAt: '2026-09-28T01:16:30.000Z',
    })
    expect(sample.frames[1]?.progress.latestEvent).toMatchObject({
      code: 'retry_scheduled',
      stage: 'extraction',
      failureCode: 'timeout',
    })
  })

  it('retains earlier partial settlements when report generation starts', () => {
    expect(sample.frames[2]?.progress).toMatchObject({
      primaryStage: 'report',
      activeStages: ['report'],
      stages: {
        retrieval: { status: 'partial_success' },
        fulltext: { status: 'partial_success' },
        extraction: { status: 'partial_success' },
        analysis: { status: 'success' },
        report: { status: 'running' },
      },
      counts: { includedPapers: 9, validatedEvidenceRecords: 36, completedQuestions: 3 },
    })
  })
})
