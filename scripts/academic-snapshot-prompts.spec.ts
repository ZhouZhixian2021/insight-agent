/** Keep reviewed academic request expectations aligned with the model-visible prompt builders. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { EvidenceGenerationRequest } from '@deepseek-ai/dsh-academic-evidence'
import { compactSynthesisPrompt, parseSynthesisDraft, SynthesisError, synthesisPrompt, synthesisRepairPrompt } from '@deepseek-ai/dsh-academic-analysis'
import { evidenceMessages } from '../packages/academic/workflow/src/model-prompt.ts'
import { estimateMessage } from '../packages/llm/token-meter/src/estimate.ts'

it.each([
  'snapshots/sdk/academic-coverage/session.v4.jsonl',
  'snapshots/sdk-oracles/academic-evidence/writer.expected.jsonl',
  'snapshots/sdk-oracles/academic-limited-draft/writer.expected.jsonl',
])('retains current prompts and token estimates in %s', (file) => {
  let checked = 0
  const records = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').trim().split('\n')
    .map(line => JSON.parse(line) as SessionEvent)
  const failed = records.find(record => record.type === 'academic/synthesis-result'
    && record.data.errorCode === 'SYNTHESIS_INVALID_MODEL_OUTPUT')
  const initial = records.find(record => record.type === 'academic/synthesis-request')
  let validationError: string | undefined
  if (failed?.type === 'academic/synthesis-result' && initial?.type === 'academic/synthesis-request') {
    const output = failed.data.stream.flatMap(chunk => chunk.type === 'text-chunks' ? chunk.texts : []).join('')
    try { parseSynthesisDraft(output, initial.data.input) } catch (error) {
      if (!(error instanceof SynthesisError)) throw error
      validationError = error.message
    }
    expect(validationError).toBeDefined()
  }
  for (const record of records) {
    if (record.type !== 'academic/evidence-request' && record.type !== 'academic/synthesis-request') continue
    const first = record.data.messages[0]?.content[0]
    if (first?.type !== 'text') throw new Error('Academic snapshot request has no text prompt')
    const text = first.text
    if (record.type === 'academic/synthesis-request') {
      expect(text).toBe(record.data.attempt === 1 ? synthesisPrompt(record.data.input)
        : validationError === undefined ? compactSynthesisPrompt(record.data.input)
          : synthesisRepairPrompt(record.data.input, validationError, false))
    } else {
      const marker = '\nExtract only facts directly answering the focus questions'
      const start = text.indexOf(marker)
      if (record.data.phase !== 'evidence' || start === -1) continue
      const input = JSON.parse(text.slice(text.lastIndexOf('\n{') + 1)) as Pick<EvidenceGenerationRequest, 'focusQuestions' | 'segments'>
      const generated = evidenceMessages({ ...input, instruction: text.slice(0, start) },
        text.includes('Return at most 5 entries') ? 'minimal' : 'complete')[0]?.content[0]
      expect(generated).toMatchObject({ type: 'text', text })
    }
    expect(record.data.estimatedInputTokens).toBe(record.data.messages.reduce((total, message) => total + estimateMessage(message), 0))
    checked += 1
  }
  expect(checked).toBeGreaterThan(0)
})
