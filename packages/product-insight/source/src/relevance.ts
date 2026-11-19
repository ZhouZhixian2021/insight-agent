/** Reject discovery metadata that names nothing the investigation is about. */
import type { Product } from '@deepseek-ai/dsh-product-insight-model'
import { productQuestionTerms } from './page-content.ts'

/** Distinct approved question terms that make unmatched metadata relevant on their own. */
export const MINIMUM_QUESTION_TERM_HITS = 2
/** Shortest name token worth matching on its own; shorter tokens match inside unrelated words. */
const MINIMUM_NAME_TOKEN = 3

/**
 * What the investigation is looking for. Designators are the digit-bearing tokens
 * (M6, iPhone18) that identify one product line; names cover the whole product name.
 */
export interface RelevanceSignals {
  /** Product name and aliases, already lowercase. */
  readonly names: readonly string[]
  /** Digit-bearing product-line tokens, already lowercase. */
  readonly designators: readonly string[]
  /** Words from one approved question, as returned by the question-term segmenter. */
  readonly questionTerms: ReadonlySet<string>
}

/** Discovery metadata available before the page body is read. */
export interface RelevanceCandidate {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
}

/** Admission decision with the evidence that produced it. */
export interface RelevanceVerdict {
  readonly relevant: boolean
  /** Matched signal weight; larger means the metadata names more of the query. */
  readonly score: number
  readonly reason: string
}

/**
 * Derive the signals for one product and question.
 * @param product - Product identity and its aliases.
 * @param question - One approved question whose terms also count as evidence.
 * @returns Lowercase names, digit-bearing designators, and the question's own terms.
 */
export function relevanceSignals(product: Product, question: string): RelevanceSignals {
  const names = [product.name, ...product.aliases ?? []]
    .map(name => name.trim().toLocaleLowerCase()).filter(name => name.length > 0)
  const designators = names.flatMap(name => name.split(/[^\p{L}\p{N}]+/u))
    .filter(token => token.length >= 2 && /\d/u.test(token))
  return { names, designators: [...new Set(designators)],
    questionTerms: new Set([...productQuestionTerms(question)].filter(term => term.length > 1)) }
}

/**
 * Match one ASCII term on word boundaries and any other term by containment.
 * @param haystack - Lowercase title, snippet, and path.
 * @param term - Lowercase term to look for.
 * @returns Whether the term occurs.
 */
function contains(haystack: string, term: string): boolean {
  if (!/^[a-z0-9]+$/u.test(term)) return haystack.includes(term)
  return new RegExp(`(?:^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:$|[^a-z0-9])`, 'u').test(haystack)
}

/**
 * Decide whether one discovery result is about the investigated product.
 *
 * Official feeds already filter by product-line token; this check covers search
 * results, where an unrelated page can rank for any query. Admission needs one
 * product-line token, or the product name, or {@link MINIMUM_QUESTION_TERM_HITS}
 * distinct question terms.
 * @param candidate - Link metadata plus the optional search snippet.
 * @param signals - Signals returned by {@link relevanceSignals}.
 * @returns Whether the result is relevant, with the evidence that decided it.
 */
export function scoreCandidateRelevance(candidate: RelevanceCandidate, signals: RelevanceSignals): RelevanceVerdict {
  let path = ''
  try { path = new URL(candidate.url).pathname } catch { path = '' }
  const haystack = `${candidate.title ?? ''} ${candidate.snippet ?? ''} ${path}`.toLocaleLowerCase()
  if (haystack.trim() === '') return { relevant: false, score: 0, reason: 'Result carries no title, snippet, or readable path.' }
  const designator = signals.designators.find(token => contains(haystack, token))
  if (designator !== undefined) {
    return { relevant: true, score: 20 + designator.length, reason: `Metadata names the product line token "${designator}".` }
  }
  const name = signals.names.find(item => contains(haystack, item))
    ?? signals.names.flatMap(item => item.split(/[^\p{L}\p{N}]+/u))
      .find(token => token.length >= MINIMUM_NAME_TOKEN && contains(haystack, token))
  if (name !== undefined) {
    return { relevant: true, score: 10 + name.length, reason: `Metadata names the product as "${name}".` }
  }
  const hits = [...signals.questionTerms].filter(term => contains(haystack, term))
  if (hits.length >= MINIMUM_QUESTION_TERM_HITS) {
    return { relevant: true, score: hits.length, reason: `Metadata matches approved question terms: ${hits.join(', ')}.` }
  }
  return { relevant: false, score: 0,
    reason: `Metadata names neither the product nor ${MINIMUM_QUESTION_TERM_HITS} approved question terms (matched ${hits.length}).` }
}
