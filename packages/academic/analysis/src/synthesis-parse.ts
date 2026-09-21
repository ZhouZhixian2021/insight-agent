/** Validate untrusted synthesis JSON without granting semantic approval. */
import type { EvidenceId, EvidenceRecord } from '@deepseek-ai/dsh-academic-model'
import { SYNTHESIS_SECTIONS, SynthesisError, type AcademicSynthesisDraft, type AcademicSynthesisInput,
  type SynthesisStatement, type RejectedSynthesisStatement } from './synthesis-types.ts'
import { synthesisSections } from './synthesis-input.ts'

function invalid(message: string): never { throw new SynthesisError(message, 'SYNTHESIS_INVALID_MODEL_OUTPUT') }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid('Expected an object.')
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return invalid('Missing or unexpected fields.')
  return value as Record<string, unknown>
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : invalid('Expected an array.') }
function text(value: unknown): string { return typeof value === 'string' && value.trim() !== '' ? value : invalid('Expected non-empty text.') }
function nullable(value: unknown): string | null { return value === null ? null : text(value) }
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  return typeof value === 'string' && choices.includes(value as T) ? value as T : invalid('Unexpected enum value.')
}
function indexes(value: unknown, maximum: number): number[] {
  const result = array(value).map(item => typeof item === 'number' && Number.isSafeInteger(item) && item >= 0 && item < maximum
    ? item : invalid('Statement index is outside the submitted statements.'))
  if (new Set(result).size !== result.length) invalid('Duplicate statement indexes.')
  return result
}

/**
 * Parse complete JSON, quarantining invalid paragraphs without weakening evidence checks.
 * @param response Complete JSON text; Markdown framing and extra fields are rejected.
 * @param input Admitted immutable request materials.
 * @returns Valid paragraphs, remapped question/section references and original-index rejection reasons; all paragraphs may be rejected.
 * @throws SynthesisError for invalid JSON, a different Brief, or an invalid question/section layout.
 */
export function parseSynthesisDraft(response: string, input: AcademicSynthesisInput): AcademicSynthesisDraft {
  let value: unknown
  try { value = JSON.parse(response) } catch { return invalid('Expected complete JSON.') }
  const root = object(value, ['schemaVersion', 'researchBriefId', 'researchBriefVersion',
    'statements', 'questionAnswers', 'sections', 'limitations'])
  if (root.schemaVersion !== 1 || root.researchBriefId !== input.brief.researchBriefId
    || root.researchBriefVersion !== input.brief.version) {
    invalid('Synthesis must reference the exact approved Brief version.')
  }
  const evidence = new Map(input.analysisInput.evidenceRecords.map(record => [record.evidenceId, record]))
  const candidates = array(root.statements)
  const questionAnswers = parseQuestions(root.questionAnswers, input.brief.questions.length, candidates.length)
  const sections = parseSections(root.sections, candidates.length)
  if (synthesisSections(input.brief).some(required => !sections.some(section => section.sectionId === required))) {
    invalid('A required section is missing; include it with an explicit missingReason when evidence is insufficient.')
  }
  const limitations = array(root.limitations).map(text)
  if (limitations.length === 0) invalid('Limitations must be disclosed.')
  const referenced = new Set([...questionAnswers, ...sections].flatMap(item => item.statementIndexes))
  if (referenced.size !== candidates.length) invalid('Every statement must belong to a question or section.')
  const statements: SynthesisStatement[] = [], rejectedStatements: RejectedSynthesisStatement[] = []
  const retained = new Map<number, number>()
  candidates.forEach((value, statementIndex) => {
    let statement: SynthesisStatement
    try { statement = parseStatement(value, evidence) } catch (error: unknown) {
      if (!(error instanceof SynthesisError)) throw error
      rejectedStatements.push({ statementIndex, code: error.code, reason: error.message })
      return
    }
    retained.set(statementIndex, statements.length)
    statements.push(statement)
  })
  const remap = (original: readonly number[]) => original.flatMap((index) => {
    const mapped = retained.get(index)
    return mapped === undefined ? [] : [mapped]
  })
  const rejectionReason = (original: readonly number[]) =>
    `模型候选段落 ${original.filter(index => !retained.has(index)).map(index => index + 1).join('、')} 未通过校验，相关内容尚未完整覆盖。`
  return { schemaVersion: 1, researchBriefId: input.brief.researchBriefId, researchBriefVersion: input.brief.version,
    statements, limitations, rejectedStatements,
    questionAnswers: questionAnswers.map((answer) => {
      const statementIndexes = remap(answer.statementIndexes)
      if (statementIndexes.length === answer.statementIndexes.length) return { ...answer, statementIndexes }
      return { ...answer, statementIndexes, status: statementIndexes.length === 0 ? 'unanswered' : 'partial',
        reason: [answer.reason, rejectionReason(answer.statementIndexes)].filter(reason => reason !== null).join(' ') }
    }),
    sections: sections.map((section) => {
      const statementIndexes = remap(section.statementIndexes)
      return { ...section, statementIndexes, missingReason: statementIndexes.length === 0 && section.statementIndexes.length > 0
        ? rejectionReason(section.statementIndexes) : section.missingReason }
    }),
  }
}

function parseStatement(value: unknown, evidence: ReadonlyMap<EvidenceId, EvidenceRecord>): SynthesisStatement {
  const item = object(value, ['text', 'kind', 'category', 'scope', 'uncertainty', 'evidenceLinks'])
  const kind = choice(item.kind, ['source_statement', 'synthesis'])
  const category = item.category === null ? null : choice(item.category, ['consensus', 'trend', 'comparison', 'disagreement', 'research_gap', 'limitation'])
  if ((kind === 'source_statement') !== (category === null)) invalid('Only synthesis statements have a Claim category.')
  const evidenceLinks = array(item.evidenceLinks).map((value) => {
    const link = object(value, ['evidenceId', 'relation', 'rationale'])
    const evidenceId = text(link.evidenceId) as EvidenceId
    if (!evidence.has(evidenceId)) invalid('A statement references evidence outside the admitted request.')
    return { evidenceId, relation: choice(link.relation, ['supports', 'contradicts', 'background']), rationale: text(link.rationale) }
  })
  if (new Set(evidenceLinks.map(link => link.evidenceId)).size !== evidenceLinks.length) invalid('Duplicate evidence links.')
  const supportingWorks = new Set(evidenceLinks.filter(link => link.relation === 'supports').map(link => evidence.get(link.evidenceId)?.academicWorkId))
  if (supportingWorks.size < (kind === 'synthesis' ? 2 : 1)) invalid('Supporting independent works are insufficient for this statement kind.')
  const uncertainty = nullable(item.uncertainty)
  if (uncertainty === null && evidenceLinks.some(link => link.relation === 'contradicts')) invalid('Opposing evidence requires explicit uncertainty.')
  return { text: text(item.text), kind, category, scope: text(item.scope), uncertainty, evidenceLinks }
}

function parseQuestions(value: unknown, count: number, statementCount: number): AcademicSynthesisDraft['questionAnswers'] {
  const questionAnswers = array(value).map((value, index) => {
    const item = object(value, ['questionIndex', 'status', 'statementIndexes', 'reason'])
    if (item.questionIndex !== index || index >= count) invalid('Questions must appear exactly once in approved order.')
    const status = choice(item.status, ['answered', 'partial', 'unanswered'])
    const statementIndexes = indexes(item.statementIndexes, statementCount)
    const reason = nullable(item.reason)
    if ((status === 'unanswered') !== (statementIndexes.length === 0)
      || (status === 'answered') !== (reason === null)) invalid('Question coverage, cited statements and missing-evidence reason disagree.')
    return { questionIndex: index, status, statementIndexes, reason }
  })
  if (questionAnswers.length !== count) invalid('A research question is missing.')
  return questionAnswers
}

function parseSections(value: unknown, statementCount: number): AcademicSynthesisDraft['sections'] {
  let previousSection = -1
  return array(value).map((value) => {
    const item = object(value, ['sectionId', 'title', 'statementIndexes', 'missingReason'])
    const sectionId = choice(item.sectionId, SYNTHESIS_SECTIONS)
    const order = SYNTHESIS_SECTIONS.indexOf(sectionId)
    if (order <= previousSection) invalid('Sections must be unique and in canonical order.')
    previousSection = order
    const statementIndexes = indexes(item.statementIndexes, statementCount)
    const missingReason = nullable(item.missingReason)
    const host = ['scope_and_method', 'references', 'evidence_appendix'].includes(sectionId)
    if (host ? statementIndexes.length !== 0 || missingReason !== null
      : (statementIndexes.length === 0) !== (missingReason !== null)) invalid('Section statements and missing-evidence reason disagree.')
    return { sectionId, title: text(item.title), statementIndexes, missingReason }
  })
}
