/** Keyless fragment recovery through the shipped SDK profile. */
import assert from 'node:assert/strict'
import type { Context } from '../../../vendor/cordis/lib/index.js'
import { defineTool } from '../../../packages/core/tools/lib/index.js'
import { createAcademicWorkId, createWorkVersionId } from '../../../packages/academic/model/lib/index.js'
import { EvidenceError, extractEvidenceInFragments } from '../../../packages/academic/evidence/lib/index.js'

export const name = 'academic-evidence-fragments-fixture'
export const inject = ['tools']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'run_evidence_fragments_fixture',
    description: 'Verify and retain fixed paper evidence while recovering one timed-out source fragment.',
    parameters: {}, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => {
      const saved: string[] = []
      const calls: string[] = []
      const result = await extractEvidenceInFragments({ academicWorkId: createAcademicWorkId(),
        workVersionId: createWorkVersionId(), sourceProvider: 'acl', sourceUrl: 'https://aclanthology.org/2025.acl-long.1/',
        retrievedAt: '2026-10-10T00:00:00Z', contentHash: 'sha256:fixture',
        extractionMethod: { method: 'fixture', methodVersion: '1' }, focusQuestions: ['Which fact is supported?'],
        segments: [{ text: 'abcdefghABCDEFGH', locator: { kind: 'abstract' } }],
      }, {
        policy: { maximumCharacters: 8, minimumCharacters: 2, overlapCharacters: 0, maximumAttempts: 3,
          maximumOutputTokens: 512, initialRetryDelayMs: 0 },
        generator: async (request) => {
          const text = request.segments[0]?.text
          assert.ok(text)
          calls.push(text)
          if (text === 'ABCDEFGH') {
            assert.deepEqual(saved, ['abcdefgh'])
            throw new EvidenceError('Synthetic timeout.', 'EVIDENCE_MODEL_TIMEOUT')
          }
          return [{ segmentIndex: 0, questionIndexes: [0], sourcedStatement: text,
            verbatimExcerpt: text, cardItems: [] }]
        },
        classifyFailure: error => error instanceof EvidenceError && error.code === 'EVIDENCE_MODEL_TIMEOUT' ? 'timeout' : null,
        onVerified: async (_attempt, evidence) => { saved.push(...evidence.evidenceRecords.map(record => record.sourcedStatement)) },
      })
      assert.deepEqual(calls, ['abcdefgh', 'ABCDEFGH', 'ABCD', 'EFGH'])
      assert.equal(result.evidence.evidenceRecords.length, 3)
      assert.equal(result.incompleteFragments.length, 0)
      return JSON.stringify({ calls, saved, records: result.evidence.evidenceRecords.length,
        failedAttempts: result.failures.length, incomplete: result.incompleteFragments.length })
    },
  })))
}
