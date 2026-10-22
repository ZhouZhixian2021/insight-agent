import { describe, expect, it } from 'vitest'

import {
  checkClaimFreshness,
  createAcademicWorkId,
  createClaimAssessmentId,
  createClaimEvidenceLinkId,
  createClaimId,
  createEvidenceId,
  createEvidenceSnapshotId,
  createFailureId,
  createResearchBriefId,
  createSourceLocatorId,
  createWorkVersionId,
  type ClaimAssessment,
  type ClaimEvidenceLink,
  type ClaimRecord,
  type EvidenceRecord,
} from '../src/index.ts'

function fixture() {
  const brief = { researchBriefId: createResearchBriefId(), version: 2 }
  const evidence: EvidenceRecord = {
    schemaVersion: 1,
    evidenceId: createEvidenceId(),
    academicWorkId: createAcademicWorkId(),
    workVersionId: createWorkVersionId(),
    level: 'abstract',
    sourcedStatement: 'The sample reports a conditional improvement.',
    sourceLocatorId: createSourceLocatorId(),
    verbatimExcerpt: { status: 'available', value: 'conditional improvement' },
    sourceProvider: 'sample',
    sourceUrl: 'https://example.org/paper',
    retrievedAt: '2026-09-14T00:00:00Z',
    contentHash: { status: 'available', value: 'sha256:sample-content' },
    extractionMethod: { method: 'fixture', methodVersion: '1' },
    qualityNotes: [],
  }
  const claim: ClaimRecord = {
    schemaVersion: 1,
    claimId: createClaimId(),
    text: 'The improvement is conditional in the checked sample.',
    category: 'comparison',
    scope: 'The checked sample only.',
    uncertainty: 'Full text is unavailable.',
    confidence: 'low',
    confidenceReasons: ['Only abstract evidence is available.'],
    evidenceSnapshot: {
      schemaVersion: 1,
      evidenceSnapshotId: createEvidenceSnapshotId(),
      researchBriefId: brief.researchBriefId,
      researchBriefVersion: brief.version,
      createdAt: '2026-09-14T00:01:00Z',
      evidenceItems: [{
        evidenceId: evidence.evidenceId,
        academicWorkId: evidence.academicWorkId,
        workVersionId: evidence.workVersionId,
        contentHash: 'sha256:sample-content',
      }],
    },
    validity: 'current',
  }
  return { brief, evidence, claim }
}

describe('claim records', () => {
  it('keeps supporting, opposing, and background links separate from assessment', () => {
    const { claim, evidence } = fixture()
    const links: ClaimEvidenceLink[] = (['supports', 'contradicts', 'background'] as const).map(relation => ({
      schemaVersion: 1,
      claimEvidenceLinkId: createClaimEvidenceLinkId(),
      claimId: claim.claimId,
      evidenceId: evidence.evidenceId,
      relation,
      rationale: `Synthetic ${relation} relationship.`,
    }))
    const assessment: ClaimAssessment = {
      schemaVersion: 1,
      claimAssessmentId: createClaimAssessmentId(),
      claimId: claim.claimId,
      status: 'insufficient',
      reason: 'The fixture is not a semantic review.',
      method: 'fixture',
      methodVersion: '1',
      assessedEvidenceIds: [evidence.evidenceId],
      assessedAt: '2026-09-14T00:02:00Z',
    }
    expect(new Set(links.map(link => link.claimEvidenceLinkId)).size).toBe(3)
    expect(links.map(link => link.relation)).toEqual(['supports', 'contradicts', 'background'])
    expect(assessment.claimId).toBe(claim.claimId)
    expect(createClaimId()).not.toBe(claim.claimId)
    expect(createClaimAssessmentId()).not.toBe(assessment.claimAssessmentId)
  })
})

describe('checkClaimFreshness', () => {
  it('accepts matching evidence without changing history or interpreting semantic confidence', () => {
    const { claim, brief, evidence } = fixture()
    Object.freeze(claim.evidenceSnapshot.evidenceItems[0])
    Object.freeze(claim.evidenceSnapshot.evidenceItems)
    Object.freeze(claim.evidenceSnapshot)
    Object.freeze(claim)
    const before = JSON.stringify(claim)
    const result = checkClaimFreshness(claim, brief, new Map([[evidence.evidenceId, evidence]]))
    expect(result.status).toBe('current')
    expect(result.reasons).toHaveLength(1)
    expect(JSON.stringify(claim)).toBe(before)
    expect(claim.confidence).toBe('low')
  })

  it.each(['researchBriefId', 'version'] as const)('marks a changed brief %s stale', (field) => {
    const { claim, brief, evidence } = fixture()
    const changed = field === 'version' ? { ...brief, version: 3 } : { ...brief, researchBriefId: createResearchBriefId() }
    expect(checkClaimFreshness(claim, changed, new Map([[evidence.evidenceId, evidence]])).status).toBe('stale')
  })

  it.each(['evidenceId', 'academicWorkId', 'workVersionId'] as const)('marks changed %s stale', (field) => {
    const { claim, brief, evidence } = fixture()
    const ids = { evidenceId: createEvidenceId(), academicWorkId: createAcademicWorkId(), workVersionId: createWorkVersionId() }
    const changed: EvidenceRecord = { ...evidence, [field]: ids[field] }
    expect(checkClaimFreshness(claim, brief, new Map([[evidence.evidenceId, changed]])).status).toBe('stale')
  })

  it('marks changed content stale even when the version ID is unchanged', () => {
    const { claim, brief, evidence } = fixture()
    const changed: EvidenceRecord = { ...evidence, contentHash: { status: 'available', value: 'sha256:changed' } }
    expect(checkClaimFreshness(claim, brief, new Map([[evidence.evidenceId, changed]])).status).toBe('stale')
  })

  it('does not restore an already-stale claim automatically', () => {
    const { claim, brief, evidence } = fixture()
    expect(checkClaimFreshness({ ...claim, validity: 'stale' }, brief, new Map([[evidence.evidenceId, evidence]])).status).toBe('stale')
  })

  it('cannot verify missing evidence or an empty snapshot', () => {
    const { claim, brief } = fixture()
    expect(checkClaimFreshness(claim, brief, new Map()).status).toBe('unverifiable')
    const empty = { ...claim, evidenceSnapshot: { ...claim.evidenceSnapshot, evidenceItems: [] } }
    expect(checkClaimFreshness(empty, brief, new Map()).status).toBe('unverifiable')
  })

  it.each([
    { status: 'unknown', reason: 'Missing' },
    { status: 'not_applicable', reason: 'No content' },
    { status: 'not_extracted' },
    { status: 'failed', failureId: createFailureId(), reason: 'Read failed' },
    { status: 'available', value: ' ' },
  ] satisfies EvidenceRecord['contentHash'][])('cannot verify current hash state $status', (contentHash) => {
    const { claim, brief, evidence } = fixture()
    expect(checkClaimFreshness(claim, brief, new Map([[evidence.evidenceId, { ...evidence, contentHash }]])).status).toBe('unverifiable')
  })

  it.each([null, ''])('cannot verify a missing snapshot hash: %s', (contentHash) => {
    const { claim, brief, evidence } = fixture()
    const changed = { ...claim, evidenceSnapshot: { ...claim.evidenceSnapshot,
      evidenceItems: claim.evidenceSnapshot.evidenceItems.map(item => ({ ...item, contentHash })),
    } }
    expect(checkClaimFreshness(changed, brief, new Map([[evidence.evidenceId, evidence]])).status).toBe('unverifiable')
  })

  it('prioritizes known changes while retaining missing-evidence reasons', () => {
    const { claim, brief, evidence } = fixture()
    const second = { ...claim.evidenceSnapshot.evidenceItems[0]!, evidenceId: createEvidenceId() }
    const two = {
      ...claim,
      evidenceSnapshot: { ...claim.evidenceSnapshot, evidenceItems: [...claim.evidenceSnapshot.evidenceItems, second] },
    }
    const result = checkClaimFreshness(two, { ...brief, version: 3 }, new Map([[evidence.evidenceId, evidence]]))
    expect(result.status).toBe('stale')
    expect(result.reasons.some(reason => reason.includes('brief'))).toBe(true)
    expect(result.reasons.some(reason => reason.includes('missing'))).toBe(true)
  })
})
