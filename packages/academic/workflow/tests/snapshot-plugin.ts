/** Opt-in snapshot composition: real academic extraction with only model output scripted. */
import type { Context } from '@deepseek-ai/cordis'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { createModelEvidenceGenerator, createModelSynthesisGenerator, extractPaperEvidence } from '@deepseek-ai/dsh-academic-workflow'
import { prepareSynthesisInput, synthesisAnalysis, type AcademicSynthesisInput } from '@deepseek-ai/dsh-academic-analysis'
import { generateReport } from '@deepseek-ai/dsh-academic-report'
import type { AcademicWorkId, WorkVersionId, WorkVersion } from '@deepseek-ai/dsh-academic-model'
import type {} from '@deepseek-ai/dsh-agent'

export const name = 'academic-model-snapshot'
export const inject = ['llm', 'sessions', 'sessionPersistence', 'tokenMeter']
const samples = new URL('../../../../z-team_docs/interface-samples/academic-model-v1/', import.meta.url)

class SnapshotAdapter extends LlmAdapter {
  override resolveModel(provider: string, model: string) {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 32768 } })
  }
  override async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    const message = _options.messages[0]?.content[0]
    if (message?.type === 'text' && message.text.includes('INPUT_JSON\n')) {
      yield { type: 'text-delta', index: 0, text: readFileSync(new URL('synthesis-partial-output.sample.json', samples), 'utf8') }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    yield { type: 'text-delta', index: 0, text: JSON.stringify({
      scope: { status: 'included', reason: 'No approved rule excludes the paper.' }, evidence: [{ segmentIndex: 0,
        sourcedStatement: 'Uses Method X.', verbatimExcerpt: 'Uses Method X.',
        cardItems: [{ section: 'methods', statement: 'Uses Method X.',
          methodName: { status: 'available', value: 'Method X' },
          methodRole: { status: 'available', value: 'proposed' } }] },
      { segmentIndex: 0, sourcedStatement: 'Unverified model statement.', verbatimExcerpt: 'Not in the supplied source.', cardItems: [] },
      { segmentIndex: 0, sourcedStatement: 'Uses Method X.', verbatimExcerpt: 'Method X', cardItems: [] }] }) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.llm.registerAdapter(['academic-fixture'], new SnapshotAdapter()))
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    if (!agent.session.snapshotEvents().some(event => event.type === 'academic/evidence-result')) {
      const academicWorkId = 'synthetic-work' as AcademicWorkId, workVersionId = 'synthetic-version' as WorkVersionId
      const version: WorkVersion = { schemaVersion: 1, academicWorkId, workVersionId, versionType: 'preprint',
        versionLabel: { status: 'available', value: 'v1' }, releaseDate: { status: 'unknown', reason: 'synthetic' },
        externalIdentifiers: [], sourceRecords: [], contentHash: { status: 'not_extracted' },
        supersedesWorkVersionId: null, status: 'active' }
      const result = await extractPaperEvidence(version, { academicWorkId, workVersionId, contentHash: 'synthetic-content',
        sourceProvider: 'fixture', sourceUrl: 'https://example.org/synthetic', retrievedAt: '2026-09-15T00:00:00Z',
        extractionMethod: { method: 'fixture', methodVersion: '1' },
        segments: [{ text: 'Uses Method X.', locator: { kind: 'paragraph', paragraphNumber: 1 } }] },
      false, createModelEvidenceGenerator(ctx, agent.session,
        { provider: 'academic-fixture', model: 'fixture', maxTokens: 500 }, { maxAttempts: 1 }),
      { inclusionRules: [], exclusionRules: [] })
      assert.equal(result.status, 'partially_extracted')
      if (result.status !== 'partially_extracted') throw new Error('unexpected paper settlement')
      assert.equal(result.evidence.evidenceRecords.length, 2)
      assert.deepEqual(result.evidence.rejectedDrafts, [{ draftIndex: 1, segmentIndex: 0,
        code: 'EVIDENCE_EXCERPT_NOT_FOUND', reason: 'excerpt is not uniquely present outside segment 0' }])
      assert.equal(result.evidence.evidenceCard.workVersionId, workVersionId)
      assert.deepEqual(result.evidence.evidenceRecords[0]?.contentHash, { status: 'available', value: 'synthetic-content' })
      const input: AcademicSynthesisInput = JSON.parse(readFileSync(new URL('synthesis-input.sample.json', samples), 'utf8')) as AcademicSynthesisInput
      const admission = prepareSynthesisInput(input)
      assert.equal(admission.status, 'ready')
      if (admission.status !== 'ready') throw new Error('synthetic evidence admission failed')
      const draft = await createModelSynthesisGenerator(ctx, agent.session,
        { provider: 'academic-fixture', model: 'fixture', maxTokens: 4096 }, { maxAttempts: 1 })(admission.input)
      const analysis = synthesisAnalysis(admission.input, draft, '2026-09-20T00:00:00Z')
      const report = generateReport({ brief: input.brief, claims: analysis.claims, links: analysis.links,
        evidence: input.analysisInput.evidenceRecords, versions: input.analysisInput.workVersions,
        sourceLocators: input.analysisInput.sourceLocators, works: input.analysisInput.academicWorks,
        reviews: [], assessedAt: '2026-09-20T00:00:00Z', limitations: draft.limitations,
        mode: 'draft', synthetic: true, synthesis: draft, coverage: input.coverageSummary })
      assert.equal(report.evaluation.status, 'needs_review')
      assert.equal(report.claims.length, 1)
      assert.equal(report.evidence.length, 2)
      assert.equal(draft.rejectedStatements.length, 1)
      assert.equal(draft.rejectedStatements[0]?.statementIndex, 3)
      assert.ok(report.limitations.some(message => message.includes('模型候选段落 4 未纳入报告')))
      assert.ok(report.markdown.includes('逐题研究结论'))
      assert.ok(report.markdown.includes('部分回答'))
      await using reader = await ctx.sessionPersistence.open(agent.session.id, 'read')
      const saved = await reader.read()
      assert.equal(saved.filter(event => event.type === 'academic/evidence-request').length, 1)
      assert.equal(saved.filter(event => event.type === 'academic/evidence-result').length, 1)
      assert.equal(saved.filter(event => event.type === 'academic/synthesis-request').length, 1)
      assert.equal(saved.filter(event => event.type === 'academic/synthesis-result').length, 1)
      const synthesis = saved.find(event => event.type === 'academic/synthesis-result')
      assert.equal(synthesis?.data.status, 'partially_validated')
      assert.deepEqual(synthesis?.data.rejectedStatements, draft.rejectedStatements)
    }
    return next()
  })
}
