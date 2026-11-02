import { describe, expect, it, vi } from 'vitest'
import { ACADEMIC_CANDIDATE_RANKING_POLICY_V2, contentScreeningRules, evaluatePublicationDate, isExecutableResearchBrief,
  isValidPublicationDate, resolvePublicationDateContext, PublicationDatePolicyError,
  type HybridSearchPlan, type PartialDate, type PublicationWindow } from '@deepseek-ai/dsh-academic-model'
import { createIngestIndex, ingestWorks } from '@deepseek-ai/dsh-academic-ingestion'
import { parseCandidateSemanticReview, preReviewHardExclusions } from '@deepseek-ai/dsh-academic-retrieval'
import { extractPaperEvidence, parseScopeDecision, runResearchDraft, selectResearchPapers } from '../src/index.ts'
import { scopeMessages } from '../src/model-prompt.ts'
import { draftFixture } from './pipeline-fixture.ts'

function fixture() {
  const f = draftFixture(1)
  f.input.brief = { ...f.input.brief,
    publicationWindow: { start: { iso: '1990', precision: 'year' }, end: null, dateBasis: 'published' },
    inclusionRules: ['研究 Agent 架构', '提供可核验方法', '正式学术来源', '版本日期在 1990 年至检索时点之间'],
    publicationDatePolicy: { endMode: 'run_start', timeZone: 'Asia/Shanghai',
      inclusionRuleKinds: ['content', 'content', 'content', 'publication_date'], exclusionRuleKinds: [] } }
  const record = f.records[0]!
  f.records[0] = { academicWork: { ...record.academicWork,
    title: 'SoK: When Safe Agents Fail Together: The Security of Multi Agent LLM Systems' },
  workVersion: { ...record.workVersion, releaseDate: { status: 'available', value: { iso: '2026-09-01', precision: 'day' } } } }
  f.adapters.now = () => '2026-10-30T01:57:32.671Z'
  const context = resolvePublicationDateContext(f.input.brief, f.adapters.now())
  const work = f.records[0].academicWork, version = f.records[0].workVersion
  return { ...f, work, version, context }
}

describe('program-owned publication dates', () => {
  it('admits the September 1 paper at the actual October 30 research cutoff in both selectors', () => {
    const f = fixture(), brief = { ...f.input.brief, publicationWindow: f.context.window }
    if (!isExecutableResearchBrief(brief)) throw new Error('Expected approved regression plan')
    const plan: HybridSearchPlan = { schemaVersion: 1, researchBriefId: brief.researchBriefId,
      researchBriefVersion: brief.version, constraints: { publicationWindow: f.context.window,
        includedWorkTypes: brief.includedWorkTypes, inclusionRules: [], exclusionRules: [], requiredTerms: [], excludedTerms: [] },
      inclusionTargets: { minimum: 1, target: 1, maximum: 1 }, rankingPolicy: ACADEMIC_CANDIDATE_RANKING_POLICY_V2,
      queries: [], citationExpansionSeeds: [], maximumSearchRounds: 1 }
    expect(evaluatePublicationDate(f.work, f.version, f.context.window).verdict).toBe('within_window')
    expect(preReviewHardExclusions(f.work, f.version, plan,
      brief, { abstract: { status: 'unknown', reason: 'not needed' },
        keywords: { status: 'unknown', reason: 'not needed' } })).toEqual([])
    const ingested = ingestWorks(createIngestIndex(), f.records)
    expect(selectResearchPapers(ingested, brief, () => ({ urls: ['https://arxiv.org/html/2609.00595'],
      sourceProvider: 'arxiv', extractionMethod: { method: 'html', methodVersion: '1' }, hasHistoricalEvidence: false })).papers).toHaveLength(1)
  })

  it.each([
    ['1989-12-31', 'day', 'before_publication_window'],
    ['1990-01-01', 'day', 'within_window'],
    ['2026-10-30', 'day', 'within_window'],
    ['2026-10-31', 'day', 'after_publication_window'],
    ['2026', 'year', 'within_window'],
    ['2026-10', 'month', 'within_window'],
    ['2026-11', 'month', 'after_publication_window'],
  ] as const)('compares %s at %s precision as %s', (iso, precision, verdict) => {
    const f = fixture()
    expect(evaluatePublicationDate(f.work, { releaseDate: { status: 'available', value: { iso, precision } } }, f.context.window).verdict).toBe(verdict)
  })

  it('keeps first public release separate from selected-version publication and handles unknown dates', () => {
    const f = fixture(), work = { firstPublicDate: { status: 'available' as const,
      value: { iso: '1989', precision: 'year' as const } } }
    expect(evaluatePublicationDate(work, f.version, f.context.window).verdict).toBe('within_window')
    expect(evaluatePublicationDate(work, f.version, { ...f.context.window, dateBasis: 'first_public_release' }).verdict).toBe('before_publication_window')
    const unknown = { releaseDate: { status: 'unknown' as const, reason: 'source did not supply a date' } }
    expect(evaluatePublicationDate(work, unknown, f.context.window).verdict).toBe('publication_date_unknown')
    expect(evaluatePublicationDate(work, unknown, { start: null, end: null, dateBasis: 'published' }).verdict).toBe('within_window')
  })

  it('freezes Shanghai calendar time across UTC midnight and a next-day restart', () => {
    const f = fixture()
    const context = resolvePublicationDateContext(f.input.brief, '2026-10-29T16:01:00Z')
    expect(context.asOfDate).toBe('2026-10-30')
    expect(resolvePublicationDateContext(f.input.brief, '2026-10-31T16:01:00Z', structuredClone(context))).toEqual(context)
    expect(resolvePublicationDateContext({ ...f.input.brief,
      publicationDatePolicy: { ...f.input.brief.publicationDatePolicy!, timeZone: 'UTC' } }, context.startedAt).asOfDate).toBe('2026-10-29')
  })

  it('preserves fixed dates and explicit unbounded dates without silently rewriting legacy null', () => {
    const f = fixture(), policy = f.input.brief.publicationDatePolicy!
    const fixed: PublicationWindow = { ...f.input.brief.publicationWindow, end: { iso: '2025', precision: 'year' } }
    expect(resolvePublicationDateContext({ ...f.input.brief, publicationWindow: fixed,
      publicationDatePolicy: { ...policy, endMode: 'fixed' } }, f.adapters.now()).window).toEqual(fixed)
    expect(resolvePublicationDateContext({ ...f.input.brief, publicationDatePolicy: { ...policy, endMode: 'unbounded' } }, f.adapters.now()).window.end).toBeNull()
    const { publicationDatePolicy: _policy, ...legacy } = f.input.brief
    expect(() => resolvePublicationDateContext(legacy, f.adapters.now())).toThrow(PublicationDatePolicyError)
    expect(legacy.publicationWindow.end).toBeNull()
    const contentOnly = { ...legacy, inclusionRules: ['研究 Agent 架构'], exclusionRules: [] }
    expect(resolvePublicationDateContext(contentOnly, f.adapters.now()).window.end).toBeNull()
  })

  it.each([
    [{ iso: '2024-02-29', precision: 'day' }, true], [{ iso: '2026-02-29', precision: 'day' }, false],
    [{ iso: '2026-02-31', precision: 'day' }, false], [{ iso: '2026-04-31', precision: 'day' }, false],
    [{ iso: '2026-13', precision: 'month' }, false], [{ iso: '2026-00', precision: 'month' }, false],
    [{ iso: '2026-10', precision: 'year' }, false], [{ iso: '2026-10-00', precision: 'day' }, false],
  ] satisfies readonly [PartialDate, boolean][])('validates calendar precision: %j', (date, valid) => {
    expect(isValidPublicationDate(date)).toBe(valid)
  })

  it('rejects the invented May 7 cutoff as a model exclusion, while allowing content exclusions', async () => {
    const f = fixture(), rules = contentScreeningRules(f.input.brief)
    expect(rules.map(rule => rule.id)).toEqual(['inclusion-1', 'inclusion-2', 'inclusion-3'])
    const scope = { inclusionRules: rules.map(rule => rule.text), exclusionRules: [], contentRules: rules,
      publicationDate: { context: f.context, evaluation: evaluatePublicationDate(f.work, f.version, f.context.window) } }
    const invented = { status: 'excluded' as const, reason: '版本日期为 2026-09-01，晚于检索时点 2026-05-07，不满足纳入规则4。', ruleId: 'inclusion-4' }
    expect(() => parseScopeDecision(JSON.stringify(invented), scope)).toThrow('approved content rule')
    const parsed = { academicWorkId: f.version.academicWorkId, workVersionId: f.version.workVersionId,
      contentHash: 'sha256:regression', sourceProvider: 'openalex', sourceUrl: 'https://arxiv.org/html/2609.00595',
      retrievedAt: f.adapters.now(), extractionMethod: { method: 'html', methodVersion: '1' },
      focusQuestions: ['Compare methods'], segments: [{ text: 'Multi agent security.', locator: { kind: 'paragraph' as const, paragraphNumber: 1 } }] }
    const generator = vi.fn(async () => ({ scope: invented, evidence: [] }))
    expect(await extractPaperEvidence(f.version, parsed, false, generator, scope)).toMatchObject({ status: 'paused', pause: { reason: 'scope_needs_more_context' } })
    generator.mockResolvedValue({ scope: { ...invented, ruleId: 'inclusion-1', reason: 'Does not study Agent architectures.' }, evidence: [] })
    expect(await extractPaperEvidence(f.version, parsed, false, generator, scope)).toMatchObject({ status: 'excluded', exclusion: { ruleId: 'inclusion-1' } })
    const messages = scopeMessages({ ...parsed, instruction: '' }, scope, parsed, true)
    expect(JSON.stringify(messages)).toContain('2026-10-30')
    expect(JSON.stringify(messages)).not.toContain('版本日期在 1990 年至检索时点之间')
  })

  it('enforces content rule references in candidate metadata review as well', () => {
    const response = { schemaVersion: 2, scope: { status: 'off_topic', reason: 'After May 7.', ruleId: 'inclusion-4',
      quote: { source: 'title', text: 'Safe Agents' } }, matchedQuestions: [] }
    expect(() => parseCandidateSemanticReview(JSON.stringify(response), 'Safe Agents', { status: 'unknown', reason: 'none' }, [], ['inclusion-1'])).toThrow('approved content rule')
    response.scope.ruleId = 'inclusion-1'
    expect(parseCandidateSemanticReview(JSON.stringify(response), 'Safe Agents', { status: 'unknown', reason: 'none' }, [], ['inclusion-1']).scope.status).toBe('off_topic')
  })

  it('passes the frozen context through paper review and the HTML report disclosure', async () => {
    const f = fixture()
    f.input.publicationDateContext = f.context
    const result = await runResearchDraft(f.input, f.adapters)
    const scope = vi.mocked(f.adapters.generator).mock.calls[0]?.[2]
    expect(scope?.publicationDate).toMatchObject({ context: f.context, evaluation: { verdict: 'within_window' } })
    expect(result.papers[0]?.publicationDate).toEqual(scope?.publicationDate)
    expect(result.report?.markdown).toContain('Asia/Shanghai')
  })

  it.each(['future', 'unknown'] as const)('blocks %s publication dates in the executor even if a selector forwards them', async (kind) => {
    const f = fixture()
    f.records[0] = { academicWork: f.work, workVersion: { ...f.version, releaseDate: kind === 'future'
      ? { status: 'available', value: { iso: '2026-10-31', precision: 'day' } }
      : { status: 'unknown', reason: 'Provider did not supply a date' } } }
    const result = await runResearchDraft(f.input, f.adapters)
    expect(result.papers[0]).toMatchObject({ status: 'excluded', publicationDate: { evaluation: {
      verdict: kind === 'future' ? 'after_publication_window' : 'publication_date_unknown',
    } } })
    expect(f.adapters.generator).not.toHaveBeenCalled()
  })
})
