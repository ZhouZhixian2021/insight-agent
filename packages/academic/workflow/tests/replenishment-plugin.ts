/** Keyless Loader scenario: external source/model answers are scripted; orchestration is real. */
import type { Context } from '@deepseek-ai/cordis'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createBatchResult, type AcademicWorkId, type WorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { parseSynthesisDraft, synthesisSections, type AcademicSynthesisInput } from '@deepseek-ai/dsh-academic-analysis'
import { runResearchDraft, selectResearchPapers } from '../src/index.ts'

export const name = 'academic-replenishment-fixture'
export const inject = ['tools']

export function apply(ctx: Context, config: { paperConcurrency?: number } = {}): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'run_replenishment_fixture', description: 'Run a synthetic bounded candidate replenishment without network access.',
    parameters: {}, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => {
      const sample = JSON.parse(readFileSync(new URL('../../../../z-team_docs/interface-samples/academic-model-v1/synthesis-input.sample.json', import.meta.url), 'utf8')) as AcademicSynthesisInput
      const concurrency = config.paperConcurrency ?? 1
      const included = concurrency === 3 ? 3 : 2
      const brief = { ...sample.brief, topic: 'Synthetic replenishment', questions: ['Compare the observed methods.'],
        publicationWindow: { ...sample.brief.publicationWindow, start: null, end: null },
        evidenceRequirements: { ...sample.brief.evidenceRequirements, minimumIncludedWorks: included, minimumFulltextWorks: included },
        stopConditions: { ...sample.brief.stopConditions, maximumCandidateWorks: 5, maximumIncludedWorks: included,
          maximumElapsedMinutes: null, stopWhenEvidenceRequirementsMet: true } }
      const records = Array.from({ length: 5 }, (_, index) => {
        const academicWorkId = `synthetic-work-${index}` as AcademicWorkId
        const workVersionId = `synthetic-version-${index}` as WorkVersionId
        return { academicWork: { ...sample.analysisInput.academicWorks[0]!, academicWorkId, title: `Candidate ${index}`,
          externalIdentifiers: [], workVersionIds: [workVersionId], canonicalVersionId: workVersionId },
        workVersion: { ...sample.analysisInput.workVersions[0]!, academicWorkId, workVersionId,
          externalIdentifiers: [], contentHash: { status: 'not_extracted' as const }, supersedesWorkVersionId: null,
          sourceRecords: [{ provider: 'fixture', recordId: String(index) }] } }
      })
      const attempted: string[] = []
      let active = 0, peak = 0
      const result = await runResearchDraft({ brief, paperConcurrency: concurrency, searches: [{ query: 'synthetic' }], synthetic: true }, {
        search: async () => ({ works: records, batch: createBatchResult(records, []), providers: ['fixture'],
          discoveredRecords: 5, truncated: false, limitations: [] }),
        selectPapers: (ingested, scope) => selectResearchPapers(ingested, scope, (_work, version) => ({
          urls: [`https://example.org/${version.sourceRecords[0]!.recordId}`], sourceProvider: 'fixture',
          extractionMethod: { method: 'fixture', methodVersion: '1' }, hasHistoricalEvidence: false })),
        fetcher: async (url) => {
          attempted.push(url)
          active++; peak = Math.max(peak, active)
          await Promise.resolve()
          active--
          return { url, statusCode: 200, truncated: false,
            body: { kind: 'html', content: '<article><h2>Methods</h2><p>Uses reranking.</p></article>' } }
        },
        generator: async (_request, parsed) => {
          if (parsed.sourceUrl.endsWith('/0')) return { scope: { status: 'excluded', reason: 'Outside synthetic scope.' }, evidence: [] }
          if (parsed.sourceUrl.endsWith('/1')) throw new Error('Synthetic extraction failure')
          return { scope: { status: 'included', reason: 'Relevant synthetic methods.' }, evidence: [
            { segmentIndex: 0, sourcedStatement: 'Uses reranking.', verbatimExcerpt: 'Uses reranking.', cardItems: [
              { section: 'methods', statement: 'Uses reranking.', methodName: { status: 'available', value: 'reranking' },
                methodRole: { status: 'available', value: 'proposed' } },
            ] },
          ] }
        },
        synthesize: async input => parseSynthesisDraft(JSON.stringify({ schemaVersion: 1,
          researchBriefId: brief.researchBriefId, researchBriefVersion: brief.version,
          statements: [{ text: '两篇合成论文均描述了重排序方法。', kind: 'synthesis', category: 'comparison',
            scope: '仅限合成材料。', uncertainty: '不代表真实研究结论。',
            evidenceLinks: input.analysisInput.evidenceRecords.map(record => ({ evidenceId: record.evidenceId,
              relation: 'supports', rationale: '原文描述该方法。' })) }],
          questionAnswers: [{ questionIndex: 0, status: 'answered', statementIndexes: [0], reason: null }],
          sections: synthesisSections(brief).map(sectionId => ({ sectionId, title: sectionId,
            statementIndexes: ['scope_and_method', 'references', 'evidence_appendix'].includes(sectionId) ? [] : [0], missingReason: null })),
          limitations: ['仅供无密钥补选回归。'],
        }), input),
        now: () => '2026-09-21T00:00:00Z',
      })
      assert.equal(peak, concurrency)
      assert.equal(attempted.length, included + 2, JSON.stringify({ papers: result.papers.map(paper => paper.status),
        failures: result.failures, synthesis: result.synthesis }))
      assert.equal(result.retrievalRun.coverageSummary.includedWorks, included)
      assert.equal(result.failures.length, 1)
      assert.equal(result.synthesis.status, 'completed')
      assert.ok(result.report)
      return JSON.stringify({ ...concurrency === 3 ? { peak } : {}, attempted, papers: result.papers.map(paper => paper.status),
        includedWorks: result.retrievalRun.coverageSummary.includedWorks, failures: result.failures.length,
        synthesis: result.synthesis.status, hasReport: result.report !== null,
        limitations: result.retrievalRun.coverageSummary.limitations })
    },
  })))
}
