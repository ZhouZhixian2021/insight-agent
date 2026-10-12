import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compactSynthesisPrompt, synthesisPrompt, synthesisRepairPrompt, type AcademicSynthesisInput } from '../src/index.ts'
import { comparisonContext, evidenceReadingGuide } from '../src/evidence-reading.ts'
import { batch, paper } from './fixtures.ts'

const fixture = (): AcademicSynthesisInput => JSON.parse(readFileSync(
  new URL('../../../../z-team_docs/interface-samples/academic-model-v1/synthesis-input.sample.json', import.meta.url), 'utf8')) as AcademicSynthesisInput

function guide(prompt: string): ReturnType<typeof evidenceReadingGuide> {
  return JSON.parse(prompt.split('EVIDENCE_READING_GUIDE_JSON\n')[1]!.split('\nINPUT_JSON')[0]!) as ReturnType<typeof evidenceReadingGuide>
}

describe('question-focused evidence reading', () => {
  it('adds a source-role guide to full, compact and repair requests without altering incoming evidence', () => {
    const input = fixture(), before = structuredClone(input)
    const prompts = [synthesisPrompt(input), compactSynthesisPrompt(input), synthesisRepairPrompt(input, 'invalid layout', false)]
    for (const prompt of prompts) {
      expect(guide(prompt).evidenceRoles.map(row => row.evidenceId)).toEqual(input.analysisInput.evidenceRecords.map(row => row.evidenceId))
      expect(prompt).toContain('not merely evidence mentioning the topic')
      expect(prompt).toContain('different conditions with different results are')
      expect(prompt).toContain('Missing comparison conditions mean the comparison is indeterminate')
      expect(prompt).toContain('Do not infer causation from correlation')
    }
    expect(JSON.parse(prompts[0]!.split('INPUT_JSON\n')[1]!)).toEqual(before)
    expect(input).toEqual(before)
    expect(guide(prompts[0]!).evidenceRoles[0]!.cardSections).toEqual(['methods'])
    expect(guide(prompts[0]!).evidenceRoles[0]).not.toHaveProperty('relation')
  })
  it('does not submit excluded records in either the reading guide or the complete prompt payload', () => {
    const original = fixture(), before = structuredClone(original)
    const input: AcademicSynthesisInput = { ...original, analysisInput: { ...original.analysisInput,
      evidenceRecords: original.analysisInput.evidenceRecords.map((record, index) =>
        index === 0 ? { ...record, contentHash: { status: 'available', value: 'conflicting-hash' } } : record) } }
    const excluded = input.analysisInput.evidenceRecords[0]!.evidenceId
    const prompt = synthesisPrompt(input), submitted = JSON.parse(prompt.split('INPUT_JSON\n')[1]!) as AcademicSynthesisInput
    expect(guide(prompt).evidenceRoles.some(row => row.evidenceId === excluded)).toBe(false)
    expect(submitted.analysisInput.evidenceRecords.some((row: { evidenceId: string }) => row.evidenceId === excluded)).toBe(false)
    expect(original).toEqual(before)
    expect(input.analysisInput.evidenceRecords).toHaveLength(before.analysisInput.evidenceRecords.length)
    expect(input.analysisInput.evidenceRecords[0]!.contentHash).toEqual({ status: 'available', value: 'conflicting-hash' })
  })
  it('groups only exact same-source excerpts and retains all original IDs', () => {
    const input = fixture(), original = input.analysisInput.evidenceRecords[0]!
    const duplicate = { ...original, evidenceId: 'same-source-copy' as typeof original.evidenceId }
    const otherWork = { ...duplicate, evidenceId: 'different-work' as typeof original.evidenceId,
      academicWorkId: input.analysisInput.evidenceRecords[1]!.academicWorkId }
    const otherVersion = { ...duplicate, evidenceId: 'different-version' as typeof original.evidenceId,
      workVersionId: input.analysisInput.evidenceRecords[1]!.workVersionId }
    const otherLocator = { ...duplicate, evidenceId: 'different-locator' as typeof original.evidenceId,
      sourceLocatorId: input.analysisInput.evidenceRecords[1]!.sourceLocatorId }
    const unknownHash = { ...duplicate, evidenceId: 'unknown-hash' as typeof original.evidenceId,
      contentHash: { status: 'not_extracted' as const } }
    const unknownExcerpt = { ...duplicate, evidenceId: 'unknown-excerpt' as typeof original.evidenceId,
      verbatimExcerpt: { status: 'not_extracted' as const } }
    const records = [original, duplicate, otherWork, otherVersion, otherLocator, unknownHash, unknownExcerpt]
    const result = evidenceReadingGuide({ ...input, analysisInput: { ...input.analysisInput, evidenceRecords: records } })
    expect(result.identicalSourceGroups).toEqual([[original.evidenceId, duplicate.evidenceId]])
    expect(result.evidenceRoles.map(row => row.evidenceId)).toEqual(records.map(row => row.evidenceId))
  })
  it('retains dataset, measurement context and explicitly unavailable conditions in compact recovery', () => {
    const input = fixture(), a = paper('conditions-a'), b = paper('conditions-b')
    a.card = { ...a.card, findings: [{ ...a.card.methods[0]!, findingType: { status: 'available', value: 'primary' },
      conditions: { status: 'unknown', reason: 'Study conditions were not supplied.' } }] }
    const request = { ...input, analysisInput: batch(a, b) }
    const compact = compactSynthesisPrompt(request)
    const value = JSON.parse(compact.split('INPUT_JSON\n')[1]!) as { comparisonContext: ReturnType<typeof comparisonContext> }
    expect(value.comparisonContext[0]!.datasets[0]!.datasetName).toEqual(a.card.datasets[0]!.datasetName)
    expect(value.comparisonContext[0]!.metrics[0]!.evaluationContext).toEqual(a.card.metrics[0]!.evaluationContext)
    expect(value.comparisonContext[0]!.findings[0]!.conditions).toEqual(a.card.findings[0]!.conditions)
    expect(compact.length).toBeLessThan(synthesisPrompt(request).length)
  })
})
