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
  EvidenceDraftRejection,
  EvidenceExtractionInput,
  EvidenceExtractionResult,
  EvidenceGenerator,
} from './types.ts'

const EXTRACTION_INSTRUCTION = [
  'Extract only claims explicitly supported by the supplied paper segments.',
  'Every verbatimExcerpt must be an exact non-empty substring of its segment.',
  'Create card items only when the cited excerpt directly supports the statement.',
  'Classify items into researchQuestions, methods, datasets, metrics, findings, or limitations.',
  'Do not infer missing values; represent them with the shared Availability states.',
].join(' ')

type CardSections = {
  [K in keyof Omit<EvidenceCardInput, 'academicWorkId' | 'workVersionId'>]:
  Array<EvidenceCardInput[K][number]>
}

/**
 * Extracts traceable evidence from one paper version. The caller supplies the semantic
 * generator so workflow code can own model routing and durable request logging.
 *
 * @param input - paper identity, provenance, content hash, and locatable text segments.
 * @param generator - semantic extraction implementation, normally backed by the workflow model.
 * @param signal - optional cancellation signal forwarded to the generator.
 * Invalid model source references are rejected individually; accepted drafts continue.
 * Generator failures, cancellation and invalid program-owned provenance still reject the call.
 * @returns verified locators, records, one six-section card, and rejected draft diagnostics.
 */
export async function extractEvidenceFromContent(
  input: EvidenceExtractionInput,
  generator: EvidenceGenerator,
  signal?: AbortSignal,
): Promise<EvidenceExtractionResult> {
  assertNonEmpty('contentHash', input.contentHash)
  if (input.segments.length === 0) invalid('at least one content segment is required')
  for (const segment of input.segments) assertNonEmpty('segment text', segment.text)

  signal?.throwIfAborted()
  const drafts = await generator({
    instruction: EXTRACTION_INSTRUCTION,
    focusQuestions: [...(input.focusQuestions ?? [])],
    segments: input.segments,
    ...(signal === undefined ? {} : { signal }),
  })
  signal?.throwIfAborted()

  const sourceLocators: SourceLocator[] = []
  const rejectedDrafts: EvidenceDraftRejection[] = []
  const evidenceRecords: EvidenceExtractionResult['evidenceRecords'][number][] = []
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
    const excerpt = draft.verbatimExcerpt.trim()
    let located: ReturnType<typeof locateExcerpt>
    try {
      located = locateExcerpt(input.segments, draft.segmentIndex, excerpt)
    } catch (error: unknown) {
      if (!(error instanceof EvidenceError) || (error.code !== 'EVIDENCE_EMPTY_EXCERPT'
        && error.code !== 'EVIDENCE_INVALID_SEGMENT_INDEX' && error.code !== 'EVIDENCE_EXCERPT_NOT_FOUND')) throw error
      rejectedDrafts.push({ draftIndex, segmentIndex: draft.segmentIndex, code: error.code, reason: error.message })
      continue
    }
    const { segment, excerptStart } = located

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
    for (const item of draft.cardItems) addCardItem(sections, item, evidenceRecord.evidenceId)
  }

  return {
    rejectedDrafts,
    sourceLocators,
    evidenceRecords,
    evidenceCard: createEvidenceCard({
      academicWorkId: input.academicWorkId,
      workVersionId: input.workVersionId,
      ...sections,
    }),
  }
}

/** Keep a valid model locator, or repair only an unambiguous exact match elsewhere. */
function locateExcerpt(
  segments: readonly EvidenceContentSegment[],
  requestedIndex: number,
  excerpt: string,
): { readonly segment: EvidenceContentSegment; readonly excerptStart: number } {
  if (excerpt.length === 0) invalid('verbatimExcerpt must not be empty', 'EVIDENCE_EMPTY_EXCERPT')
  const requested = segmentAt(segments, requestedIndex)
  const requestedStart = requested.text.indexOf(excerpt)
  if (requestedStart >= 0) return { segment: requested, excerptStart: requestedStart }
  const matches: Array<{ readonly segment: EvidenceContentSegment; readonly excerptStart: number }> = []
  for (const segment of segments) {
    for (let start = segment.text.indexOf(excerpt); start >= 0; start = segment.text.indexOf(excerpt, start + excerpt.length)) {
      matches.push({ segment, excerptStart: start })
      if (matches.length > 1) break
    }
    if (matches.length > 1) break
  }
  if (matches.length === 1) {
    const match = matches[0]
    if (match !== undefined) return match
  }
  invalid(`excerpt is not uniquely present outside segment ${requestedIndex}`, 'EVIDENCE_EXCERPT_NOT_FOUND')
}

function segmentAt(segments: readonly EvidenceContentSegment[], index: number): EvidenceContentSegment {
  if (!Number.isInteger(index) || index < 0 || segments[index] === undefined) {
    invalid(`segmentIndex ${index} does not identify a supplied segment`, 'EVIDENCE_INVALID_SEGMENT_INDEX')
  }
  return segments[index]
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
