/** Offline retrieval coverage for human-checked saved-page ranges. */
import { indexProductPagePassages, keywordProductPassageRetriever,
  type ProductPassageRetriever } from './passage-index.ts'

/** One approved question with exact relevant spans labeled in the saved canonical text. */
export interface ProductPassageEvaluationCase {
  readonly text: string
  readonly question: string
  readonly relevantRanges: readonly { readonly start: number; readonly end: number }[]
}

/** Span recall of the retrieval stage only; semantic support and report quality need separate review. */
export interface ProductPassageEvaluationResult {
  readonly cases: number
  readonly relevantRanges: number
  readonly retrievedRanges: number
  readonly recall: number | null
}

/**
 * Measure whether offered passages contain manually labeled source ranges.
 * @param cases - Human-checked questions and exact ranges in their saved pages.
 * @param retriever - Keyword retrieval by default or a later semantic implementation.
 * @param maximum - Maximum passages offered to the model for each question.
 * @returns Retrieval recall, or null when no relevant ranges have been labeled.
 */
export async function evaluateProductPassageRetrieval(cases: readonly ProductPassageEvaluationCase[],
  retriever: ProductPassageRetriever = keywordProductPassageRetriever,
  maximum = 6): Promise<ProductPassageEvaluationResult> {
  let relevantRanges = 0
  let retrievedRanges = 0
  for (const sample of cases) {
    const passages = indexProductPagePassages(sample.text)
    const offered = await retriever.retrieve(passages, sample.question, maximum)
    const known = new Map(passages.map(passage => [passage.id, passage]))
    if (offered.length > maximum || offered.some((passage) => {
      const original = known.get(passage.id)
      return original === undefined || original.start !== passage.start || original.end !== passage.end
        || original.text !== passage.text
    })) {
      throw new RangeError('Evaluation retriever returned an unknown or excess passage')
    }
    for (const range of sample.relevantRanges) {
      if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)
        || range.start < 0 || range.end <= range.start || range.end > sample.text.length) {
        throw new RangeError('Evaluation range is outside the saved page')
      }
      relevantRanges++
      if (offered.some(passage => passage.start <= range.start && passage.end >= range.end)) retrievedRanges++
    }
  }
  return { cases: cases.length, relevantRanges, retrievedRanges,
    recall: relevantRanges === 0 ? null : retrievedRanges / relevantRanges }
}
