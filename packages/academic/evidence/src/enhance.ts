/** Complete paper extraction that supplements committed evidence without replacing its provenance. */
import { isDeepStrictEqual } from 'node:util'
import type { EvidenceCardItem, EvidenceId } from '@deepseek-ai/dsh-academic-model'
import { runEvidenceFragments } from './fragments.ts'
import { EvidenceError } from './types.ts'
import type { EvidenceExtractionInput, EvidenceExtractionResult } from './types.ts'
import type { EvidenceFragmentOptions, EvidenceFragmentResult } from './fragment-types.ts'

/**
 * Supplement verified evidence with six-section extraction of the same paper content.
 * @param input Verified source segments with the original paper, version and content hash; extraction uses complete depth.
 * @param initial Previously verified and committed evidence; all original records, locators and card items remain unchanged.
 * @param options Complete-extraction controls and a sink for additions, whose card items may reference initial evidence IDs.
 * @param signal Cancellation forwarded to extraction and persistence dispatch.
 * @returns Original evidence plus committed additions, failures and unprocessed ranges; empty sections do not establish full review.
 * @throws Mismatched source identity, cancellation, unclassified errors or sink failures; the caller retains previous commits.
 */
export async function enhanceEvidenceInFragments(input: Omit<EvidenceExtractionInput, 'depth'>,
  initial: EvidenceExtractionResult, options: EvidenceFragmentOptions, signal?: AbortSignal): Promise<EvidenceFragmentResult> {
  signal?.throwIfAborted()
  validateInitial(input, initial)
  let evidence = initial
  const result = await runEvidenceFragments({ ...input, depth: 'complete' }, { ...options,
    onVerified: async (attempt, addition) => {
      await options.onVerified(attempt, addition)
      evidence = { sourceLocators: [...evidence.sourceLocators, ...addition.sourceLocators],
        evidenceRecords: [...evidence.evidenceRecords, ...addition.evidenceRecords],
        questionLinks: [...evidence.questionLinks, ...addition.questionLinks],
        rejectedDrafts: [...evidence.rejectedDrafts, ...addition.rejectedDrafts],
        evidenceCard: { ...evidence.evidenceCard,
          researchQuestions: [...evidence.evidenceCard.researchQuestions, ...addition.evidenceCard.researchQuestions],
          methods: [...evidence.evidenceCard.methods, ...addition.evidenceCard.methods],
          datasets: [...evidence.evidenceCard.datasets, ...addition.evidenceCard.datasets],
          metrics: [...evidence.evidenceCard.metrics, ...addition.evidenceCard.metrics],
          findings: [...evidence.evidenceCard.findings, ...addition.evidenceCard.findings],
          limitations: [...evidence.evidenceCard.limitations, ...addition.evidenceCard.limitations],
        } }
    },
  }, signal, verified => additions(evidence, verified))
  return { ...result, evidence }
}

function validateInitial(input: Omit<EvidenceExtractionInput, 'depth'>, initial: EvidenceExtractionResult): void {
  const card = initial.evidenceCard
  const locators = new Map(initial.sourceLocators.map(locator => [locator.sourceLocatorId, locator]))
  const ids = new Set(initial.evidenceRecords.map(record => record.evidenceId))
  if (ids.size === 0 || card.academicWorkId !== input.academicWorkId || card.workVersionId !== input.workVersionId
    || initial.sourceLocators.some(locator => locator.workVersionId !== input.workVersionId || locator.contentHash !== input.contentHash)
    || initial.evidenceRecords.some(record => record.academicWorkId !== input.academicWorkId
      || record.workVersionId !== input.workVersionId || record.contentHash.status !== 'available'
      || record.contentHash.value !== input.contentHash || !locators.has(record.sourceLocatorId))
    || initial.questionLinks.some(link => !ids.has(link.evidenceId))
    || [...card.researchQuestions, ...card.methods, ...card.datasets, ...card.metrics, ...card.findings, ...card.limitations]
      .some(item => item.evidenceIds.some(id => !ids.has(id)))) {
    throw new EvidenceError('Enhancement requires verified evidence from the same paper, version and content hash with retained references.',
      'EVIDENCE_INVALID_ENHANCEMENT')
  }
}

function additions(existing: EvidenceExtractionResult, verified: EvidenceExtractionResult): EvidenceExtractionResult {
  const known = [...existing.evidenceRecords]
  const locations = new Map([...existing.sourceLocators, ...verified.sourceLocators].map(({ sourceLocatorId, ...location }) =>
    [sourceLocatorId, location]))
  const retained = new Set<EvidenceId>()
  const replacements = new Map<EvidenceId, EvidenceId>()
  for (const record of verified.evidenceRecords) {
    const previous = known.find(candidate => candidate.sourcedStatement === record.sourcedStatement
      && isDeepStrictEqual(candidate.verbatimExcerpt, record.verbatimExcerpt)
      && isDeepStrictEqual(locations.get(candidate.sourceLocatorId), locations.get(record.sourceLocatorId)))
    const id = previous?.evidenceId ?? record.evidenceId
    replacements.set(record.evidenceId, id)
    if (previous === undefined) {
      known.push(record)
      retained.add(id)
    }
  }
  const records = verified.evidenceRecords.filter(record => retained.has(record.evidenceId))
  const questions = new Set(existing.questionLinks.map(link => JSON.stringify([link.evidenceId, link.question])))
  const questionLinks = verified.questionLinks.map(link => ({ ...link,
    evidenceId: replacements.get(link.evidenceId) as EvidenceId })).filter((link) => {
    const key = JSON.stringify([link.evidenceId, link.question])
    if (questions.has(key)) return false
    questions.add(key)
    return true
  })
  const items = <T extends EvidenceCardItem>(prior: readonly T[], proposed: readonly T[]): T[] => {
    const seen = [...prior]
    // Source verification creates each proposed item from one excerpt.
    return proposed.map(item => ({ ...item,
      evidenceIds: [replacements.get(item.evidenceIds[0]) as EvidenceId] as const,
    })).filter((item) => {
      const { evidenceCardItemId: _, ...fields } = item
      if (seen.some(({ evidenceCardItemId: _, ...known }) => isDeepStrictEqual(known, fields))) return false
      seen.push(item)
      return true
    })
  }
  return { ...verified, evidenceRecords: records, questionLinks,
    sourceLocators: verified.sourceLocators.filter(locator => records.some(record => record.sourceLocatorId === locator.sourceLocatorId)),
    evidenceCard: { ...verified.evidenceCard,
      evidenceCardId: existing.evidenceCard.evidenceCardId,
      researchQuestions: items(existing.evidenceCard.researchQuestions, verified.evidenceCard.researchQuestions),
      methods: items(existing.evidenceCard.methods, verified.evidenceCard.methods),
      datasets: items(existing.evidenceCard.datasets, verified.evidenceCard.datasets),
      metrics: items(existing.evidenceCard.metrics, verified.evidenceCard.metrics),
      findings: items(existing.evidenceCard.findings, verified.evidenceCard.findings),
      limitations: items(existing.evidenceCard.limitations, verified.evidenceCard.limitations),
    } }
}
