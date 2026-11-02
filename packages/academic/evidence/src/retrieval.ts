/** Question-driven dispatch ordering: BM25 over fine-grained scoring units, budgeted per focus question. */
import type { EvidenceContentSegment } from './types.ts'
import type { EvidenceFragmentRange, EvidenceFragmentSourceRange } from './fragment-types.ts'

/**
 * Ranking granularity inside one dispatch range.
 *
 * A dispatch range carries a full `maximumCharacters` window, so scoring the whole window
 * lets one relevant paragraph be diluted by neighbouring text. Units are scoring only and never
 * change what a dispatch sends; they split a window into comparable passage-sized slices.
 */
export const SCORING_UNIT_CHARACTERS = 1_200

const K1 = 1.2
const B = 0.75

/** Function words that carry no retrieval signal across windows of the same paper. */
const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'were', 'was',
  'are', 'has', 'have', 'had', 'not', 'but', 'its', 'their', 'our', 'can', 'may', 'than', 'then',
  'when', 'where', 'which', 'while', 'these', 'those', 'such', 'each', 'also', 'more', 'most',
  'about', 'between', 'under', 'over', 'after', 'before', 'during', 'both', 'other'])

/** Optional controls for one ranking pass. */
export interface QuestionRankingOptions {
  /** Scoring granularity inside one range. */
  readonly unitCharacters?: number
  /**
   * Characters one dispatch is expected to carry.
   *
   * A range smaller than this is worth fewer characters than a dispatch costs, so its score is discounted in
   * proportion to its content instead of winning on term density alone.
   */
  readonly minimumCharacters?: number
  /** Relative dispatch priority per focus question, in the same order; an even share by default. */
  readonly weights?: readonly number[]
}

/** One passage-sized slice used to score the dispatch range that contains it. */
interface ScoringUnit {
  readonly rangeIndex: number
  readonly tokens: readonly string[]
}

/** Corpus statistics needed by one BM25 pass over a single paper. */
interface Corpus {
  readonly units: readonly ScoringUnit[]
  readonly documentFrequency: ReadonlyMap<string, number>
  readonly averageLength: number
}

/**
 * Order dispatch ranges so the budget reaches every focus question before it repeats a section.
 * @param ranges Packed dispatch ranges in source order.
 * @param segments Parsed content segments the ranges address.
 * @param questionTerms Approved lexical hints per focus question; questions without hints score nothing.
 * @param budget Maximum dispatches the caller will spend, or undefined when every range is dispatched.
 * @param options Scoring granularity, per-range size discount and per-question dispatch weights.
 * @returns A permutation of `ranges`: question-covered ranges first, then remaining ranges in source order.
 */
export function rankRangesByQuestion(ranges: readonly EvidenceFragmentRange[],
  segments: readonly EvidenceContentSegment[], questionTerms: readonly (readonly string[])[],
  budget: number | undefined, options: QuestionRankingOptions = {}): EvidenceFragmentRange[] {
  if (ranges.length <= 1 || questionTerms.length === 0) return [...ranges]
  const unitCharacters = options.unitCharacters ?? SCORING_UNIT_CHARACTERS
  const texts = ranges.map(range => rangeText(range, segments))
  const units = texts.flatMap((text, rangeIndex) => scoringUnits(text, rangeIndex, unitCharacters))
  const corpus = buildCorpus(units)
  const discount = texts.map(text => sizeDiscount(text.length, options.minimumCharacters))
  const scores = questionTerms.map(terms => scoreRanges(corpus, ranges.length, tokenize(terms.join(' ')), discount))
  const ordered = selectByQuestion(ranges, scores, budget ?? ranges.length, questionWeights(scores.length, options.weights))
  return ordered.length === ranges.length ? ordered : [...ordered, ...ranges.filter(range => !ordered.includes(range))]
}

/**
 * Discount a range that carries less text than one dispatch should.
 * @param characters Characters the range actually carries.
 * @param minimumCharacters Expected dispatch size; an omitted value keeps every range fully weighted.
 * @returns A factor in `(0, 1]` applied to the range's best unit score.
 */
function sizeDiscount(characters: number, minimumCharacters: number | undefined): number {
  if (minimumCharacters === undefined || minimumCharacters <= 0 || characters >= minimumCharacters) return 1
  return characters / minimumCharacters
}

function questionWeights(count: number, weights: readonly number[] | undefined): readonly number[] {
  if (weights === undefined || weights.length !== count) return new Array<number>(count).fill(1)
  return weights.map(weight => Number.isFinite(weight) && weight > 0 ? weight : 0)
}

function rangeText(range: EvidenceFragmentRange, segments: readonly EvidenceContentSegment[]): string {
  const parts = range.sourceRanges ?? [range]
  return parts.map((part: EvidenceFragmentSourceRange) =>
    (segments[part.segmentIndex] as EvidenceContentSegment).text.slice(part.characterStart, part.characterEnd)).join(' ')
}

function scoringUnits(text: string, rangeIndex: number, unitCharacters: number): ScoringUnit[] {
  if (text.trim() === '') return []
  const units: ScoringUnit[] = []
  for (let start = 0; start < text.length; start += unitCharacters) {
    const tokens = tokenize(text.slice(start, start + unitCharacters))
    if (tokens.length > 0) units.push({ rangeIndex, tokens })
  }
  return units
}

function buildCorpus(units: readonly ScoringUnit[]): Corpus {
  const documentFrequency = new Map<string, number>()
  let totalLength = 0
  for (const unit of units) {
    totalLength += unit.tokens.length
    for (const token of new Set(unit.tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
    }
  }
  return { units, documentFrequency, averageLength: units.length === 0 ? 1 : totalLength / units.length }
}

function scoreRanges(corpus: Corpus, rangeCount: number, query: readonly string[],
  discount: readonly number[]): number[] {
  const scores = new Array<number>(rangeCount).fill(0)
  if (query.length === 0 || corpus.units.length === 0) return scores
  for (const unit of corpus.units) {
    const score = bm25(unit.tokens, query, corpus) * (discount[unit.rangeIndex] as number)
    if (score > (scores[unit.rangeIndex] as number)) scores[unit.rangeIndex] = score
  }
  return scores
}

function bm25(tokens: readonly string[], query: readonly string[], corpus: Corpus): number {
  const frequencies = new Map<string, number>()
  for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1)
  const length = tokens.length
  let score = 0
  for (const term of unique(query)) {
    const frequency = frequencies.get(term)
    if (frequency === undefined) continue
    const frequencyOfTerm = corpus.documentFrequency.get(term) ?? 0
    const idf = Math.log(1 + (corpus.units.length - frequencyOfTerm + 0.5) / (frequencyOfTerm + 0.5))
    score += idf * (frequency * (K1 + 1)) / (frequency + K1 * (1 - B + B * length / corpus.averageLength))
  }
  return score
}

/**
 * Spend the budget in descending per-question priority, one range per question at a time.
 * @param ranges Ranges in source order, used for the unanswered tail.
 * @param scores Per-question score of every range.
 * @param budget Dispatches the caller will spend.
 * @param weights Relative priority per question; equal weights give every question one range per round.
 * @returns Selected ranges in dispatch order.
 */
function selectByQuestion(ranges: readonly EvidenceFragmentRange[], scores: readonly number[][],
  budget: number, weights: readonly number[]): EvidenceFragmentRange[] {
  const candidates = scores.map(perRange => perRange
    .map((score, index) => ({ index, score }))
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index))
  const selected: number[] = []
  const taken = new Array<number>(candidates.length).fill(0)
  const remaining = [...weights]
  // D'Hondt allocation: the question with the largest weight per range already taken is served next, so equal
  // weights reproduce one range per question per round and a starved question outranks a covered one.
  while (selected.length < budget) {
    let chosen = -1
    let priority = 0
    for (let question = 0; question < candidates.length; question++) {
      if ((candidates[question] as Array<{ index: number; score: number }>).length === 0) continue
      const share = (remaining[question] as number) / ((taken[question] as number) + 1)
      if (share > priority) {
        priority = share
        chosen = question
      }
    }
    if (chosen === -1) break
    const queue = candidates[chosen] as Array<{ index: number; score: number }>
    let next = queue.shift()
    while (next !== undefined && selected.includes(next.index)) next = queue.shift()
    if (next === undefined) {
      remaining[chosen] = 0
      continue
    }
    selected.push(next.index)
    taken[chosen] = (taken[chosen] as number) + 1
  }
  for (const question of candidates) {
    for (let candidate = question.shift(); candidate !== undefined; candidate = question.shift()) {
      if (selected.length >= budget) break
      if (!selected.includes(candidate.index)) selected.push(candidate.index)
    }
  }
  for (let index = 0; index < ranges.length && selected.length < budget; index++) {
    if (!selected.includes(index)) selected.push(index)
  }
  return selected.map(index => ranges[index] as EvidenceFragmentRange)
}

function tokenize(text: string): string[] {
  const segmenter = new Intl.Segmenter('en', { granularity: 'word' })
  const tokens: string[] = []
  for (const part of segmenter.segment(text.toLowerCase())) {
    if (!part.isWordLike) continue
    const token = part.segment.trim()
    if (token.length < 2 || STOPWORDS.has(token)) continue
    tokens.push(token)
  }
  return tokens
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}
