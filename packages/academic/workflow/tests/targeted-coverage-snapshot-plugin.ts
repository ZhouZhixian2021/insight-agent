/** Loader regression: stop-time review, one existing-paper repair and durable reservations. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { createBatchResult, type ResearchAspectId, type RetrievalRunId } from '@deepseek-ai/dsh-academic-model'
import { CoverageRepairRuntime, runModelResearchDraft, selectResearchPapers,
  type CoverageReviewInput } from '@deepseek-ai/dsh-academic-workflow'
import type { AcademicSynthesisInput } from '@deepseek-ai/dsh-academic-analysis'
import type {} from '@deepseek-ai/dsh-agent'

export const name = 'academic-targeted-coverage-snapshot'
export const inject = ['llm', 'sessions', 'sessionPersistence', 'tokenMeter']

class CoverageAdapter extends LlmAdapter {
  reviews = 0
  evidenceCalls = 0
  override resolveModel(provider: string, model: string) {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 32768 } })
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const part = options.messages[0]?.content[0]
    assert.ok(part?.type === 'text')
    let response: object
    if (part.text.startsWith('Review whether')) {
      this.reviews++
      const payload = JSON.parse(part.text.slice(part.text.lastIndexOf('\n') + 1)) as {
        previouslyReviewed?: object
        repairSources?: { workVersionId: string }[]
        evidence: { evidenceId: string; statement: string }[] }
      const method = payload.evidence.find(item => item.statement === 'Uses reranking.')
      const result = payload.evidence.find(item => item.statement === 'Accuracy improves by 3 points.')
      assert.ok(method)
      response = { aspects: [...payload.previouslyReviewed === undefined
        ? [{ aspectId: 'q1.method', status: 'covered', evidenceIds: [method.evidenceId], reason: 'Direct method.' }] : [],
      result === undefined ? { aspectId: 'q1.result', status: 'missing', evidenceIds: [], reason: 'No observed result.' }
        : { aspectId: 'q1.result', status: 'covered', evidenceIds: [result.evidenceId], reason: 'Direct reported result.' }],
      ...payload.previouslyReviewed === undefined ? { preferredRepairs: [{ question: 'What method and observed result are reported?',
        workVersionId: payload.repairSources![0]!.workVersionId, windowIndexes: [0] }] } : { invalidatedAspectIds: [] } }
    } else if (part.text.startsWith('Decide whether')) response = { status: 'included', reason: 'Studies the approved method.' }
    else {
      this.evidenceCalls++
      const result = this.evidenceCalls > 1
      const payload = JSON.parse(part.text.slice(part.text.lastIndexOf('\n') + 1)) as {
        targetAspects?: { aspectId: string }[] }
      if (payload.targetAspects !== undefined) {
        assert.ok(!part.text.includes('Return at most 6'))
        assert.deepEqual(payload.targetAspects.map(a => a.aspectId), ['q1.result'])
      }
      response = { evidence: [{ segmentIndex: 0, ...payload.targetAspects === undefined ? { questionIndexes: [0] }
        : { aspectIds: payload.targetAspects.map(a => a.aspectId) },
      sourcedStatement: result ? 'Accuracy improves by 3 points.' : 'Uses reranking.',
      verbatimExcerpt: result ? 'Accuracy improves by 3 points.' : 'Uses reranking.', section: result ? 'findings' : 'methods' }] }
    }
    yield { type: 'text-delta', index: 0, text: JSON.stringify(response) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export function apply(ctx: Context): void {
  const adapter = new CoverageAdapter()
  ctx.effect(() => ctx.llm.registerAdapter(['academic-coverage-fixture'], adapter))
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    if (agent.session.snapshotEvents().some(event => event.type === 'academic/coverage-review-result-v1')) return next()
    const sample = JSON.parse(readFileSync(new URL(
      '../../../../z-team_docs/interface-samples/academic-model-v1/synthesis-input.sample.json', import.meta.url), 'utf8')) as AcademicSynthesisInput
    const work = sample.analysisInput.academicWorks[0], version = sample.analysisInput.workVersions[0]
    assert.ok(work && version)
    const question = 'What method and observed result are reported?'
    const record = { academicWork: work, workVersion: { ...version, versionType: 'preprint' as const,
      contentHash: { status: 'not_extracted' as const } } }
    const result = await runModelResearchDraft(ctx, agent.session,
      { provider: 'academic-coverage-fixture', model: 'fixture', maxTokens: 1000 },
      { evidence: { maxAttempts: 1, depth: 'minimal' }, synthesis: { maxAttempts: 1 }, coverage: { maxAttempts: 1, maxTokens: 1000 } },
      { retrievalRunId: 'coverage-fixture-run' as RetrievalRunId, synthetic: true,
        searches: [{ query: 'method and result', channels: ['academic'] }],
        coverageRepairPolicy: { minimumSupportingWorks: 1, maximumReviews: 2, maximumRepairRounds: 1,
          maximumRepairPapers: 1, maximumNewCandidateWorks: 0, maximumExcerptCharacters: 1000, maximumRepairCharacters: 4000,
          targeting: { maximumWindowsPerPaper: 2, maximumWindowCharacters: 1500, maximumSourceOptions: 20,
            maximumPreviewCharacters: 360, maximumTotalCharacters: 6000, contextCharacters: 240, maximumCandidateReads: 1,
            maximumModelTokens: 45000, maximumModelCalls: 6, maximumElapsedMs: 220000, repairMaxTokens: 4096,
            deltaReviewMaxTokens: 8192, candidateMaxTokens: 4096, finalReviewReserveTokens: 10000 } },
        brief: { ...sample.brief, questions: [question], includedWorkTypes: ['preprint'],
          publicationWindow: { start: null, end: null, dateBasis: 'published' },
          coverageRequirements: [{ question, aspects: [
            { aspectId: 'q1.method' as ResearchAspectId, label: 'Method', evidenceRequirement: 'direct', searchTerms: ['reranking'] },
            { aspectId: 'q1.result' as ResearchAspectId, label: 'Observed result', evidenceRequirement: 'direct', searchTerms: ['accuracy'] }] }],
          evidenceRequirements: { ...sample.brief.evidenceRequirements, minimumIncludedWorks: 2, targetIncludedWorks: 2,
            minimumFulltextWorks: 2, allowPreprints: true, insufficientEvidencePolicy: 'stop_for_review' },
          stopConditions: { ...sample.brief.stopConditions, maximumCandidateWorks: 2,
            maximumIncludedWorks: 2, maximumElapsedMinutes: null } } }, {
        search: async () => ({ works: [record], batch: createBatchResult([record], []), providers: ['fixture'],
          discoveredRecords: 1, truncated: false, limitations: [] }),
        selectPapers: (ingested, brief) => selectResearchPapers(ingested, brief, () => ({
          urls: ['https://example.org/coverage'], sourceProvider: 'fixture',
          extractionMethod: { method: 'fixture-html', methodVersion: '1' }, hasHistoricalEvidence: false })),
        fetcher: async url => ({ url, statusCode: 200, truncated: false,
          body: { kind: 'html', content: '<article><h2>Results</h2><p>Uses reranking. Accuracy improves by 3 points.</p></article>' } }),
        now: () => '2026-10-30T01:00:00Z',
      })
    assert.equal(adapter.reviews, 2, JSON.stringify({ papers: result.papers, failures: result.failures,
      synthesis: result.synthesis, coverage: result.retrievalRun.coverageSummary }))
    assert.equal(result.coverageRepair?.repairRounds, 1)
    assert.equal(result.coverageRepair?.reviewCalls, 2)
    assert.equal(result.coverageRepair?.schemaVersion, 2)
    assert.equal(result.coverageRepair?.targeting?.dispatches.length, 3)
    assert.ok(result.coverageRepair.targeting.characters > 0)
    assert.equal(result.coverageRepair?.coverage?.allQuestionsCovered, true)
    assert.equal(result.coverageRepair?.coverage?.evidenceRequirementsMet, false)
    assert.equal(result.synthesis.status, 'blocked')
    assert.equal(result.papers[0]?.status === 'extracted' ? result.papers[0].evidence.evidenceRecords.length : 0, 2)
    const events = agent.session.snapshotEvents()
    const reservation = events.find(event => event.type === 'academic/coverage-repair-state-v1')
    const review = events.find(event => event.type === 'academic/coverage-review-request-v1')
    assert.ok(reservation && review && reservation.seq < review.seq)
    const baseline = events.find(event => event.type === 'academic/coverage-repair-state-v1'
      && event.data.state.reviewCalls === 1 && event.data.state.review !== null && event.data.state.pending === null)
    assert.ok(baseline?.type === 'academic/coverage-repair-state-v1')
    const checkpoint = events.findLast(event => event.type === 'academic/coverage-repair-state-v1')
    assert.ok(checkpoint?.type === 'academic/coverage-repair-state-v1')
    const interruptedId = 'coverage-interruption-fixture-run' as RetrievalRunId
    const input: CoverageReviewInput = { retrievalRunId: interruptedId,
      brief: { ...sample.brief, questions: [question], coverageRequirements: baseline.data.state.requirements },
      works: [work], evidence: result.papers.flatMap(p => 'evidence' in p ? p.evidence.evidenceRecords : []),
      questionLinks: result.papers.flatMap(p => 'evidence' in p ? p.evidence.questionLinks : []) }
    const persist = async (state: typeof baseline.data.state) => {
      agent.session.append('academic/coverage-repair-state-v1', { retrievalRunId: interruptedId, state })
      assert.ok(await ctx.sessions.flush(agent.session))
    }
    const interrupted = new CoverageRepairRuntime(input, baseline.data.state.policy, baseline.data.state, persist,
      () => '2026-10-30T01:00:00Z')
    await assert.rejects(interrupted.review(input, false, 'now', async () => { throw new Error('Simulated interruption') }),
      /Simulated interruption/)
    assert.equal(interrupted.state.review?.aspects[0]?.status, 'covered')
    const saved = structuredClone(interrupted.state)
    const resumed = new CoverageRepairRuntime(input, saved.policy, saved, persist, () => '2026-10-30T01:00:00Z')
    const coverage = await resumed.review(input, false, 'now', async () => { throw new Error('Interrupted call was repeated') })
    assert.deepEqual(coverage.questions[0]?.aspects?.map(a => a.status), ['covered', 'missing'])
    assert.equal(resumed.state.reviewCalls, 2)
    assert.equal(resumed.state.failure, 'review_failed')
    assert.deepEqual(resumed.state.targeting, saved.targeting)
    return next()
  })
}
