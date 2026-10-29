import { afterEach, describe, expect, it, vi } from 'vitest'
import { setTimeout as retryDelay } from 'node:timers/promises'
import { createAcademicWorkId, createWorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { EvidenceError, extractEvidenceInFragments, type EvidenceDraft, type EvidenceExtractionInput,
  type EvidenceFragmentOptions, type EvidenceFragmentFailure } from '../src/index.ts'

vi.mock('node:timers/promises', async (original) => {
  const timers = await original<typeof import('node:timers/promises')>()
  return { ...timers, setTimeout: vi.fn(timers.setTimeout) }
})
afterEach(() => { vi.mocked(retryDelay).mockReset() })

function source(text = 'abcdefghABCDEFGH'): EvidenceExtractionInput {
  return { academicWorkId: createAcademicWorkId(), workVersionId: createWorkVersionId(), contentHash: 'sha256:test',
    sourceProvider: 'acl', sourceUrl: 'https://aclanthology.org/2025.acl-long.1/', retrievedAt: '2026-10-10T00:00:00Z',
    extractionMethod: { method: 'fixture', methodVersion: '1' }, focusQuestions: ['Which fact?'],
    segments: [{ text, locator: { kind: 'abstract', characterOffset: 10 } }] }
}

function draft(text: string): EvidenceDraft {
  return { segmentIndex: 0, sourcedStatement: text, verbatimExcerpt: text, questionIndexes: [0],
    cardItems: [{ section: 'findings', statement: text, findingType: { status: 'available', value: 'primary' },
      conditions: { status: 'unknown', reason: 'Not established.' } }] }
}

function options(overrides: Partial<EvidenceFragmentOptions> = {}): EvidenceFragmentOptions {
  return { policy: { maximumCharacters: 8, minimumCharacters: 2, overlapCharacters: 0, maximumAttempts: 3,
    maximumOutputTokens: 512, initialRetryDelayMs: 0 },
  generator: async request => [draft(request.segments[0]?.text ?? '')],
  classifyFailure: error => error instanceof EvidenceError
    ? error.code === 'TIMEOUT' ? 'timeout' : error.code === 'TRANSPORT' ? 'transport'
      : error.code === 'PARSE_FAILED' ? 'parse_failed' : error.code === 'INCOMPLETE_OUTPUT' ? 'incomplete_output' : null : null,
  onVerified: async () => {}, ...overrides }
}

describe('extractEvidenceInFragments', () => {
  it('packs adjacent short paragraphs and keeps each quoted paragraph locator', async () => {
    const input = { ...source(), segments: ['alpha', 'bravo', 'charlie'].map((text, index) => ({
      text, locator: { kind: 'paragraph' as const, paragraphNumber: index + 1 },
    })) }
    const calls: number[] = []
    const onVerified = vi.fn<EvidenceFragmentOptions['onVerified']>(async () => {})
    const opts = options({ generator: async (request) => {
      calls.push(request.segments.length)
      return request.segments.map((segment, segmentIndex) => ({ ...draft(segment.text), segmentIndex }))
    }, onVerified })
    const result = await extractEvidenceInFragments(input, { ...opts,
      policy: { ...opts.policy, maximumCharacters: 11 } })
    expect(calls).toEqual([2, 1])
    expect(onVerified.mock.calls[0]?.[0].sourceRanges).toEqual([
      { segmentIndex: 0, characterStart: 0, characterEnd: 5 },
      { segmentIndex: 1, characterStart: 0, characterEnd: 5 },
    ])
    expect(result.evidence.sourceLocators.map(locator => locator.kind === 'paragraph' ? locator.paragraphNumber : null))
      .toEqual([1, 2, 3])
    expect(result.evidence.evidenceRecords).toHaveLength(3)
  })

  it('splits a failed packed request by source segment without losing successful siblings', async () => {
    const input = { ...source(), segments: ['abc', 'def', 'ghi'].map((text, index) => ({
      text, locator: { kind: 'paragraph' as const, paragraphNumber: index + 1 },
    })) }
    const calls: number[] = []
    const opts = options({ generator: async (request) => {
      calls.push(request.segments.length)
      if (request.segments.length === 3) throw new EvidenceError('output incomplete', 'INCOMPLETE_OUTPUT')
      return request.segments.map((segment, segmentIndex) => ({ ...draft(segment.text), segmentIndex }))
    } })
    const result = await extractEvidenceInFragments(input, { ...opts,
      policy: { ...opts.policy, maximumCharacters: 12 } })
    expect(calls).toEqual([3, 2, 1])
    expect(result.failures).toHaveLength(1)
    expect(result.incompleteFragments).toEqual([])
    expect(result.evidence.sourceLocators.map(locator => locator.kind === 'paragraph' ? locator.paragraphNumber : null))
      .toEqual([1, 2, 3])
  })

  it('waits for verified-fragment persistence before dispatching the next source range', async () => {
    const input = source()
    let release: (() => void) | undefined
    const barrier = new Promise<void>((resolve) => { release = resolve })
    const generator = vi.fn(options().generator)
    const onVerified = vi.fn<EvidenceFragmentOptions['onVerified']>(async () => { await barrier })
    const pending = extractEvidenceInFragments(input, options({ generator, onVerified }))
    await vi.waitFor(() => { expect(onVerified).toHaveBeenCalledTimes(1) })
    expect(generator).toHaveBeenCalledTimes(1)
    expect(onVerified.mock.calls[0]?.[1].sourceLocators[0]).toMatchObject({ characterStart: 10, characterEnd: 18 })
    release?.()
    const result = await pending
    expect(generator).toHaveBeenCalledTimes(2)
    expect(generator.mock.calls[1]?.[1]).toMatchObject({ academicWorkId: input.academicWorkId,
      workVersionId: input.workVersionId, stage: 'extraction', fragmentIndex: 2, segmentIndex: 0,
      characterStart: 8, characterEnd: 16, maximumOutputTokens: 512 })
    expect(result.evidence.sourceLocators[1]).toMatchObject({ characterStart: 18, characterEnd: 26 })
    expect(result.evidence.evidenceCard.findings.map(item => item.evidenceIds[0]))
      .toEqual(result.evidence.evidenceRecords.map(record => record.evidenceId))
  })

  it.each(['TIMEOUT', 'PARSE_FAILED', 'INCOMPLETE_OUTPUT'])('shrinks only the failed range after %s', async (code) => {
    const calls: string[] = []
    const retained: string[] = []
    const result = await extractEvidenceInFragments(source(), options({
      generator: async (request) => {
        const text = request.segments[0]?.text ?? ''
        calls.push(text)
        if (text === 'ABCDEFGH') throw new EvidenceError('failed', code)
        return [draft(text)]
      },
      onVerified: async (_attempt, evidence) => { retained.push(...evidence.evidenceRecords.map(record => record.sourcedStatement)) },
    }))
    expect(calls).toEqual(['abcdefgh', 'ABCDEFGH', 'ABCD', 'EFGH'])
    expect(retained).toEqual(['abcdefgh', 'ABCD', 'EFGH'])
    expect(result.incompleteFragments).toEqual([])
    expect(result.failures).toHaveLength(1)
    expect(result.evidence.evidenceRecords).toHaveLength(3)
  })

  it('retains verified records and reports undispatched split ranges when the call budget is exhausted', async () => {
    const opts = options({ generator: async (request) => {
      const text = request.segments[0]?.text ?? ''
      if (text.startsWith('A')) throw new EvidenceError('timed out', 'TIMEOUT')
      return [draft(text)]
    } })
    const generator = vi.fn(opts.generator)
    const result = await extractEvidenceInFragments(source(), { ...opts, generator })
    expect(generator).toHaveBeenCalledTimes(4)
    expect(result.evidence.evidenceRecords.map(record => record.sourcedStatement)).toEqual(['abcdefgh'])
    expect(result.incompleteFragments).toEqual([
      { fragmentIndex: 2, segmentIndex: 0, characterStart: 8, characterEnd: 10 },
      { fragmentIndex: 2, segmentIndex: 0, characterStart: 10, characterEnd: 12 },
      { fragmentIndex: 2, segmentIndex: 0, characterStart: 12, characterEnd: 16 },
    ])
  })

  it('retries transport without shrinking and retains request identity plus the consecutive-failure signal', async () => {
    const error = Object.assign(new EvidenceError('connection lost', 'TRANSPORT'), { requestId: 'provider-request-1' })
    const failures: EvidenceFragmentFailure[] = []
    let count = 0
    const result = await extractEvidenceInFragments(source('abcdefgh'), options({
      generator: async (request) => { if (++count < 3) throw error; return [draft(request.segments[0]?.text ?? '')] },
      onFailure: (failure) => { failures.push(failure); throw new Error('observer failed') },
    }))
    expect(count).toBe(3)
    expect(failures.map(failure => failure.consecutiveTransientFailures)).toEqual([1, 2])
    expect(result.failures[0]?.error).toBe(error)
    expect(result.failures.every(failure => failure.characterEnd === 8)).toBe(true)
    expect(result.incompleteFragments).toEqual([])
  })

  it('resets consecutive transient failures after a verified response', async () => {
    const attempts = new Map<number, number>()
    const result = await extractEvidenceInFragments(source(), options({ generator: async (request, attempt) => {
      const count = (attempts.get(attempt.fragmentIndex) ?? 0) + 1
      attempts.set(attempt.fragmentIndex, count)
      if (count === 1) throw new EvidenceError('connection lost', 'TRANSPORT')
      return [draft(request.segments[0]?.text ?? '')]
    } }))
    expect(result.failures.map(failure => failure.consecutiveTransientFailures)).toEqual([1, 1])
  })

  it('does not retry excerpt rejection or discard a verified companion draft', async () => {
    const generator = vi.fn(async () => [draft('absent'), draft('abcd')])
    const result = await extractEvidenceInFragments(source('abcdefgh'), options({ generator }))
    expect(generator).toHaveBeenCalledTimes(1)
    expect(result.evidence.evidenceRecords).toHaveLength(1)
    expect(result.evidence.rejectedDrafts).toHaveLength(1)
    expect(result.evidence.evidenceCard.findings).toHaveLength(1)
    expect(result.failures).toEqual([])
  })

  it('deduplicates overlapping verified excerpts and their card references', async () => {
    const input = { ...source('xxfactxxTAIL'), segments: [{ text: 'xxfactxxTAIL',
      locator: { kind: 'paragraph' as const, paragraphNumber: 1 } }] }
    const opts = options({ generator: async request => request.segments[0]?.text.includes('fact') ? [draft('fact')] : [] })
    const result = await extractEvidenceInFragments(input, { ...opts,
      policy: { ...opts.policy, minimumCharacters: 7, overlapCharacters: 6 } })
    expect(result.evidence.evidenceRecords).toHaveLength(1)
    expect(result.evidence.questionLinks).toHaveLength(1)
    expect(result.evidence.sourceLocators).toHaveLength(1)
    expect(result.evidence.evidenceCard.findings).toHaveLength(1)
  })

  it('does not classify or retry sink failures or unclassified generator errors', async () => {
    const classifyFailure = vi.fn(options().classifyFailure)
    const generator = vi.fn(options().generator)
    await expect(extractEvidenceInFragments(source(), options({ generator, classifyFailure,
      onVerified: async () => { throw new Error('storage unavailable') } }))).rejects.toThrow('storage unavailable')
    expect(classifyFailure).not.toHaveBeenCalled()
    expect(generator).toHaveBeenCalledTimes(1)
    await expect(extractEvidenceInFragments(source(), options({ generator: async () => { throw new Error('programming defect') } })))
      .rejects.toThrow('programming defect')
  })

  it('cancels a retry delay while retaining the earlier verified fragment in the sink', async () => {
    const controller = new AbortController()
    const saved: string[] = []
    const opts = options({ generator: async (request) => {
      const text = request.segments[0]?.text ?? ''
      if (text === 'ABCDEFGH') throw new EvidenceError('connection lost', 'TRANSPORT')
      return [draft(text)]
    }, onVerified: async (_attempt, evidence) => { saved.push(...evidence.evidenceRecords.map(record => record.sourcedStatement)) },
    onFailure: () => { controller.abort(new Error('user cancelled')) } })
    const pending = extractEvidenceInFragments(source(),
      { ...opts, policy: { ...opts.policy, initialRetryDelayMs: 100 } }, controller.signal)
    await expect(pending).rejects.toThrow()
    expect(saved).toEqual(['abcdefgh'])
  })

  it('backs off transport attempts exponentially with the supplied delay', async () => {
    vi.mocked(retryDelay).mockResolvedValue(undefined)
    const generator = vi.fn(async () => { throw new EvidenceError('network', 'TRANSPORT') })
    const opts = options({ generator })
    const pending = extractEvidenceInFragments(source('abcdefgh'), { ...opts, policy: { ...opts.policy, initialRetryDelayMs: 100 } })
    expect((await pending).incompleteFragments).toHaveLength(1)
    expect(vi.mocked(retryDelay).mock.calls.map(call => call[0])).toEqual([100, 200])
    expect(generator).toHaveBeenCalledTimes(3)
  })

  it('preserves cancellation and refuses to dispatch an already cancelled request', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    const generator = vi.fn(options().generator)
    await expect(extractEvidenceInFragments(source(), options({ generator }), controller.signal)).rejects.toThrow('cancelled')
    expect(generator).not.toHaveBeenCalled()
  })

  it.each([
    { maximumCharacters: 0 }, { minimumCharacters: 9 }, { overlapCharacters: 2 }, { maximumAttempts: 0 },
    { maximumOutputTokens: 0 }, { initialRetryDelayMs: -1 }, { initialRetryDelayMs: Number.MAX_SAFE_INTEGER },
  ])('rejects invalid fragment policy before dispatch: %j', async (invalid) => {
    const opts = options()
    const generator = vi.fn(opts.generator)
    await expect(extractEvidenceInFragments(source(), { ...opts, generator, policy: { ...opts.policy, ...invalid } }))
      .rejects.toBeInstanceOf(RangeError)
    expect(generator).not.toHaveBeenCalled()
  })

  it('rejects empty source metadata or content before generation', async () => {
    const input = source()
    for (const invalid of [{ ...input, contentHash: '' }, { ...input, segments: [] }, source(' ')]) {
      await expect(extractEvidenceInFragments(invalid, options())).rejects.toMatchObject({ code: 'EVIDENCE_INVALID_EXTRACTION' })
    }
  })

  it('marks the remaining split half incomplete without exceeding the initial fragment budget', async () => {
    const opts = options({ generator: async (request) => {
      const text = request.segments[0]?.text ?? ''
      if (text.length === 8) throw new EvidenceError('timeout', 'TIMEOUT')
      return [draft(text)]
    } })
    const result = await extractEvidenceInFragments(source('abcdefgh'), { ...opts,
      policy: { ...opts.policy, maximumAttempts: 2 } })
    expect(result.evidence.evidenceRecords).toHaveLength(1)
    expect(result.incompleteFragments).toEqual([{ fragmentIndex: 1, segmentIndex: 0, characterStart: 4, characterEnd: 8 }])
  })

  it('retries a minimum-size failed fragment without splitting and keeps absent abstract offsets valid', async () => {
    let count = 0
    const input = { ...source('ab'), segments: [{ text: 'ab', locator: { kind: 'abstract' as const } }] }
    const result = await extractEvidenceInFragments(input, options({ generator: async () => {
      if (++count === 1) throw new EvidenceError('timeout', 'TIMEOUT')
      return [draft('ab')]
    } }))
    expect(count).toBe(2)
    expect(result.evidence.sourceLocators[0]).toMatchObject({ characterStart: 0, characterEnd: 2 })
  })

  it('merges all card sections while preserving already committed item and evidence identities', async () => {
    const value: EvidenceDraft = { ...draft('abcdefgh'), cardItems: [
      ...draft('abcdefgh').cardItems,
      { section: 'researchQuestions', statement: 'Question', questionType: { status: 'unknown', reason: 'unknown' } },
      { section: 'methods', statement: 'Method', methodName: { status: 'unknown', reason: 'unknown' },
        methodRole: { status: 'unknown', reason: 'unknown' } },
      { section: 'datasets', statement: 'Dataset', datasetName: { status: 'unknown', reason: 'unknown' },
        version: { status: 'not_extracted' }, split: { status: 'not_extracted' }, scale: { status: 'not_extracted' } },
      { section: 'metrics', statement: 'Metric', metricName: { status: 'unknown', reason: 'unknown' },
        value: { status: 'not_extracted' }, unit: { status: 'not_extracted' }, direction: { status: 'not_extracted' },
        evaluationContext: { status: 'not_extracted' } },
      { section: 'limitations', statement: 'Limit', limitationType: { status: 'unknown', reason: 'unknown' } },
    ] }
    const onVerified = vi.fn<EvidenceFragmentOptions['onVerified']>(async () => {})
    const result = await extractEvidenceInFragments(source('abcdefgh'), options({ generator: async () => [value], onVerified }))
    const saved = onVerified.mock.calls[0]?.[1]
    for (const section of ['researchQuestions', 'methods', 'datasets', 'metrics', 'findings', 'limitations'] as const) {
      expect(result.evidence.evidenceCard[section]).toEqual(saved?.evidenceCard[section])
      expect(result.evidence.evidenceCard[section]).toHaveLength(1)
    }
  })

  it('skips whitespace-only slices without losing original source offsets or consuming calls', async () => {
    const generator = vi.fn(options().generator)
    const result = await extractEvidenceInFragments(source('        abcdefgh'), options({ generator }))
    expect(generator).toHaveBeenCalledTimes(1)
    expect(result.evidence.sourceLocators[0]).toMatchObject({ characterStart: 18, characterEnd: 26 })
    expect(result.incompleteFragments).toEqual([])
  })
})
