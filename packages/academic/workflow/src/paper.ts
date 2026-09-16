/** Paper-level handoff using existing academic parsing and extraction interfaces. */
import type { WorkVersion } from '@deepseek-ai/dsh-academic-model'
import { EvidenceError, extractEvidenceFromContent, type EvidenceExtractionInput } from '@deepseek-ai/dsh-academic-evidence'
import type { PaperEvidenceGenerator } from './model-types.ts'
import type { PaperEvidenceResult, PaperPause } from './types.ts'
export type { PaperEvidenceResult, PaperPause } from './types.ts'

/**
 * Fill a first observed content hash before extracting evidence for the same version.
 * Paused papers never invoke the generator. Inputs and historical records are not mutated.
 * @param version Current version after work identity reconciliation.
 * @param parsed Successful parser output for this paper and version.
 * @param hasHistoricalEvidence Whether this version already has bound historical content or evidence.
 * @param generator Semantic extractor receiving B's request and program-owned parsed provenance.
 * @param signal Optional cancellation forwarded to extraction; cancellation rejects.
 * @returns Extracted evidence and its consistent version, or a located paper pause for caller retention.
 * @throws Propagates cancellation, logging and extraction errors; input-budget excess returns a pause.
 */
export async function extractPaperEvidence(
  version: WorkVersion,
  parsed: EvidenceExtractionInput,
  hasHistoricalEvidence: boolean,
  generator: PaperEvidenceGenerator,
  signal?: AbortSignal,
): Promise<PaperEvidenceResult> {
  signal?.throwIfAborted()
  const pause = (reason: PaperPause['reason']): PaperEvidenceResult => ({
    status: 'paused',
    pause: { academicWorkId: version.academicWorkId, workVersionId: version.workVersionId,
      oldHash: version.contentHash, newHash: parsed.contentHash,
      sourceUrl: parsed.sourceUrl, retrievedAt: parsed.retrievedAt, reason },
  })
  if (version.academicWorkId !== parsed.academicWorkId || version.workVersionId !== parsed.workVersionId) {
    return pause('identity_mismatch')
  }
  if (parsed.contentHash.trim().length === 0) return pause('empty_hash')
  let current = version
  if (version.contentHash.status === 'available') {
    if (version.contentHash.value !== parsed.contentHash) return pause('hash_conflict')
  } else {
    if (hasHistoricalEvidence) return pause('history_requires_review')
    if (version.contentHash.status !== 'not_extracted') return pause('hash_unavailable')
    current = { ...version, contentHash: { status: 'available', value: parsed.contentHash } }
  }
  try {
    const evidence = await extractEvidenceFromContent(parsed, request => generator(request, parsed), signal)
    return { status: 'extracted', version: current, evidence }
  } catch (error: unknown) {
    if (error instanceof EvidenceError && error.code === 'EVIDENCE_INPUT_TOO_LARGE') return pause('input_too_large')
    throw error
  }
}
