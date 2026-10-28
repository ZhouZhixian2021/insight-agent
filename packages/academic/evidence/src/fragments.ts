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
 * @param input Verified paper identity, source metadata and locatable content.
 * @param options Explicit source/output limits, semantic generator, failure classifier and verified-result sink.
 * @param signal Cancellation forwarded to every call and retry delay.
 * Minimal depth retains at most five unique records across the paper, including the verified-result sink.
 * It prioritizes lexical question matches and starts later groups smaller after size-related model failures.
 * @returns Merged verified evidence, all failed attempts, and ranges left incomplete by retries, the minimum size or evidence cap.
 * @throws Cancellation, unclassified generator failures, invalid inputs or failure of the verified-result sink.
 */
export async function extractEvidenceInFragments(input: EvidenceExtractionInput, options: EvidenceFragmentOptions,
  signal?: AbortSignal): Promise<EvidenceFragmentResult> {
  return runEvidenceFragments(input, options, signal)
}

/**
 * Shared fragment dispatch for extraction and supplementation of committed evidence.
 * @param input Paper content and extraction depth.
 * @param options Limits, generator and commit sink.
 * @param signal Cancellation for model dispatch and retry delay.
 * @param accept Optional complete-depth supplementation that reuses committed identities before the sink.
 * @returns Evidence committed in this dispatch, failures and incomplete ranges.
 */
export async function runEvidenceFragments(input: EvidenceExtractionInput, options: EvidenceFragmentOptions,
  signal?: AbortSignal, accept?: (result: EvidenceExtractionResult) => EvidenceExtractionResult): Promise<EvidenceFragmentResult> {
  validatePolicy(options)
  if (input.contentHash.trim() === '' || input.segments.length === 0
    || input.segments.some(segment => segment.text.trim() === '')) {
    throw new EvidenceError('Fragment extraction requires a content hash and non-empty source segments.', 'EVIDENCE_INVALID_EXTRACTION')
  }
  if (input.depth === 'minimal' && (input.focusQuestions?.length ?? 0) === 0) {
    throw new EvidenceError('Minimal extraction requires at least one focus question.', 'EVIDENCE_INVALID_EXTRACTION')
  }
  if (options.questionTerms !== undefined && options.questionTerms.length !== (input.focusQuestions?.length ?? 0)) {
    throw new RangeError('Fragment question terms must have one entry per focus question.')
  }
  const verified: EvidenceExtractionResult[] = []
  const failures: EvidenceFragmentFailure[] = []
  const incomplete: EvidenceFragmentRange[] = []
  const seen = new Set<string>()
  let consecutiveTransientFailures = 0
  let shrinkInitialFragments = false
  const packed = packSourceRanges(input.segments, options.policy.maximumCharacters, options.policy.overlapCharacters)
  const ranges = input.depth === 'minimal' ? prioritizeRanges(input, packed, options.questionTerms) : packed
  for (const [index, initial] of ranges.entries()) {
    signal?.throwIfAborted()
    if (input.depth === 'minimal' && seen.size === 5) {
      incomplete.push(...ranges.slice(index))
      break
    }
    const queue: EvidenceFragmentRange[] = shrinkInitialFragments
      ? splitRange(initial, options.policy.minimumCharacters, options.policy.overlapCharacters) ?? [initial] : [initial]
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
        if (input.depth === 'minimal' && category !== 'transport') shrinkInitialFragments = true
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
          if (input.depth === 'minimal') {
            if (smaller === undefined) incomplete.push(range)
            else queue.unshift(...smaller)
          } else if (smaller === undefined) queue.unshift(range)
          else queue.unshift(...smaller)
        }
        continue
      }
      consecutiveTransientFailures = 0
      const accepted = accept === undefined
        ? uniqueEvidence(result, seen, input.depth === 'minimal' ? 5 - seen.size : Infinity) : accept(result)
      // The sink owns persistence; a failed commit must stop dispatch rather than resemble a model failure.
      await options.onVerified(context, accepted)
      verified.push(accepted)
      signal?.throwIfAborted()
      if (input.depth === 'minimal' && seen.size === 5) {
        incomplete.push(...queue)
        break
      }
    }
  }
  return { evidence: mergeEvidence(input, verified), failures, incompleteFragments: incomplete }
}

function prioritizeRanges(input: EvidenceExtractionInput, ranges: readonly EvidenceFragmentRange[],
  questionTerms: EvidenceFragmentOptions['questionTerms']): EvidenceFragmentRange[] {
  const segmenter = new Intl.Segmenter('en', { granularity: 'word' })
  const words = (text: string) => [...segmenter.segment(text.toLowerCase())]
    .filter(part => part.isWordLike).map(part => part.segment)
  const terms = questionTerms === undefined ? (input.focusQuestions as readonly string[]).map(words)
    : questionTerms.map(question => question.map(term => words(term).join(' ')).filter(term => term !== ''))
  const texts = ranges.map(range => ` ${words(sourceRanges(range).map(part =>
    sourceSegment(input.segments, part.segmentIndex).text.slice(part.characterStart, part.characterEnd)).join(' ')).join(' ')} `)
  const ranked = terms.map(question => ranges.map((range, index) => ({ range,
    score: new Set(question.filter(term => (texts[index] as string).includes(` ${term} `))).size,
  })).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || a.range.fragmentIndex - b.range.fragmentIndex))
  const remaining = new Set(ranges)
  const prioritized: EvidenceFragmentRange[] = []
  while (ranked.some(question => question.length > 0)) {
    for (const question of ranked) {
      let next = question.shift()
      while (next !== undefined && !remaining.has(next.range)) next = question.shift()
      if (next === undefined) continue
      prioritized.push(next.range)
      remaining.delete(next.range)
    }
  }
  return [...prioritized, ...remaining]
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
  return segments[index] as EvidenceContentSegment
}

function sourceRange(ranges: readonly EvidenceFragmentSourceRange[], index: number): EvidenceFragmentSourceRange {
  return ranges[index] as EvidenceFragmentSourceRange
}

function observeFailure(options: EvidenceFragmentOptions, failure: EvidenceFragmentFailure): void {
  try {
    options.onFailure?.(failure)
  } catch {
    // Failure observers are informational; the returned failure list remains authoritative.
  }
}

function uniqueEvidence(result: EvidenceExtractionResult, seen: Set<string>, remaining: number): EvidenceExtractionResult {
  const locations = result.sourceLocators.map(({ sourceLocatorId: _, ...location }) => location)
  const ids = new Set(result.evidenceRecords.filter((record, index) => {
    const questions = result.questionLinks.filter(link => link.evidenceId === record.evidenceId).map(link => link.question).toSorted()
    const key = JSON.stringify([locations[index], record.sourcedStatement, record.verbatimExcerpt, questions])
    if (seen.has(key) || remaining === 0) return false
    seen.add(key)
    remaining--
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
