/** Session-backed evidence extraction through the shared durable model transport. */
import type { Context } from '@deepseek-ai/cordis'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import { parsePaperModelResponse } from './parse-evidence.ts'
import { evidenceMessages } from './model-prompt.ts'
import { createLoggedModelRunner } from './model-call.ts'
import type { EvidenceModelPolicy, EvidenceModelSource, PaperEvidenceGenerator, PaperModelResponse } from './model-types.ts'

/**
 * Bind extraction to a live Session with exact provenance and durable model records.
 * @param ctx DSH model, token-meter and persistence services.
 * @param session Live Session with an active durable writer.
 * @param config Explicit model route and generation controls.
 * @param policy Bounded recovery; only output-limit exhaustion is retried.
 * @returns A source-aware generator for one paper.
 */
export function createModelEvidenceGenerator(
  ctx: Context, session: Session, config: LlmCallConfig, policy: EvidenceModelPolicy,
): PaperEvidenceGenerator {
  const run = createLoggedModelRunner<PaperModelResponse>(ctx, session, config, policy)
  return (request, parsed, scope) => {
    const source: EvidenceModelSource = {
      academicWorkId: parsed.academicWorkId, workVersionId: parsed.workVersionId, contentHash: parsed.contentHash,
      sourceProvider: parsed.sourceProvider, sourceUrl: parsed.sourceUrl, retrievedAt: parsed.retrievedAt,
      extractionMethod: structuredClone(parsed.extractionMethod),
    }
    return run({ messages: evidenceMessages(request, scope), ...request.signal === undefined ? {} : { signal: request.signal },
      parse: parsePaperModelResponse,
      appendRequest: data => session.append('academic/evidence-request', { source, ...data }),
      appendResult: data => session.append('academic/evidence-result', { source, ...data }),
    })
  }
}
