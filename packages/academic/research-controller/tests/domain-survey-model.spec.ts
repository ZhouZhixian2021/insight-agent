import { beforeEach, expect, it, vi } from 'vitest'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import type { DomainSurveyPaper } from '@deepseek-ai/dsh-academic-retrieval'
import type { EvidenceModelPolicy, LoggedModelRequest } from '@deepseek-ai/dsh-academic-workflow'

const modelRunner = vi.hoisted(() => vi.fn())
vi.mock('@deepseek-ai/dsh-academic-workflow', () => ({ createLoggedModelRunner: modelRunner }))
import { createDomainSurveyProposer } from '../src/domain-survey-model.ts'

const paper: DomainSurveyPaper = { workId: 'w1', title: 'Operating system kernel',
  abstract: 'A'.repeat(1_000), sourceProviders: ['fixture'],
  sourceRecords: [{ provider: 'fixture', recordId: 'r1' }] }
const answer = JSON.stringify({ directions: [{ label: '内核', definition: '内核研究',
  supports: [{ workId: 'w1', field: 'title', quote: 'Operating system kernel' }] }],
unclassifiedWorkIds: [] })

beforeEach(() => { modelRunner.mockReset() })

it('reserves enough output and uses a smaller abstract only after output-limit recovery', async () => {
  let config: LlmCallConfig | undefined
  let policy: EvidenceModelPolicy | undefined
  modelRunner.mockImplementation((_ctx: unknown, _session: unknown, selected: LlmCallConfig,
    recovery: EvidenceModelPolicy) => {
    config = selected; policy = recovery
    return async (request: LoggedModelRequest<string>) => {
      expect(JSON.stringify(request.messages)).toContain('A'.repeat(1_000))
      expect(JSON.stringify(request.messages)).not.toContain('sourceRecords')
      expect(JSON.stringify(request.outputLimitRetryMessages)).toContain('A'.repeat(400))
      expect(JSON.stringify(request.outputLimitRetryMessages)).not.toContain('A'.repeat(401))
      request.onAttempt?.({ phase: 'retry_scheduled', attempt: 1, maximumAttempts: 3,
        status: 'failed', finish: { kind: 'max-tokens' }, errorCode: 'EVIDENCE_MODEL_INCOMPLETE' })
      return request.parse(answer)
    }
  })
  const propose = createDomainSurveyProposer({} as never, {} as never,
    { provider: 'fixture', model: 'fixture', maxTokens: 8_192 }, 'plan-1', '操作系统', '2022–2026')
  const result = await propose([paper])
  expect(config?.maxTokens).toBe(16_384)
  expect(policy).toMatchObject({ maxAttempts: 3, retryOutputLimit: true,
    transientRetry: { failureCodes: ['TRANSPORT', 'TIMEOUT'] } })
  expect(result.limitations).toContain('Direction mapping used only the first 400 characters of each abstract after an output-limit retry.')
})

it('reports a transport failure clearly after the bounded retries', async () => {
  modelRunner.mockImplementation(() => async (request: LoggedModelRequest<string>) => {
    request.onAttempt?.({ phase: 'settled', attempt: 3, maximumAttempts: 3,
      status: 'failed', finish: { kind: 'error', failure: { code: 'TRANSPORT', message: 'Connection error.' } },
      errorCode: 'EVIDENCE_MODEL_INCOMPLETE' })
    throw new Error('Model did not complete a text response.')
  })
  const propose = createDomainSurveyProposer({} as never, {} as never,
    { provider: 'fixture', model: 'fixture', maxTokens: 16_384 }, 'plan-1', '操作系统', '2022–2026')
  await expect(propose([paper])).rejects.toThrow('模型连接失败')
})
