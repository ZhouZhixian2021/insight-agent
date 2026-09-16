/** Opt-in snapshot composition: real academic extraction with only model output scripted. */
import type { Context } from '@deepseek-ai/cordis'
import assert from 'node:assert/strict'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { createModelEvidenceGenerator, extractPaperEvidence } from '@deepseek-ai/dsh-academic-workflow'
import type { AcademicWorkId, WorkVersionId, WorkVersion } from '@deepseek-ai/dsh-academic-model'
import type {} from '@deepseek-ai/dsh-agent'

export const name = 'academic-model-snapshot'
export const inject = ['llm', 'sessions', 'sessionPersistence', 'tokenMeter']

class SnapshotAdapter extends LlmAdapter {
  override resolveModel(provider: string, model: string) {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 8192 } })
  }
  override async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: 'text-delta', index: 0, text: JSON.stringify([{ segmentIndex: 0,
      sourcedStatement: 'Uses Method X.', verbatimExcerpt: 'Uses Method X.',
      cardItems: [{ section: 'methods', statement: 'Uses Method X.',
        methodName: { status: 'available', value: 'Method X' },
        methodRole: { status: 'available', value: 'proposed' } }] }]) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['academic-fixture'], new SnapshotAdapter())
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
      false, createModelEvidenceGenerator(ctx, agent.session, { provider: 'academic-fixture', model: 'fixture', maxTokens: 500 }))
      assert.equal(result.status, 'extracted')
      if (result.status !== 'extracted') throw new Error('unexpected paper pause')
      assert.equal(result.evidence.evidenceRecords.length, 1)
      assert.equal(result.evidence.evidenceCard.workVersionId, workVersionId)
      assert.deepEqual(result.evidence.evidenceRecords[0]?.contentHash, { status: 'available', value: 'synthetic-content' })
      await using reader = await ctx.sessionPersistence.open(agent.session.id, 'read')
      const saved = await reader.read()
      assert.equal(saved.filter(event => event.type === 'academic/evidence-request').length, 1)
      assert.equal(saved.filter(event => event.type === 'academic/evidence-result').length, 1)
    }
    return next()
  })
}
