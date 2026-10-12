/** Incremental source verification and bounded recovery of failed paper fragments. */
import { setTimeout as delay } from 'node:timers/promises'
import { createEvidenceCardId } from '@deepseek-ai/dsh-academic-model'
import { extractEvidenceFromContent } from './extract.ts'
import { EvidenceError } from './types.ts'
import type { EvidenceContentSegment, EvidenceExtractionInput, EvidenceExtractionResult } from './types.ts'
import type { EvidenceFragmentAttempt, EvidenceFragmentFailure, EvidenceFragmentOptions,
  EvidenceFragmentRange, EvidenceFragmentResult, EvidenceFragmentSourceRange } from './fragment-types.ts'

/**
 * Verify each fragment before dispatching the next, and recover only failed source ranges.
 * @param input Verified paper identity, provenance and locatable content.
 * @param options Explicit source/output limits, semantic generator, failure classifier and verified-result sink.
 * @param signal Cancellation forwarded to every call and retry delay.
 * @returns Merged verified evidence, all failed attempts, and source ranges left incomplete.
 * @throws Cancellation, unclassified generator failures, invalid inputs or failure of the verified-result sink.
 */
export async function extractEvidenceInFragments(input: EvidenceExtractionInput, options: EvidenceFragmentOptions,
  signal?: AbortSignal): Promise<EvidenceFragmentResult> {
  validatePolicy(options)
  if (input.contentHash.trim() === '' || input.segments.length === 0
    || input.segments.some(segment => segment.text.trim() === '')) {
    throw new EvidenceError('Fragment extraction requires a content hash and non-empty source segments.', 'EVIDENCE_INVALID_EXTRACTION')
  }
  const verified: EvidenceExtractionResult[] = []
  const failures: EvidenceFragmentFailure[] = []
  const incomplete: EvidenceFragmentRange[] = []
  const seen = new Set<string>()
  let consecutiveTransientFailures = 0
  for (const initial of packSourceRanges(input.segments, options.policy.maximumCharacters,
    options.policy.overlapCharacters)) {
    signal?.throwIfAborted()
    const queue: EvidenceFragmentRange[] = [initial]
    let attempt = 0
    for (let range = queue.shift(); range !== undefined; range = queue.shift()) {
      signal?.throwIfAborted()
      if (sourceRanges(range).every(part => sourceSegment(input.segments, part.segmentIndex)
        .text.slice(part.characterStart, part.characterEnd).trim() === '')) continue
      if (attempt === options.policy.maximumAttempts) {
        incomplete.push(range, ...queue)
        break
      }
      const context: EvidenceFragmentAttempt = { ...range, academicWorkId: input.academicWorkId,
        workVersionId: input.workVersionId, stage: 'extraction', attempt: ++attempt,
        maximumAttempts: options.policy.maximumAttempts, maximumOutputTokens: options.policy.maximumOutputTokens }
      const source = fragmentSource(input, range)
      let result: EvidenceExtractionResult
      try {
        result = await extractEvidenceFromContent(source, request => options.generator(request, context), signal)
      } catch (error: unknown) {
        signal?.throwIfAborted()
        const category = options.classifyFailure(error)
        if (category === null) throw error
        consecutiveTransientFailures = category === 'timeout' || category === 'transport'
          ? consecutiveTransientFailures + 1 : 0
        const failure: EvidenceFragmentFailure = { ...context, category, error, consecutiveTransientFailures }
        failures.push(failure)
        observeFailure(options, failure)
        if (attempt === options.policy.maximumAttempts) {
          incomplete.push(range, ...queue)
          break
        }
        if (category === 'transport') {
          queue.unshift(range)
          await delay(options.policy.initialRetryDelayMs * 2 ** (attempt - 1), undefined,
            signal === undefined ? undefined : { signal })
        } else {
          const smaller = splitRange(range, options.policy.minimumCharacters, options.policy.overlapCharacters)
          if (smaller === undefined) queue.unshift(range)
          else queue.unshift(...smaller)
        }
        continue
      }
      consecutiveTransientFailures = 0
      const accepted = uniqueEvidence(result, seen)
      // The sink owns persistence; a failed commit must stop dispatch rather than resemble a model failure.
      await options.onVerified(context, accepted)
      verified.push(accepted)
      signal?.throwIfAborted()
    }
  }
  return { evidence: mergeEvidence(input, verified), failures, incompleteFragments: incomplete }
}

function validatePolicy(options: EvidenceFragmentOptions): void {
  const p = options.policy
  for (const value of [p.maximumCharacters, p.minimumCharacters, p.maximumAttempts, p.maximumOutputTokens]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Fragment limits must be positive safe integers.')
  }
  if (p.minimumCharacters > p.maximumCharacters || !Number.isSafeInteger(p.overlapCharacters)
    || p.overlapCharacters < 0 || p.overlapCharacters >= p.minimumCharacters) {
    throw new RangeError('Fragment overlap must be smaller than the minimum size, within the maximum size.')
  }
  if (!Number.isSafeInteger(p.initialRetryDelayMs) || p.initialRetryDelayMs < 0
    || !Number.isSafeInteger(p.initialRetryDelayMs * 2 ** (p.maximumAttempts - 1))) {
    throw new RangeError('Fragment retry delay must remain a non-negative safe integer.')
  }
}

function fragmentSource(input: EvidenceExtractionInput, range: EvidenceFragmentRange): EvidenceExtractionInput {
  return { ...input, segments: sourceRanges(range).map((part) => {
    const segment = sourceSegment(input.segments, part.segmentIndex)
    const locator = segment.locator.kind === 'abstract'
      ? { ...segment.locator, characterOffset: (segment.locator.characterOffset ?? 0) + part.characterStart }
      : segment.locator
    return { text: segment.text.slice(part.characterStart, part.characterEnd), locator }
  }) }
}

function splitRange(range: EvidenceFragmentRange, minimum: number, overlap: number): EvidenceFragmentRange[] | undefined {
  const parts = sourceRanges(range)
  if (parts.length > 1) {
    const total = parts.reduce((sum, part) => sum + part.characterEnd - part.characterStart, 0)
    let accumulated = 0, splitIndex = 1
    for (let index = 0; index < parts.length - 1; index++) {
      const part = sourceRange(parts, index)
      accumulated += part.characterEnd - part.characterStart
      splitIndex = index + 1
      if (accumulated >= total / 2) break
    }
    return [fragmentRange(range.fragmentIndex, parts.slice(0, splitIndex)),
      fragmentRange(range.fragmentIndex, parts.slice(splitIndex))]
  }
  const size = range.characterEnd - range.characterStart
  if (size < minimum * 2) return undefined
  const middle = range.characterStart + Math.floor(size / 2)
  return [{ ...range, characterEnd: middle + overlap }, { ...range, characterStart: middle - overlap }]
}

function sourceRanges(range: EvidenceFragmentRange): readonly EvidenceFragmentSourceRange[] {
  return range.sourceRanges ?? [range]
}

function fragmentRange(fragmentIndex: number, parts: readonly EvidenceFragmentSourceRange[]): EvidenceFragmentRange {
  const first = sourceRange(parts, 0)
  return parts.length === 1 ? { fragmentIndex, ...first }
    : { fragmentIndex, ...first, sourceRanges: parts }
}

function packSourceRanges(segments: readonly EvidenceContentSegment[], maximum: number,
  overlap: number): EvidenceFragmentRange[] {
  const groups: EvidenceFragmentRange[] = []
  let pending: EvidenceFragmentSourceRange[] = []
  let length = 0
  const commit = () => {
    if (pending.length === 0) return
    groups.push(fragmentRange(groups.length + 1, pending))
    pending = []
    length = 0
  }
  for (const [segmentIndex, segment] of segments.entries()) {
    for (let start = 0; start < segment.text.length;) {
      const end = Math.min(segment.text.length, start + maximum)
      const size = end - start
      if (pending.length > 0 && (length + size > maximum
        || pending.at(-1)?.segmentIndex === segmentIndex)) commit()
      pending.push({ segmentIndex, characterStart: start, characterEnd: end })
      length += size
      if (end === segment.text.length) break
      start = end - overlap
    }
  }
  commit()
  return groups
}

function sourceSegment(segments: readonly EvidenceContentSegment[], index: number): EvidenceContentSegment {
  const segment = segments[index]
  if (segment === undefined) throw new RangeError('Fragment source segment is missing.')
  return segment
}

function sourceRange(ranges: readonly EvidenceFragmentSourceRange[], index: number): EvidenceFragmentSourceRange {
  const range = ranges[index]
  if (range === undefined) throw new RangeError('Fragment source range is missing.')
  return range
}

function observeFailure(options: EvidenceFragmentOptions, failure: EvidenceFragmentFailure): void {
  try {
    options.onFailure?.(failure)
  } catch {
    // Failure observers are informational; the returned failure list remains authoritative.
  }
}

function uniqueEvidence(result: EvidenceExtractionResult, seen: Set<string>): EvidenceExtractionResult {
  const locations = result.sourceLocators.map(({ sourceLocatorId: _, ...location }) => location)
  const ids = new Set(result.evidenceRecords.filter((record, index) => {
    const questions = result.questionLinks.filter(link => link.evidenceId === record.evidenceId).map(link => link.question).toSorted()
    const key = JSON.stringify([locations[index], record.sourcedStatement, record.verbatimExcerpt, questions])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).map(record => record.evidenceId))
  const records = result.evidenceRecords.filter(record => ids.has(record.evidenceId))
  return { ...result, evidenceRecords: records,
    sourceLocators: result.sourceLocators.filter(locator => records.some(record => record.sourceLocatorId === locator.sourceLocatorId)),
    questionLinks: result.questionLinks.filter(link => ids.has(link.evidenceId)),
    evidenceCard: { ...result.evidenceCard,
      researchQuestions: result.evidenceCard.researchQuestions.filter(item => item.evidenceIds.every(id => ids.has(id))),
      methods: result.evidenceCard.methods.filter(item => item.evidenceIds.every(id => ids.has(id))),
      datasets: result.evidenceCard.datasets.filter(item => item.evidenceIds.every(id => ids.has(id))),
      metrics: result.evidenceCard.metrics.filter(item => item.evidenceIds.every(id => ids.has(id))),
      findings: result.evidenceCard.findings.filter(item => item.evidenceIds.every(id => ids.has(id))),
      limitations: result.evidenceCard.limitations.filter(item => item.evidenceIds.every(id => ids.has(id))),
    } }
}

function mergeEvidence(input: EvidenceExtractionInput, results: readonly EvidenceExtractionResult[]): EvidenceExtractionResult {
  return { sourceLocators: results.flatMap(result => result.sourceLocators),
    evidenceRecords: results.flatMap(result => result.evidenceRecords),
    questionLinks: results.flatMap(result => result.questionLinks),
    rejectedDrafts: results.flatMap(result => result.rejectedDrafts),
    evidenceCard: { schemaVersion: 1, evidenceCardId: createEvidenceCardId(),
      academicWorkId: input.academicWorkId, workVersionId: input.workVersionId,
      researchQuestions: results.flatMap(result => result.evidenceCard.researchQuestions),
      methods: results.flatMap(result => result.evidenceCard.methods),
      datasets: results.flatMap(result => result.evidenceCard.datasets),
      metrics: results.flatMap(result => result.evidenceCard.metrics),
      findings: results.flatMap(result => result.evidenceCard.findings),
      limitations: results.flatMap(result => result.evidenceCard.limitations),
    } }
}
