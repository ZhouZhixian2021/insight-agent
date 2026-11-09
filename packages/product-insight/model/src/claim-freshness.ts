/** Freshness compares recorded source content with the latest observed page snapshots. */
import type {
  CandidatePageId, ProductClaim, ProductEvidence, ProductEvidenceId, ProductPlan,
  SourceSnapshot,
} from './types.ts'

/** A page-change check does not establish semantic support or report eligibility. */
export interface ProductClaimFreshnessCheck {
  readonly status: 'current' | 'stale' | 'unverifiable'
  readonly reasons: readonly string[]
}

/**
 * Compare one conclusion's plan and source-content identities with current records.
 * @param claim - Stored conclusion and its analysis-time evidence snapshot.
 * @param currentPlan - Plan identity and version currently in force.
 * @param evidenceById - Evidence records currently retained by the investigation.
 * @param latestPageSnapshots - Latest observed fetch for each cited page.
 * @returns Stale for known changes, unverifiable for missing observations, or current for matching content.
 */
export function checkProductClaimFreshness(
  claim: ProductClaim,
  currentPlan: Pick<ProductPlan, 'planId' | 'version'>,
  evidenceById: ReadonlyMap<ProductEvidenceId, ProductEvidence>,
  latestPageSnapshots: ReadonlyMap<CandidatePageId, SourceSnapshot>,
): ProductClaimFreshnessCheck {
  const reasons: string[] = []
  let stale = claim.validity === 'stale'
  let unverifiable = false
  if (stale) reasons.push('The stored conclusion was marked stale and requires reanalysis.')
  const snapshot = claim.evidenceSnapshot
  if (snapshot.planId !== currentPlan.planId || snapshot.planVersion !== currentPlan.version) {
    stale = true
    reasons.push('The approved plan identity or version differs from the analysis snapshot.')
  }
  if (snapshot.evidenceItems.length === 0) {
    unverifiable = true
    reasons.push('The conclusion has no recorded evidence snapshot.')
  }
  for (const item of snapshot.evidenceItems) {
    const evidence = evidenceById.get(item.evidenceId)
    if (evidence === undefined) {
      unverifiable = true
      reasons.push(`Evidence ${item.evidenceId} is unavailable.`)
      continue
    }
    if (evidence.evidenceId !== item.evidenceId || evidence.candidatePageId !== item.candidatePageId) {
      stale = true
      reasons.push(`Evidence ${item.evidenceId} has a different evidence or page identity.`)
    }
    if (item.contentHash.trim() === '' || evidence.contentHash.trim() === '') {
      unverifiable = true
      reasons.push(`Evidence ${item.evidenceId} lacks a comparable content hash.`)
    } else if (evidence.contentHash !== item.contentHash) {
      stale = true
      reasons.push(`Evidence ${item.evidenceId} has a different content hash.`)
    }
    const currentPage = latestPageSnapshots.get(item.candidatePageId)
    if (currentPage === undefined || currentPage.status === 'failed') {
      unverifiable = true
      reasons.push(`The current content of page ${item.candidatePageId} cannot be checked.`)
    } else if (currentPage.candidatePageId !== item.candidatePageId) {
      stale = true
      reasons.push(`Page ${item.candidatePageId} has a different page identity.`)
    } else if (item.contentHash.trim() === '' || currentPage.contentHash.trim() === '') {
      unverifiable = true
      reasons.push(`Page ${item.candidatePageId} lacks a comparable content hash.`)
    } else if (currentPage.contentHash !== item.contentHash) {
      stale = true
      reasons.push(`Page ${item.candidatePageId} has changed since the conclusion was formed.`)
    }
  }
  if (!stale && !unverifiable) reasons.push('The plan and cited page contents match the analysis snapshot.')
  return { status: stale ? 'stale' : unverifiable ? 'unverifiable' : 'current', reasons }
}
