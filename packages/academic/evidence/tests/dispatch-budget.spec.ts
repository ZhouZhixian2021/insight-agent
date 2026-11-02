import { describe, expect, it, vi } from 'vitest'
import { createAcademicWorkId, createWorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { EvidenceError, extractEvidenceInFragments, type EvidenceDraft, type EvidenceExtractionInput,
  type EvidenceFragmentOptions, type EvidenceFragmentPolicy } from '../src/index.ts'

const MAXIMUM_CHARACTERS = 3

const policy: EvidenceFragmentPolicy = { maximumCharacters: MAXIMUM_CHARACTERS, minimumCharacters: 2, overlapCharacters: 0,
  maximumAttempts: 3, maximumOutputTokens: 512, initialRetryDelayMs: 0, maximumConcurrentDispatches: 1 }

function source(texts: readonly string[]): EvidenceExtractionInput {
  return { depth: 'complete', academicWorkId: createAcademicWorkId(), workVersionId: createWorkVersionId(),
    sourceProvider: 'fixture', sourceUrl: 'https://example.org/paper', retrievedAt: '2026-11-02T00:00:00Z',
    contentHash: 'sha256:fixture', extractionMethod: { method: 'fixture', methodVersion: '1' },
    focusQuestions: ['Which fact?'], segments: texts.map((text, index) => ({
      text, locator: { kind: 'paragraph', paragraphNumber: index + 1 },
    })) }
}

function draft(text: string): EvidenceDraft {
  return { segmentIndex: 0, questionIndexes: [0], sourcedStatement: text, verbatimExcerpt: text, cardItems: [] }
}

function options(generator: EvidenceFragmentOptions['generator'],
  overrides: Partial<EvidenceFragmentPolicy> = {}, maximumCalls?: number): EvidenceFragmentOptions {
  return { policy: { ...policy, ...overrides }, generator,
    ...maximumCalls === undefined ? {} : { maximumCalls },
    classifyFailure: error => error instanceof EvidenceError ? 'timeout' : null, onVerified: async () => {} }
}

const ranged = ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff', 'ggg', 'hhh']

describe('whole-paper dispatch budget', () => {
  it('scales the budget with the ranges one paper packs', async () => {
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async request => [draft(request.segments[0]?.text ?? '')])
    const result = await extractEvidenceInFragments(source(ranged),
      options(generator, { callBudgetFraction: 0.5, minimumCalls: 1 }, 8))
    expect(generator).toHaveBeenCalledTimes(4)
    expect(result.incompleteFragments).toHaveLength(4)
  })

  it('gives a short paper at least the minimum number of dispatches', async () => {
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async request => [draft(request.segments[0]?.text ?? '')])
    await extractEvidenceInFragments(source(ranged.slice(0, 2)),
      options(generator, { callBudgetFraction: 0.5, minimumCalls: 2 }, 6))
    expect(generator).toHaveBeenCalledTimes(2)
  })

  it('keeps the per-call cap as the upper bound for a long paper', async () => {
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async request => [draft(request.segments[0]?.text ?? '')])
    await extractEvidenceInFragments(source(ranged),
      options(generator, { callBudgetFraction: 1, minimumCalls: 1 }, 3))
    expect(generator).toHaveBeenCalledTimes(3)
  })

  it('rejects a budget fraction outside the unit interval', async () => {
    await expect(extractEvidenceInFragments(source(ranged),
      options(async () => [], { callBudgetFraction: 0 }))).rejects.toThrow('call budget fraction')
  })
})

describe('evidence-free dispatch stop', () => {
  it('leaves the rest of a paper unread after consecutive empty dispatches', async () => {
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async () => [])
    const result = await extractEvidenceInFragments(source(ranged),
      options(generator, { emptyDispatchStopAfter: 2 }, 8))
    expect(generator).toHaveBeenCalledTimes(2)
    expect(result.evidence.evidenceRecords).toEqual([])
    expect(result.incompleteFragments).toHaveLength(6)
  })

  it('keeps dispatching while a paper still returns evidence', async () => {
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async (request) => {
      const text = request.segments[0]?.text ?? ''
      return text === 'bbb' || text === 'ddd' ? [] : [draft(text)]
    })
    const result = await extractEvidenceInFragments(source(ranged),
      options(generator, { emptyDispatchStopAfter: 2 }, 8))
    expect(generator).toHaveBeenCalledTimes(8)
    expect(result.evidence.evidenceRecords).toHaveLength(6)
  })

  it('never stops early when the stop threshold is zero', async () => {
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async () => [])
    await extractEvidenceInFragments(source(ranged.slice(0, 3)),
      options(generator, { emptyDispatchStopAfter: 0 }, 8))
    expect(generator).toHaveBeenCalledTimes(3)
  })

  it('keeps dispatch width working under the stop threshold', async () => {
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async () => [])
    const result = await extractEvidenceInFragments(source(ranged),
      options(generator, { emptyDispatchStopAfter: 3, maximumConcurrentDispatches: 2 }, 8))
    expect(generator.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(result.incompleteFragments.length).toBeGreaterThan(0)
  })
})
