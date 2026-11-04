import type { PlanReview } from '@deepseek-ai/dsh-client-ui-user-questions/client'

/** Visible sections around the single approved machine-readable Research Brief. */
export interface AcademicPlanPresentation {
  readonly before: string
  readonly execution: string
  readonly after: string
}

/**
 * Select a Research Brief without interpreting or changing its approval payload.
 * @param owner - The plan submitted for review.
 * @returns Display sections, or null for another plan or an ambiguous handoff.
 */
export function academicPlanPresentation(owner: { review: PlanReview }): AcademicPlanPresentation | null {
  const { review } = owner
  const matches = [...review.plan.matchAll(/(?:^|\n)```academic-research-brief-json\s*\n[\s\S]*?\n```(?=\n|$)/gu)]
  const handoff = matches.length === 1 ? matches[0] : undefined
  if (handoff === undefined) return null
  const text = review.plan.slice(0, handoff.index)
  const fields = ['研究目标', '核心问题', '研究范围', '执行方式', '交付结果', '待确认事项']
  const before = fields.every(field => text.includes(`${field}：`))
    ? text.replace(/(核心问题|研究范围|执行方式|交付结果|待确认事项)：/gu, '\n\n$1：') : text
  return { before, execution: handoff[0], after: review.plan.slice(handoff.index + handoff[0].length) }
}
