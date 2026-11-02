/** Run-wide record of how much evidence each focus question already holds, used to weight later papers. */

/** Per-question evidence counts for one research run. */
export interface QuestionEvidenceLedger {
  /**
   * Relative dispatch priority for every focus question, in Brief order.
   *
   * A question with no evidence yet weighs `1`; each record it already holds divides that weight, so a starved
   * question outranks a served one while dispatch stays bounded by the caller's budget.
   * @returns One positive weight per question.
   */
  weights(): readonly number[]
  /**
   * Count the records one committed paper contributed to each question.
   * @param questionLinks Approved question texts of the paper's verified links; unmatched texts are ignored.
   */
  observe(questionLinks: readonly { readonly question: string }[]): void
  /**
   * Records counted so far per question, in Brief order.
   * @returns One count per question.
   */
  counts(): readonly number[]
}

/**
 * Track evidence coverage across the papers of one run.
 *
 * The dispatcher ranks within one paper only, so without a run-wide count every paper would keep spending its budget
 * on the question its own text answers best.
 * @param questions Approved focus-question texts in Brief order.
 * @returns A ledger that answers with dispatch weights and accepts each paper's evidence.
 */
export function createQuestionEvidenceLedger(questions: readonly string[]): QuestionEvidenceLedger {
  const index = new Map<string, number>()
  questions.forEach((question, position) => {
    index.set(normalize(question), position)
  })
  const counts = new Array<number>(questions.length).fill(0)
  return {
    weights: () => counts.map(count => 1 / (1 + count)),
    counts: () => [...counts],
    observe: (questionLinks) => {
      for (const link of questionLinks) {
        const position = index.get(normalize(link.question))
        if (position === undefined) continue
        counts[position] = (counts[position] as number) + 1
      }
    },
  }
}

/** Question text arrives from the approved Brief, but whitespace differences must not split one question into two. */
function normalize(question: string): string {
  return question.trim().replace(/\s+/g, ' ')
}
