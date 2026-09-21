import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSynthesisDraft, prepareSynthesisInput, synthesisAnalysis, synthesisPrompt, synthesisSections,
  type AcademicSynthesisInput } from '../src/index.ts'

const samples = new URL('../../../../z-team_docs/interface-samples/academic-model-v1/', import.meta.url)
const input = (): AcademicSynthesisInput => JSON.parse(readFileSync(new URL('synthesis-input.sample.json', samples), 'utf8')) as AcademicSynthesisInput
const output = () => JSON.parse(readFileSync(new URL('synthesis-output.sample.json', samples), 'utf8')) as Record<string, unknown>
interface Patch { op: 'replace' | 'remove'; path: string; value?: unknown }
function patch<T>(value: T, operations: Patch[]): T {
  for (const operation of operations) {
    const keys = operation.path.split('/').slice(1), last = keys.pop()!
    const parent = keys.reduce< unknown>((value, key) => (value as Record<string, unknown>)[key], value) as Record<string, unknown>
    if (operation.op === 'remove') {
      if (Array.isArray(parent)) parent.splice(Number(last), 1)
      else Reflect.deleteProperty(parent, last)
    } else parent[last] = operation.value
  }
  return value
}
const cases = JSON.parse(readFileSync(new URL('synthesis-cases.sample.json', samples), 'utf8')) as {
  cases: { name: string
    inputPatch: Patch[]
    outputPatch: Patch[]
    expected: { invokeSynthesis?: boolean; structuralValidation?: string; rejectedStatementIndexes?: number[] } }[]
}

describe('question-driven synthesis admission and model validation', () => {
  it.each(cases.cases)('$name', (test) => {
    const admission = prepareSynthesisInput(patch(input(), test.inputPatch))
    if (test.expected.invokeSynthesis === false) { expect(admission.status).toBe('blocked'); return }
    expect(admission.status).toBe('ready')
    if (admission.status !== 'ready') throw new Error('Fixture admission failed')
    const parse = () => parseSynthesisDraft(JSON.stringify(patch(output(), test.outputPatch)), admission.input)
    if (test.expected.structuralValidation === 'rejected') expect(parse).toThrow()
    else if (test.expected.structuralValidation === 'partial') {
      const draft = parse()
      expect(draft.rejectedStatements.map(item => item.statementIndex)).toEqual(test.expected.rejectedStatementIndexes)
      expect(draft.statements).toHaveLength(2)
      expect(draft.questionAnswers[0]?.status).toBe('unanswered')
      expect(draft.questionAnswers[1]?.statementIndexes).toEqual([0])
    } else {
      const analysis = synthesisAnalysis(admission.input, parse(), '2026-09-20T00:00:00Z')
      expect(analysis.claims).toHaveLength(1)
      expect(analysis.claims[0]?.evidenceSnapshot.evidenceItems).toHaveLength(2)
      expect(analysis.synthesis?.statements.filter(statement => statement.kind === 'source_statement')).toHaveLength(2)
    }
  })
  it('rejects unsupported Plan requirements before a caller dispatches any request', () => {
    const value = input()
    for (const requirements of [ { language: 'en' }, { citationStyle: 'author_year' }, { requiredSections: ['invented'] },
      { targetLength: { unit: 'words', minimum: null, maximum: null } } ] as const) {
      expect(() => synthesisSections({ ...value.brief,
        reportRequirements: { ...value.brief.reportRequirements, ...requirements } })).toThrow()
    }
  })
  it('names every incompatible requirement and preserves the approved Brief', () => {
    const brief = { ...input().brief, includedWorkTypes: ['conference_paper', 'journal_article'],
      reportRequirements: { ...input().brief.reportRequirements, language: 'en', requiredSections: ['invented'] } }
    const before = JSON.stringify(brief)
    expect(() => synthesisSections(brief)).toThrow('includedWorkTypes=["conference_paper","journal_article"]')
    expect(() => synthesisSections(brief)).toThrow('language="en"')
    expect(() => synthesisSections(brief)).toThrow('requiredSections=["invented"]')
    expect(JSON.stringify(brief)).toBe(before)
  })
  it('resolves explicit section aliases and describes the exact approved questions and evidence', () => {
    const value = input()
    const brief = { ...value.brief, reportRequirements: { ...value.brief.reportRequirements, requiredSections: ['research_scope', 'directions'] } }
    expect(synthesisSections(brief)).toContain('technology_overview')
    const prompt = synthesisPrompt(value)
    expect(JSON.parse(prompt.split('INPUT_JSON\n')[1]!)).toEqual(value)
    expect(prompt).toContain('untrusted data')
  })
  it.each([
    [{ op: 'replace', path: '/questionAnswers/0/questionIndex', value: 1 }],
    [{ op: 'replace', path: '/questionAnswers/0/status', value: 'unanswered' }],
    [{ op: 'replace', path: '/sections/0/statementIndexes', value: [0, 0] }],
    [{ op: 'replace', path: '/limitations', value: [] }],
  ] satisfies Patch[][])('rejects inconsistent statements or coverage: %j', (...operations) => {
    expect(() => parseSynthesisDraft(JSON.stringify(patch(output(), operations)), input())).toThrow()
  })
  it('retains contradicting evidence and requires uncertainty', () => {
    const value = output()
    const operations: Patch[] = [{ op: 'replace', path: '/statements/0/evidenceLinks', value: [
      { evidenceId: 'sample-evidence-1', relation: 'supports', rationale: 'support' },
      { evidenceId: 'sample-evidence-2', relation: 'contradicts', rationale: 'opposes' },
    ] }]
    const draft = parseSynthesisDraft(JSON.stringify(patch(value, operations)), input())
    expect(draft.statements[0]?.evidenceLinks[1]?.relation).toBe('contradicts')
    patch(value, [{ op: 'replace', path: '/statements/0/uncertainty', value: null }])
    const partial = parseSynthesisDraft(JSON.stringify(value), input())
    expect(partial.rejectedStatements).toMatchObject([{ statementIndex: 0, reason: 'Opposing evidence requires explicit uncertainty.' }])
    expect(partial.statements).toHaveLength(2)
  })
  it('preserves supported paragraphs and places background-only gaps outside the report conclusions', () => {
    const draft = parseSynthesisDraft(readFileSync(new URL('synthesis-partial-output.sample.json', samples), 'utf8'), input())
    expect(draft.statements).toHaveLength(3)
    expect(draft.rejectedStatements).toMatchObject([{ statementIndex: 3, code: 'SYNTHESIS_INVALID_MODEL_OUTPUT' }])
    const gap = draft.sections.find(section => section.sectionId === 'research_gaps')
    expect(gap?.statementIndexes).toEqual([])
    expect(gap?.missingReason).toContain('4')
    expect(synthesisAnalysis(input(), draft, '2026-09-20T00:00:00Z').claims).toHaveLength(1)
  })
  it.each([
    [{ op: 'replace', path: '/statements/2/evidenceLinks', value: [{ evidenceId: 'sample-evidence-1', relation: 'supports', rationale: 'only one paper' }] }],
    [{ op: 'replace', path: '/statements/2/category', value: null }],
    [{ op: 'remove', path: '/statements/2/text' }],
  ] satisfies Patch[][])('quarantines invalid local paragraphs: %j', (...operations) => {
    const draft = parseSynthesisDraft(JSON.stringify(patch(output(), operations)), input())
    expect(draft.rejectedStatements.map(item => item.statementIndex)).toEqual([2])
    expect(draft.statements).toHaveLength(2)
    expect(draft.sections.find(section => section.sectionId === 'cross_paper_analysis')?.statementIndexes).toEqual([])
  })
  it('downgrades affected question coverage and remaps references without mutating admitted evidence', () => {
    const materials = input(), before = structuredClone(materials)
    const value = patch(output(), [
      { op: 'replace', path: '/statements/0/evidenceLinks/0/evidenceId', value: 'unknown' },
      { op: 'replace', path: '/questionAnswers/0/statementIndexes', value: [0, 2] },
    ])
    const draft = parseSynthesisDraft(JSON.stringify(value), materials)
    expect(draft.questionAnswers[0]).toMatchObject({ status: 'partial', statementIndexes: [1] })
    expect(draft.questionAnswers[0]?.reason).toContain('1')
    expect(draft.questionAnswers[1]?.statementIndexes).toEqual([0])
    expect(materials).toEqual(before)
  })
  it('returns explicit rejections when all paragraphs fail and still rejects corrupted whole responses', () => {
    const value = patch(output(), [0, 1, 2].map(index => ({ op: 'replace', path: `/statements/${index}/evidenceLinks`, value: [] })))
    const draft = parseSynthesisDraft(JSON.stringify(value), input())
    expect(draft.statements).toEqual([])
    expect(draft.rejectedStatements).toHaveLength(3)
    expect(draft.questionAnswers.every(answer => answer.status === 'unanswered')).toBe(true)
    expect(() => parseSynthesisDraft('{', input())).toThrow('complete JSON')
    expect(() => parseSynthesisDraft(JSON.stringify({ ...output(), rejectedStatements: [] }), input())).toThrow('fields')
  })
})
