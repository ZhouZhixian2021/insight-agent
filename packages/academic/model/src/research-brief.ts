import type { ExecutableResearchBrief, ResearchBrief } from './types.ts'

/**
 * Resolve the desired included-work count while preserving released Brief behavior.
 *
 * @param brief Research brief whose evidence target is required.
 * @returns Explicit target for current briefs, or the minimum requirement for a released brief without one.
 */
export function targetIncludedWorks(brief: ResearchBrief): number {
  return brief.evidenceRequirements.targetIncludedWorks ?? brief.evidenceRequirements.minimumIncludedWorks
}

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
