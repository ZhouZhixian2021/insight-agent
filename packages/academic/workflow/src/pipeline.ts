/** Sequential draft orchestration; module dependencies point toward producer libraries. */
import { isExecutableResearchBrief } from '@deepseek-ai/dsh-academic-model'
import { createIngestIndex, ingestWorks } from '@deepseek-ai/dsh-academic-ingestion'
import { fetchAcademicFullText } from '@deepseek-ai/dsh-academic-evidence'
import { analyzeEvidence } from '@deepseek-ai/dsh-academic-analysis'
import { generateReport } from '@deepseek-ai/dsh-academic-report'
import { extractPaperEvidence } from './paper.ts'
import { WorkflowLogError } from './model-errors.ts'
import type { PaperEvidenceResult } from './types.ts'
import type { DraftPipelineAdapters, DraftPipelineInput, DraftPipelineResult, PaperProcessingFailure } from './pipeline-types.ts'

/**
 * Search, reconcile, acquire and extract papers before analyzing and evaluating a draft.
 * Scope selection is explicit; this pass neither plans queries nor grants semantic approval.
 * @param input Approved brief, one search request and explicit synthetic-data disclosure.
 * @param adapters Existing source/web/model adapters, scope selector and clock.
 * @param signal Caller-owned cancellation and elapsed-time budget.
 * @returns Draft and paper outcomes; cancellation retains completed outcomes without a report.
 * @throws Rejects unapproved input, invalid selection, search failure, logging failure or downstream programming errors.
 */
export async function runResearchDraft(
  input: DraftPipelineInput,
  adapters: DraftPipelineAdapters,
  signal?: AbortSignal,
): Promise<DraftPipelineResult> {
  const { brief } = input
  if (!isExecutableResearchBrief(brief)) throw new Error('Current research brief requires approval.')
  const limits = brief.stopConditions
  if (limits.maximumSearchRounds < 1 || limits.maximumCandidateWorks < 1 || limits.maximumIncludedWorks < 1) {
    throw new Error('Research limits do not permit this pass.')
  }
  const papers: PaperEvidenceResult[] = []
  const failures: PaperProcessingFailure[] = []
  const cancelled = (): DraftPipelineResult => ({ status: 'cancelled', papers, failures, analysis: null, report: null })
  if (signal?.aborted) return cancelled()
  const maxResults = Math.min(input.search.maxResults ?? limits.maximumCandidateWorks, limits.maximumCandidateWorks)
  if (!Number.isSafeInteger(maxResults) || maxResults < 1) throw new Error('Search limit must be a positive integer.')
  let search
  try {
    search = await adapters.search({ ...input.search, maxResults }, signal)
  } catch (error: unknown) {
    if (signal?.aborted) return cancelled()
    throw error
  }
  if (signal?.aborted) return cancelled()
  const ingested = ingestWorks(createIngestIndex(), search.works.slice(0, maxResults))
  const selected = adapters.selectPapers(ingested, brief)
  if (selected.length > limits.maximumIncludedWorks) throw new Error('Selection exceeds the approved work limit.')
  const versions = new Map(ingested.versions.map(version => [version.workVersionId, version]))
  const selectedWorks = new Set<string>()
  // Validate the whole selection before spending network or model work on any paper.
  const validated = selected.map((paper) => {
    const version = versions.get(paper.workVersionId)
    if (!version) throw new Error('Selection references a version outside this search pass.')
    if (selectedWorks.has(version.academicWorkId)) throw new Error('Select only one version per work.')
    if (version.status === 'retracted' || version.versionType === 'retracted'
      || (!brief.evidenceRequirements.allowPreprints && version.versionType === 'preprint')) {
      throw new Error('Selected version is excluded by the research brief or retraction state.')
    }
    selectedWorks.add(version.academicWorkId)
    return { paper, version }
  })
  for (const { paper, version } of validated) {
    if (signal?.aborted) return cancelled()
    let stage: PaperProcessingFailure['stage'] = 'fulltext'
    try {
      const parsed = await fetchAcademicFullText({ ...paper, academicWorkId: version.academicWorkId,
        retrievedAt: adapters.now(), focusQuestions: brief.questions }, adapters.fetcher, signal)
      if (signal?.aborted) return cancelled()
      stage = 'extraction'
      const result = await extractPaperEvidence(version, parsed, paper.hasHistoricalEvidence, adapters.generator, signal)
      papers.push(result)
    } catch (error: unknown) {
      if (error instanceof WorkflowLogError) throw error
      // Paper-local acquisition/extraction failures preserve other papers; cancellation is run-wide.
      if (signal?.aborted) return cancelled()
      failures.push({ workVersionId: paper.workVersionId, stage })
    }
  }
  if (signal?.aborted) return cancelled()
  const extracted = papers.filter(result => result.status === 'extracted')
  const successfulWorks = new Set(extracted.map(result => result.version.academicWorkId))
  const source = { academicWorks: ingested.works.filter(work => successfulWorks.has(work.academicWorkId)),
    workVersions: extracted.map(result => result.version),
    evidenceRecords: extracted.flatMap(result => result.evidence.evidenceRecords),
    evidenceCards: extracted.map(result => result.evidence.evidenceCard),
    sourceLocators: extracted.flatMap(result => result.evidence.sourceLocators) }
  const assessedAt = adapters.now()
  const analysis = analyzeEvidence(source, brief, assessedAt)
  const limitations = [...analysis.limitations, 'Single search pass; no automatic scope planning, retries or abstract fallback.',
    ...papers.filter(result => result.status === 'paused').map(result => `Paused version ${result.pause.workVersionId}: ${result.pause.reason}.`),
    ...failures.map(failure => `Version ${failure.workVersionId} failed during ${failure.stage}.`)]
  if (search.truncated || search.works.length > maxResults) limitations.push('Search results were truncated; coverage is incomplete.')
  const report = generateReport({ brief, claims: analysis.claims, links: analysis.links,
    evidence: source.evidenceRecords, versions: source.workVersions, sourceLocators: source.sourceLocators,
    works: source.academicWorks, reviews: [], assessedAt, limitations, mode: 'draft', synthetic: input.synthetic })
  return { status: 'completed', papers, failures, analysis, report }
}
