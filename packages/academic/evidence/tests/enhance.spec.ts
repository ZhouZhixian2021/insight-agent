import { describe, expect, it, vi } from 'vitest'
import { createAcademicWorkId, createWorkVersionId, createEvidenceId, createEvidenceCardItemId } from '@deepseek-ai/dsh-academic-model'
import { enhanceEvidenceInFragments, extractEvidenceFromContent, EvidenceError,
  type EvidenceCardItemDraft, type EvidenceDraft, type EvidenceExtractionInput,
  type EvidenceExtractionResult, type EvidenceFragmentOptions } from '../src/index.ts'

function source(): EvidenceExtractionInput {
  return { academicWorkId: createAcademicWorkId(), workVersionId: createWorkVersionId(), contentHash: 'sha256:paper',
    sourceProvider: 'fixture', sourceUrl: 'https://example.org/paper', retrievedAt: '2026-10-15T00:00:00Z',
    extractionMethod: { method: 'fixture', methodVersion: '1' }, focusQuestions: ['Which fact?', 'What limitation?'],
    segments: ['question', 'method!!', 'dataset!', 'metric!!', 'finding!', 'limits!!', 'extra!!!'].map((text, index) => ({
      text, locator: { kind: 'paragraph', paragraphNumber: index + 1 },
    })) }
}

const sections: readonly EvidenceCardItemDraft[] = [
  { section: 'researchQuestions', statement: 'Question', questionType: { status: 'not_extracted' } },
  { section: 'methods', statement: 'Method', methodName: { status: 'not_extracted' }, methodRole: { status: 'not_extracted' } },
  { section: 'datasets', statement: 'Dataset', datasetName: { status: 'not_extracted' }, version: { status: 'not_extracted' },
    split: { status: 'not_extracted' }, scale: { status: 'not_extracted' } },
  { section: 'metrics', statement: 'Metric', metricName: { status: 'not_extracted' }, value: { status: 'not_extracted' },
    unit: { status: 'not_extracted' }, direction: { status: 'not_extracted' }, evaluationContext: { status: 'not_extracted' } },
  { section: 'findings', statement: 'Finding', findingType: { status: 'not_extracted' }, conditions: { status: 'not_extracted' } },
  { section: 'limitations', statement: 'Limitation', limitationType: { status: 'not_extracted' } },
]

function draft(text: string, cardItems: readonly EvidenceCardItemDraft[] = []): EvidenceDraft {
  return { segmentIndex: 0, sourcedStatement: text, verbatimExcerpt: text, questionIndexes: [0], cardItems }
}

function initial(input: EvidenceExtractionInput): Promise<EvidenceExtractionResult> {
  return extractEvidenceFromContent({ ...input, depth: 'minimal' }, async () => [draft('question')])
}

function options(overrides: Partial<EvidenceFragmentOptions> = {}): EvidenceFragmentOptions {
  return { policy: { maximumCharacters: 8, minimumCharacters: 2, overlapCharacters: 0, maximumAttempts: 1,
    maximumOutputTokens: 512, initialRetryDelayMs: 0 },
  generator: async (request, attempt) => [draft(request.segments[0]?.text ?? '', sections.slice(attempt.fragmentIndex - 1, attempt.fragmentIndex))],
  classifyFailure: error => error instanceof EvidenceError && error.code === 'TIMEOUT' ? 'timeout' : null,
  onVerified: async () => {}, ...overrides }
}

describe('enhanceEvidenceInFragments', () => {
  it('adds all six sections beyond the minimal cap while retaining committed identities and provenance', async () => {
    const input = { ...source(), depth: 'minimal' as const }
    const seed = await initial(input)
    const original = structuredClone(seed)
    const onVerified = vi.fn<EvidenceFragmentOptions['onVerified']>(async () => {})
    const generator = vi.fn(options().generator)
    const result = await enhanceEvidenceInFragments({ ...input, sourceProvider: 'mirror', sourceUrl: 'https://example.org/mirror',
      retrievedAt: '2026-10-15T01:00:00Z', extractionMethod: { method: 'enhancement', methodVersion: '2' } }, seed, options({ generator, onVerified }))
    expect(seed).toEqual(original)
    expect(result.evidence.evidenceRecords).toHaveLength(7)
    expect(generator.mock.calls.every(call => call[0].instruction.includes(
      'Classify each supported fact into researchQuestions, methods, datasets, metrics, findings, or limitations.',
    ))).toBe(true)
    expect(result.evidence.evidenceRecords[0]).toBe(seed.evidenceRecords[0])
    expect(result.evidence.sourceLocators[0]).toBe(seed.sourceLocators[0])
    expect(result.evidence.evidenceCard.evidenceCardId).toBe(seed.evidenceCard.evidenceCardId)
    expect(result.evidence.evidenceRecords.slice(1).every(record => record.sourceProvider === 'mirror'
      && record.extractionMethod.method === 'enhancement')).toBe(true)
    for (const section of sections) {
      expect(result.evidence.evidenceCard[section.section]).toHaveLength(1)
    }
    expect(result.evidence.evidenceCard.researchQuestions[0]?.evidenceIds).toEqual([seed.evidenceRecords[0]?.evidenceId])
    expect(onVerified.mock.calls[0]?.[1].evidenceRecords).toEqual([])
    expect(onVerified.mock.calls.every(call => call[1].evidenceCard.evidenceCardId === seed.evidenceCard.evidenceCardId)).toBe(true)
    expect(onVerified.mock.calls.flatMap(call => call[1].evidenceRecords)).toEqual(result.evidence.evidenceRecords.slice(1))
    expect(onVerified.mock.calls.flatMap(call => call[1].evidenceCard.researchQuestions))
      .toEqual(result.evidence.evidenceCard.researchQuestions)
    expect(result.failures).toEqual([])
    expect(result.incompleteFragments).toEqual([])
  })

  it('reuses evidence across overlapping drafts but retains new sections and question links', async () => {
    const input = { ...source(), segments: Array.from({ length: 3 }, () => ({
      text: 'question', locator: { kind: 'paragraph' as const, paragraphNumber: 1 },
    })) }
    const seed = await initial(input)
    const result = await enhanceEvidenceInFragments(input, seed, options({ generator: async (_request, attempt) => {
      return attempt.fragmentIndex === 1 ? [draft('question', sections.slice(0, 1))]
        : [{ ...draft('question', sections.slice(1, 2)), questionIndexes: [0, 1] }, draft('question', sections.slice(4, 5))]
    } }))
    expect(result.evidence.evidenceRecords).toEqual(seed.evidenceRecords)
    expect(result.evidence.sourceLocators).toEqual(seed.sourceLocators)
    expect(result.evidence.questionLinks).toEqual([
      ...seed.questionLinks, { evidenceId: seed.evidenceRecords[0]?.evidenceId, question: input.focusQuestions?.[1] },
    ])
    expect(result.evidence.evidenceCard.methods).toHaveLength(1)
    expect(result.evidence.evidenceCard.findings).toHaveLength(1)
    expect(result.evidence.evidenceCard.methods[0]?.evidenceIds).toEqual([seed.evidenceRecords[0]?.evidenceId])
    const repeated = await enhanceEvidenceInFragments(input, result.evidence, options({ generator: async () => [
      draft('question', sections.slice(0, 2)), draft('question', sections.slice(4, 5)),
    ] }))
    expect(repeated.evidence).toEqual(result.evidence)
  })

  it('keeps new evidence even when an invalid sibling and later fragment fail', async () => {
    const input = source(), seed = await initial(input)
    const result = await enhanceEvidenceInFragments(input, seed, options({ generator: async (request, attempt) => {
      if (attempt.fragmentIndex === 1) return []
      if (attempt.fragmentIndex > 2) throw new EvidenceError('Synthetic timeout', 'TIMEOUT')
      return [draft('absent'), draft(request.segments[0]?.text ?? '', sections.slice(1, 2))]
    } }))
    expect(result.evidence.evidenceRecords).toHaveLength(2)
    expect(result.evidence.evidenceRecords[0]).toBe(seed.evidenceRecords[0])
    expect(result.evidence.rejectedDrafts).toMatchObject([{ code: 'EVIDENCE_EXCERPT_NOT_FOUND' }])
    expect(result.evidence.evidenceCard.methods).toHaveLength(1)
    expect(result.failures).toHaveLength(5)
    expect(result.incompleteFragments).toHaveLength(5)
  })

  it('matches persisted evidence and classifications regardless of JSON field order', async () => {
    const input = source()
    const first = await extractEvidenceFromContent({ ...input, depth: 'minimal' }, async () => [
      draft('question', [{ section: 'methods', statement: 'Method', methodName: { status: 'available', value: 'method' },
        methodRole: { status: 'not_extracted' } }]),
    ])
    const seed = { ...first, sourceLocators: first.sourceLocators.map(locator =>
      Object.fromEntries(Object.entries(locator).reverse()) as typeof locator) }
    const result = await enhanceEvidenceInFragments(input, seed, options({
      generator: async (_request, attempt) => attempt.fragmentIndex === 1 ? [
        draft('question', [{ methodRole: { status: 'not_extracted' }, methodName: { value: 'method', status: 'available' },
          statement: 'Method', section: 'methods' }]),
      ] : [],
    }))
    expect(result.evidence).toEqual(seed)
    expect(result.evidence.evidenceCard.methods[0]).toBe(seed.evidenceCard.methods[0])
  })

  it('returns the original evidence when every enhancement fragment fails', async () => {
    const input = source(), seed = await initial(input)
    const onVerified = vi.fn<EvidenceFragmentOptions['onVerified']>(async () => {})
    const result = await enhanceEvidenceInFragments(input, seed, options({ onVerified,
      generator: async () => { throw new EvidenceError('Synthetic timeout', 'TIMEOUT') } }))
    expect(result.evidence).toBe(seed)
    expect(result.failures).toHaveLength(7)
    expect(result.incompleteFragments).toHaveLength(7)
    expect(onVerified).not.toHaveBeenCalled()
  })

  it.each(['paper', 'version', 'hash', 'locator', 'locatorVersion', 'record', 'recordPaper', 'recordVersion',
    'recordHash', 'question', 'card', 'empty'] as const)(
    'refuses mismatched %s before model dispatch', async (mismatch) => {
      const input = source(), seed = await initial(input)
      const generator = vi.fn(options().generator)
      let changed = seed
      switch (mismatch) {
        case 'paper': changed = { ...seed, evidenceCard: { ...seed.evidenceCard, academicWorkId: createAcademicWorkId() } }; break
        case 'version': changed = { ...seed, evidenceCard: { ...seed.evidenceCard, workVersionId: createWorkVersionId() } }; break
        case 'hash': changed = { ...seed, sourceLocators: seed.sourceLocators.map(locator => ({ ...locator, contentHash: 'other' })) }; break
        case 'locator': changed = { ...seed, sourceLocators: [] }; break
        case 'locatorVersion': changed = { ...seed, sourceLocators: seed.sourceLocators.map(locator => ({ ...locator, workVersionId: createWorkVersionId() })) }; break
        case 'record': changed = { ...seed, evidenceRecords: seed.evidenceRecords.map(record => ({ ...record, contentHash: { status: 'not_extracted' } })) }; break
        case 'recordPaper': changed = { ...seed, evidenceRecords: seed.evidenceRecords.map(record => ({ ...record, academicWorkId: createAcademicWorkId() })) }; break
        case 'recordVersion': changed = { ...seed, evidenceRecords: seed.evidenceRecords.map(record => ({ ...record, workVersionId: createWorkVersionId() })) }; break
        case 'recordHash': changed = { ...seed, evidenceRecords: seed.evidenceRecords.map(record => ({ ...record, contentHash: { status: 'available', value: 'other' } })) }; break
        case 'question': changed = { ...seed, questionLinks: [{ evidenceId: createEvidenceId(), question: 'Which fact?' }] }; break
        case 'card': changed = { ...seed, evidenceCard: { ...seed.evidenceCard,
          methods: [{ statement: 'Method', methodName: { status: 'not_extracted' }, methodRole: { status: 'not_extracted' },
            evidenceCardItemId: createEvidenceCardItemId(), evidenceIds: [createEvidenceId()] }] } }; break
        case 'empty': changed = await extractEvidenceFromContent(input, async () => []); break
      }
      await expect(enhanceEvidenceInFragments(input, changed, options({ generator })))
        .rejects.toMatchObject({ code: 'EVIDENCE_INVALID_ENHANCEMENT' })
      expect(generator).not.toHaveBeenCalled()
    })

  it('propagates sink failure before another model dispatch', async () => {
    const input = source(), seed = await initial(input)
    const failure = new Error('Storage unavailable')
    const generator = vi.fn(options().generator), classifyFailure = vi.fn(options().classifyFailure)
    await expect(enhanceEvidenceInFragments(input, seed, options({ generator, classifyFailure,
      onVerified: async () => { throw failure } }))).rejects.toBe(failure)
    expect(generator).toHaveBeenCalledTimes(1)
    expect(classifyFailure).not.toHaveBeenCalled()
    expect(seed.evidenceCard.researchQuestions).toEqual([])
  })

  it('propagates cancellation with the committed addition retained by the sink', async () => {
    const input = source(), seed = await initial(input), controller = new AbortController()
    const reason = new Error('Cancelled')
    const generator = vi.fn(options().generator)
    const onVerified = vi.fn<EvidenceFragmentOptions['onVerified']>(async () => { controller.abort(reason) })
    await expect(enhanceEvidenceInFragments(input, seed, options({ generator, onVerified }), controller.signal)).rejects.toBe(reason)
    expect(generator).toHaveBeenCalledTimes(1)
    expect(onVerified.mock.calls[0]?.[1].evidenceCard.researchQuestions[0]?.evidenceIds)
      .toEqual([seed.evidenceRecords[0]?.evidenceId])
    expect(seed.evidenceCard.researchQuestions).toEqual([])
  })

  it('propagates an unclassified generator failure without discarding the initial evidence', async () => {
    const input = source(), seed = await initial(input), failure = new Error('Unexpected failure')
    await expect(enhanceEvidenceInFragments(input, seed, options({ generator: async () => { throw failure } }))).rejects.toBe(failure)
    expect(seed.evidenceRecords).toHaveLength(1)
  })
})
