import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSynthesisDraft, synthesisPrompt, type AcademicSynthesisInput } from '../src/index.ts'
import { academicReportFormat } from '../src/report-format.ts'

const root = new URL('../../../../z-team_docs/interface-samples/academic-model-v1/', import.meta.url)
const input = (): AcademicSynthesisInput => JSON.parse(readFileSync(new URL('synthesis-input.sample.json', root), 'utf8')) as AcademicSynthesisInput
interface Component { statementIndexes: number[]; missingReason: string | null }
interface Direction {
  title: string
  layer: string
  questionIndexes: number[]
  overview: Component
  themes: (Component & { title: string })[]
  themeLimit: string | null
  mechanism: Component
  keyResults: Component & { quantitative: boolean }
  judgment: Component
  implications: Component
}
const output = () => JSON.parse(readFileSync(new URL('synthesis-partial-output.sample.json', root), 'utf8')) as {
  directions: Direction[]
}

describe('executable direction report layout', () => {
  it('retains the historical preset reference while new requests select evidence narrative writing', () => {
    const source = readFileSync(new URL('../../../preset/agent-presets/presets/academic/skills/academic-insight-report/references/report-format.md', import.meta.url), 'utf8')
    expect(academicReportFormat).toBe(source.replaceAll('\r\n', '\n').trimEnd() + '\n')
    const prompt = synthesisPrompt(input())
    expect(prompt).toContain('writingStyle:"evidence_narrative"')
    expect(prompt).toContain('directions may be omitted')
    expect(prompt).toContain('PaperQA')
  })
  it('keeps every approved question and source identity while quarantining an unsupported paragraph', () => {
    const source = input(), raw = output(), before = JSON.stringify(raw)
    const draft = parseSynthesisDraft(JSON.stringify(raw), source)
    expect(draft.directions).toHaveLength(2)
    expect(draft.directions!.flatMap(row => row.questionIndexes)).toEqual([0, 1])
    expect(draft.rejectedStatements).toHaveLength(1)
    expect(draft.statements[0]!.evidenceLinks[0]!.evidenceId).toBe(source.analysisInput.evidenceRecords[0]!.evidenceId)
    expect(JSON.stringify(raw)).toBe(before)
  })
  it.each(['question', 'component', 'theme', 'uncited-prose'] as const)('rejects invalid direction %s instead of rendering it', (fault) => {
    const raw = output(), direction = raw.directions[0]!
    if (fault === 'question') direction.questionIndexes = [50]
    if (fault === 'component') direction.overview.missingReason = 'Also missing'
    if (fault === 'theme') direction.themeLimit = null
    if (fault === 'uncited-prose') Object.assign(direction.overview, { text: 'An unreferenced claim' })
    expect(() => parseSynthesisDraft(JSON.stringify(raw), input())).toThrow()
  })
  it('removes rejected themes and records the resulting coverage limit', () => {
    const raw = output(), direction = raw.directions[0]!
    direction.themes.push({ title: 'Unsupported gap', statementIndexes: [3], missingReason: null })
    direction.themeLimit = null
    const draft = parseSynthesisDraft(JSON.stringify(raw), input())
    expect(draft.directions![0]!.themes).toHaveLength(1)
    expect(draft.directions![0]!.themeLimit).toContain('未通过校验')
  })
  it('requires full-text support for declared numerical results', () => {
    const raw = output(), source = input()
    raw.directions[0]!.keyResults = { statementIndexes: [0], missingReason: null, quantitative: true }
    const abstractOnly = { ...source, analysisInput: { ...source.analysisInput,
      evidenceRecords: source.analysisInput.evidenceRecords.map((record, index) => index === 0 ? { ...record, level: 'abstract' as const } : record) } }
    expect(() => parseSynthesisDraft(JSON.stringify(raw), abstractOnly)).toThrow('full-text')
    expect(parseSynthesisDraft(JSON.stringify(raw), source).directions![0]!.keyResults.quantitative).toBe(true)
  })
  it('reads an existing question-only output without claiming a direction layout', () => {
    const raw = JSON.parse(readFileSync(new URL('synthesis-output.sample.json', root), 'utf8')) as unknown
    expect(parseSynthesisDraft(JSON.stringify(raw), input()).directions).toBeUndefined()
  })
})
