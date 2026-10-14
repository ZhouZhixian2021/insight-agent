import { describe, expect, it, vi } from 'vitest'
import { createAcademicWorkId, createWorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { EvidenceError, extractEvidenceInFragments, type EvidenceDraft, type EvidenceExtractionInput,
  type EvidenceFragmentOptions } from '../src/index.ts'

function source(texts: readonly string[]): EvidenceExtractionInput {
  return { depth: 'minimal', academicWorkId: createAcademicWorkId(), workVersionId: createWorkVersionId(),
    sourceProvider: 'fixture', sourceUrl: 'https://example.org/paper', retrievedAt: '2026-10-14T00:00:00Z',
    contentHash: 'sha256:fixture', extractionMethod: { method: 'fixture', methodVersion: '1' },
    focusQuestions: ['Which fact?'], segments: texts.map((text, index) => ({
      text, locator: { kind: 'paragraph', paragraphNumber: index + 1 },
    })) }
}

function draft(text: string, question = 0): EvidenceDraft {
  return { segmentIndex: 0, questionIndexes: [question], sourcedStatement: text,
    verbatimExcerpt: text, cardItems: [] }
}

function options(generator: EvidenceFragmentOptions['generator']): EvidenceFragmentOptions {
  return { policy: { maximumCharacters: 8, minimumCharacters: 2, overlapCharacters: 0, maximumAttempts: 3,
    maximumOutputTokens: 512, initialRetryDelayMs: 0 }, generator,
  classifyFailure: error => error instanceof EvidenceError
    ? error.code === 'TIMEOUT' ? 'timeout' : error.code === 'PARSE_FAILED' ? 'parse_failed'
      : error.code === 'INCOMPLETE_OUTPUT' ? 'incomplete_output' : error.code === 'TRANSPORT' ? 'transport' : null : null,
  onVerified: async () => {} }
}

describe('minimal fragment priority and recovery', () => {
  it.each([true, false])('reads a match for each question before further same-question fragments (aliases: %s)', async (aliases) => {
    const input = { ...source(['Unrelated introduction.', 'faithfulness methods results.',
      'faithfulness measurements findings.', 'limitations and future work.']),
    focusQuestions: aliases ? ['如何衡量幻觉？', '有哪些限制？'] : ['faithfulness', 'limitations'] }
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async (request) => {
      const text = request.segments[0]?.text ?? ''
      if (text.includes('methods')) return [draft('faithfulness'), draft('methods')]
      if (text.includes('measurements')) return [draft('faithfulness'), draft('measurements')]
      return text.includes('limitations') ? [draft('limitations', 1)] : []
    })
    const opts = options(generator)
    const selected = { ...opts, policy: { ...opts.policy, maximumCharacters: 35 },
      ...aliases ? { questionTerms: [['faithfulness'], ['limitations']] } : {} }
    const result = await extractEvidenceInFragments(input, selected)
    expect(generator.mock.calls.map(call => call[0].segments[0]?.text)).toEqual([
      input.segments[1]?.text, input.segments[3]?.text, input.segments[2]?.text,
    ])
    expect(generator.mock.calls.map(call => call[1].fragmentIndex)).toEqual([2, 4, 3])
    expect(result.evidence.evidenceRecords).toHaveLength(5)
    expect(new Set(result.evidence.questionLinks.map(link => link.question))).toEqual(new Set(input.focusQuestions))
    expect(result.evidence.sourceLocators.map(locator => locator.kind === 'paragraph' ? locator.paragraphNumber : null))
      .toEqual([2, 2, 4, 3, 3])
    expect(result.incompleteFragments).toMatchObject([{ fragmentIndex: 1, segmentIndex: 0 }])
    generator.mockClear()
    const complete = await extractEvidenceInFragments({ ...input, depth: 'complete' }, selected)
    expect(generator).toHaveBeenCalledTimes(4)
    expect(complete.evidence.evidenceRecords.map(record => record.sourcedStatement).toSorted())
      .toEqual(result.evidence.evidenceRecords.map(record => record.sourcedStatement).toSorted())
  })

  it('dispatches shared matches once and keeps unmatched text available', async () => {
    const input = { ...source(['RAG', 'RAG', 'tail']), focusQuestions: ['First?', 'Second?'] }
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async () => [])
    const opts = options(generator)
    await extractEvidenceInFragments(input, { ...opts, questionTerms: [['RAG', 'RAG'], ['RAG']],
      policy: { ...opts.policy, maximumCharacters: 4 } })
    expect(generator.mock.calls.map(call => call[1].segmentIndex)).toEqual([0, 1, 2])
  })

  it('keeps source order when supplied lexical hints have no word match', async () => {
    const input = source(['ab', 'cd'])
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async () => [])
    const opts = options(generator)
    await extractEvidenceInFragments(input, { ...opts, questionTerms: [['+-']],
      policy: { ...opts.policy, maximumCharacters: 2 } })
    expect(generator.mock.calls.map(call => call[1].segmentIndex)).toEqual([0, 1])
  })

  it('rejects question-hint count mismatch before any model dispatch', async () => {
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async () => [])
    await expect(extractEvidenceInFragments(source(['text']), { ...options(generator), questionTerms: [] }))
      .rejects.toThrow('one entry per focus question')
    const { focusQuestions: _, ...input } = source(['text'])
    await expect(extractEvidenceInFragments({ ...input, depth: 'complete' }, {
      ...options(generator), questionTerms: [['fact']],
    })).rejects.toThrow('one entry per focus question')
    expect(generator).not.toHaveBeenCalled()
  })

  it.each(['TIMEOUT', 'PARSE_FAILED', 'INCOMPLETE_OUTPUT'])('starts subsequent groups smaller after %s without losing evidence', async (code) => {
    const input = source(['abcdefgh', 'ABCDEFGH'])
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async (request) => {
      const text = request.segments[0]?.text ?? ''
      if (text.length === 8) throw new EvidenceError('Synthetic size-related failure', code)
      return [draft(text)]
    })
    const onVerified = vi.fn<EvidenceFragmentOptions['onVerified']>(async () => {})
    const opts = { ...options(generator), onVerified }
    const result = await extractEvidenceInFragments(input, opts)
    expect(generator.mock.calls.map(call => call[0].segments[0]?.text)).toEqual(['abcdefgh', 'abcd', 'efgh', 'ABCD', 'EFGH'])
    expect(result.evidence.evidenceRecords).toEqual(onVerified.mock.calls.flatMap(call => call[1].evidenceRecords))
    expect(result.evidence.evidenceRecords).toHaveLength(4)
    expect(result.incompleteFragments).toEqual([])
    expect(result.failures).toHaveLength(1)
    generator.mockClear()
    const complete = await extractEvidenceInFragments({ ...input, depth: 'complete' }, options(generator))
    expect(generator).toHaveBeenCalledTimes(6)
    expect(complete.evidence.evidenceRecords.map(record => record.sourcedStatement))
      .toEqual(result.evidence.evidenceRecords.map(record => record.sourcedStatement))
  })

  it('keeps committed evidence and marks irreducible failed ranges without repeating identical input', async () => {
    const input = source(['ok', 'no', 'zz'])
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async (request) => {
      const text = request.segments[0]?.text ?? ''
      if (text === 'no') throw new EvidenceError('Synthetic timeout', 'TIMEOUT')
      return [draft(text)]
    })
    const onVerified = vi.fn<EvidenceFragmentOptions['onVerified']>(async () => {})
    const opts = options(generator)
    const result = await extractEvidenceInFragments(input, { ...opts, onVerified,
      policy: { ...opts.policy, maximumCharacters: 2 } })
    expect(generator).toHaveBeenCalledTimes(3)
    expect(result.evidence.evidenceRecords).toEqual(onVerified.mock.calls.flatMap(call => call[1].evidenceRecords))
    expect(result.evidence.evidenceRecords).toHaveLength(2)
    expect(result.failures).toHaveLength(1)
    expect(result.incompleteFragments).toMatchObject([{ segmentIndex: 1, characterStart: 0, characterEnd: 2 }])
  })

  it('keeps transport retries on the same input without triggering smaller subsequent groups', async () => {
    const input = source(['abcd', 'EFGH'])
    let calls = 0
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async (request) => {
      if (++calls === 1) throw new EvidenceError('Synthetic connection failure', 'TRANSPORT')
      return [draft(request.segments[0]?.text ?? '')]
    })
    const opts = options(generator)
    const result = await extractEvidenceInFragments(input, { ...opts, policy: { ...opts.policy, maximumCharacters: 4 } })
    expect(generator.mock.calls.map(call => call[0].segments[0]?.text)).toEqual(['abcd', 'abcd', 'EFGH'])
    expect(result.evidence.evidenceRecords).toHaveLength(2)
    expect(result.incompleteFragments).toEqual([])
  })

  it('starts later groups smaller even when the first failure exhausts its attempt budget', async () => {
    const input = source(['abcdefgh', 'ABCDEFGH'])
    const generator = vi.fn<EvidenceFragmentOptions['generator']>(async (request) => {
      const text = request.segments[0]?.text ?? ''
      if (text.length === 8) throw new EvidenceError('Synthetic timeout', 'TIMEOUT')
      return [draft(text)]
    })
    const opts = options(generator)
    const result = await extractEvidenceInFragments(input, { ...opts,
      policy: { ...opts.policy, maximumAttempts: 1 } })
    expect(generator.mock.calls.map(call => call[0].segments[0]?.text)).toEqual(['abcdefgh', 'ABCD'])
    expect(result.evidence.evidenceRecords.map(record => record.sourcedStatement)).toEqual(['ABCD'])
    expect(result.incompleteFragments).toEqual([
      { fragmentIndex: 1, segmentIndex: 0, characterStart: 0, characterEnd: 8 },
      { fragmentIndex: 2, segmentIndex: 1, characterStart: 4, characterEnd: 8 },
    ])
  })
})
