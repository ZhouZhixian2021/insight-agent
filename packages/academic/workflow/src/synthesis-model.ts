/** Session-backed question synthesis, reusing the extraction transport's durability and budgets. */
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage, type LlmCallConfig } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import { parseSynthesisDraft, synthesisPrompt, type AcademicSynthesisDraft, type AcademicSynthesisInput,
  type RejectedSynthesisStatement } from '@deepseek-ai/dsh-academic-analysis'
import { createLoggedModelRunner } from './model-call.ts'
import type { EvidenceModelPolicy, EvidenceModelRequest, EvidenceModelResult } from './model-types.ts'

/** Exact synthesis input and resolved dispatch configuration, durably written before streaming. */
export interface SynthesisModelRequest extends Omit<EvidenceModelRequest, 'source'> {
  readonly input: AcademicSynthesisInput
}

/** Settled synthesis attempt; validation covers structure and references, never semantic review. */
export interface SynthesisModelResult extends Omit<EvidenceModelResult, 'source' | 'status'> {
  readonly retrievalRunId: AcademicSynthesisInput['retrievalRunId']
  readonly status: EvidenceModelResult['status'] | 'partially_validated'
  /** Present after complete JSON parsing; earlier logs and transport failures omit this field. */
  readonly rejectedStatements?: readonly RejectedSynthesisStatement[]
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Log-only approved Brief, admitted evidence and exact synthesis model request. */
    'academic/synthesis-request': SynthesisModelRequest
    /** Log-only synthesis settlement, raw output, usage and request sequence. */
    'academic/synthesis-result': SynthesisModelResult
  }
}

/**
 * Bind question synthesis to the selected Session model without a provider-specific API.
 * @param ctx DSH model and durable Session services.
 * @param session Live Session owning the request and response records.
 * @param config Selected model and output-token budget.
 * @param policy Bounded output-limit recovery policy.
 * @returns An adapter retaining valid paragraphs and recording local rejections; no template fallback or reference weakening.
 */
export function createModelSynthesisGenerator(ctx: Context, session: Session, config: LlmCallConfig, policy: EvidenceModelPolicy):
(input: AcademicSynthesisInput, signal?: AbortSignal) => Promise<AcademicSynthesisDraft> {
  const run = createLoggedModelRunner<AcademicSynthesisDraft>(ctx, session, config, policy)
  return (input: AcademicSynthesisInput, signal?: AbortSignal): Promise<AcademicSynthesisDraft> => {
    let draft: AcademicSynthesisDraft | undefined
    return run({
      messages: [createUserMessage({ source: { kind: 'plugin', plugin: 'dsh-academic-workflow' },
        content: [{ type: 'text', text: synthesisPrompt(input) }] })],
      ...signal === undefined ? {} : { signal },
      parse: (text) => { draft = parseSynthesisDraft(text, input); return draft },
      appendRequest: data => session.append('academic/synthesis-request', { input, ...data }),
      appendResult: data => session.append('academic/synthesis-result', { retrievalRunId: input.retrievalRunId, ...data,
        ...draft === undefined ? {} : { rejectedStatements: draft.rejectedStatements },
        ...data.status !== 'validated' || draft === undefined ? {} : draft.statements.length === 0
          ? { status: 'failed', errorCode: 'SYNTHESIS_NO_VALID_STATEMENTS' }
          : { status: draft.rejectedStatements.length > 0 ? 'partially_validated' : 'validated' },
      }),
    })
  }
}
