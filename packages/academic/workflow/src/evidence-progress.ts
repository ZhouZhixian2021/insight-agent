/** Exception-contained dispatch for A-owned paper extraction progress. */
import type { PaperEvidenceProgressObservation, PaperEvidenceProgressObserver } from './model-types.ts'

/**
 * Publish one paper extraction observation without letting UI progress affect research.
 * @param observer Optional workflow-owned progress receiver.
 * @param observation Complete current extraction activity.
 */
export function reportPaperEvidenceProgress(
  observer: PaperEvidenceProgressObserver | undefined,
  observation: PaperEvidenceProgressObservation,
): void {
  if (observer === undefined) return
  try {
    observer(observation)
  } catch {
    // Progress is observational; a broken subscriber cannot change extraction.
  }
}
