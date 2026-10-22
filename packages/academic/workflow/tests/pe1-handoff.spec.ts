import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EvidenceError, extractEvidenceInFragments,
  type EvidenceDraft, type EvidenceExtractionInput } from '@deepseek-ai/dsh-academic-evidence'

interface Pe1EvidenceSample {
  readonly sampleSchemaVersion: 1
  readonly synthetic: true
  readonly input: EvidenceExtractionInput
  readonly firstFragmentDrafts: readonly EvidenceDraft[]
  readonly secondFragmentFailure: { readonly code: string; readonly category: 'timeout' }
  readonly expected: {
    readonly acceptedEvidenceRecords: number
    readonly rejectedDrafts: number
    readonly acceptedQuestionIndexes: readonly number[]
    readonly uncoveredQuestionIndexes: readonly number[]
    readonly incompleteFragments: number
    readonly paperStatus: 'partial_success'
    readonly draftAllowedWithWarning: true
    readonly draftAllowedWithoutEvidence: false
  }
}

const sample = JSON.parse(readFileSync(new URL(
  '../../../../z-team_docs/interface-samples/academic-model-v1/academic-pe1-evidence.sample.json', import.meta.url,
), 'utf8')) as Pe1EvidenceSample

describe('A-PE1 fixed evidence handoff', () => {
  it('retains verified first-fragment evidence and question links after a later timeout', async () => {
    expect(sample.sampleSchemaVersion).toBe(1)
    expect(sample.synthetic).toBe(true)
    const committed: string[] = []
    const result = await extractEvidenceInFragments(sample.input, {
      policy: { maximumCharacters: 120, minimumCharacters: 30, overlapCharacters: 0,
        maximumAttempts: 1, maximumOutputTokens: 512, initialRetryDelayMs: 0 },
      generator: async (_request, attempt) => {
        if (attempt.fragmentIndex === 1) return sample.firstFragmentDrafts
        throw new EvidenceError('Synthetic timeout', sample.secondFragmentFailure.code)
      },
      classifyFailure: error => error instanceof EvidenceError && error.code === sample.secondFragmentFailure.code
        ? sample.secondFragmentFailure.category : null,
      onVerified: async (_attempt, verified) => {
        committed.push(...verified.evidenceRecords.map(record => record.evidenceId))
      },
    })
    expect(result.evidence.evidenceRecords).toHaveLength(sample.expected.acceptedEvidenceRecords)
    expect(result.evidence.rejectedDrafts).toHaveLength(sample.expected.rejectedDrafts)
    expect(result.incompleteFragments).toHaveLength(sample.expected.incompleteFragments)
    expect(result.failures.map(failure => failure.category)).toEqual(['timeout'])
    expect(result.evidence.evidenceRecords.map(record => record.evidenceId)).toEqual(committed)
    expect(result.evidence.evidenceRecords[0]).toMatchObject({ level: 'fulltext',
      workVersionId: sample.input.workVersionId,
      verbatimExcerpt: { status: 'available', value: sample.firstFragmentDrafts[0]?.verbatimExcerpt } })
    const linked = result.evidence.questionLinks.map(link => sample.input.focusQuestions?.indexOf(link.question) ?? -1)
    expect(linked).toEqual(sample.expected.acceptedQuestionIndexes)
    expect(sample.input.focusQuestions?.map((_question, index) => index).filter(index => !linked.includes(index)))
      .toEqual(sample.expected.uncoveredQuestionIndexes)
    expect(result.evidence.evidenceCard.researchQuestions).toEqual([])
    expect(result.evidence.evidenceCard.findings).toEqual([])
    const paperStatus = result.evidence.evidenceRecords.length > 0 && result.incompleteFragments.length > 0
      ? 'partial_success' : 'unexpected'
    expect(paperStatus).toBe(sample.expected.paperStatus)
    expect(result.evidence.evidenceRecords.length > 0).toBe(sample.expected.draftAllowedWithWarning)
  })

  it('has no evidence to hand to a report when both fragments return nothing', async () => {
    const result = await extractEvidenceInFragments(sample.input, {
      policy: { maximumCharacters: 120, minimumCharacters: 30, overlapCharacters: 0,
        maximumAttempts: 1, maximumOutputTokens: 512, initialRetryDelayMs: 0 },
      generator: async () => [], classifyFailure: () => null, onVerified: async () => {},
    })
    expect(result.evidence.evidenceRecords).toEqual([])
    expect(result.evidence.questionLinks).toEqual([])
    expect(result.evidence.evidenceRecords.length > 0).toBe(sample.expected.draftAllowedWithoutEvidence)
  })
})
