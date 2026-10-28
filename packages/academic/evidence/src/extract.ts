/**
 * Single-paper evidence extraction: asks a caller-provided semantic generator for exact
 * excerpts, verifies them against locatable content, and builds records plus one evidence card.
 * @module @deepseek-ai/dsh-academic-evidence/extract
 */

import type { EvidenceId, SourceLocator } from '@deepseek-ai/dsh-academic-model'

import { createEvidenceCard } from './card.ts'
import { createSourceLocator } from './locator.ts'
import { createEvidenceRecord } from './record.ts'
import { EvidenceError } from './types.ts'
import type {
  EvidenceCardInput,
  EvidenceCardItemDraft,
  EvidenceContentSegment,
  EvidenceDraft,
  EvidenceDraftRejection,
  EvidenceExtractionInput,
  EvidenceExtractionResult,
  EvidenceGenerator,
} from './types.ts'

const EXTRACTION_INSTRUCTION = [
  'Extract only claims explicitly supported by the supplied paper segments.',
  'Every verbatimExcerpt must be an exact non-empty substring of its segment.',
  'Classify each supported fact into researchQuestions, methods, datasets, metrics, findings, or limitations.',
  'Do not infer missing values from absent text.',
].join(' ')

const MINIMAL_EXTRACTION_INSTRUCTION = [
  'Extract three to five concise facts directly relevant to the supplied focus questions, or fewer when unsupported.',
  'Every fact must identify at least one supplied question using zero-based questionIndexes.',
  'Every verbatimExcerpt must be an exact non-empty substring of its segment.',
  'Card sections may be empty; leave unextracted attributes not_extracted and do not infer missing facts.',
  'Do not claim that a question is answered when its supporting evidence is absent.',
].join(' ')

type CardSections = {
  [K in keyof Omit<EvidenceCardInput, 'academicWorkId' | 'workVersionId'>]:
  Array<EvidenceCardInput[K][number]>
}

type LocatedExcerpt = { readonly segment: EvidenceContentSegment; readonly excerptStart: number }
type DraftRejection = Pick<EvidenceDraftRejection, 'code' | 'reason'>

/**
 * Extracts traceable evidence from one paper version. The caller supplies the semantic
 * generator so workflow code can own model routing and durable request logging.
 *
 * @param input - paper identity, source metadata, content hash, and locatable text segments.
 * @param generator - semantic extraction implementation, normally backed by the workflow model.
 * @param signal - optional cancellation signal forwarded to the generator.
 * Invalid model source references are rejected individually; accepted drafts continue.
 * Generator failures, cancellation and invalid program-owned source metadata still reject the call.
 * Minimal depth requires focus questions and retains at most five verified, question-linked drafts.
 * @returns verified locators, records, run-specific question links, one six-section card, and rejected draft diagnostics.
 */
export async function extractEvidenceFromContent(
  input: EvidenceExtractionInput,
  generator: EvidenceGenerator,
  signal?: AbortSignal,
): Promise<EvidenceExtractionResult> {
  assertNonEmpty('contentHash', input.contentHash)
  if (input.segments.length === 0) invalid('at least one content segment is required')
  for (const segment of input.segments) assertNonEmpty('segment text', segment.text)
  if (input.depth === 'minimal' && (input.focusQuestions?.length ?? 0) === 0) {
    invalid('minimal extraction requires at least one focus question')
  }

  signal?.throwIfAborted()
  const drafts = await generator({
    instruction: input.depth === 'minimal' ? MINIMAL_EXTRACTION_INSTRUCTION : EXTRACTION_INSTRUCTION,
    focusQuestions: [...(input.focusQuestions ?? [])],
    segments: input.segments,
    ...(signal === undefined ? {} : { signal }),
  })
  signal?.throwIfAborted()

  const sourceLocators: SourceLocator[] = []
  const rejectedDrafts: EvidenceDraftRejection[] = []
  const evidenceRecords: EvidenceExtractionResult['evidenceRecords'][number][] = []
  const questionLinks: EvidenceExtractionResult['questionLinks'][number][] = []
  const sections: CardSections = {
    researchQuestions: [],
    methods: [],
    datasets: [],
    metrics: [],
    findings: [],
    limitations: [],
  }

  for (const [draftIndex, draft] of drafts.entries()) {
    signal?.throwIfAborted()
    if (input.depth === 'minimal' && evidenceRecords.length === 5) break
    const excerpt = draft.verbatimExcerpt.trim()
    const verified = verifyDraft(input, draft, excerpt)
    if ('code' in verified) {
      rejectedDrafts.push({ draftIndex, segmentIndex: draft.segmentIndex, ...verified })
      continue
    }
    const { segment, excerptStart, questions } = verified

    const sourceLocator = locatorFor(input, segment, excerptStart, excerpt.length)
    const evidenceRecord = createEvidenceRecord({
      academicWorkId: input.academicWorkId,
      workVersionId: input.workVersionId,
      level: segment.locator.kind === 'abstract' ? 'abstract' : 'fulltext',
      sourcedStatement: draft.sourcedStatement,
      sourceLocator,
      verbatimExcerpt: { status: 'available', value: excerpt },
      sourceProvider: input.sourceProvider,
      sourceUrl: input.sourceUrl,
      retrievedAt: input.retrievedAt,
      contentHash: { status: 'available', value: input.contentHash },
      extractionMethod: input.extractionMethod,
      ...(draft.qualityNotes === undefined ? {} : { qualityNotes: draft.qualityNotes }),
    })
    sourceLocators.push(sourceLocator)
    evidenceRecords.push(evidenceRecord)
    for (const question of questions) questionLinks.push({ evidenceId: evidenceRecord.evidenceId, question })
    for (const item of draft.cardItems) addCardItem(sections, item, evidenceRecord.evidenceId)
  }

  return {
    rejectedDrafts,
    sourceLocators,
    evidenceRecords,
    questionLinks,
    evidenceCard: createEvidenceCard({
      academicWorkId: input.academicWorkId,
      workVersionId: input.workVersionId,
      ...sections,
    }),
  }
}

function verifyDraft(input: EvidenceExtractionInput, draft: EvidenceDraft, excerpt: string):
  (LocatedExcerpt & { readonly questions: readonly string[] }) | DraftRejection {
  const questions = questionsForDraft(input.focusQuestions ?? [], draft.questionIndexes)
  if ('code' in questions) return questions
  if (input.depth === 'minimal' && questions.length === 0) {
    return { code: 'EVIDENCE_INVALID_QUESTION_INDEX', reason: 'minimal evidence must identify at least one supplied focus question' }
  }
  const located = locateExcerpt(input.segments, draft.segmentIndex, excerpt)
  return 'code' in located ? located : { ...located, questions }
}

function questionsForDraft(
  focusQuestions: readonly string[],
  questionIndexes: readonly number[] | undefined,
): readonly string[] | DraftRejection {
  if (questionIndexes === undefined) return []
  const seen = new Set<number>()
  const questions: string[] = []
  for (const index of questionIndexes) {
    if (!Number.isSafeInteger(index) || index < 0 || seen.has(index) || focusQuestions[index] === undefined) {
      return { code: 'EVIDENCE_INVALID_QUESTION_INDEX', reason: `questionIndex ${index} does not uniquely identify a supplied focus question` }
    }
    seen.add(index)
    questions.push(focusQuestions[index])
  }
  return questions
}

/** Keep a valid model locator, or repair only an unambiguous exact match elsewhere. */
function locateExcerpt(
  segments: readonly EvidenceContentSegment[],
  requestedIndex: number,
  excerpt: string,
): LocatedExcerpt | DraftRejection {
  if (excerpt.length === 0) return { code: 'EVIDENCE_EMPTY_EXCERPT', reason: 'verbatimExcerpt must not be empty' }
  if (!Number.isInteger(requestedIndex) || requestedIndex < 0 || segments[requestedIndex] === undefined) {
    return { code: 'EVIDENCE_INVALID_SEGMENT_INDEX', reason: `segmentIndex ${requestedIndex} does not identify a supplied segment` }
  }
  const requested = segments[requestedIndex]
  const requestedStart = requested.text.indexOf(excerpt)
  if (requestedStart >= 0) return { segment: requested, excerptStart: requestedStart }
  const matches: LocatedExcerpt[] = []
  for (const segment of segments) {
    for (let start = segment.text.indexOf(excerpt); start >= 0; start = segment.text.indexOf(excerpt, start + excerpt.length)) {
      matches.push({ segment, excerptStart: start })
      if (matches.length > 1) break
    }
    if (matches.length > 1) break
  }
  if (matches.length === 1) return matches[0] as LocatedExcerpt
  return { code: 'EVIDENCE_EXCERPT_NOT_FOUND', reason: `excerpt is not uniquely present outside segment ${requestedIndex}` }
}

function locatorFor(
  input: EvidenceExtractionInput,
  segment: EvidenceContentSegment,
  excerptStart: number,
  excerptLength: number,
): SourceLocator {
  const common = { workVersionId: input.workVersionId, contentHash: input.contentHash }
  switch (segment.locator.kind) {
    case 'abstract': {
      const characterOffset = segment.locator.characterOffset ?? 0
      if (!Number.isInteger(characterOffset) || characterOffset < 0) invalid('abstract characterOffset must be a non-negative integer')
      return createSourceLocator({
        kind: 'abstract',
        ...common,
        characterStart: characterOffset + excerptStart,
        characterEnd: characterOffset + excerptStart + excerptLength,
      })
    }
    case 'page_section': return createSourceLocator({ ...segment.locator, ...common })
    case 'paragraph': return createSourceLocator({ ...segment.locator, ...common })
    case 'table': return createSourceLocator({ ...segment.locator, ...common })
    case 'figure': return createSourceLocator({ ...segment.locator, ...common })
  }
}

function addCardItem(sections: CardSections, item: EvidenceCardItemDraft, evidenceId: EvidenceId): void {
  // ponytail: one item cites its own record; add draft evidence indexes when multi-excerpt synthesis is required.
  switch (item.section) {
    case 'researchQuestions': {
      const { section: _, ...entry } = item
      sections.researchQuestions.push({ ...entry, evidenceIds: [evidenceId] })
      return
    }
    case 'methods': {
      const { section: _, ...entry } = item
      sections.methods.push({ ...entry, evidenceIds: [evidenceId] })
      return
    }
    case 'datasets': {
      const { section: _, ...entry } = item
      sections.datasets.push({ ...entry, evidenceIds: [evidenceId] })
      return
    }
    case 'metrics': {
      const { section: _, ...entry } = item
      sections.metrics.push({ ...entry, evidenceIds: [evidenceId] })
      return
    }
    case 'findings': {
      const { section: _, ...entry } = item
      sections.findings.push({ ...entry, evidenceIds: [evidenceId] })
      return
    }
    case 'limitations': {
      const { section: _, ...entry } = item
      sections.limitations.push({ ...entry, evidenceIds: [evidenceId] })
    }
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (value.trim().length === 0) invalid(`${field} must not be empty`)
}

function invalid(message: string, code = 'EVIDENCE_INVALID_EXTRACTION'): never {
  throw new EvidenceError(message, code)
}
