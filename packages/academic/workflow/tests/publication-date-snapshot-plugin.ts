/** Opt-in Loader regression for the real scope parser, persistence and paper executor. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { contentScreeningRules, createBatchResult, evaluatePublicationDate, resolvePublicationDateContext,
  type AcademicWorkId, type PublicationDatePolicy, type PublicationWindow, type RetrievalRunId,
  type WorkVersion, type WorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { createModelEvidenceGenerator, extractPaperEvidence, runModelResearchDraft,
  selectResearchPapers } from '@deepseek-ai/dsh-academic-workflow'
import type { AcademicSynthesisInput } from '@deepseek-ai/dsh-academic-analysis'
import type {} from '@deepseek-ai/dsh-agent'

export const name = 'academic-publication-date-snapshot'
export const inject = ['llm', 'sessions', 'sessionPersistence', 'tokenMeter']

class DateReviewAdapter extends LlmAdapter {
  scopeCalls = 0
  override resolveModel(provider: string, model: string) {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 32768 } })
  }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const part = options.messages[0]?.content[0]
    assert.ok(part?.type === 'text')
    let response: object
    if (part.text.startsWith('Decide whether')) {
      this.scopeCalls++
      assert.ok(part.text.includes('2026-10-30'))
      assert.ok(part.text.includes('Asia/Shanghai'))
      response = this.scopeCalls <= 2 ? { status: 'excluded', ruleId: 'inclusion-4',
        reason: '版本日期为 2026-09-01，晚于检索时点 2026-05-07，不满足纳入规则4。' }
        : this.scopeCalls === 3 ? { status: 'included', reason: 'The paper studies multi agent security.' }
          : { status: 'excluded', ruleId: 'inclusion-1', reason: 'The supplied content does not study Agent architectures.' }
    } else response = { evidence: [{ segmentIndex: 0, questionIndexes: [0], sourcedStatement: 'Agents fail together.',
      verbatimExcerpt: 'Agents fail together.', section: 'findings' }] }
    yield { type: 'text-delta', index: 0, text: JSON.stringify(response) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export function apply(ctx: Context): void {
  const adapter = new DateReviewAdapter()
  ctx.effect(() => ctx.llm.registerAdapter(['academic-date-fixture'], adapter))
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    if (agent.session.snapshotEvents().some(event => event.type === 'academic/evidence-result')) return next()
    const brief = { publicationWindow: { start: { iso: '1990', precision: 'year' }, end: null, dateBasis: 'published' } satisfies PublicationWindow,
      inclusionRules: ['Study Agent architectures', 'Provide verifiable methods', 'Use scholarly sources', '1990 年至检索时点'], exclusionRules: [],
      publicationDatePolicy: { endMode: 'run_start', timeZone: 'Asia/Shanghai',
        inclusionRuleKinds: ['content', 'content', 'content', 'publication_date'], exclusionRuleKinds: [] } satisfies PublicationDatePolicy }
    const context = resolvePublicationDateContext(brief, '2026-10-30T01:57:32.671Z')
    assert.deepEqual(resolvePublicationDateContext(brief, '2026-11-01T00:00:00Z', structuredClone(context)), context)
    const version: WorkVersion = { schemaVersion: 1,
      academicWorkId: '8c2a94c3-d49b-4d49-b4d1-6c3b5803b8f4' as AcademicWorkId,
      workVersionId: '8df66167-f989-4cea-baac-97a408daa58e' as WorkVersionId,
      versionType: 'preprint', versionLabel: { status: 'available', value: 'v1' },
      releaseDate: { status: 'available', value: { iso: '2026-09-01', precision: 'day' } },
      externalIdentifiers: [], sourceRecords: [{ provider: 'openalex', recordId: 'W7206155294' }],
      contentHash: { status: 'not_extracted' }, supersedesWorkVersionId: null, status: 'active' }
    const evaluation = evaluatePublicationDate({ firstPublicDate: { status: 'unknown', reason: 'Not needed for published basis' } }, version, context.window)
    assert.equal(evaluation.verdict, 'within_window')
    const contentRules = contentScreeningRules(brief)
    const scope = { inclusionRules: contentRules.map(rule => rule.text), exclusionRules: [], contentRules,
      publicationDate: { context, evaluation } }
    const parsed = { academicWorkId: version.academicWorkId, workVersionId: version.workVersionId,
      contentHash: 'sha256:date-regression', sourceProvider: 'openalex', sourceUrl: 'https://arxiv.org/html/2609.00595',
      retrievedAt: context.startedAt, extractionMethod: { method: 'fixture-html', methodVersion: '1' },
      focusQuestions: ['How do multi agent systems fail?'], segments: [{ text: 'Agents fail together.',
        locator: { kind: 'paragraph' as const, paragraphNumber: 1 } }] }
    const generate = createModelEvidenceGenerator(ctx, agent.session,
      { provider: 'academic-date-fixture', model: 'fixture', maxTokens: 500 }, { maxAttempts: 1 })
    const invalid = await extractPaperEvidence(version, parsed, false, generate, scope)
    assert.equal(invalid.status, 'paused')
    assert.ok(invalid.status === 'paused' && invalid.pause.reason === 'scope_needs_more_context')
    const sample = JSON.parse(readFileSync(new URL(
      '../../../../z-team_docs/interface-samples/academic-model-v1/synthesis-input.sample.json', import.meta.url), 'utf8')) as AcademicSynthesisInput
    const baseWork = sample.analysisInput.academicWorks[0]
    assert.ok(baseWork)
    const scholarlyRecord = { academicWork: { ...baseWork,
      academicWorkId: version.academicWorkId, canonicalVersionId: version.workVersionId, workVersionIds: [version.workVersionId],
      title: 'SoK: When Safe Agents Fail Together: The Security of Multi Agent LLM Systems' }, workVersion: version }
    const runFormal = (run: string) => runModelResearchDraft(ctx, agent.session,
      { provider: 'academic-date-fixture', model: 'fixture', maxTokens: 500 },
      { evidence: { maxAttempts: 1, depth: 'minimal' }, synthesis: { maxAttempts: 1 } },
      { retrievalRunId: run as RetrievalRunId, synthetic: true, searches: [{ query: 'multi agent security', channels: ['academic'] }],
        brief: { ...sample.brief, ...brief, questions: parsed.focusQuestions, includedWorkTypes: ['preprint'],
          evidenceRequirements: { ...sample.brief.evidenceRequirements, minimumIncludedWorks: 2, minimumFulltextWorks: 2,
            targetIncludedWorks: 2, allowPreprints: true, insufficientEvidencePolicy: 'stop_for_review' },
          stopConditions: { ...sample.brief.stopConditions, maximumCandidateWorks: 2, maximumIncludedWorks: 2,
            maximumElapsedMinutes: null } } }, {
        search: async () => ({ works: [scholarlyRecord], batch: createBatchResult([scholarlyRecord], []),
          providers: ['openalex'], discoveredRecords: 1, truncated: false, limitations: [] }),
        selectPapers: (ingested, approved) => selectResearchPapers(ingested, approved, () => ({
          urls: [parsed.sourceUrl], sourceProvider: parsed.sourceProvider, extractionMethod: parsed.extractionMethod,
          hasHistoricalEvidence: false })),
        fetcher: async url => ({ url, statusCode: 200, truncated: false,
          body: { kind: 'html', content: '<article><h2>Results</h2><p>Agents fail together.</p></article>' } }),
        now: () => context.startedAt,
      })
    const formalResult = await runFormal('synthetic-date-invalid')
    const invalidFormal = formalResult.papers[0]
    assert.ok(invalidFormal?.status === 'paused' && invalidFormal.pause.reason === 'scope_needs_more_context',
      JSON.stringify({ papers: formalResult.papers, failures: formalResult.failures, coverage: formalResult.retrievalRun.coverageSummary }))
    const accepted = (await runFormal('synthetic-date-accepted')).papers[0]
    assert.ok(accepted)
    assert.ok(accepted.status === 'extracted' && accepted.evidence.evidenceRecords.length === 1)
    const excluded = await extractPaperEvidence(version, parsed, false, generate, scope)
    assert.ok(excluded.status === 'excluded' && excluded.exclusion.ruleId === 'inclusion-1')
    assert.equal(adapter.scopeCalls, 4)
    return next()
  })
}
