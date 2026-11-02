import { describe, expect, it, vi } from 'vitest'
import { createAcademicWorkId, createWorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { EvidenceError, extractEvidenceInFragments, type EvidenceDraft, type EvidenceExtractionInput,
  type EvidenceFragmentAttempt, type EvidenceFragmentOptions, type EvidenceFragmentPolicy } from '../src/index.ts'

const MAXIMUM_CHARACTERS = 3
const THREE_RANGES = ['aaa', 'bbb', 'ccc']

const policy: EvidenceFragmentPolicy = { maximumCharacters: MAXIMUM_CHARACTERS, minimumCharacters: 2, overlapCharacters: 0,
  maximumAttempts: 3, maximumOutputTokens: 512, initialRetryDelayMs: 0, maximumConcurrentDispatches: 1 }

function source(texts: readonly string[], depth: 'minimal' | 'complete' = 'complete'): EvidenceExtractionInput {
  return { depth, academicWorkId: createAcademicWorkId(), workVersionId: createWorkVersionId(),
    sourceProvider: 'fixture', sourceUrl: 'https://example.org/paper', retrievedAt: '2026-11-02T00:00:00Z',
    contentHash: 'sha256:fixture', extractionMethod: { method: 'fixture', methodVersion: '1' },
    focusQuestions: ['Which fact?'], segments: texts.map((text, index) => ({
      text, locator: { kind: 'paragraph', paragraphNumber: index + 1 },
    })) }
}

function draft(text: string): EvidenceDraft {
  return { segmentIndex: 0, questionIndexes: [0], sourcedStatement: text, verbatimExcerpt: text, cardItems: [] }
}

/** One range per source segment, so a dispatch count is a range count. */
function options(width: number, generator: EvidenceFragmentOptions['generator'],
  onVerified: EvidenceFragmentOptions['onVerified'] = async () => {},
  maximumCalls?: number): EvidenceFragmentOptions {
  return { policy: { ...policy, maximumConcurrentDispatches: width }, generator,
    ...maximumCalls === undefined ? {} : { maximumCalls },
    classifyFailure: error => error instanceof EvidenceError ? 'timeout' : null, onVerified }
}

const tick = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms))

/** One draft per range, while recording how many dispatches the extractor keeps in flight. */
interface Recording {
  readonly state: { inFlight: number; peak: number }
  readonly generator: EvidenceFragmentOptions['generator']
}

function recording(): Recording {
  const state = { inFlight: 0, peak: 0 }
  const generator: EvidenceFragmentOptions['generator'] = async (request) => {
    state.inFlight += 1
    state.peak = Math.max(state.peak, state.inFlight)
    await tick()
    state.inFlight -= 1
    return [draft(request.segments[0]?.text ?? '')]
  }
  return { state, generator }
}

describe('concurrent fragment dispatch', () => {
  it('runs complete-depth ranges at the configured width', async () => {
    const { state, generator } = recording()
    const result = await extractEvidenceInFragments(source(THREE_RANGES),
      options(3, generator))
    expect(state.peak).toBe(3)
    expect(result.evidence.evidenceRecords).toHaveLength(3)
    expect(result.incompleteFragments).toEqual([])
  })

  it('serializes commits even when ranges finish together', async () => {
    let commits = 0, peak = 0
    const generator: EvidenceFragmentOptions['generator'] = async (request) => {
      await tick()
      return [draft(request.segments[0]?.text ?? '')]
    }
    const onVerified: EvidenceFragmentOptions['onVerified'] = async () => {
      commits += 1
      peak = Math.max(peak, commits)
      await tick()
      commits -= 1
    }
    await extractEvidenceInFragments(source(THREE_RANGES), options(3, generator, onVerified))
    expect(peak).toBe(1)
  })

  it('keeps a failed commit fatal instead of reporting it as a model failure', async () => {
    const commit = new Error('sink unavailable')
    const generator: EvidenceFragmentOptions['generator'] = async request => [draft(request.segments[0]?.text ?? '')]
    const onVerified: EvidenceFragmentOptions['onVerified'] = async () => { throw commit }
    await expect(extractEvidenceInFragments(source(['aaa', 'bbb']), options(2, generator, onVerified)))
      .rejects.toThrow('sink unavailable')
  })

  it('spends no more than the whole-paper call budget across concurrent ranges', async () => {
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async request => [draft(request.segments[0]?.text ?? '')])
    const result = await extractEvidenceInFragments(source(THREE_RANGES),
      options(3, generator, undefined, 2))
    expect(generator).toHaveBeenCalledTimes(2)
    expect(result.incompleteFragments).toHaveLength(1)
  })

  it('keeps minimal depth serial so the record cap and late shrinking stay exact', async () => {
    const { state, generator } = recording()
    await extractEvidenceInFragments(source(THREE_RANGES, 'minimal'), options(3, generator))
    expect(state.peak).toBe(1)
  })

  it('reports every dispatch attempt of a concurrent batch through onVerified', async () => {
    const seen: EvidenceFragmentAttempt[] = []
    const generator: EvidenceFragmentOptions['generator'] = async request => [draft(request.segments[0]?.text ?? '')]
    await extractEvidenceInFragments(source(THREE_RANGES),
      options(3, generator, async (attempt) => { seen.push(attempt) }))
    expect(seen.map(attempt => attempt.fragmentIndex).sort((a, b) => a - b)).toEqual([1, 2, 3])
  })
})
