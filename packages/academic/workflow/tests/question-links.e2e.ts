/** Real full-text extraction checks question associations against source-verified evidence. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as DeepSeek from '@deepseek-ai/dsh-llm-deepseek'
import SessionStore from '@deepseek-ai/dsh-session'
import JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { createAcademicWorkId, createWorkVersionId, type WorkVersion } from '@deepseek-ai/dsh-academic-model'
import { prepareFetchedAcademicFullText } from '@deepseek-ai/dsh-academic-evidence'
import { createModelEvidenceGenerator, extractPaperEvidence } from '../src/index.ts'

it.skipIf(!process.env.DEEPSEEK_API_KEY)('associates real paper evidence with its supported question only', { retry: 0 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'academic-question-links-e2e-'))
  const ctx = new Context()
  vi.stubEnv('DSH_HOME', join(root, 'home'))
  try {
    const response = await fetch('https://arxiv.org/html/1706.03762v7', { signal: AbortSignal.timeout(30_000) })
    expect(response.status).toBe(200)
    const focusQuestions = [
      'What neural architecture does Attention Is All You Need propose?',
      'What exact annual carbon emissions in tonnes does this paper report?',
    ]
    const parsed = prepareFetchedAcademicFullText({
      academicWorkId: createAcademicWorkId(), workVersionId: createWorkVersionId(),
      sourceProvider: 'arxiv', retrievedAt: new Date().toISOString(),
      extractionMethod: { method: 'html-paragraphs', methodVersion: '1' },
      focusQuestions, fetched: { url: response.url, statusCode: response.status, truncated: false,
        body: { kind: 'html', content: await response.text() } },
    })
    expect(parsed.segments.length).toBeGreaterThan(10)
    const version: WorkVersion = { schemaVersion: 1, academicWorkId: parsed.academicWorkId,
      workVersionId: parsed.workVersionId, versionType: 'preprint',
      versionLabel: { status: 'available', value: 'v7' }, releaseDate: { status: 'unknown', reason: 'Not checked by this extraction test.' },
      externalIdentifiers: [], sourceRecords: [], contentHash: { status: 'not_extracted' },
      supersedesWorkVersionId: null, status: 'active' }
    await ctx.plugin(SessionStore)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionProjections)
    await ctx.plugin(TokenMeter)
    await ctx.plugin(JsonlPersistence, { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(DeepSeek, { thinking: 'disabled', retryPolicy: { mode: 'normal', maxRetries: 0 } })
    const session = ctx.sessions.create()
    await ctx.sessionPersistence.create(session.header)
    const generate = createModelEvidenceGenerator(ctx, session,
      { provider: 'deepseek-official', model: 'deepseek-v4-flash', maxTokens: 2048 },
      { maxAttempts: 1, attemptTimeoutMs: 60_000 })
    const result = await extractPaperEvidence(version, parsed, false, generate,
      { inclusionRules: [], exclusionRules: [] }, AbortSignal.timeout(70_000)).catch((error: unknown) => {
      const failed = session.snapshotEvents().findLast(event => event.type === 'academic/evidence-result')
      throw new Error('Real extraction failed: ' + JSON.stringify(failed?.data.finish), { cause: error })
    })
    expect(result.status).toBe('extracted')
    if (result.status !== 'extracted') throw new Error('Expected source-verified extraction.')
    expect(result.evidence.evidenceRecords.length).toBeGreaterThan(0)
    expect(new Set(result.evidence.questionLinks.map(link => link.question))).toEqual(new Set([focusQuestions[0]]))
    for (const link of result.evidence.questionLinks) {
      expect(result.evidence.evidenceRecords.some(record => record.evidenceId === link.evidenceId)).toBe(true)
    }
    await using reader = await ctx.sessionPersistence.open(session.id, 'read')
    const events = await reader.read()
    expect(events.filter(event => event.type === 'academic/evidence-request')).toHaveLength(1)
    expect(events.filter(event => event.type === 'academic/evidence-result')).toHaveLength(1)
  } finally {
    try { await ctx.fiber.dispose() } finally {
      vi.unstubAllEnvs()
      await rm(root, { recursive: true, force: true })
    }
  }
})
