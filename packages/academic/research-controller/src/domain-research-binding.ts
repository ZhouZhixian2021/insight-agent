/** Bind a reviewed domain research plan to the exact saved survey directions. */
import type { ResearchBrief } from '@deepseek-ai/dsh-academic-model'
import type { AcademicDomainSurveyView } from './types.ts'

/**
 * Reject missing, altered, or selectively omitted survey directions before research begins.
 * @param brief Approved research brief that may bind a domain survey.
 * @param surveys Saved survey maps indexed by approval identity.
 * @returns The bound survey, or null for a legacy research brief.
 */
export function validateDomainResearchBinding(brief: ResearchBrief,
  surveys: Readonly<Record<string, AcademicDomainSurveyView>>): AcademicDomainSurveyView | null {
  const plan = brief.domainResearchPlan
  if (plan === undefined) return null
  const survey = surveys[plan.surveyPlanId]
  if (survey === undefined) throw new Error('领域研究计划引用的已审核勘察结果不存在，请重新审核计划。')
  const actual = new Map(survey.result.map.directions.map(direction => [direction.directionId, direction.label]))
  if (actual.size !== plan.directions.length || plan.directions.some(direction =>
    actual.get(direction.directionId) !== direction.label)) {
    throw new Error('领域方向已变更或计划遗漏了已勘察方向，请重新审核研究计划。')
  }
  return survey
}
