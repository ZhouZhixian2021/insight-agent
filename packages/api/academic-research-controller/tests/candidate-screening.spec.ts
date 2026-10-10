import { ACADEMIC_CANDIDATE_RANKING_POLICY_V1, createResearchBriefId, createSearchQueryId,
  type ExecutableResearchBrief, type HybridSearchPlan } from '@deepseek-ai/dsh-academic-model'
import { describe, expect, it } from 'vitest'
import { approvedCandidateScreeningCriteria } from '../src/candidate-screening.ts'

const question = '检索增强生成如何影响答案忠实性？'
const brief: ExecutableResearchBrief = {
  schemaVersion: 1,
  researchBriefId: createResearchBriefId(),
  version: 2,
  topic: '检索增强生成与幻觉',
  aliases: ['RAG hallucination', ' retrieval augmented generation '],
  questions: [question],
  publicationWindow: {
    start: { iso: '2019', precision: 'year' },
    end: { iso: '2024-12', precision: 'month' },
    dateBasis: 'first_public_release',
  },
  includedWorkTypes: ['preprint', 'version_of_record'],
  inclusionRules: [],
  exclusionRules: [],
  evidenceRequirements: {
    minimumIncludedWorks: 1,
    minimumFulltextWorks: 1,
    minimumEvidenceLevel: 'fulltext',
    requireLocatableEvidence: true,
    allowPreprints: true,
    insufficientEvidencePolicy: 'continue_with_warning',
  },
  targetAudience: '研究者',
  reportRequirements: {
    language: 'zh',
    targetLength: { unit: 'words', minimum: null, maximum: null },
    requiredSections: [],
    citationStyle: 'numeric',
    includeEvidenceAppendix: true,
    includeMethodology: true,
    includeLimitations: true,
    includeResearchGaps: true,
  },
  stopConditions: {
    maximumSearchRounds: 2,
    maximumCandidateWorks: 20,
    maximumIncludedWorks: 6,
    maximumElapsedMinutes: null,
    saturationRounds: 2,
    stopWhenEvidenceRequirementsMet: true,
  },
  assumptions: [],
  approval: {
    status: 'approved',
    reviewedBy: 'user',
    reviewedAt: '2026-10-09T00:00:00Z',
    approvedBriefVersion: 2,
    comment: null,
  },
}

function planFor(value: ExecutableResearchBrief = brief): HybridSearchPlan {
  return {
    schemaVersion: 1,
    researchBriefId: value.researchBriefId,
    researchBriefVersion: value.version,
    constraints: {
      publicationWindow: value.publicationWindow,
      includedWorkTypes: value.includedWorkTypes,
      inclusionRules: value.inclusionRules,
      exclusionRules: value.exclusionRules,
      requiredTerms: ['faithfulness'],
      excludedTerms: [],
    },
    inclusionTargets: { minimum: 1, target: 3, maximum: 6 },
    rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V1,
    queries: [
      { kind: 'academic', searchQueryId: createSearchQueryId(), expression: 'RAG faithfulness evaluation',
        purpose: 'core', questions: [question], roundIndex: 1, providers: ['openalex'] },
      { kind: 'academic', searchQueryId: createSearchQueryId(), expression: 'retrieval grounded generation',
        purpose: 'synonym_expansion', questions: [question], roundIndex: 1, providers: ['arxiv'] },
    ],
    citationExpansionSeeds: [],
    maximumSearchRounds: 2,
  }
}

describe('approved candidate screening criteria', () => {
  it('uses only reviewed topic, aliases, required terms, and question-linked query expressions', () => {
    expect(approvedCandidateScreeningCriteria(brief, planFor())).toEqual({
      topic: [
        ['检索增强生成与幻觉', 'RAG hallucination', 'retrieval augmented generation'],
        ['faithfulness'],
      ],
      questions: [{ question, concepts: [[
        question, 'RAG faithfulness evaluation', 'retrieval grounded generation',
      ]] }],
      methods: [],
      evidence: [],
      contributions: [],
      asOfYear: 2024,
      recencyWindowYears: 6,
    })
  })

  it('omits recency scoring unless both reviewed publication bounds exist', () => {
    const openEnded = { ...brief, publicationWindow: { ...brief.publicationWindow, end: null } }
    const criteria = approvedCandidateScreeningCriteria(openEnded, planFor(openEnded))
    expect(criteria).not.toHaveProperty('asOfYear')
    expect(criteria).not.toHaveProperty('recencyWindowYears')
  })

  it('passes exact reviewed question, method, evidence, and contribution cues to metadata screening', () => {
    const reviewed = {
      questions: [{ question, concepts: [['faithfulness', '忠实性']] }],
      methods: [['retrieval evaluation', '检索评估']],
      evidence: [['benchmark', '基准测试']],
      contributions: [{ classification: 'empirical_evaluation' as const,
        concepts: [['experimental comparison', '实验比较']] }],
    }
    expect(approvedCandidateScreeningCriteria(brief, planFor(), reviewed)).toMatchObject(reviewed)
    expect(approvedCandidateScreeningCriteria(brief, planFor(), reviewed).questions[0]?.concepts)
      .toEqual([['faithfulness', '忠实性']])
  })

  it('rejects a plan bound to another approved Brief version', () => {
    expect(() => approvedCandidateScreeningCriteria(brief, { ...planFor(), researchBriefVersion: 1 }))
      .toThrow(/approved Brief version bound to the plan/u)
  })
})
