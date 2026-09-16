import { describe, expect, it } from 'vitest'
import { createAcademicWorkId, createWorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { extractEvidenceFromContent, type EvidenceDraft } from '@deepseek-ai/dsh-academic-evidence'
import { parseEvidenceDrafts, parsePaperModelResponse } from '../src/index.ts'

const available = <T>(value: T) => ({ status: 'available' as const, value })
const absent = { status: 'unknown' as const, reason: 'Not specified in the supplied segment.' }
const excerpt = 'Method X achieves 91% accuracy on Dataset Y, but requires labeled examples.'
const drafts: readonly EvidenceDraft[] = [{ segmentIndex: 0, sourcedStatement: excerpt, verbatimExcerpt: excerpt,
  qualityNotes: ['Synthetic test evidence.'], cardItems: [
    { section: 'researchQuestions', statement: 'Investigate classification accuracy.', questionType: available('descriptive') },
    { section: 'methods', statement: 'Uses Method X.', methodName: available('Method X'), methodRole: available('proposed') },
    { section: 'datasets', statement: 'Evaluates on Dataset Y.', datasetName: available('Dataset Y'), version: absent,
      split: { status: 'not_extracted' }, scale: { status: 'not_extracted', reason: 'Not extracted.' } },
    { section: 'metrics', statement: 'Reports 91% accuracy.', metricName: available('accuracy'), value: available(91),
      unit: available('%'), direction: available('higher_better'), evaluationContext: absent },
    { section: 'findings', statement: 'Method X achieves 91% accuracy.', findingType: available('primary'),
      conditions: { status: 'not_applicable', reason: 'Synthetic fixture.' } },
    { section: 'limitations', statement: 'Requires labeled examples.', limitationType: available('data') },
  ] }]

const included = { status: 'included' as const, reason: 'The paper satisfies the approved scope.' }

function response(evidence: unknown, scope: unknown = included): string {
  return JSON.stringify({ scope, evidence })
}

function reply(patch: Record<string, unknown> = {}): string {
  return response([{ segmentIndex: 0, sourcedStatement: excerpt, verbatimExcerpt: excerpt, cardItems: [], ...patch }])
}

function itemReply(item: Record<string, unknown>): string {
  return reply({ cardItems: [{ section: 'methods', statement: 'Uses Method X.',
    methodName: available('Method X'), methodRole: available('proposed'), ...item }] })
}

describe('model evidence JSON', () => {
  it('returns a scope decision and all six card sections using the existing B request interface', () => {
    expect(parsePaperModelResponse(response(drafts))).toEqual({ scope: included, evidence: drafts })
    expect(parseEvidenceDrafts(response(drafts))).toEqual(drafts)
  })
  it('distinguishes exclusion, no evidence and an uncategorized evidence record', () => {
    expect(parsePaperModelResponse(response([], { status: 'excluded', reason: 'Outside the approved population.' })))
      .toEqual({ scope: { status: 'excluded', reason: 'Outside the approved population.' }, evidence: [] })
    expect(parseEvidenceDrafts(response([]))).toEqual([])
    expect(parseEvidenceDrafts(reply())[0]?.cardItems).toEqual([])
  })
  it('preserves numeric metric strings and original excerpt whitespace', () => {
    const card = drafts[0]!.cardItems[3]!
    const result = parseEvidenceDrafts(reply({ verbatimExcerpt: `  ${excerpt}  `,
      cardItems: [{ ...card, value: available('91 ± 2') }] }))
    expect(result[0]?.verbatimExcerpt).toBe(`  ${excerpt}  `)
    expect(result[0]?.cardItems[0]).toMatchObject({ value: available('91 ± 2') })
  })
  it.each([
    '', '```json\n{}\n```', 'Here is the result: {}', '{', '[]', 'null', '1', '{}',
    response([], null), response([], {}), response([], { status: 'included', reason: '' }),
    response([], { status: 'other', reason: 'x' }), response([null]), response([[]]),
    reply({ segmentIndex: -1 }), reply({ segmentIndex: 0.5 }), reply({ segmentIndex: '0' }),
    reply({ segmentIndex: 9007199254740992 }), reply({ segmentIndex: undefined }),
    reply({ sourcedStatement: '  ' }), reply({ sourcedStatement: 3 }), reply({ verbatimExcerpt: '' }),
    reply({ cardItems: undefined }), reply({ cardItems: {} }), reply({ cardItems: [null] }),
    reply({ qualityNotes: 'note' }), reply({ qualityNotes: [3] }), reply({ evidenceId: 'invented' }),
    itemReply({ section: 'other' }), itemReply({ statement: '' }), itemReply({ methodName: undefined }),
    itemReply({ methodRole: available('invented') }), itemReply({ methodName: available(1) }),
    itemReply({ methodName: null }), itemReply({ methodName: available(null) }),
    itemReply({ methodName: { status: 'unknown' } }), itemReply({ methodName: { status: 'unknown', reason: '' } }),
    itemReply({ methodName: { status: 'unknown', reason: 'Absent', value: 'X' } }),
    itemReply({ methodName: { status: 'available', value: 'X', reason: 'Mixed states' } }),
    itemReply({ methodName: { status: 'not_extracted', reason: 3 } }),
    itemReply({ methodName: { status: 'failed', reason: 'Failed' } }),
    itemReply({ methodName: { status: 'failed', failureId: 'invented', reason: 'Failed' } }),
    itemReply({ methodName: { status: 'invented' } }), itemReply({ questionType: absent }),
    itemReply({ evidenceIds: ['invented'] }), itemReply({ evidenceCardItemId: 'invented' }),
    reply({ cardItems: [{ ...drafts[0]!.cardItems[3], value: available(false) }] }),
    reply({ cardItems: [{ ...drafts[0]!.cardItems[3], value: available(1) }] }).replace('"value":1', '"value":1e999'),
    response(drafts, { status: 'excluded', reason: 'Outside scope.' }),
  ])('rejects an invalid response without returning partial drafts: %s', (text) => {
    expect(() => parsePaperModelResponse(text)).toThrow(expect.objectContaining({ code: 'EVIDENCE_INVALID_MODEL_OUTPUT' }))
  })
  it('rejects the whole array when a later draft is malformed', () => {
    expect(() => parseEvidenceDrafts(response([...drafts, { segmentIndex: 0 }]))).toThrow()
  })
  it('accepts at most six focused drafts from one paper', () => {
    const items = (length: number) => Array.from({ length }, (_, segmentIndex) => ({
      segmentIndex, sourcedStatement: excerpt, verbatimExcerpt: excerpt, cardItems: [],
    }))
    expect(parseEvidenceDrafts(response(items(6)))).toHaveLength(6)
    expect(() => parseEvidenceDrafts(response(items(7)))).toThrow('$: expected at most 6 entries')
  })
  it('reports the field path without echoing untrusted response content', () => {
    expect(() => parseEvidenceDrafts(itemReply({ methodRole: available('private-response-marker') })))
      .toThrow('$.evidence[0].cardItems[0].methodRole.value: invalid enum value')
    expect(() => parseEvidenceDrafts('private-response-marker')).toThrow('$: expected JSON')
  })
  it('feeds actual B extraction and leaves source matching under B ownership', async () => {
    const input = { academicWorkId: createAcademicWorkId(), workVersionId: createWorkVersionId(),
      sourceProvider: 'fixture', sourceUrl: 'https://example.org/paper', retrievedAt: '2026-09-15T00:00:00Z',
      contentHash: 'fixture-hash', extractionMethod: { method: 'fixture', methodVersion: '1' },
      segments: [{ text: excerpt, locator: { kind: 'paragraph' as const, paragraphNumber: 1 } }] }
    const result = await extractEvidenceFromContent(input, async () => parseEvidenceDrafts(response(drafts)))
    expect(result.evidenceRecords).toHaveLength(1)
    expect(result.evidenceCard.methods[0]?.evidenceIds).toEqual([result.evidenceRecords[0]?.evidenceId])
    await expect(extractEvidenceFromContent(input, async () => parseEvidenceDrafts(reply({ segmentIndex: 1 }))))
      .rejects.toMatchObject({ code: 'EVIDENCE_INVALID_EXTRACTION' })
    await expect(extractEvidenceFromContent(input, async () => parseEvidenceDrafts(reply({ verbatimExcerpt: 'Invented excerpt.' }))))
      .rejects.toMatchObject({ code: 'EVIDENCE_EXCERPT_NOT_FOUND' })
  })
})
