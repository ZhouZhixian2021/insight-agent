/** Deterministic source selection for approved evidence gaps, without model-owned relevance gates. */
import { createHash } from 'node:crypto'
import type { AcademicWork, CandidateAssessment, ResearchCoverageRequirement, ResearchAspectId, WorkVersion } from '@deepseek-ai/dsh-academic-model'
import type { EvidenceExtractionInput, EvidenceExtractionResult } from '@deepseek-ai/dsh-academic-evidence'
import type { CoverageTargetingPolicy } from './coverage-types.ts'

function discoveryTerms(aspect: ResearchCoverageRequirement['aspects'][number]): readonly string[] {
  const label = `${aspect.label} ${aspect.searchTerms.join(' ')}`
  const aliases = /\bBDI\b|信念.*意图/iu.test(label)
    ? ['BDI Agent', 'BDI Components', 'BDI Interpreter', 'belief base', 'plan library']
    : /reinforcement learning|强化学习/iu.test(label)
      ? ['POMDP', 'policy function', 'reward function', 'fallback policy']
      : /符号|symbolic/iu.test(label) ? ['grounded predicates', 'first-order formula', 'production system'] : []
  const transition = /评测.*转变|evaluation.*(shift|transition)/iu.test(aspect.label)
    ? ['static', 'one-shot', 'question answering', 'single-turn', 'multi-turn', 'frozen'] : []
  return [...new Set([...aspect.searchTerms, ...aliases, ...transition])]
}

function purposeScore(text: string, aspect: ResearchCoverageRequirement['aspects'][number]): number {
  if (/评测.*转变|evaluation.*(shift|transition)/iu.test(aspect.label)) {
    const before = /static|one.shot|single.turn|frozen|question answering/iu.test(text)
    const after = /interact|multi.turn|long.horizon|observ(es|ations|e)|full loop/iu.test(text)
    if (!before || !after) return 0
    return /\b(should|could|recommend|future work)\b/iu.test(text)
      && !/\b(recent|have|has|majority|protocols|transitions)\b/iu.test(text) ? 2 : 4
  }
  if (!/架构|概念|architecture|concept/iu.test(aspect.label)) return 0
  const definition = /\bDefinition\s+\d|\b(defines?|consists of|composed of|tuple)\b/iu.test(text)
  const cues = /reinforcement learning|强化学习/iu.test(`${aspect.label} ${aspect.searchTerms.join(' ')}`)
    ? [/\bstates?\b/iu, /\bactions?\b/iu, /\breward/iu, /\bpolicy\b/iu, /\bPOMDP\b/iu]
    : [/belief base/iu, /plan library/iu, /intention/iu, /reasoning cycle|interpreter/iu, /grounded predicate|first.order/iu]
  const mechanisms = cues.filter(cue => cue.test(text)).length
  return mechanisms >= 2 ? (definition ? 4 : 2) + mechanisms / cues.length : 0
}

/** An unchanged contiguous source window with its approved aspect matches. */
export interface CoverageSourceWindow {
  readonly segmentIndex: number
  readonly start: number
  readonly end: number
  readonly aspectIds: readonly ResearchAspectId[]
  readonly primaryAspectIds: readonly ResearchAspectId[]
  readonly score: number
}

/**
 * Find new evidence-bearing windows; matches locate text but never establish coverage.
 * @param source Original parsed source, including its unchanged locators and hash.
 * @param requirements Approved unresolved aspects.
 * @param initial Previously extracted evidence, used to avoid rereading the same support.
 * @param policy Explicit window and context bounds.
 * @param remainingCharacters Remaining run-wide source allowance.
 * @param preferredQuestion Optional parent question prioritized for this paper.
 * @returns Distinct contiguous windows, with a total size within the caller's remaining allowance.
 */
export function selectCoverageWindows(source: EvidenceExtractionInput, requirements: readonly ResearchCoverageRequirement[],
  initial: EvidenceExtractionResult | undefined, policy: CoverageTargetingPolicy,
  remainingCharacters: number, preferredQuestion?: string): readonly CoverageSourceWindow[] {
  const aspects = requirements.flatMap(r => r.aspects).map(a => ({ ...a, searchTerms: discoveryTerms(a) }))
  const preferred = new Set(requirements.filter(r => r.question === preferredQuestion).flatMap(r => r.aspects.map(a => a.aspectId)))
  const architectural = requirements.some(r => r.aspects.some(a => /架构|承继|architecture|inheritance/iu.test(a.label)))
  const referenceHeading = /(?:^|\n)\s*(references|bibliography)\b|\bReferences\s*(?=\[?\d|[A-Z])/u
  const referencePages = source.segments.flatMap(s => s.locator.kind === 'page_section'
    && referenceHeading.test(s.text) ? [s.locator.pdfPage] : [])
  const firstReferencePage = referencePages.length > 0 ? Math.min(...referencePages) : undefined
  const frequency = new Map<string, number>()
  for (const a of aspects) for (const term of a.searchTerms) frequency.set(term.toLowerCase(),
    source.segments.filter(s => s.text.toLowerCase().includes(term.toLowerCase())).length)
  const candidates: CoverageSourceWindow[] = []
  for (const [segmentIndex, segment] of source.segments.entries()) {
    const heading = 'sectionTitle' in segment.locator ? segment.locator.sectionTitle ?? '' : ''
    if (/^(?:\d+[.\s]*)?(references|bibliography|参考文献)\b/iu.test(heading)) continue
    if (firstReferencePage !== undefined && segment.locator.kind === 'page_section'
      && segment.locator.pdfPage > firstReferencePage && !/(?:^|\n)\s*(appendix|appendices)\b/iu.test(segment.text)) continue
    const lower = segment.text.toLowerCase()
    const referenceStart = segment.text.search(referenceHeading)
    for (const aspect of aspects) for (const term of aspect.searchTerms) {
      let offset = lower.indexOf(term.toLowerCase())
      while (offset >= 0) {
        const rawStart = Math.max(0, offset - policy.contextCharacters)
        const boundary = segment.text.lastIndexOf('. ', offset)
        const start = boundary >= rawStart ? boundary + 2 : rawStart
        const end = Math.min(segment.text.length, start + Math.min(policy.maximumWindowCharacters, remainingCharacters),
          referenceStart >= 0 ? referenceStart : segment.text.length)
        const text = segment.text.slice(start, end), textLower = text.toLowerCase()
        const matched = aspects.filter(a => a.searchTerms.some(t => textLower.includes(t.toLowerCase())))
        const alreadyRead = initial?.evidenceRecords.some(r => r.verbatimExcerpt.status === 'available'
          && text.includes(r.verbatimExcerpt.value) && r.verbatimExcerpt.value.length >= text.length / 2) ?? false
        if (!alreadyRead && (referenceStart < 0 || offset < referenceStart)) {
          candidates.push({ segmentIndex, start, end, aspectIds: matched.map(a => a.aspectId),
            primaryAspectIds: matched.filter(a => a.searchTerms[0] !== undefined && textLower.includes(a.searchTerms[0].toLowerCase()))
              .map(a => a.aspectId),
            score: 0 })
        }
        offset = lower.indexOf(term.toLowerCase(), offset + Math.max(1, term.length))
      }
    }
  }
  const result: CoverageSourceWindow[] = [], covered = new Set<ResearchAspectId>()
  let remaining = remainingCharacters
  while (result.length < policy.maximumWindowsPerPaper && remaining > 0) {
    const ranked = candidates.filter(c => !result.some(r => r.segmentIndex === c.segmentIndex && c.start < r.end && c.end > r.start))
      .map((c) => {
        const segmentText = source.segments[c.segmentIndex]?.text ?? ''
        const limit = Math.min(c.end, c.start + remaining)
        const sentenceEnd = segmentText.lastIndexOf('. ', limit - 1)
        const complete = limit === segmentText.length || /[.!?。！？]$/u.test(segmentText.slice(c.start, limit).trimEnd())
        const end = !complete && sentenceEnd > c.start ? sentenceEnd + 1 : limit
        const text = segmentText.slice(c.start, end)
        const matched = aspects.filter(a => a.searchTerms.some(t => text.toLowerCase().includes(t.toLowerCase())))
        const unserved = matched.filter(a => !covered.has(a.aspectId))
        const purpose = Math.max(0, ...(unserved.length > 0 ? unserved : matched).map(a => purposeScore(text, a)))
        const terms = [...new Set(matched.flatMap(a => a.searchTerms.filter(t => text.toLowerCase().includes(t.toLowerCase()))))]
        const specificity = terms.reduce((n, t) => n + t.length / (frequency.get(t.toLowerCase()) ?? 1), 0)
        return { ...c, end, aspectIds: matched.map(a => a.aspectId),
          primaryAspectIds: matched.filter(a => a.searchTerms[0] !== undefined
            && text.toLowerCase().includes(a.searchTerms[0].toLowerCase()))
            .map(a => a.aspectId), purpose,
          preferred: unserved.filter(a => preferred.has(a.aspectId)).length, unserved: unserved.length,
          score: specificity + purpose * 100
            + (architectural ? [...text.matchAll(/\b(classical|traditional|deliberative|reactive|hybrid)\b/giu)].length * 6 : 0)
            + [...text.matchAll(/\b(reported|found|reduced?|increased?|compared?|measured?|classical|traditional)\b/giu)].length }
      }).filter(c => c.aspectIds.length > 0)
      .toSorted((a, b) => Number(b.unserved > 0) - Number(a.unserved > 0) || b.purpose - a.purpose
        || b.preferred - a.preferred || b.unserved - a.unserved || b.score - a.score
        || a.segmentIndex - b.segmentIndex || a.start - b.start)
    const next = ranked[0]
    if (next === undefined) break
    const end = Math.min(next.end, next.start + remaining)
    if (end <= next.start) break
    const window = { ...next, end }
    result.push(window)
    for (const id of window.aspectIds) covered.add(id)
    remaining -= end - next.start
  }
  return result
}

/**
 * Retain original text and locators for selected contiguous ranges.
 * @param source Original source.
 * @param windows Valid selections owned by this module.
 * @returns Unmodified substrings with their original locators.
 */
export function coverageWindowSegments(source: EvidenceExtractionInput,
  windows: readonly CoverageSourceWindow[]): EvidenceExtractionInput['segments'] {
  return windows.map((w) => {
    const segment = source.segments[w.segmentIndex]
    if (segment === undefined) throw new Error('Coverage source window has no original segment.')
    return { ...segment, text: segment.text.slice(w.start, w.end) }
  })
}

/**
 * Rank a retained-pool paper for unresolved aspects without requiring an earlier question link.
 * @param work Bibliographic identity; metadata matches are discovery signals only.
 * @param version Exact canonical version.
 * @param requirements Approved gaps.
 * @param metadata Optional retained scholarly abstract and question matches; omitted callers use only the title.
 * @returns Stable score with rare, specific approved terms favored over generic topic words.
 */
export function coverageCandidateScore(work: AcademicWork, version: WorkVersion,
  requirements: readonly ResearchCoverageRequirement[],
  metadata?: { readonly abstract?: CandidateAssessment['abstract']; readonly matchedQuestions: readonly string[] }): number {
  const title = work.title.toLowerCase()
  if (version.workVersionId !== work.canonicalVersionId) return 0
  const abstract = metadata?.abstract?.status === 'available' ? metadata.abstract.value.toLowerCase() : ''
  const questions = requirements.filter(r => metadata?.matchedQuestions.includes(r.question)).length
  return questions + requirements.flatMap(r => r.aspects).reduce((score, a) => score + a.searchTerms.reduce((n, t) =>
    n + (title.includes(t.toLowerCase()) ? 1 : abstract.includes(t.toLowerCase()) ? 0.5 : 0) / t.split(/\s+/u).length, 0), 0)
}

/**
 * Bind an aspect's support to exact evidence content and question associations.
 * @param record One admitted record.
 * @param questions Its approved question links.
 * @returns Digest for deciding whether an earlier judgment is reusable.
 */
export function coverageEvidenceDigest(record: import('@deepseek-ai/dsh-academic-model').EvidenceRecord,
  questions: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify([record, questions.toSorted()])).digest('hex')
}
