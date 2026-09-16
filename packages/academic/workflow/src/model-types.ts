/** Model extraction configuration and durable request/result payloads. */
import type { EvidenceExtractionInput, EvidenceGenerationRequest, EvidenceDraft } from '@deepseek-ai/dsh-academic-evidence'
import type { AssistantStreamRecord, FinishReason, LlmCallConfig, Message, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionSeq } from '@deepseek-ai/dsh-session'

/** A's generator receives program-owned provenance without changing B's request interface. */
export type PaperEvidenceGenerator = (
  request: EvidenceGenerationRequest,
  source: EvidenceExtractionInput,
) => Promise<readonly EvidenceDraft[]>

/** Program-owned identity of the exact parsed content submitted for extraction. */
export type EvidenceModelSource = Pick<EvidenceExtractionInput,
  'academicWorkId' | 'workVersionId' | 'contentHash' | 'sourceProvider' | 'sourceUrl' | 'retrievedAt' | 'extractionMethod'>

/** Exact model-visible request and the heuristic admission decision, recorded before dispatch. */
export interface EvidenceModelRequest {
  readonly source: EvidenceModelSource
  readonly config: LlmCallConfig
  readonly messages: Message[]
  readonly estimatedInputTokens: number
  readonly contextWindow: number
  readonly outputTokens: number
  readonly decision: 'dispatch' | 'skip_input_limit'
}

/** One settled model attempt; validated means JSON validation, not semantic approval. */
export interface EvidenceModelResult {
  readonly source: EvidenceModelSource
  /** Null when preparation failed before an exact request could be recorded. */
  readonly requestSeq: SessionSeq | null
  readonly status: 'validated' | 'failed' | 'cancelled' | 'skipped'
  /** Lossless compact chunks, including rejected tool calls and interrupted output. */
  readonly stream: readonly AssistantStreamRecord[]
  readonly finish?: FinishReason
  readonly usage?: TokenUsage
  readonly errorCode?: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Log-only academic extraction input and admission decision before model dispatch. */
    'academic/evidence-request': EvidenceModelRequest
    /** Log-only academic extraction settlement, including raw model output when available. */
    'academic/evidence-result': EvidenceModelResult
  }
}
