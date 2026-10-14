import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createAcademicWorkId, createWorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { EvidenceError, extractEvidenceFromContent, extractEvidenceInFragments,
  type EvidenceDraft, type EvidenceExtractionInput, type EvidenceFragmentOptions } from '../src/index.ts'

function source(text = 'a b c d e f'): EvidenceExtractionInput {
  return { depth: 'minimal', academicWorkId: createAcademicWorkId(), workVersionId: createWorkVersionId(),
    sourceProvider: 'fixture', sourceUrl: 'https://example.org/paper', retrievedAt: '2026-10-14T00:00:00Z',
    contentHash: 'sha256:fixture', extractionMethod: { method: 'fixture', methodVersion: '1' },
    focusQuestions: ['What is supported?', 'What remains unknown?'],
    segments: [{ text, locator: { kind: 'paragraph', paragraphNumber: 1 } }] }
}

function draft(text: string): EvidenceDraft {
  return { segmentIndex: 0, questionIndexes: [0], sourcedStatement: text, verbatimExcerpt: text, cardItems: [] }
}

function options(generator: EvidenceFragmentOptions['generator']): EvidenceFragmentOptions {
  return { policy: { maximumCharacters: 8, minimumCharacters: 2, overlapCharacters: 0,
    maximumAttempts: 3, maximumOutputTokens: 512, initialRetryDelayMs: 0 }, generator,
  classifyFailure: error => error instanceof EvidenceError && error.code === 'TIMEOUT' ? 'timeout' : null,
  onVerified: async () => {} }
}

describe('minimal evidence extraction', () => {
  it('retains five verified question-linked records after rejecting invalid companion drafts', async () => {
    const input = source()
    const result = await extractEvidenceFromContent(input, async (request) => {
      expect(request.instruction).toContain('three to five concise facts')
      expect(request.instruction).toContain('Card sections may be empty')
      expect(request.focusQuestions).toEqual(input.focusQuestions)
      return [{ segmentIndex: 0, sourcedStatement: 'a', verbatimExcerpt: 'a', cardItems: [] },
        { ...draft('b'), questionIndexes: [] },
        draft('absent'), ...['a', 'b', 'c', 'd', 'e', 'f'].map(draft)]
    })
    expect(result.evidenceRecords.map(record => record.sourcedStatement)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(result.rejectedDrafts.map(rejected => rejected.code)).toEqual([
      'EVIDENCE_INVALID_QUESTION_INDEX', 'EVIDENCE_INVALID_QUESTION_INDEX', 'EVIDENCE_EXCERPT_NOT_FOUND',
    ])
    expect(result.sourceLocators).toHaveLength(5)
    expect(result.questionLinks).toEqual(result.evidenceRecords.map(record => ({
      evidenceId: record.evidenceId, question: input.focusQuestions?.[0],
    })))
    expect(result.evidenceRecords.every(record => record.level === 'fulltext'
      && record.workVersionId === input.workVersionId && record.sourceUrl === input.sourceUrl
      && record.contentHash.status === 'available' && record.contentHash.value === input.contentHash)).toBe(true)
    expect(result.evidenceCard.findings).toEqual([])
  })

  it.each([undefined, []])('refuses minimal extraction without approved questions: %j', async (focusQuestions) => {
    const generator = vi.fn(async () => [])
    const { focusQuestions: _, ...base } = source()
    const input = { ...base, ...focusQuestions === undefined ? {} : { focusQuestions } }
    await expect(extractEvidenceFromContent(input, generator)).rejects.toMatchObject({ code: 'EVIDENCE_INVALID_EXTRACTION' })
    await expect(extractEvidenceInFragments(input, options(generator))).rejects.toMatchObject({ code: 'EVIDENCE_INVALID_EXTRACTION' })
    expect(generator).not.toHaveBeenCalled()
  })

  it('preserves the fixed A-PE1 evidence and uncovered questions after a later fragment timeout', async () => {
    const sample = JSON.parse(readFileSync(new URL(
      '../../../../z-team_docs/interface-samples/academic-model-v1/academic-pe1-evidence.sample.json', import.meta.url,
    ), 'utf8')) as { input: EvidenceExtractionInput; firstFragmentDrafts: readonly EvidenceDraft[] }
    const onVerified = vi.fn<EvidenceFragmentOptions['onVerified']>(async () => {})
    const opts = options(async (_request, attempt) => {
      if (attempt.fragmentIndex === 1) return sample.firstFragmentDrafts
      throw new EvidenceError('Synthetic timeout', 'TIMEOUT')
    })
    const result = await extractEvidenceInFragments({ ...sample.input, depth: 'minimal' }, { ...opts, onVerified,
      policy: { ...opts.policy, maximumCharacters: 120, maximumAttempts: 1 } })
    expect(result.evidence.evidenceRecords).toHaveLength(1)
    expect(result.evidence.rejectedDrafts).toHaveLength(1)
    expect(result.evidence.evidenceRecords).toEqual(onVerified.mock.calls[0]?.[1].evidenceRecords)
    expect(result.incompleteFragments).toHaveLength(1)
    expect(result.failures.map(failure => failure.category)).toEqual(['timeout'])
    expect(result.evidence.questionLinks.map(link => link.question)).toEqual([sample.input.focusQuestions?.[0]])
    expect(sample.input.focusQuestions?.filter(question => !result.evidence.questionLinks.some(link => link.question === question)))
      .toEqual(sample.input.focusQuestions?.slice(1))
    expect(result.evidence.evidenceCard.findings).toEqual([])
    const failed = await extractEvidenceInFragments({ ...sample.input, depth: 'minimal' }, { ...opts,
      generator: async () => { throw new EvidenceError('Synthetic timeout', 'TIMEOUT') },
      policy: { ...opts.policy, maximumCharacters: 120, maximumAttempts: 1 } })
    expect(failed.evidence.evidenceRecords).toEqual([])
    expect(failed.evidence.questionLinks).toEqual([])
    expect(result.evidence.evidenceRecords).toHaveLength(1)
  })

  it('caps both committed and returned paper evidence without orphan card references', async () => {
    const input = { ...source(), segments: ['a b', 'c d', 'e f', 'g h'].map((text, index) => ({
      text, locator: { kind: 'paragraph' as const, paragraphNumber: index + 1 },
    })) }
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async request =>
      (request.segments[0]?.text.split(' ') ?? []).map(text => ({ ...draft(text),
        cardItems: [{ section: 'findings', statement: text, findingType: { status: 'not_extracted' },
          conditions: { status: 'not_extracted' } }],
      })))
    const onVerified = vi.fn<EvidenceFragmentOptions['onVerified']>(async () => {})
    const opts = options(generator)
    const result = await extractEvidenceInFragments(input, { ...opts, onVerified,
      policy: { ...opts.policy, maximumCharacters: 3 } })
    expect(generator).toHaveBeenCalledTimes(3)
    expect(result.evidence.evidenceRecords.map(record => record.sourcedStatement)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(onVerified.mock.calls.flatMap(call => call[1].evidenceRecords)).toEqual(result.evidence.evidenceRecords)
    expect(result.evidence.sourceLocators).toHaveLength(5)
    expect(result.evidence.questionLinks).toHaveLength(5)
    expect(result.evidence.evidenceCard.findings.map(item => item.evidenceIds[0]))
      .toEqual(result.evidence.evidenceRecords.map(record => record.evidenceId))
    expect(result.incompleteFragments).toEqual([
      { fragmentIndex: 4, segmentIndex: 3, characterStart: 0, characterEnd: 3 },
    ])
    expect(result.failures).toEqual([])
  })

  it('leaves undispatched retry siblings incomplete when a verified child reaches the paper cap', async () => {
    const input = { ...source(), segments: ['a b c d!', 'efghijkl'].map((text, index) => ({
      text, locator: { kind: 'paragraph' as const, paragraphNumber: index + 1 },
    })) }
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async (request) => {
      const text = request.segments[0]?.text ?? ''
      if (text === 'a b c d!') return ['a', 'b', 'c', 'd'].map(draft)
      if (text === 'efghijkl') throw new EvidenceError('Synthetic timeout', 'TIMEOUT')
      return [draft(text)]
    })
    const result = await extractEvidenceInFragments(input, options(generator))
    expect(generator).toHaveBeenCalledTimes(3)
    expect(result.evidence.evidenceRecords).toHaveLength(5)
    expect(result.incompleteFragments).toEqual([
      { fragmentIndex: 2, segmentIndex: 1, characterStart: 4, characterEnd: 8 },
    ])
  })

  it('does not consume the paper cap twice for the same source evidence', async () => {
    const input = { ...source(), segments: ['a b c', 'a d e', 'f'].map(text => ({
      text, locator: { kind: 'paragraph' as const, paragraphNumber: 1 },
    })) }
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async request =>
      (request.segments[0]?.text.split(' ') ?? []).map(draft))
    const opts = options(generator)
    const result = await extractEvidenceInFragments(input, { ...opts,
      policy: { ...opts.policy, maximumCharacters: 5 } })
    expect(generator).toHaveBeenCalledTimes(2)
    expect(result.evidence.evidenceRecords.map(record => record.sourcedStatement)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(result.incompleteFragments).toHaveLength(1)
  })

  it('rejects persistence failure or cancellation even when the fragment reaches the paper cap', async () => {
    const input = source()
    const opts = options(async () => ['a', 'b', 'c', 'd', 'e'].map(draft))
    const whole = { ...opts, policy: { ...opts.policy, maximumCharacters: 20 } }
    const storageFailure = new Error('Storage unavailable')
    const classifyFailure = vi.fn(whole.classifyFailure)
    await expect(extractEvidenceInFragments(input, { ...whole, classifyFailure,
      onVerified: async () => { throw storageFailure } })).rejects.toBe(storageFailure)
    expect(classifyFailure).not.toHaveBeenCalled()
    const controller = new AbortController()
    const committed: string[] = []
    await expect(extractEvidenceInFragments(input, { ...whole,
      onVerified: async (_attempt, evidence) => {
        committed.push(...evidence.evidenceRecords.map(record => record.evidenceId))
        controller.abort(new Error('User cancelled'))
      },
    }, controller.signal)).rejects.toThrow('User cancelled')
    expect(committed).toHaveLength(5)
  })
})
