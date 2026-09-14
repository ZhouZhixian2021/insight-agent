import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  checkClaimFreshness,
  type AcademicWork,
  type ClaimEvidenceLink,
  type ClaimFreshnessStatus,
  type ClaimRecord,
  type EvidenceRecord,
  type EvidenceSnapshotItem,
  type ResearchBrief,
  type WorkVersion,
} from '../src/index.ts'

// These repository-owned synthetic fixtures exercise handoff semantics, not untrusted JSON parsing.
const base = '../../../../z-team_docs/interface-samples/academic-model-v1/'
const b = JSON.parse(readFileSync(new URL(`${base}b-retrieval-evidence.sample.json`, import.meta.url), 'utf8')) as {
  researchBrief: ResearchBrief
  academicWorks: AcademicWork[]
  workVersions: WorkVersion[]
  evidenceRecords: EvidenceRecord[]
}
const c = JSON.parse(readFileSync(new URL(`${base}c-analysis.sample.json`, import.meta.url), 'utf8')) as {
  claims: ClaimRecord[]
  claimEvidenceLinks: ClaimEvidenceLink[]
}
const freshness = JSON.parse(readFileSync(new URL(`${base}claim-freshness.sample.json`, import.meta.url), 'utf8')) as {
  currentEvidenceVersions: EvidenceSnapshotItem[]
  expectedFreshness: { validity: ClaimFreshnessStatus }
  additionalCases: { case: string; currentEvidenceVersions: EvidenceSnapshotItem[]; expectedCheck: { status: ClaimFreshnessStatus } }[]
}

function currentRecords(items: readonly EvidenceSnapshotItem[]) {
  return new Map(items.map((item) => {
    const source = b.evidenceRecords.find(record => record.evidenceId === item.evidenceId)
    if (!source) throw new Error(`Missing fixture evidence ${item.evidenceId}`)
    const record: EvidenceRecord = {
      ...source,
      academicWorkId: item.academicWorkId,
      workVersionId: item.workVersionId,
      contentHash: item.contentHash === null
        ? { status: 'not_extracted' }
        : { status: 'available', value: item.contentHash },
    }
    return [record.evidenceId, record] as const
  }))
}

describe('B-to-C fixed claim handoff', () => {
  it('resolves every claim link through the snapshot to B evidence and its work version', () => {
    for (const claim of c.claims) {
      const links = c.claimEvidenceLinks.filter(link => link.claimId === claim.claimId)
      expect(links.length).toBeGreaterThan(0)
      for (const link of links) {
        const item = claim.evidenceSnapshot.evidenceItems.find(value => value.evidenceId === link.evidenceId)
        expect(item).toBeDefined()
        expect(b.evidenceRecords.some(record => record.evidenceId === item?.evidenceId)).toBe(true)
        expect(b.academicWorks.some(work => work.academicWorkId === item?.academicWorkId)).toBe(true)
        expect(b.workVersions.some(version => version.workVersionId === item?.workVersionId)).toBe(true)
      }
      expect(checkClaimFreshness(claim, b.researchBrief, new Map(b.evidenceRecords.map(record => [record.evidenceId, record]))).status)
        .toBe('current')
    }
  })

  it('rejects the documented stale version and reproduces each additional freshness case', () => {
    const claim = c.claims[0]!
    expect(checkClaimFreshness(claim, b.researchBrief, currentRecords(freshness.currentEvidenceVersions)).status)
      .toBe(freshness.expectedFreshness.validity)
    for (const testCase of freshness.additionalCases) {
      expect(checkClaimFreshness(claim, b.researchBrief, currentRecords(testCase.currentEvidenceVersions)).status, testCase.case)
        .toBe(testCase.expectedCheck.status)
    }
  })
})
