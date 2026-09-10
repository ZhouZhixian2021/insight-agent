import type { ExecutableResearchBrief, ResearchBrief } from './types.ts'

/**
 * Reports whether a research brief's current version has explicit approval.
 *
 * @param brief - Research brief version to inspect.
 * @returns Whether the approval authorizes this exact version.
 */
export function isExecutableResearchBrief(
  brief: ResearchBrief,
): brief is ExecutableResearchBrief {
  return (
    brief.approval.status === 'approved' &&
    brief.approval.approvedBriefVersion === brief.version
  )
}
