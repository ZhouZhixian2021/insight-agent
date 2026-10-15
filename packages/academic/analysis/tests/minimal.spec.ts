import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSynthesisDraft, prepareSynthesisInput, synthesisPrompt, type AcademicSynthesisInput } from '../src/index.ts'

const samples = new URL('../../../../z-team_docs/interface-samples/academic-model-v1/', import.meta.url)
function input(): AcademicSynthesisInput {
  const value = JSON.parse(readFileSync(new URL('synthesis-input.sample.json', samples), 'utf8')) as AcademicSynthesisInput
  return { ...value, analysisInput: { ...value.analysisInput,
    evidenceCards: value.analysisInput.evidenceCards.map(card => ({ ...card, researchQuestions: [], methods: [],
      datasets: [], metrics: [], findings: [], limitations: [] })) } }
}
function response(): string { return readFileSync(new URL('synthesis-output.sample.json', samples), 'utf8') }

describe('minimal evidence consumption', () => {
  it('admits original records without manufacturing card entries or mutating the producer batch', () => {
    const value = input(), before = JSON.stringify(value)
    const admitted = prepareSynthesisInput(value)
    expect(admitted.status).toBe('ready')
    if (admitted.status === 'blocked') throw new Error('fixture blocked')
    expect(admitted.input.analysisInput.evidenceRecords).toEqual(value.analysisInput.evidenceRecords)
    expect(admitted.input.analysisInput.evidenceCards.every(card => card.findings.length === 0)).toBe(true)
    expect(admitted.limitations.filter(text => text.includes('证据卡部分分区'))).toHaveLength(1)
    expect(synthesisPrompt(value)).toContain('Minimal records do not authorize final delivery')
    expect(JSON.stringify(value)).toBe(before)
  })

  it('retains an unassigned record alongside a partially filled card without inferring fields', () => {
    const value = input(), original = value.analysisInput.evidenceRecords[0]!
    const standalone = { ...original, evidenceId: 'standalone-record' as typeof original.evidenceId }
    const supplied = JSON.parse(readFileSync(new URL('synthesis-input.sample.json', samples), 'utf8')) as AcademicSynthesisInput
    const result = prepareSynthesisInput({ ...supplied, analysisInput: { ...supplied.analysisInput,
      evidenceRecords: [...supplied.analysisInput.evidenceRecords, standalone] } })
    if (result.status === 'blocked') throw new Error('fixture blocked')
    expect(result.input.analysisInput.evidenceRecords).toContainEqual(standalone)
    expect(result.input.analysisInput.evidenceCards).toEqual(supplied.analysisInput.evidenceCards)
  })

  it.each(['hash', 'locator', 'excerpt', 'metadata', 'retracted', 'zero'] as const)('blocks unusable minimal input: %s', (kind) => {
    const value = input()
    const records = value.analysisInput.evidenceRecords.map(record => kind === 'hash'
      ? { ...record, contentHash: { status: 'available' as const, value: 'mismatch' } }
      : kind === 'excerpt' ? { ...record, verbatimExcerpt: { status: 'not_extracted' as const, reason: 'missing' } }
        : kind === 'metadata' ? { ...record, level: 'metadata' as const } : record)
    expect(prepareSynthesisInput({ ...value, analysisInput: { ...value.analysisInput,
      evidenceRecords: kind === 'zero' ? [] : records,
      sourceLocators: kind === 'locator' ? [] : value.analysisInput.sourceLocators,
      workVersions: value.analysisInput.workVersions.map(version => kind === 'retracted'
        ? { ...version, status: 'retracted' as const } : version),
    } }).status).toBe('blocked')
  })

  it('allows a limited draft only under the approved shortage policy', () => {
    const value = input()
    const brief = { ...value.brief, evidenceRequirements: { ...value.brief.evidenceRequirements,
      minimumIncludedWorks: 10, insufficientEvidencePolicy: 'continue_with_warning' as const } }
    expect(prepareSynthesisInput({ ...value, brief }).status).toBe('ready_with_warning')
    expect(prepareSynthesisInput({ ...value, brief: { ...brief, evidenceRequirements: { ...brief.evidenceRequirements,
      insufficientEvidencePolicy: 'stop_for_review' } } }).status).toBe('blocked')
  })

  it('does not count another question or a background link as supporting coverage', () => {
    const value = input(), record = value.analysisInput.evidenceRecords[0]!
    const linked = { ...value, analysisInput: { ...value.analysisInput, questionLinks: [
      { evidenceId: record.evidenceId, question: value.brief.questions[0]! },
    ] } }
    const admission = prepareSynthesisInput(linked)
    if (admission.status === 'blocked') throw new Error('fixture blocked')
    const draft = parseSynthesisDraft(response(), admission.input)
    expect(draft.questionAnswers[0]?.status).toBe('answered')
    expect(draft.questionAnswers[1]?.status).toBe('unanswered')
    expect(draft.questionAnswers[1]?.reason).toContain('生产方支持证据')
    expect(synthesisPrompt(linked)).toContain('"questionCoverage"')
    expect(parseSynthesisDraft(response(), { ...value, analysisInput: { ...value.analysisInput, questionLinks: [] } })
      .questionAnswers.every(answer => answer.status === 'unanswered')).toBe(true)
    const background = JSON.parse(response()) as { statements: {
      evidenceLinks: { evidenceId: string; relation: string; rationale: string }[]
    }[] }
    background.statements[1]!.evidenceLinks.push({ evidenceId: record.evidenceId, relation: 'background', rationale: 'background only' })
    expect(parseSynthesisDraft(JSON.stringify(background), admission.input).questionAnswers[1]?.status).toBe('unanswered')
  })
})
