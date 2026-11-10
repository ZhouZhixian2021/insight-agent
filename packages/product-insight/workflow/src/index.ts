/** Bounded product investigation from an approved plan through cited report delivery. */
import { setTimeout as delay } from 'node:timers/promises'
import { registerSearchRecognition } from './search-recognition.ts'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import { createEvidenceGapId, createProductBatchResult, createProductFailureId, createProductReportId, createProductRunId,
  isExecutableProductPlan, type AvailableSourceSnapshot, type CandidatePage, type Product,
  type ProductClaim, type ProductEvidence, type ProductEvidenceGap, type ProductFailure, type ProductPlan,
  type ProductReportDelivery, type ProductRun, type ProductQuestionId, type SourceSnapshot,
} from '@deepseek-ai/dsh-product-insight-model'
import { discoverCandidatePages, extractProductPageEvidence, fetchProductPages, hasProductCandidateCapacity,
  isProductGapSearch, productCorroborationDomains,
  rankProductPageFragments,
  resolveProductPageCharacterLimit, sameProductPageFacts, selectProductGapFragment, splitProductPageText,
  splitFailedProductFragment,
  PRODUCT_PAGE_FRAGMENT_CHARACTERS, PRODUCT_PAGE_FRAGMENT_OVERLAP_CHARACTERS,
  type ProductDiscoveryResult, type ProductEvidenceDraft, type ProductPageFetchAdapters, type ProductPageFetchResult,
  type ProductPageFragment,
} from '@deepseek-ai/dsh-product-insight-source'
import type { WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { latestApprovedProductPlan, parseProductPlanMarkdown, productPlanFromApproval } from './approved-plan.ts'
import { claimsFromSemanticReview, type ProductSemanticReview } from './claim-review.ts'
import { assessProductCorroboration, assessProductSource, checkCrossSourceJudgments, comparisonEvidence, keyProductClaims,
  type ProductCrossSourceJudgment, type ProductQuestionVerification } from './claim-verification.ts'
import { evaluateProductReport, MAX_PRODUCT_REPORT_BYTES, productSynthesisInput, renderProductReport, renderProductSynthesis,
  type ProductReportAssessment, type ProductReportInput, type ProductSynthesisInput } from './report.ts'
import { registerProductInvestigationTool } from './session-tool.ts'

// Publish the Session event declarations consumed by the product transcript card.
export type {} from './session-tool.ts'
export type {} from './background-run.ts'

export { latestApprovedProductPlan, parseProductPlanMarkdown, productPlanFromApproval } from './approved-plan.ts'
export type { ApprovedProductPlan, ApprovedProductPlanInput } from './approved-plan.ts'
export { claimsFromSemanticReview } from './claim-review.ts'
export type { ProductSemanticReview } from './claim-review.ts'
export type { ProductCrossSourceJudgment, ProductQuestionVerification } from './claim-verification.ts'
export { evaluateProductReport, prepareProductReport } from './report.ts'
export type { ProductReportAssessment, ProductReportInput } from './report.ts'

const MAXIMUM_PAGE_EXTRACTION_CALLS = 12

/** Cordis plugin name for validation of proposed product plans. */
export const name = 'product-insight-workflow'
/** The plan guard observes tool dispatch before the review is presented. */
export const inject = ['tools']

/** Reject malformed product execution blocks without changing approval state. */
export function apply(ctx: Context): void {
  registerSearchRecognition(ctx)
  registerProductInvestigationTool(ctx, runApprovedProductInvestigation)
  ctx.on('tools/execute', async (exec, next) => {
    if (exec.name === 'web_search' && exec.agent) {
      const agents = ctx.get('agents')
      if (!agents) throw new Error('Product search requires agent attribution')
      return agents.withInitiator(exec.agent, next)
    }
    if (exec.name === 'exit_plan_mode') {
      if (exec.agent && ctx.get('jobs')?.list(exec.agent.session.id).some(job =>
        job.kind === 'product-insight' && (job.status === 'running' || job.status === 'stopping'))) {
        throw new Error('当前产品调查仍在运行，请等待完成或明确取消后再批准新的计划。')
      }
      const args = exec.arguments as { readonly plan?: unknown } | null
      parseProductPlanMarkdown(typeof args?.plan === 'string' ? args.plan : '')
    }
    return next()
  })
}

/** Approved product investigation and optional exact-plan recovery observations. */
export interface ProductInvestigationInput {
  readonly product: Product
  readonly plan: ProductPlan
  readonly maxResultsPerQuery: number
  readonly extractionMethod: ProductEvidence['extractionMethod']
  /** A durable checkpoint for this exact approved plan; absence starts fresh. */
  readonly checkpoint?: ProductInvestigationCheckpoint
  /** A fresh fetch proving that resumed checkpoint pages retain their content and declared scope. */
  readonly sourceRevalidation?: ProductPageFetchResult
}

/** Complete retained work through one committed page, review batch, or question. */
export interface ProductInvestigationCheckpoint {
  /** Version 3 ranks overlapping windows. Versions 1 and 2 resume in source order. */
  readonly schemaVersion: 1 | 2 | 3
  readonly planId: ProductPlan['planId']
  readonly planVersion: number
  readonly productId: Product['productId']
  readonly stage: 'pages' | 'evidence' | 'claims' | 'verification'
  /** Settled pages, evidence items, or questions in the named stage. */
  readonly nextIndex: number
  /** Settled fragments in the current page when evidence nextIndex still points to that page. */
  readonly fragmentIndex?: number
  /** Required for overlapping windows in versions 2 and 3. Version 1 uses contiguous windows. */
  readonly fragmentOverlapCharacters?: number
  /** Version 3 in-page cursors retain the dispatch permutation as source start offsets. */
  readonly fragmentOrder?: readonly number[]
  /** The approved pass over saved fragments has settled. */
  readonly gapReadCompleted?: true
  /** Settled comparisons retained while appended corroboration pages are processed. */
  readonly priorVerifications?: readonly ProductQuestionVerification[]
  /** Active execution time across this plan's completed attempts; downtime is excluded. */
  readonly elapsedMilliseconds: number
  readonly discovery: ProductDiscoveryResult
  readonly pages: ProductPageFetchResult
  readonly evidence: readonly ProductEvidence[]
  readonly reviews: readonly ProductSemanticReview[]
  readonly claims: readonly ProductClaim[]
  readonly verifications: readonly ProductQuestionVerification[]
  readonly failures: readonly ProductFailure[]
}

/** Model routing and any model-visible request logging belong to this adapter's owner. */
export interface ProductInvestigationAdapters {
  readonly web: ProductPageFetchAdapters['web'] & {
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>
  }
  readonly saveText: (page: CandidatePage, text: string, contentHash: string) => Promise<string>
  readonly readText: (contentRef: string) => Promise<string>
  readonly proposeEvidence: (page: CandidatePage, text: string, questions: readonly {
    readonly questionId: ProductQuestionId
    readonly text: string
  }[], signal?: AbortSignal, fragment?: ProductPageFragment,
    maximumDrafts?: number) => Promise<readonly ProductEvidenceDraft[]>
  /** Return 'retry' for a transient model failure or true to allow splitting a failed window. Omission leaves failures unrecovered. */
  readonly recoverEvidenceFailure?: (error: unknown) => boolean | 'retry'
  /** Persist accepted excerpts before any semantic review or report uses their identities. */
  readonly saveEvidence: (evidence: readonly ProductEvidence[]) => Promise<void>
  /** Persist screened pages and settled metadata before extraction consumes them. */
  readonly savePages: (pages: readonly CandidatePage[], snapshots: readonly SourceSnapshot[]) => Promise<void>
  /** Commit a complete recovery point before starting the next model operation. */
  readonly saveCheckpoint: (checkpoint: ProductInvestigationCheckpoint) => Promise<void>
  readonly reviewEvidence: (evidence: readonly ProductEvidence[], questions: ProductPlan['questions'],
    signal?: AbortSignal) => Promise<readonly ProductSemanticReview[]>
  /** Opt in review failures that may be resolved by two smaller evidence batches. */
  readonly recoverReviewFailure?: (error: unknown) => boolean
  readonly saveClaims: (claims: readonly ProductClaim[]) => Promise<void>
  /** Opt in comparison failures that may be resolved by two smaller candidate batches. */
  readonly recoverComparisonFailure?: (error: unknown) => boolean
  /** Compare at most eight candidates; split children retain their original batch index. */
  readonly compareClaim: (claim: ProductClaim, questionId: ProductQuestionId,
    candidates: readonly ProductEvidence[], evidence: readonly ProductEvidence[],
    pages: readonly CandidatePage[], batchIndex: number,
    signal?: AbortSignal) => Promise<readonly ProductCrossSourceJudgment[]>
  /** Persist each question's settled comparison before report delivery consumes it. */
  readonly saveVerification: (verification: ProductQuestionVerification) => Promise<void>
  /** Generate one cited paragraph per approved question when delivery checks pass. */
  readonly synthesizeReport?: (input: ProductSynthesisInput, signal?: AbortSignal) => Promise<ReadonlyMap<string, string>>
  readonly saveReport: (markdown: string) => Promise<string>
  readonly now: () => string
}

/** Settled source, evidence, verification, and report outcomes for one run. */
export interface ProductInvestigationResult {
  readonly run: ProductRun
  readonly discovery: ProductDiscoveryResult
  readonly pages: ProductPageFetchResult
  readonly evidence: readonly ProductEvidence[]
  readonly reviews: readonly ProductSemanticReview[]
  readonly claims: readonly ProductClaim[]
  readonly verifications: readonly ProductQuestionVerification[]
  readonly gaps: readonly ProductEvidenceGap[]
  readonly assessment: ProductReportAssessment
  readonly delivery: ProductReportDelivery
}

/**
 * Session-owned entry point: an unapproved proposal cannot start source work.
 * @param input - Session history, explicit bounds, and optional recovery observations.
 * @param adapters - Web, model, durable storage, and clock operations.
 * @param signal - Optional cancellation for source and model work.
 * @returns Settled investigation and report decision.
 */
export async function runApprovedProductInvestigation(input: {
  readonly sessionId: string
  readonly events: readonly SessionEvent[]
  readonly maxResultsPerQuery: number
  readonly extractionMethod: ProductEvidence['extractionMethod']
  readonly checkpoint?: ProductInvestigationCheckpoint
  readonly sourceRevalidation?: ProductPageFetchResult
}, adapters: ProductInvestigationAdapters, signal?: AbortSignal): Promise<ProductInvestigationResult> {
  const approved = latestApprovedProductPlan(input.events)
  if (approved === undefined) throw new RangeError('Product investigation requires explicit plan approval')
  const { product, plan } = productPlanFromApproval({ sessionId: input.sessionId, ...approved })
  return runProductInvestigation({ product, plan, maxResultsPerQuery: input.maxResultsPerQuery,
    extractionMethod: input.extractionMethod,
    ...input.checkpoint === undefined ? {} : { checkpoint: input.checkpoint },
    ...input.sourceRevalidation === undefined ? {} : { sourceRevalidation: input.sourceRevalidation } }, adapters, signal)
}

/**
 * Execute one approved plan, retaining settled source work and exact evidence across failures.
 * @param input - Approved plan, limits, and optional matching checkpoint.
 * @param adapters - Web, model, durable storage, and clock operations.
 * @param signal - Optional cancellation for source and model work.
 * @returns Settled investigation and report decision.
 */
export async function runProductInvestigation(input: ProductInvestigationInput,
  adapters: ProductInvestigationAdapters, signal?: AbortSignal): Promise<ProductInvestigationResult> {
  if (!isExecutableProductPlan(input.plan)) throw new RangeError('Product investigation requires the approved plan version')
  const maximumPageCharacters = resolveProductPageCharacterLimit(input.plan)
  const maximumGapSearches = input.plan.limits?.maximumGapSearches ?? 0
  const maximumGapReads = input.plan.limits?.maximumGapReads ?? 0
  if (!Number.isSafeInteger(maximumGapReads) || maximumGapReads < 0 || maximumGapReads > input.plan.questions.length) {
    throw new RangeError('Product gap reads exceed the approved questions')
  }
  if (!Number.isSafeInteger(maximumGapSearches) || maximumGapSearches < 0
    || maximumGapSearches > input.plan.questions.length
    || maximumGapSearches > 0 && input.plan.limits?.maximumCandidatePages === undefined) {
    throw new RangeError('Product gap search requires an approved search and candidate-page allowance')
  }
  if (input.checkpoint !== undefined) validateProductCheckpoint(input, input.checkpoint)
  const checkpointVersion = input.checkpoint?.schemaVersion ?? 3
  const fragmentOverlapCharacters = input.checkpoint === undefined
    ? PRODUCT_PAGE_FRAGMENT_OVERLAP_CHARACTERS : input.checkpoint.fragmentOverlapCharacters ?? 0
  if (input.sourceRevalidation !== undefined) {
    if (input.checkpoint === undefined || input.sourceRevalidation.cancelled
      || input.sourceRevalidation.snapshots.failures.length > 0) {
      throw new RangeError('Product source revalidation requires a complete recovery checkpoint')
    }
    const saved = new Map(input.checkpoint.pages.snapshots.items.map(item => [item.candidatePageId, item]))
    const checked = new Map(input.sourceRevalidation.snapshots.items.map(item => [item.candidatePageId, item]))
    if (input.checkpoint.discovery.candidates.items.some(page => page.screening.status === 'selected'
      && !sameProductPageFacts(saved.get(page.candidatePageId), checked.get(page.candidatePageId)))) {
      throw new RangeError('Product recovery source changed before investigation resumed')
    }
  }
  const runId = createProductRunId()
  const startedAt = adapters.now()
  const monotonicStart = performance.now()
  const previousElapsed = input.checkpoint?.elapsedMilliseconds ?? 0
  const elapsedMilliseconds = () => previousElapsed + Math.max(0, performance.now() - monotonicStart)
  const maximumMinutes = input.plan.limits?.maximumElapsedMinutes
  if (maximumMinutes !== undefined && (!Number.isFinite(maximumMinutes) || maximumMinutes <= 0)) {
    throw new RangeError('maximumElapsedMinutes must be positive')
  }
  const remainingMilliseconds = maximumMinutes === undefined ? undefined : maximumMinutes * 60_000 - previousElapsed
  if (remainingMilliseconds !== undefined && remainingMilliseconds <= 0) {
    throw new RangeError('Approved product investigation time is exhausted; review a new plan')
  }
  const deadline = remainingMilliseconds === undefined ? undefined
    : AbortSignal.timeout(Math.min(Math.ceil(remainingMilliseconds), 2_147_483_647))
  const operationSignal = deadline === undefined ? signal : signal === undefined
    ? deadline : AbortSignal.any([signal, deadline])
  let discovery = input.checkpoint?.discovery
    ?? await discoverCandidatePages(input, { web: adapters.web, now: adapters.now }, operationSignal)
  let pages = input.checkpoint?.pages
    ?? await fetchProductPages(discovery.candidates.items, adapters, operationSignal, maximumPageCharacters)
  let sourceRevalidation = input.sourceRevalidation
  let currentCheckpoint = input.checkpoint
  let gapReadCompleted = currentCheckpoint?.gapReadCompleted === true
  const evidence: ProductEvidence[] = [...input.checkpoint?.evidence ?? []]
  const evidenceFingerprints = new Set(evidence.map(productEvidenceFingerprint))
  const failures: ProductFailure[] = [...input.checkpoint?.failures
    ?? [...discovery.candidates.failures, ...pages.snapshots.failures]]
  const reviews: ProductSemanticReview[] = [...input.checkpoint?.reviews ?? []]
  const claims: ProductClaim[] = [...input.checkpoint?.claims ?? []]
  const verifications: ProductQuestionVerification[] = [...input.checkpoint?.verifications ?? []]
  let priorVerifications = input.checkpoint?.priorVerifications
  const checkpoint = async (stage: ProductInvestigationCheckpoint['stage'], nextIndex: number,
    fragment?: { index: number; order: readonly number[] }): Promise<void> => {
    const saved: ProductInvestigationCheckpoint = { schemaVersion: checkpointVersion,
      planId: input.plan.planId, planVersion: input.plan.version,
      productId: input.product.productId, stage, nextIndex,
      ...fragment === undefined ? {} : { fragmentIndex: fragment.index },
      ...fragmentOverlapCharacters === 0 ? {} : { fragmentOverlapCharacters },
      ...fragment === undefined || checkpointVersion !== 3 ? {} : { fragmentOrder: fragment.order },
      ...gapReadCompleted ? { gapReadCompleted: true } : {},
      ...priorVerifications === undefined ? {} : { priorVerifications },
      elapsedMilliseconds: elapsedMilliseconds(), discovery, pages,
      evidence: [...evidence], reviews: [...reviews], claims: [...claims],
      verifications: [...verifications], failures: [...failures] }
    await adapters.saveCheckpoint(saved)
    currentCheckpoint = saved
  }
  const admitDrafts = (page: CandidatePage, snapshot: AvailableSourceSnapshot, text: string,
    drafts: readonly ProductEvidenceDraft[], range: ProductPageFragment, allowance: number, label: string): void => {
    if (drafts.length > allowance) throw new RangeError('Fragment exceeded its evidence draft allowance')
    const located = drafts.map(draft => locateProductDraft(draft, range))
    const extracted = extractProductPageEvidence(page, snapshot, text, located, input.extractionMethod)
    for (const item of extracted.evidence) {
      const fingerprint = productEvidenceFingerprint(item)
      if (evidenceFingerprints.has(fingerprint)) continue
      evidenceFingerprints.add(fingerprint)
      evidence.push(item)
    }
    for (const rejected of extracted.rejected) {
      failures.push({ schemaVersion: 1, failureId: createProductFailureId(), stage: 'extraction',
        category: 'parse_failed', message: `${label}, draft ${rejected.draftIndex}: ${rejected.reason}`,
        retryable: false, occurredAt: adapters.now(), candidatePageId: page.candidatePageId })
    }
  }
  const extractFragment = async ({ page, snapshot, text }: {
    page: CandidatePage
    snapshot: AvailableSourceSnapshot
    text: string
  }, questions: ProductPlan['questions'], fragment: ProductPageFragment,
  maximumDrafts: number, label: string, recoveryBudget: { remaining: number }, allowSplit: boolean): Promise<void> => {
    const propose = async (range: ProductPageFragment, allowance: number, rangeLabel: string): Promise<void> => {
      operationSignal?.throwIfAborted()
      const drafts = await adapters.proposeEvidence(page, range.text, questions, operationSignal, range, allowance)
      operationSignal?.throwIfAborted()
      admitDrafts(page, snapshot, text, drafts, range, allowance, rangeLabel)
    }
    const recordFailure = (error: unknown, rangeLabel: string): void => {
      if (operationSignal?.aborted) return
      failures.push({ schemaVersion: 1, failureId: createProductFailureId(), stage: 'extraction',
        category: 'unknown', message: allowSplit ? `${rangeLabel}: ${error instanceof Error ? error.message : String(error)}`
          : 'Targeted extraction from a saved source did not complete.',
        retryable: true, occurredAt: adapters.now(), candidatePageId: page.candidatePageId })
    }
    try { await propose(fragment, maximumDrafts, label) }
    catch (error) {
      if (operationSignal?.aborted) return
      const recovery = adapters.recoverEvidenceFailure?.(error)
      if (recovery === 'retry' && recoveryBudget.remaining >= 1) {
        recoveryBudget.remaining -= 1
        try {
          await delay(500, undefined, { signal: operationSignal })
          await propose(fragment, maximumDrafts, label)
        } catch (retryError) { recordFailure(retryError, label) }
        return
      }
      const children = allowSplit && maximumDrafts >= 2 && recovery === true && recoveryBudget.remaining >= 2
        ? splitFailedProductFragment(fragment) : null
      if (children === null) { recordFailure(error, label); return }
      recoveryBudget.remaining -= children.length
      for (const [childIndex, child] of children.entries()) {
        if (operationSignal?.aborted) break
        const allowance = childIndex === 0 ? Math.ceil(maximumDrafts / 2) : Math.floor(maximumDrafts / 2)
        const childLabel = `${label}, recovery ${childIndex + 1}`
        try { await propose(child, allowance, childLabel) }
        catch (childError) { recordFailure(childError, childLabel) }
      }
    }
  }
  const searchForGaps = async (gapQuestionIds: readonly ProductQuestionId[],
    corroborationFor?: ReadonlyMap<ProductQuestionId, CandidatePage['candidatePageId']>): Promise<number | undefined> => {
    const selectedBefore = new Set(discovery.candidates.items.filter(page => page.screening.status === 'selected')
      .map(page => page.candidatePageId))
    const previousSnapshots = pages.snapshots.items.length
    const previousDiscoveryFailures = discovery.candidates.failures.length
    const unavailablePages = new Set(pages.snapshots.items.filter(snapshot => snapshot.status === 'failed')
      .map(snapshot => snapshot.candidatePageId))
    discovery = await discoverCandidatePages({ product: input.product, plan: input.plan,
      maxResultsPerQuery: input.maxResultsPerQuery, existing: discovery, gapQuestionIds, unavailablePages,
      ...corroborationFor === undefined ? {} : { corroborationFor } },
    { web: adapters.web, now: adapters.now }, operationSignal)
    failures.push(...discovery.candidates.failures.slice(previousDiscoveryFailures))
    if (operationSignal?.aborted) return undefined
    const additions = discovery.candidates.items.filter(page => page.screening.status === 'selected'
      && !selectedBefore.has(page.candidatePageId))
    if (additions.length === 0) {
      await adapters.savePages(discovery.candidates.items, pages.snapshots.items)
      return undefined
    }
    const fetched = await fetchProductPages(additions, adapters, operationSignal, maximumPageCharacters)
    const append = (existing: ProductPageFetchResult): ProductPageFetchResult => ({ snapshots: createProductBatchResult(
      [...existing.snapshots.items, ...fetched.snapshots.items],
      [...existing.snapshots.failures, ...fetched.snapshots.failures]),
    cancelled: existing.cancelled || fetched.cancelled })
    failures.push(...fetched.snapshots.failures)
    pages = append(pages)
    if (sourceRevalidation !== undefined) sourceRevalidation = append(sourceRevalidation)
    await adapters.savePages(discovery.candidates.items, pages.snapshots.items)
    return fetched.snapshots.items.some(snapshot => snapshot.status === 'available') ? previousSnapshots : undefined
  }
  if (input.checkpoint === undefined) {
    await adapters.savePages(discovery.candidates.items, pages.snapshots.items)
    if (!discovery.cancelled && !pages.cancelled && !operationSignal?.aborted) await checkpoint('pages', 0)
  }
  while (true) {
    const byPage = new Map(discovery.candidates.items.map(page => [page.candidatePageId, page]))
    const extractionStart = currentCheckpoint === undefined || currentCheckpoint.stage === 'pages' ? 0
      : currentCheckpoint.stage === 'evidence' ? currentCheckpoint.nextIndex : pages.snapshots.items.length
    for (let index = extractionStart; index < pages.snapshots.items.length; index++) {
      if (operationSignal?.aborted) break
      const snapshot = pages.snapshots.items[index]
      if (snapshot === undefined) throw new RangeError('Recovery page index exceeds captured snapshots')
      if (snapshot.status === 'available') {
        const page = byPage.get(snapshot.candidatePageId)
        if (page === undefined) throw new RangeError('Saved page has no discovered candidate')
        let text: string
        try {
          text = await adapters.readText(snapshot.contentRef)
          if (text.length > maximumPageCharacters) throw new RangeError('Saved product page exceeds the approved text limit')
          if (text.length === 0) throw new RangeError('Saved product page has no readable text')
        } catch (error) {
          if (operationSignal?.aborted) break
          failures.push({ schemaVersion: 1, failureId: createProductFailureId(), stage: 'extraction',
            category: 'unknown', message: error instanceof Error ? error.message : String(error),
            retryable: true, occurredAt: adapters.now(), candidatePageId: page.candidatePageId })
          await checkpoint('evidence', index + 1)
          continue
        }
        const questions = input.plan.questions.filter(question => page.questionIds.includes(question.questionId))
        const sourceFragments = splitProductPageText(text, fragmentOverlapCharacters)
        const savedPage = currentCheckpoint?.stage === 'evidence' && index === currentCheckpoint.nextIndex
          ? currentCheckpoint : undefined
        const fragmentStart = savedPage?.fragmentIndex ?? 0
        let order = savedPage?.fragmentOrder
        if (order === undefined && checkpointVersion === 3) {
          const covered = new Set(evidence.flatMap(item => item.questionIds))
          const priority = questions.toSorted((left, right) => Number(covered.has(left.questionId)) - Number(covered.has(right.questionId)))
          order = rankProductPageFragments(sourceFragments, priority.map(question => question.text)).map(fragment => fragment.start)
        }
        order ??= sourceFragments.map(fragment => fragment.start)
        if (order.length !== sourceFragments.length || new Set(order).size !== order.length) {
          throw new RangeError('Recovery fragment order does not match captured source text')
        }
        if (fragmentStart >= order.length) throw new RangeError('Recovery fragment index exceeds captured source text')
        const baseDrafts = Math.floor(8 / sourceFragments.length)
        const extraDrafts = 8 % sourceFragments.length
        const fragments = order.map((start) => {
          const sourceIndex = sourceFragments.findIndex(fragment => fragment.start === start)
          const fragment = sourceFragments[sourceIndex]
          if (fragment === undefined) throw new RangeError('Recovery fragment order does not match captured source text')
          return { fragment, maximumDrafts: baseDrafts + Number(sourceIndex < extraDrafts) }
        })
        // Reserve the initial calls and the maximum recovery cost of earlier dispatched windows.
        const spent = fragments.slice(0, fragmentStart).reduce((sum, { maximumDrafts }) => sum + (maximumDrafts >= 2 ? 2 : 1), 0)
        const recoveryBudget = { remaining: MAXIMUM_PAGE_EXTRACTION_CALLS - fragments.length - spent }
        for (let fragmentIndex = fragmentStart; fragmentIndex < fragments.length; fragmentIndex++) {
          if (operationSignal?.aborted) break
          const current = fragments[fragmentIndex]
          if (current === undefined) throw new RangeError('Recovery fragment index exceeds captured source text')
          const { fragment, maximumDrafts } = current
          await extractFragment({ page, snapshot, text }, questions, fragment, maximumDrafts,
            `Fragment ${fragmentIndex + 1}`, recoveryBudget, true)
          if (operationSignal?.aborted) break
          if (fragmentIndex + 1 < fragments.length) await checkpoint('evidence', index, { index: fragmentIndex + 1, order })
          else await checkpoint('evidence', index + 1)
        }
      }
      else await checkpoint('evidence', index + 1)
    }
    await adapters.saveEvidence(evidence)
    const reviewStart = currentCheckpoint?.stage === 'claims' ? currentCheckpoint.nextIndex
      : currentCheckpoint?.stage === 'verification' ? evidence.length : reviews.length
    for (let offset = reviewStart; offset < evidence.length; offset += 8) {
      if (operationSignal?.aborted) break
      const batch = evidence.slice(offset, offset + 8)
      const admitReviews = (items: readonly ProductEvidence[], judged: readonly ProductSemanticReview[]): void => {
        const admitted = claimsFromSemanticReview(input.plan, items, judged)
        reviews.push(...judged)
        claims.push(...admitted)
      }
      try {
        const batchReviews = await adapters.reviewEvidence(batch, input.plan.questions, operationSignal)
        operationSignal?.throwIfAborted()
        admitReviews(batch, batchReviews)
      } catch (error) {
        if (operationSignal?.aborted) break
        if (batch.length >= 2 && adapters.recoverReviewFailure?.(error)) {
          const middle = Math.ceil(batch.length / 2)
          for (const [childIndex, child] of [batch.slice(0, middle), batch.slice(middle)].entries()) {
            if (operationSignal?.aborted) break
            try {
              const judged = await adapters.reviewEvidence(child, input.plan.questions, operationSignal)
              operationSignal?.throwIfAborted()
              admitReviews(child, judged)
            } catch (childError) {
              if (operationSignal?.aborted) break
              failures.push({ schemaVersion: 1, failureId: createProductFailureId(), stage: 'analysis',
                category: 'unknown', message: `Review batch ${offset / 8 + 1}, recovery ${childIndex + 1}: ${childError instanceof Error
                  ? childError.message : String(childError)}`,
                retryable: true, occurredAt: adapters.now() })
            }
          }
        } else {
          failures.push({ schemaVersion: 1, failureId: createProductFailureId(), stage: 'analysis',
            category: 'unknown', message: error instanceof Error ? error.message : String(error),
            retryable: true, occurredAt: adapters.now() })
        }
      }
      if (operationSignal?.aborted) break
      await checkpoint('claims', offset + batch.length)
    }
    await adapters.saveClaims(claims)
    const unanswered = input.plan.questions.filter(question => !claims.some(claim => claim.questionIds.includes(question.questionId)))
    const canFillGaps = (): boolean => !operationSignal?.aborted
      && currentCheckpoint?.stage !== 'verification'
    const gapAttempts = discovery.searches.filter(isProductGapSearch)
    const gapQuestions = unanswered.filter(question => !gapAttempts.some(search => search.questionId === question.questionId))
    const remainingGapSearches = maximumGapSearches - gapAttempts.length
    const canSearchGaps = remainingGapSearches > 0 && gapQuestions.length > 0
      && hasProductCandidateCapacity(discovery.candidates.items, input.plan.limits?.maximumCandidatePages ?? 0)
    if (canFillGaps() && !canSearchGaps && !gapReadCompleted && maximumGapReads > 0 && unanswered.length > 0) {
      const previousEvidenceCount = evidence.length
      const sources: { page: CandidatePage; snapshot: AvailableSourceSnapshot; text: string }[] = []
      for (const snapshot of pages.snapshots.items) {
        if (operationSignal?.aborted) break
        if (snapshot.status !== 'available') continue
        const page = byPage.get(snapshot.candidatePageId)
        if (page?.screening.status !== 'selected' || !assessProductSource(input.product, input.plan, page, snapshot).eligible) continue
        try {
          const text = await adapters.readText(snapshot.contentRef)
          if (text.length === 0 || text.length > maximumPageCharacters) throw new RangeError('Saved page text is out of bounds')
          sources.push({ page, snapshot, text })
        } catch {
          if (operationSignal?.aborted) break
          failures.push({ schemaVersion: 1, failureId: createProductFailureId(), stage: 'extraction',
            category: 'unknown', message: 'Saved source text could not be read for gap extraction.',
            retryable: true, occurredAt: adapters.now(), candidatePageId: page.candidatePageId })
        }
      }
      const readBudget = { remaining: maximumGapReads }
      let linksChanged = false
      for (const question of unanswered) {
        if (operationSignal?.aborted || readBudget.remaining === 0) break
        const target = sources.flatMap((source) => {
          const remaining = 8 - evidence.filter(item => item.candidatePageId === source.page.candidatePageId).length
          if (remaining <= 0) return []
          const match = selectProductGapFragment(source.text, question.text)
          return match === undefined ? [] : [{ ...source, ...match, allowance: Math.min(remaining, 2) }]
        }).toSorted((left, right) => right.score - left.score)[0]
        if (target === undefined) continue
        readBudget.remaining -= 1
        const { page, snapshot, text, fragment, allowance } = target
        const questionPage = { ...page, questionIds: [question.questionId] }
        const before = evidence.length
        await extractFragment({ page: questionPage, snapshot, text }, [question], fragment, allowance, 'Gap fragment',
          readBudget, false)
        if (operationSignal?.aborted) break
        const linked = byPage.get(page.candidatePageId) ?? page
        if (evidence.length > before && !linked.questionIds.includes(question.questionId)) {
          byPage.set(page.candidatePageId, { ...linked, questionIds: [...linked.questionIds, question.questionId] })
          linksChanged = true
        }
      }
      if (linksChanged) {
        const items = [...byPage.values()]
        discovery = { ...discovery, candidates: { ...discovery.candidates, items } }
        await adapters.savePages(items, pages.snapshots.items)
      }
      if (operationSignal?.aborted) break
      gapReadCompleted = readBudget.remaining < maximumGapReads
      if (previousEvidenceCount > 0) await checkpoint('claims', previousEvidenceCount)
      else if (pages.snapshots.items.length > 0) await checkpoint('evidence', pages.snapshots.items.length)
      else await checkpoint('pages', 0)
      if (evidence.length > previousEvidenceCount) continue
    }
    if (canFillGaps() && canSearchGaps) {
      const previousSnapshots = await searchForGaps(gapQuestions.slice(0, remainingGapSearches).map(question => question.questionId))
      if (operationSignal?.aborted) break
      if (previousSnapshots !== undefined) {
        const reviewed = new Set(reviews.map(review => review.evidenceId))
        evidence.sort((left, right) => Number(reviewed.has(right.evidenceId)) - Number(reviewed.has(left.evidenceId)))
        verifications.length = 0
        await checkpoint(previousSnapshots === 0 ? 'pages' : 'evidence', previousSnapshots)
        continue
      }
      if (evidence.length > 0) await checkpoint('claims', evidence.length)
      else if (pages.snapshots.items.length > 0) await checkpoint('evidence', pages.snapshots.items.length)
      else await checkpoint('pages', 0)
      continue
    }
    const selectedClaims = keyProductClaims(input.plan, claims, evidence, discovery.candidates.items)
    const verificationStart = currentCheckpoint?.stage === 'verification' ? currentCheckpoint.nextIndex : 0
    for (let index = verificationStart; index < selectedClaims.length; index++) {
      if (operationSignal?.aborted) break
      const selected = selectedClaims[index]
      if (selected === undefined) throw new RangeError('Recovery question index exceeds selected claims')
      const candidates = comparisonEvidence(selected.questionId, selected.claim, claims, evidence)
      const prior = priorVerifications?.find(item => item.questionId === selected.questionId
        && item.claimId === selected.claim.claimId && item.complete)
      const judgments: ProductCrossSourceJudgment[] = [...prior?.judgments ?? []]
      const settledIds = new Set(judgments.map(item => item.evidenceId))
      const pending = candidates.filter(item => !settledIds.has(item.evidenceId))
      let complete = true
      for (let offset = 0; offset < pending.length; offset += 8) {
        if (operationSignal?.aborted) break
        const batch = pending.slice(offset, offset + 8)
        const batchIndex = offset / 8
        const compare = async (items: readonly ProductEvidence[]): Promise<void> => {
          const compared = await adapters.compareClaim(selected.claim, selected.questionId, items,
            evidence, discovery.candidates.items, batchIndex, operationSignal)
          operationSignal?.throwIfAborted()
          checkCrossSourceJudgments(items, compared)
          judgments.push(...compared)
        }
        try {
          await compare(batch)
        } catch (error) {
          if (operationSignal?.aborted) break
          if (batch.length >= 2 && adapters.recoverComparisonFailure?.(error)) {
            const middle = Math.ceil(batch.length / 2)
            for (const [childIndex, child] of [batch.slice(0, middle), batch.slice(middle)].entries()) {
              if (operationSignal?.aborted) break
              try { await compare(child) }
              catch (childError) {
                if (operationSignal?.aborted) break
                complete = false
                failures.push({ schemaVersion: 1, failureId: createProductFailureId(), stage: 'analysis',
                  category: 'unknown', message: `Comparison batch ${batchIndex + 1}, recovery ${childIndex + 1}: ${childError instanceof Error
                    ? childError.message : String(childError)}`,
                  retryable: true, occurredAt: adapters.now() })
              }
            }
          } else {
            complete = false
            failures.push({ schemaVersion: 1, failureId: createProductFailureId(), stage: 'analysis',
              category: 'unknown', message: `Comparison batch ${batchIndex + 1}: ${error instanceof Error
                ? error.message : String(error)}`,
              retryable: true, occurredAt: adapters.now() })
          }
        }
      }
      if (operationSignal?.aborted) break
      const verification: ProductQuestionVerification = { questionId: selected.questionId,
        claimId: selected.claim.claimId, complete, judgments }
      verifications.push(verification)
      if (index + 1 === selectedClaims.length) priorVerifications = undefined
      await checkpoint('verification', index + 1)
      await adapters.saveVerification(verification)
    }
    const remainingCorroborationSearches = maximumGapSearches - gapAttempts.length
    if (!operationSignal?.aborted && remainingCorroborationSearches > 0
      && !gapAttempts.some(search => search.reason === 'corroboration_gap')
      && hasProductCandidateCapacity(discovery.candidates.items, input.plan.limits?.maximumCandidatePages ?? 0)) {
      const context = { product: input.product, plan: input.plan, pages: byPage,
        evidence: new Map(evidence.map(item => [item.evidenceId, item])),
        snapshots: new Map(pages.snapshots.items.map(snapshot => [snapshot.candidatePageId, snapshot])) }
      const targets = new Map<ProductQuestionId, CandidatePage['candidatePageId']>()
      for (const [index, selected] of selectedClaims.entries()) {
        if (targets.size >= remainingCorroborationSearches) break
        if (gapAttempts.some(search => search.questionId === selected.questionId)) continue
        const verification = verifications[index]
        if (!verification?.complete) continue
        try { checkCrossSourceJudgments(comparisonEvidence(selected.questionId, selected.claim, claims, evidence), verification.judgments) }
        catch { continue }
        const result = assessProductCorroboration(context, selected.claim, verification.judgments)
        if (!result.corroborated && result.primaryPage !== undefined
          && productCorroborationDomains(input.product, input.plan, result.primaryPage).length > 0) {
          targets.set(selected.questionId, result.primaryPage.candidatePageId)
        }
      }
      if (targets.size > 0) {
        const previousSnapshots = await searchForGaps([...targets.keys()], targets)
        if (operationSignal?.aborted) break
        if (previousSnapshots !== undefined) {
          priorVerifications = [...verifications]
          verifications.length = 0
          await checkpoint('evidence', previousSnapshots)
          continue
        }
        await checkpoint('verification', selectedClaims.length)
      }
    }
    break
  }
  const gaps: ProductEvidenceGap[] = input.plan.questions.filter(question =>
    !claims.some(item => item.questionIds.includes(question.questionId))).map(question => ({
    schemaVersion: 1, gapId: createEvidenceGapId(), planId: input.plan.planId,
    questionId: question.questionId, missingContent: question.text,
    reason: 'No semantically reviewed source statement answers this question.', status: 'open',
  }))
  const reportInput: ProductReportInput = { product: input.product, plan: input.plan, discovery, pages,
    ...sourceRevalidation === undefined ? {} : { sourceRevalidation },
    evidence, reviews, claims, verifications, gaps, failures, cancelled: operationSignal?.aborted ?? false }
  const initialAssessment = evaluateProductReport(reportInput)
  let synthesizedMarkdown: string | undefined
  if (adapters.synthesizeReport !== undefined && initialAssessment.status === 'ready') {
    try {
      const material = productSynthesisInput(reportInput)
      const paragraphs = await adapters.synthesizeReport(material, operationSignal)
      operationSignal?.throwIfAborted()
      const synthesis = renderProductSynthesis(reportInput, material, paragraphs)
      const markdown = renderProductReport(reportInput, initialAssessment, synthesis)
      if (Buffer.byteLength(markdown, 'utf8') > MAX_PRODUCT_REPORT_BYTES) {
        throw new RangeError('Synthesized product report exceeds the size limit')
      }
      synthesizedMarkdown = markdown
    } catch {
      if (!operationSignal?.aborted) {
        failures.push({ schemaVersion: 1, failureId: createProductFailureId(), stage: 'report',
          category: 'unknown', message: 'Product report synthesis did not produce a usable answer.',
          retryable: false, occurredAt: adapters.now() })
      }
    }
  }
  if (operationSignal?.aborted && currentCheckpoint !== undefined) {
    await adapters.saveCheckpoint({ ...currentCheckpoint, elapsedMilliseconds: elapsedMilliseconds() })
  }
  if (deadline?.aborted && !signal?.aborted) {
    failures.push({ schemaVersion: 1, failureId: createProductFailureId(), stage: 'analysis',
      category: 'timeout', message: 'Product investigation reached its elapsed-time limit.',
      retryable: false, occurredAt: adapters.now() })
  }
  const completedAt = adapters.now()
  const assessment = evaluateProductReport({ ...reportInput, cancelled: operationSignal?.aborted ?? false })
  let delivery: ProductReportDelivery
  if (assessment.status === 'blocked') {
    delivery = { status: 'blocked', reasons: assessment.reasons, report: null }
  } else {
    try {
      const markdown = assessment.status === 'ready' && synthesizedMarkdown !== undefined
        ? synthesizedMarkdown : renderProductReport(reportInput, assessment)
      const contentRef = await adapters.saveReport(markdown)
      if (contentRef.trim().length === 0) throw new RangeError('Saved report reference is empty')
      delivery = { status: assessment.status === 'ready' ? 'final' : 'draft', reasons: assessment.reasons,
        report: { schemaVersion: 1, reportId: createProductReportId(), planId: input.plan.planId,
          planVersion: input.plan.version, generatedAt: completedAt, assessedAt: completedAt,
          claimIds: keyProductClaims(input.plan, claims, evidence, discovery.candidates.items)
            .map(item => item.claim.claimId), evidenceIds: evidence.map(item => item.evidenceId),
          limitations: [...(assessment.status === 'draft' ? assessment.reasons : []),
            'Cross-site judgments do not prove publisher independence or product behavior.'], contentRef } }
    } catch (error) {
      failures.push({ schemaVersion: 1, failureId: createProductFailureId(), stage: 'report',
        category: 'unknown', message: error instanceof Error ? error.message : String(error),
        retryable: true, occurredAt: adapters.now() })
      delivery = { status: 'blocked', reasons: ['The evidence draft could not be saved.'], report: null }
    }
  }
  const cancelled = signal?.aborted ?? false
  const run: ProductRun = cancelled
    ? { schemaVersion: 1, runId, planId: input.plan.planId, planVersion: input.plan.version,
      startedAt, completedAt, state: 'cancelled', outcome: evidence.length ? 'partial_success' : 'failed',
      failures, reportId: delivery.report?.reportId ?? null }
    : evidence.length === 0
      ? { schemaVersion: 1, runId, planId: input.plan.planId, planVersion: input.plan.version,
        startedAt, completedAt, state: 'failed', outcome: 'failed', failures,
        reportId: null }
      : { schemaVersion: 1, runId, planId: input.plan.planId, planVersion: input.plan.version,
        startedAt, completedAt, state: 'completed', outcome: failures.length || gaps.length ? 'partial_success' : 'success',
        failures, reportId: delivery.report?.reportId ?? null }
  return { run, discovery, pages, evidence, reviews, claims, verifications, gaps, assessment, delivery }
}

/** Pin each proposed excerpt to its supplied fragment before full-page source verification. */
function locateProductDraft(draft: ProductEvidenceDraft, fragment: ProductPageFragment): ProductEvidenceDraft {
  const hinted = draft.startHint
  const validHint = hinted !== undefined && Number.isSafeInteger(hinted) && hinted >= 0
    && fragment.text.slice(hinted, hinted + draft.verbatimExcerpt.length) === draft.verbatimExcerpt
  const local = validHint && hinted !== undefined ? hinted : fragment.text.indexOf(draft.verbatimExcerpt)
  const unique = validHint || local >= 0 && fragment.text.indexOf(draft.verbatimExcerpt, local + 1) < 0
  return { ...draft, startHint: Number.isSafeInteger(local) && local >= 0 && unique
    && fragment.text.slice(local, local + draft.verbatimExcerpt.length) === draft.verbatimExcerpt
    ? fragment.start + local : -1 }
}

/** Suppress identical source statements proposed by adjacent overlapping windows, including after recovery. */
function productEvidenceFingerprint(item: ProductEvidence): string {
  return JSON.stringify([item.candidatePageId, item.locator, item.sourcedStatement,
    [...item.questionIds].sort()])
}

/**
 * Refuse a checkpoint whose identities, cursor, or retained source links changed.
 * @param input - Approved product, plan, and execution context.
 * @param checkpoint - Durable work proposed for reuse.
 */
export function validateProductCheckpoint(input: ProductInvestigationInput,
  checkpoint: ProductInvestigationCheckpoint): void {
  const version: unknown = checkpoint.schemaVersion
  const gapReadCompleted: unknown = checkpoint.gapReadCompleted
  if ((version !== 1 && version !== 2 && version !== 3) || checkpoint.planId !== input.plan.planId
    || checkpoint.planVersion !== input.plan.version || checkpoint.productId !== input.product.productId
    || gapReadCompleted !== undefined && (gapReadCompleted !== true || (input.plan.limits?.maximumGapReads ?? 0) <= 0)
    || !Number.isSafeInteger(checkpoint.nextIndex) || checkpoint.nextIndex < 0
    || !Number.isFinite(checkpoint.elapsedMilliseconds) || checkpoint.elapsedMilliseconds < 0
    || checkpoint.discovery.cancelled || checkpoint.pages.cancelled) {
    throw new RangeError('Product recovery checkpoint does not match the approved plan')
  }
  const pages = checkpoint.discovery.candidates.items
  const snapshots = checkpoint.pages.snapshots.items
  const pageIds = new Set(pages.map(page => page.candidatePageId))
  const snapshotsByPage = new Map(snapshots.map(snapshot => [snapshot.candidatePageId, snapshot]))
  if (pageIds.size !== pages.length || snapshotsByPage.size !== snapshots.length
    || pages.some(page => page.planId !== input.plan.planId || page.productId !== input.product.productId)
    || snapshots.some(snapshot => !pageIds.has(snapshot.candidatePageId))) {
    throw new RangeError('Product recovery checkpoint has inconsistent page identities')
  }
  const evidenceIds = new Set(checkpoint.evidence.map(item => item.evidenceId))
  if (evidenceIds.size !== checkpoint.evidence.length || checkpoint.evidence.some((item) => {
    const snapshot = snapshotsByPage.get(item.candidatePageId)
    return snapshot?.status !== 'available' || snapshot.sourceSnapshotId !== item.sourceSnapshotId
      || snapshot.contentHash !== item.contentHash
  }) || new Set(checkpoint.reviews.map(item => item.evidenceId)).size !== checkpoint.reviews.length
    || checkpoint.reviews.some(item => !evidenceIds.has(item.evidenceId))
    || new Set(checkpoint.claims.map(item => item.claimId)).size !== checkpoint.claims.length
    || checkpoint.claims.some(claim => claim.evidenceLinks.some(link => !evidenceIds.has(link.evidenceId)))) {
    throw new RangeError('Product recovery checkpoint has inconsistent evidence identities')
  }
  const selected = keyProductClaims(input.plan, checkpoint.claims, checkpoint.evidence, pages)
  const prior = checkpoint.priorVerifications
  if (prior !== undefined && (prior.length === 0
    || new Set(prior.map(item => item.questionId)).size !== prior.length
    || prior.some(item => !item.complete || !validPriorComparison(checkpoint, item)))) {
    throw new RangeError('Product recovery checkpoint has invalid retained comparisons')
  }
  const fragmentIndex = checkpoint.fragmentIndex
  const order = checkpoint.fragmentOrder
  const overlap = checkpoint.fragmentOverlapCharacters ?? 0
  const characterLimit = resolveProductPageCharacterLimit(input.plan)
  const maximumFragments = 1 + Math.ceil(Math.max(0, characterLimit - PRODUCT_PAGE_FRAGMENT_CHARACTERS)
    / (PRODUCT_PAGE_FRAGMENT_CHARACTERS - overlap - 1))
  const overlapValid = version === 1 ? checkpoint.fragmentOverlapCharacters === undefined
    : checkpoint.fragmentOverlapCharacters === PRODUCT_PAGE_FRAGMENT_OVERLAP_CHARACTERS
  const orderValid = version === 3 && fragmentIndex !== undefined
    ? Array.isArray(order) && order.length > fragmentIndex && order.length <= maximumFragments
      && order.includes(0) && new Set(order).size === order.length
      && order.every((start: unknown) => typeof start === 'number' && Number.isSafeInteger(start) && start >= 0 && start < characterLimit)
    : order === undefined
  const fragmentCursorValid = fragmentIndex === undefined || checkpoint.stage === 'evidence'
    && Number.isSafeInteger(fragmentIndex) && fragmentIndex > 0
    && fragmentIndex <= maximumFragments
    && checkpoint.nextIndex < snapshots.length && snapshots[checkpoint.nextIndex]?.status === 'available'
  const stageValid = checkpoint.stage === 'pages'
    ? checkpoint.nextIndex === 0 && checkpoint.evidence.length === 0
      && checkpoint.reviews.length === 0 && checkpoint.claims.length === 0
      && checkpoint.verifications.length === 0
    : checkpoint.stage === 'evidence'
      ? (fragmentIndex === undefined ? checkpoint.nextIndex > 0 && checkpoint.nextIndex <= snapshots.length
        : checkpoint.nextIndex < snapshots.length)
        && checkpoint.evidence.slice(0, checkpoint.reviews.length)
          .every(item => checkpoint.reviews.some(review => review.evidenceId === item.evidenceId))
        && checkpoint.verifications.length === 0
      : checkpoint.stage === 'claims'
        ? checkpoint.nextIndex > 0 && checkpoint.nextIndex <= checkpoint.evidence.length
          && checkpoint.reviews.length <= checkpoint.nextIndex && checkpoint.verifications.length === 0
        : checkpoint.nextIndex > 0 && checkpoint.nextIndex <= selected.length
          && checkpoint.verifications.length === checkpoint.nextIndex
          && checkpoint.verifications.every((item, index) => {
            const chosen = selected[index]
            return chosen !== undefined && item.questionId === chosen.questionId
              && item.claimId === chosen.claim.claimId
          })
  if (!overlapValid || !orderValid || !fragmentCursorValid || !stageValid) {
    throw new RangeError('Product recovery checkpoint has an invalid stage cursor')
  }
}

function validPriorComparison(checkpoint: ProductInvestigationCheckpoint, prior: ProductQuestionVerification): boolean {
  const claim = checkpoint.claims.find(item => item.claimId === prior.claimId)
  if (claim === undefined || !claim.questionIds.includes(prior.questionId)) return false
  const ids = new Set(prior.judgments.map(item => item.evidenceId))
  const covered = comparisonEvidence(prior.questionId, claim, checkpoint.claims, checkpoint.evidence)
    .filter(item => ids.has(item.evidenceId))
  try { checkCrossSourceJudgments(covered, prior.judgments); return true }
  catch { return false }
}
