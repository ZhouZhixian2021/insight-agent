import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, it } from 'vitest'

import {
  createResearchBriefId,
  isExecutableResearchBrief,
  type ResearchBrief,
  type ResearchBriefId,
} from '../src/index.ts'

function createBrief(): ResearchBrief {
  return {
    schemaVersion: 1,
    researchBriefId: brandString<ResearchBriefId>('brief-1'),
    version: 2,
    topic: 'Synthetic research topic',
    aliases: ['synthetic topic'],
    questions: ['Which methods are supported by locatable evidence?'],
    publicationWindow: {
      start: { iso: '2024', precision: 'year' },
      end: null,
      dateBasis: 'first_public_release',
    },
    includedWorkTypes: ['conference_paper', 'journal_article', 'preprint'],
    inclusionRules: ['Include work that answers the approved question.'],
    exclusionRules: ['Exclude promotional material without research evidence.'],
    evidenceRequirements: {
      minimumIncludedWorks: 2,
      minimumFulltextWorks: 1,
      minimumEvidenceLevel: 'abstract',
      requireLocatableEvidence: true,
      allowPreprints: true,
      insufficientEvidencePolicy: 'continue_with_warning',
    },
    targetAudience: 'Technical leaders',
    reportRequirements: {
      language: 'zh-CN',
      targetLength: { unit: 'characters', minimum: 2_000, maximum: 5_000 },
      requiredSections: ['executive_summary', 'limitations', 'references'],
      citationStyle: 'numeric',
      includeEvidenceAppendix: true,
      includeMethodology: true,
      includeLimitations: true,
      includeResearchGaps: true,
    },
    stopConditions: {
      maximumSearchRounds: 3,
      maximumCandidateWorks: 30,
      maximumIncludedWorks: 10,
      maximumElapsedMinutes: 30,
      saturationRounds: 2,
      stopWhenEvidenceRequirementsMet: true,
    },
    assumptions: ['Full-text gaps remain visible in the report.'],
    approval: { status: 'pending' },
  }
}

describe('isExecutableResearchBrief', () => {
  it('creates a random identity shared by brief versions', () => {
    expect(createResearchBriefId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )
  })

  it('accepts approval for the current brief version', () => {
    const brief = createBrief()
    const approved: ResearchBrief = {
      ...brief,
      approval: {
        status: 'approved',
        reviewedBy: 'reviewer-1',
        reviewedAt: '2026-09-10T03:00:00Z',
        approvedBriefVersion: 2,
        comment: null,
      },
    }

    expect(isExecutableResearchBrief(approved)).toBe(true)
  })

  it('rejects pending, revision-requested, and stale approvals', () => {
    const brief = createBrief()
    const revisionRequested: ResearchBrief = {
      ...brief,
      approval: {
        status: 'revision_requested',
        reviewedBy: 'reviewer-1',
        reviewedAt: '2026-09-10T03:00:00Z',
        reviewedBriefVersion: 2,
        comment: 'Narrow the publication window.',
      },
    }
    const staleApproval: ResearchBrief = {
      ...brief,
      approval: {
        status: 'approved',
        reviewedBy: 'reviewer-1',
        reviewedAt: '2026-09-10T03:00:00Z',
        approvedBriefVersion: 1,
        comment: null,
      },
    }

    expect(isExecutableResearchBrief(brief)).toBe(false)
    expect(isExecutableResearchBrief(revisionRequested)).toBe(false)
    expect(isExecutableResearchBrief(staleApproval)).toBe(false)
  })
})
