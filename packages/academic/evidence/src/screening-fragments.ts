/** Deterministic, condition-targeted source windows for pre-extraction scope review. */
import { bodySegmentIndexes, segmentSectionTitle } from './section-kinds.ts'
import type { EvidenceContentSegment } from './types.ts'

/** One undecided screening condition and the reviewed terms that locate its material. */
export interface ScreeningConditionQuery {
  readonly conditionId: string
  readonly terms: readonly string[]
}

/** Bounds for one fragment selection; every value is a caller-owned deployment default. */
export interface ScreeningFragmentPolicy {
  /** Maximum windows returned in one selection. */
  readonly maximumFragments: number
  /** Maximum characters retained from one window. */
  readonly maximumCharacters: number
  /** Characters kept before a term hit to preserve local context. */
  readonly leadCharacters: number
}

/** One contiguous source window and the conditions it was selected for. */
export interface ScreeningFragment {
  readonly segmentIndex: number
  readonly start: number
  readonly end: number
  /** Parsed section heading when the segment locator carries one. */
  readonly sectionTitle: string | null
  readonly conditionIds: readonly string[]
  /** Reviewed terms that occur in the window, in condition order. */
  readonly matchedTerms: readonly string[]
}

/** Windows for one review dispatch plus what the selection could and could not cover. */
export interface ScreeningFragmentSelection {
  readonly fragments: readonly ScreeningFragment[]
  /** True only when the selected windows cover every character of every segment. */
  readonly sourceComplete: boolean
  /** Conditions with no term hit in any segment. */
  readonly uncoveredConditionIds: readonly string[]
  /** True when more windows were available than the policy admitted. */
  readonly truncated: boolean
}

interface Hit {
  readonly conditionId: string
  readonly segmentIndex: number
  readonly index: number
  readonly term: string
}

interface Text {
  readonly lower: string
  readonly sectionTitle: string | null
}

/** One screened segment with the original index its windows refer to. */
interface Screened {
  readonly index: number
  readonly text: Text
}

/**
 * Select source windows that serve each undecided screening condition, preferring distinct sections.
 * Back matter (reference lists, acknowledgements, appendices) never supplies a window: those
 * sections repeat every reviewed term without describing the research object, so a keyword hit
 * there displaces the body text a rule decision needs.
 * The selection is a pure function of its arguments: no model call, no clock, no randomness.
 * @param segments - Parsed abstract or full-text segments in their original order.
 * @param conditions - Undecided conditions and the reviewed terms approved for locating them.
 * @param policy - Window count, window length and context lead.
 * @returns Selected windows, coverage facts and the conditions that no term reached.
 * @throws RangeError - A policy value, condition identity or term is invalid.
 */
export function selectScreeningFragments(segments: readonly EvidenceContentSegment[],
  conditions: readonly ScreeningConditionQuery[], policy: ScreeningFragmentPolicy): ScreeningFragmentSelection {
  validate(conditions, policy)
  const texts = segments.map(segment => ({
    lower: segment.text.toLowerCase(),
    sectionTitle: segmentSectionTitle(segment),
  }))
  const screened = bodySegmentIndexes(segments).map(index => ({ index, text: texts[index] as Text }))
  const state = { texts, policy, fragments: [] as ScreeningFragment[], covered: new Set<string>() }
  const hits = collectHits(screened, conditions)
  for (const condition of conditions) {
    const hit = hits.find(item => item.conditionId === condition.conditionId)
    if (hit !== undefined && state.fragments.length < policy.maximumFragments) admit(state, hit)
  }
  fill(state, hits)
  if (state.fragments.length === 0) spread(state, screened)
  return {
    fragments: state.fragments,
    sourceComplete: screened.every(item => coveredCharacters(state.fragments, item.index) === item.text.lower.length),
    uncoveredConditionIds: conditions.filter(condition => !state.covered.has(condition.conditionId))
      .map(condition => condition.conditionId),
    truncated: maximumSelectable(hits) > policy.maximumFragments,
  }
}

function collectHits(screened: readonly Screened[], conditions: readonly ScreeningConditionQuery[]): Hit[] {
  const hits: Hit[] = []
  for (const condition of conditions) {
    for (const { index: segmentIndex, text } of screened) {
      for (const term of condition.terms) {
        const index = text.lower.indexOf(term.toLowerCase())
        if (index !== -1) hits.push({ conditionId: condition.conditionId, segmentIndex, index, term })
      }
    }
  }
  return hits.toSorted((left, right) => left.segmentIndex - right.segmentIndex || left.index - right.index
    || left.conditionId.localeCompare(right.conditionId) || left.term.localeCompare(right.term))
}

function fill(state: SelectionState, hits: readonly Hit[]): void {
  for (const preferNewSection of [true, false]) {
    const sections = new Set(state.fragments.map(fragment => fragment.sectionTitle))
    for (const hit of hits) {
      if (state.fragments.length >= state.policy.maximumFragments) return
      const section = state.texts[hit.segmentIndex]?.sectionTitle ?? null
      if (sections.has(section) !== preferNewSection) continue
      if (insideExisting(state, hit)) continue
      if (admit(state, hit)) sections.add(section)
    }
  }
}

function insideExisting(state: SelectionState, hit: Hit): boolean {
  return state.fragments.some(fragment => fragment.segmentIndex === hit.segmentIndex
    && hit.index >= fragment.start && hit.index < fragment.end)
}

function admit(state: SelectionState, hit: Hit): boolean {
  const text = state.texts[hit.segmentIndex]
  if (text === undefined) return false
  const { start, end } = window(state, hit)
  if (end <= start) return false
  state.fragments.push({ segmentIndex: hit.segmentIndex, start, end, sectionTitle: text.sectionTitle,
    conditionIds: [hit.conditionId], matchedTerms: [hit.term] })
  state.covered.add(hit.conditionId)
  return true
}

function window(state: SelectionState, hit: Hit): { readonly start: number; readonly end: number } {
  const length = state.texts[hit.segmentIndex]?.lower.length ?? 0
  if (length <= state.policy.maximumCharacters) return { start: 0, end: length }
  const start = Math.max(0, Math.min(hit.index - state.policy.leadCharacters,
    length - state.policy.maximumCharacters))
  return { start, end: start + state.policy.maximumCharacters }
}

function spread(state: SelectionState, screened: readonly Screened[]): void {
  const count = Math.min(state.policy.maximumFragments, screened.length)
  for (let slot = 0; slot < count; slot++) {
    const position = count === screened.length ? slot
      : Math.min(screened.length - 1, Math.floor(slot * screened.length / count))
    const item = screened[position]
    if (item === undefined) continue
    state.fragments.push({ segmentIndex: item.index, start: 0,
      end: Math.min(item.text.lower.length, state.policy.maximumCharacters),
      sectionTitle: item.text.sectionTitle, conditionIds: [], matchedTerms: [] })
  }
}

interface SelectionState {
  readonly texts: readonly Text[]
  readonly policy: ScreeningFragmentPolicy
  readonly fragments: ScreeningFragment[]
  readonly covered: Set<string>
}

function coveredCharacters(fragments: readonly ScreeningFragment[], segmentIndex: number): number {
  const ranges = fragments.filter(fragment => fragment.segmentIndex === segmentIndex)
    .map(fragment => [fragment.start, fragment.end] as const).toSorted((left, right) => left[0] - right[0])
  let total = 0, cursor = 0
  for (const [start, end] of ranges) {
    if (end <= cursor) continue
    total += end - Math.max(start, cursor)
    cursor = end
  }
  return total
}

function maximumSelectable(hits: readonly Hit[]): number {
  return new Set(hits.map(hit => `${hit.segmentIndex}:${hit.index}`)).size
}

function validate(conditions: readonly ScreeningConditionQuery[], policy: ScreeningFragmentPolicy): void {
  if (![policy.maximumFragments, policy.maximumCharacters, policy.leadCharacters]
    .every(value => Number.isSafeInteger(value) && value >= 0) || policy.maximumFragments < 1
    || policy.maximumCharacters < 1) {
    throw new RangeError('Screening fragment policy requires positive bounded window counts and lengths.')
  }
  if (new Set(conditions.map(condition => condition.conditionId)).size !== conditions.length
    || conditions.some(condition => condition.conditionId.trim() === '')) {
    throw new RangeError('Screening conditions require distinct non-empty identities.')
  }
  if (conditions.some(condition => condition.terms.length === 0
    || condition.terms.some(term => term.trim() === ''))) {
    throw new RangeError('Screening conditions require at least one non-empty reviewed term.')
  }
}
