/** Fictional RAG evaluation benchmark shared by owner-local pipeline checks. */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ResearchBrief, ResearchBriefId, EvidenceCardItemId, ClaimAssessment } from '@deepseek-ai/dsh-academic-model'
import { analyzeEvidence } from '@deepseek-ai/dsh-academic-analysis'
import { generateReport, type ReportInput } from '../src/index.ts'
import { batch, paper } from '../../analysis/tests/fixtures.ts'

/**
 * Run actual analysis on a fixed two-work fulltext/abstract benchmark.
 * @returns A draft report input and analysis result; no fabricated semantic approval is added.
 */
export function benchmark(): { input: ReportInput; analysis: ReturnType<typeof analyzeEvidence> } {
  const a = paper('rag-a')
  const b = paper('rag-b')
  a.work = { ...a.work, title: '合成论文 A：分项评测' }
  b.work = { ...b.work, title: '合成论文 B：总体得分的限制' }
  a.record = { ...a.record, verbatimExcerpt: { status: 'available', value: '本合成研究分别记录检索覆盖率和回答正确率。' },
    sourcedStatement: '分别记录检索与回答指标。' }
  b.record = { ...b.record, level: 'abstract', verbatimExcerpt: { status: 'available', value: '本合成摘要指出总体得分不能区分检索失败和回答失败；没有提供实验数值。' },
    sourcedStatement: '总体得分不能区分两类失败。' }
  b.locator = { schemaVersion: 1, sourceLocatorId: b.locator.sourceLocatorId, workVersionId: b.version.workVersionId,
    contentHash: b.locator.contentHash, kind: 'abstract', characterStart: 0, characterEnd: 42 }
  a.card = { ...a.card, methods: [{ ...a.card.methods[0]!, statement: '分别记录检索覆盖率和回答正确率。',
    methodName: { status: 'available', value: '分项评测' } }], datasets: [], metrics: [],
  findings: [{ evidenceCardItemId: brandString<EvidenceCardItemId>('finding-rag-a'), evidenceIds: [a.record.evidenceId],
    statement: '记录了检索和回答两个方面的指标。', findingType: { status: 'available', value: 'primary' }, conditions: { status: 'unknown', reason: '合成材料没有完整实验条件' } }] }
  b.card = { ...b.card, methods: [{ ...b.card.methods[0]!, statement: '分析总体得分对失败类型的区分限制。',
    methodName: { status: 'available', value: '失败类型分析' } }], datasets: [], metrics: [],
  findings: [{ evidenceCardItemId: brandString<EvidenceCardItemId>('finding-rag-b'), evidenceIds: [b.record.evidenceId],
    statement: '摘要指出总体得分不能区分检索和回答失败。', findingType: { status: 'available', value: 'primary' }, conditions: { status: 'not_extracted' } }] }
  const source = batch(a, b)
  const brief: ResearchBrief = {
    schemaVersion: 1, researchBriefId: brandString<ResearchBriefId>('brief-rag-benchmark'), version: 1,
    topic: '检索增强生成：分项评测与失败定位', aliases: ['RAG evaluation'],
    questions: ['给定材料分别记录哪些评测信息？哪些比较因证据不足而不能成立？'],
    publicationWindow: { start: null, end: null, dateBasis: 'first_public_release' },
    includedWorkTypes: ['preprint'], inclusionRules: ['仅使用本次合成材料'], exclusionRules: [],
    evidenceRequirements: { minimumIncludedWorks: 2, minimumFulltextWorks: 1, minimumEvidenceLevel: 'abstract',
      requireLocatableEvidence: true, allowPreprints: true, insufficientEvidencePolicy: 'continue_with_warning' },
    targetAudience: '研究人员', reportRequirements: { language: 'zh-CN', targetLength: { unit: 'characters', minimum: null, maximum: null },
      requiredSections: ['executive_summary', 'cross_paper_analysis', 'limitations', 'references'], citationStyle: 'numeric',
      includeEvidenceAppendix: true, includeMethodology: true, includeLimitations: true, includeResearchGaps: false },
    stopConditions: { maximumSearchRounds: 1, maximumCandidateWorks: 2, maximumIncludedWorks: 2, maximumElapsedMinutes: null,
      saturationRounds: 1, stopWhenEvidenceRequirementsMet: true }, assumptions: ['全部材料为合成样例，不代表真实文献'],
    approval: { status: 'approved', reviewedBy: 'synthetic-fixture', reviewedAt: '2026-09-14T00:00:00Z', approvedBriefVersion: 1, comment: '仅批准软件验证' },
  }
  const analysis = analyzeEvidence(source, brief, '2026-09-14T00:01:00Z')
  return { analysis, input: { brief, claims: analysis.claims, links: analysis.links,
    evidence: source.evidenceRecords, versions: source.workVersions, works: source.academicWorks, sourceLocators: source.sourceLocators,
    reviews: [], assessedAt: '2026-09-14T00:02:00Z', mode: 'draft', synthetic: true,
    limitations: [...analysis.limitations, ...analysis.prepared.issues.map(issue => issue.message)] } }
}

/**
 * Build a synthetic reviewer fixture for publication-denial tests only.
 * @param input The exact claims and snapshot references the fixture reviews.
 * @returns Supporting test records, never real human approval.
 */
export function reviewFixture(input: ReportInput): ClaimAssessment[] {
  return input.claims.map((claim, index) => ({ schemaVersion: 1, claimAssessmentId: brandString<ClaimAssessment['claimAssessmentId']>(`review-${index}`),
    claimId: claim.claimId, status: 'supported', reason: 'Synthetic test review only', method: 'synthetic-test-review', methodVersion: '1',
    assessedEvidenceIds: claim.evidenceSnapshot.evidenceItems.map(item => item.evidenceId), assessedAt: input.assessedAt }))
}

/**
 * Generate the complete benchmark draft through the real reporting function.
 * @returns A visibly synthetic report awaiting semantic review.
 */
export function benchmarkReport(): ReturnType<typeof generateReport> { return generateReport(benchmark().input) }
