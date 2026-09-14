import { describe, expect, it, vi } from 'vitest'

import { createAcademicWorkId, createWorkVersionId } from '@deepseek-ai/dsh-academic-model'

import {
  EvidenceError,
  extractEvidenceFromContent,
  type EvidenceExtractionInput,
  type EvidenceGenerator,
} from '../src/index.ts'

const academicWorkId = createAcademicWorkId()
const workVersionId = createWorkVersionId()

function input(segments: EvidenceExtractionInput['segments']): EvidenceExtractionInput {
  return {
    academicWorkId,
    workVersionId,
    sourceProvider: 'arxiv',
    sourceUrl: 'https://arxiv.org/abs/1234.5678',
    retrievedAt: '2026-09-14T00:00:00Z',
    contentHash: 'sha256:paper',
    extractionMethod: { method: 'test-generator', methodVersion: '1' },
    segments,
  }
}

describe('extractEvidenceFromContent', () => {
  it('verifies excerpts and builds records, locators, and all six card sections', async () => {
    const source = {
      ...input([
        { text: 'Abstract says retrieval improves grounding.', locator: { kind: 'abstract', characterOffset: 10 } },
        { text: 'Second abstract excerpt.', locator: { kind: 'abstract' } },
        { text: 'The method uses reranking.', locator: { kind: 'page_section', sectionTitle: 'Method', pdfPage: 2 } },
        { text: 'Evaluation uses Dataset X.', locator: { kind: 'paragraph', sectionTitle: 'Evaluation', paragraphNumber: 4 } },
        { text: 'Accuracy is 91 percent.', locator: { kind: 'table', tableNumber: '2', pdfPage: 5 } },
        { text: 'The study is limited to English.', locator: { kind: 'figure', figureNumber: '3', pdfPage: 6 } },
      ]),
      focusQuestions: ['How is retrieval evaluated?'],
    }
    const generator: EvidenceGenerator = async (request) => {
      expect(request.instruction).toContain('exact non-empty substring')
      expect(request.focusQuestions).toEqual(source.focusQuestions)
      expect(request.segments).toBe(source.segments)
      expect(request.signal).toBeUndefined()
      return [
        {
          segmentIndex: 0,
          sourcedStatement: 'Retrieval improves grounding.',
          verbatimExcerpt: 'retrieval improves grounding',
          qualityNotes: ['Abstract-level evidence.'],
          cardItems: [{
            section: 'researchQuestions',
            statement: 'Does retrieval improve grounding?',
            questionType: { status: 'available', value: 'causal' },
          }],
        },
        {
          segmentIndex: 1,
          sourcedStatement: 'A second abstract excerpt exists.',
          verbatimExcerpt: 'abstract excerpt',
          cardItems: [],
        },
        {
          segmentIndex: 2,
          sourcedStatement: 'The method uses reranking.',
          verbatimExcerpt: 'method uses reranking',
          cardItems: [{
            section: 'methods',
            statement: 'The method uses reranking.',
            methodName: { status: 'available', value: 'reranking' },
            methodRole: { status: 'available', value: 'proposed' },
          }],
        },
        {
          segmentIndex: 3,
          sourcedStatement: 'Evaluation uses Dataset X.',
          verbatimExcerpt: 'uses Dataset X',
          cardItems: [{
            section: 'datasets',
            statement: 'Evaluation uses Dataset X.',
            datasetName: { status: 'available', value: 'Dataset X' },
            version: { status: 'not_extracted' },
            split: { status: 'not_extracted' },
            scale: { status: 'not_extracted' },
          }],
        },
        {
          segmentIndex: 4,
          sourcedStatement: 'Accuracy is 91 percent.',
          verbatimExcerpt: 'Accuracy is 91 percent',
          cardItems: [{
            section: 'metrics',
            statement: 'Accuracy is 91 percent.',
            metricName: { status: 'available', value: 'accuracy' },
            value: { status: 'available', value: 91 },
            unit: { status: 'available', value: 'percent' },
            direction: { status: 'available', value: 'higher_better' },
            evaluationContext: { status: 'not_extracted' },
          }],
        },
        {
          segmentIndex: 5,
          sourcedStatement: 'The study is limited to English.',
          verbatimExcerpt: 'limited to English',
          cardItems: [
            {
              section: 'findings',
              statement: 'The study covers English.',
              findingType: { status: 'available', value: 'primary' },
              conditions: { status: 'available', value: 'English only' },
            },
            {
              section: 'limitations',
              statement: 'The study is limited to English.',
              limitationType: { status: 'available', value: 'generalizability' },
            },
          ],
        },
      ]
    }

    const result = await extractEvidenceFromContent(source, generator)

    expect(result.sourceLocators.map(locator => locator.kind)).toEqual([
      'abstract', 'abstract', 'page_section', 'paragraph', 'table', 'figure',
    ])
    expect(result.sourceLocators[0]).toMatchObject({ characterStart: 24, characterEnd: 52 })
    expect(result.sourceLocators[1]).toMatchObject({ characterStart: 7, characterEnd: 23 })
    expect(result.evidenceRecords).toHaveLength(6)
    expect(result.evidenceRecords[0]).toMatchObject({
      level: 'abstract',
      verbatimExcerpt: { status: 'available', value: 'retrieval improves grounding' },
      contentHash: { status: 'available', value: 'sha256:paper' },
      qualityNotes: ['Abstract-level evidence.'],
    })
    expect(result.evidenceRecords[2]?.level).toBe('fulltext')
    expect(result.evidenceCard.researchQuestions).toHaveLength(1)
    expect(result.evidenceCard.methods).toHaveLength(1)
    expect(result.evidenceCard.datasets).toHaveLength(1)
    expect(result.evidenceCard.metrics).toHaveLength(1)
    expect(result.evidenceCard.findings).toHaveLength(1)
    expect(result.evidenceCard.limitations).toHaveLength(1)
    expect(result.evidenceCard.methods[0]?.evidenceIds).toEqual([result.evidenceRecords[2]?.evidenceId])
  })

  it('rejects empty input, invalid references, and excerpts absent from the source', async () => {
    const generator = vi.fn<EvidenceGenerator>(async () => [])
    await expect(extractEvidenceFromContent(input([]), generator))
      .rejects.toMatchObject({ code: 'EVIDENCE_INVALID_EXTRACTION' })
    expect(generator).not.toHaveBeenCalled()

    await expect(extractEvidenceFromContent(input([{ text: '  ', locator: { kind: 'abstract' } }]), generator))
      .rejects.toMatchObject({ code: 'EVIDENCE_INVALID_EXTRACTION' })
    await expect(extractEvidenceFromContent(
      { ...input([{ text: 'source text', locator: { kind: 'abstract' } }]), contentHash: ' ' },
      generator,
    )).rejects.toMatchObject({ code: 'EVIDENCE_INVALID_EXTRACTION' })

    const source = input([{ text: 'source text', locator: { kind: 'abstract' } }])
    await expect(extractEvidenceFromContent(source, async () => [{
      segmentIndex: 2,
      sourcedStatement: 'statement',
      verbatimExcerpt: 'source',
      cardItems: [],
    }])).rejects.toMatchObject({ code: 'EVIDENCE_INVALID_EXTRACTION' })
    await expect(extractEvidenceFromContent(source, async () => [{
      segmentIndex: 0,
      sourcedStatement: 'statement',
      verbatimExcerpt: '  ',
      cardItems: [],
    }])).rejects.toMatchObject({ code: 'EVIDENCE_INVALID_EXTRACTION' })
    await expect(extractEvidenceFromContent(source, async () => [{
      segmentIndex: 0,
      sourcedStatement: 'statement',
      verbatimExcerpt: 'missing',
      cardItems: [],
    }])).rejects.toMatchObject({ code: 'EVIDENCE_EXCERPT_NOT_FOUND' })
  })

  it('forwards cancellation and rejects an invalid abstract offset', async () => {
    const source = input([{ text: 'source text', locator: { kind: 'abstract', characterOffset: -1 } }])
    await expect(extractEvidenceFromContent(source, async () => [{
      segmentIndex: 0,
      sourcedStatement: 'statement',
      verbatimExcerpt: 'source',
      cardItems: [],
    }])).rejects.toMatchObject({ code: 'EVIDENCE_INVALID_EXTRACTION' })

    const controller = new AbortController()
    const aborted = extractEvidenceFromContent(
      input([{ text: 'source text', locator: { kind: 'abstract' } }]),
      async (request) => {
        expect(request.signal).toBe(controller.signal)
        controller.abort(new Error('stop'))
        return []
      },
      controller.signal,
    )
    await expect(aborted).rejects.toThrow('stop')

    const alreadyAborted = new AbortController()
    alreadyAborted.abort(new Error('already stopped'))
    const uncalled = vi.fn<EvidenceGenerator>(async () => [])
    await expect(extractEvidenceFromContent(
      input([{ text: 'source text', locator: { kind: 'abstract' } }]),
      uncalled,
      alreadyAborted.signal,
    )).rejects.toThrow('already stopped')
    expect(uncalled).not.toHaveBeenCalled()
  })

  it('rejects non-integer and negative segment and offset positions', async () => {
    const source = input([{ text: 'source text', locator: { kind: 'abstract', characterOffset: 0.5 } }])
    await expect(extractEvidenceFromContent(source, async () => [{
      segmentIndex: 0,
      sourcedStatement: 'statement',
      verbatimExcerpt: 'source',
      cardItems: [],
    }])).rejects.toBeInstanceOf(EvidenceError)

    for (const segmentIndex of [-1, 0.5]) {
      await expect(extractEvidenceFromContent(
        input([{ text: 'source text', locator: { kind: 'abstract' } }]),
        async () => [{ segmentIndex, sourcedStatement: 'statement', verbatimExcerpt: 'source', cardItems: [] }],
      )).rejects.toMatchObject({ code: 'EVIDENCE_INVALID_EXTRACTION' })
    }
  })
})
