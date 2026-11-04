/** Bounded, explicitly provisional survey facts for the next reviewed plan. */
import type { AcademicDomainSurveyView } from './types.ts'

/**
 * Supply the latest saved direction map without promoting metadata to full-text evidence.
 * @param surveys Saved maps indexed by approval identity.
 * @returns Bounded planning context, or an empty string when no survey exists.
 */
export function domainSurveyContext(surveys: Readonly<Record<string, AcademicDomainSurveyView>>): string {
  const latest = Object.values(surveys).sort((left, right) => right.completedAt.localeCompare(left.completedAt))[0]
  if (latest === undefined) return ''
  const papers = new Map(latest.result.papers.map(paper => [paper.workId, paper]))
  const directions = latest.result.map.directions.slice(0, 40).map(direction => ({
    directionId: direction.directionId, label: direction.label, definition: direction.definition,
    supportingTitles: direction.supports.slice(0, 2).map(item => papers.get(item.workId)?.title ?? item.workId),
  }))
  return `A prior user-approved academic domain survey is saved in this Session. It is relevant only if the current user request concerns the same topic and scope. This is provisional title/abstract metadata, not full-text evidence or an exhaustive domain taxonomy. Use it only to propose a second plan for explicit user review. Never infer that a direction was researched deeply from its presence here.\n${JSON.stringify({
    surveyPlanId: latest.planId, surveyStatus: latest.result.status,
    topic: latest.topic, scope: latest.scope, selection: latest.selection, limits: latest.limits,
    candidateCount: latest.result.papers.length, directions,
    omittedDirections: latest.result.map.directions.length - directions.length,
    unclassifiedCount: latest.result.map.unclassifiedWorkIds.length,
    limitations: latest.result.limitations.slice(0, 15),
  })}`
}
