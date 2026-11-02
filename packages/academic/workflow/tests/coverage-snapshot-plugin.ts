/** Loader regression: stop-time review, one existing-paper repair and durable reservations. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { createBatchResult, type ResearchAspectId, type RetrievalRunId } from '@deepseek-ai/dsh-academic-model'
import { runModelResearchDraft, selectResearchPapers } from '@deepseek-ai/dsh-academic-workflow'
import type { AcademicSynthesisInput } from '@deepseek-ai/dsh-academic-analysis'
import type {} from '@deepseek-ai/dsh-agent'

export const name = 'academic-coverage-snapshot'
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
        evidence: { evidenceId: string; statement: string }[] }
      const method = payload.evidence.find(item => item.statement === 'Uses reranking.')
      const result = payload.evidence.find(item => item.statement === 'Accuracy improves by 3 points.')
      assert.ok(method)
      response = { aspects: [{ aspectId: 'q1.method', status: 'covered', evidenceIds: [method.evidenceId], reason: 'Direct method.' },
        result === undefined ? { aspectId: 'q1.result', status: 'missing', evidenceIds: [], reason: 'No observed result.' }
          : { aspectId: 'q1.result', status: 'covered', evidenceIds: [result.evidenceId], reason: 'Direct reported result.' }] }
    } else if (part.text.startsWith('Decide whether')) response = { status: 'included', reason: 'Studies the approved method.' }
    else {
      this.evidenceCalls++
      const result = this.evidenceCalls > 1
      response = { evidence: [{ segmentIndex: 0, questionIndexes: [0],
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
          maximumRepairPapers: 1, maximumNewCandidateWorks: 0, maximumExcerptCharacters: 1000, maximumRepairCharacters: 4000 },
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
    assert.equal(result.coverageRepair?.coverage?.allQuestionsCovered, true)
    assert.equal(result.coverageRepair?.coverage?.evidenceRequirementsMet, false)
    assert.equal(result.synthesis.status, 'blocked')
    assert.equal(result.papers[0]?.status === 'extracted' ? result.papers[0].evidence.evidenceRecords.length : 0, 2)
    const events = agent.session.snapshotEvents()
    const reservation = events.find(event => event.type === 'academic/coverage-repair-state-v1')
    const review = events.find(event => event.type === 'academic/coverage-review-request-v1')
    assert.ok(reservation && review && reservation.seq < review.seq)
    return next()
  })
}
