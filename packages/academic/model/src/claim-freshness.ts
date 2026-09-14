/** Consumer-time evidence identity checks; no record mutation, model calls, or report authorization. */
import type { ClaimFreshnessCheck, ClaimRecord } from './claims.ts'
import type { EvidenceId, EvidenceRecord, ResearchBrief } from './types.ts'

/**
 * Compares a claim's analysis snapshot with the current brief and authoritative evidence map.
 * @param claim - Stored claim, retained unchanged even when its evidence is outdated.
 * @param currentBrief - Brief identity and content version being used by the consumer.
 * @param currentEvidence - Current records keyed by their evidence IDs; unrelated records are ignored.
 * @returns Stale for known differences or an already-stale claim; otherwise unverifiable for missing
 * evidence or hashes, or current when every comparison succeeds. Known differences take precedence
 * while all reasons are retained. Current does not imply semantic validity, approval, or report eligibility.
 */
export function checkClaimFreshness(
  claim: ClaimRecord,
  currentBrief: Pick<ResearchBrief, 'researchBriefId' | 'version'>,
  currentEvidence: ReadonlyMap<EvidenceId, EvidenceRecord>,
): ClaimFreshnessCheck {
  const snapshot = claim.evidenceSnapshot
  const reasons: string[] = []
  let stale = claim.validity === 'stale'
  let unverifiable = false
  if (stale) reasons.push('The stored claim is stale and requires reanalysis.')
  if (snapshot.researchBriefId !== currentBrief.researchBriefId || snapshot.researchBriefVersion !== currentBrief.version) {
    stale = true
    reasons.push('The research brief identity or content version differs from the analysis snapshot.')
  }
  if (snapshot.evidenceItems.length === 0) {
    unverifiable = true
    reasons.push('The analysis snapshot contains no evidence.')
  }
  for (const item of snapshot.evidenceItems) {
    const record = currentEvidence.get(item.evidenceId)
    if (record === undefined) {
      unverifiable = true
      reasons.push(`Current evidence ${item.evidenceId} is missing.`)
      continue
    }
    if (record.evidenceId !== item.evidenceId
      || record.academicWorkId !== item.academicWorkId
      || record.workVersionId !== item.workVersionId) {
      stale = true
      reasons.push(`Evidence ${item.evidenceId} has a different evidence, work, or version identity.`)
    }
    const hash = record.contentHash.status === 'available' ? record.contentHash.value : null
    if (item.contentHash === null || item.contentHash.trim() === '' || hash === null || hash.trim() === '') {
      unverifiable = true
      reasons.push(`Evidence ${item.evidenceId} lacks comparable content hashes.`)
    } else if (hash !== item.contentHash) {
      stale = true
      reasons.push(`Evidence ${item.evidenceId} has a different content hash.`)
    }
  }
  if (!stale && !unverifiable) reasons.push('The brief and every evidence identity, version, and content hash match.')
  return { status: stale ? 'stale' : unverifiable ? 'unverifiable' : 'current', reasons }
}
