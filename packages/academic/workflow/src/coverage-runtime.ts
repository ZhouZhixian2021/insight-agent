/** Run-owned reservations and cached judgments for bounded coverage repair. */
import { EvidenceError } from '@deepseek-ai/dsh-academic-evidence'
import { isDeepStrictEqual } from 'node:util'
import type { ResearchQuestionCoverageResult, WorkVersionId } from '@deepseek-ai/dsh-academic-model'
import { WorkflowLogError } from './model-errors.ts'
import { coverageFingerprint, parseCoverageReview, reviewedCoverage } from './coverage.ts'
import { coverageEvidenceDigest } from './coverage-targeting.ts'
import type { CoverageModelBudget, CoverageRepairPolicy, CoverageRepairState, CoverageReview, CoverageReviewInput } from './coverage-types.ts'

/** Mutable owner; only immutable snapshots cross the persistence boundary. */
export class CoverageRepairRuntime {
  /** Current committed or reserved run-local state. */
  state: CoverageRepairState

  /**
   * Freeze limits and approved aspects, or retain the original checkpoint limits.
   * @param input Approved review scope.
   * @param policy Explicit run bounds.
   * @param saved Optional original checkpoint state.
   * @param persist Durable reservation sink, called before every external operation.
   * @param clock Explicit run clock for durable targeted-work deadlines.
   */
  constructor(input: CoverageReviewInput, policy: CoverageRepairPolicy, saved: CoverageRepairState | undefined,
    private readonly persist: (state: CoverageRepairState) => Promise<void>, private readonly clock?: () => string) {
    if (policy.targeting !== undefined && clock === undefined) throw new Error('Targeted coverage requires an explicit run clock.')
    if (saved !== undefined && !isDeepStrictEqual(saved.requirements, input.brief.coverageRequirements)) {
      throw new EvidenceError('Coverage repair state belongs to a different approved scope.', 'ACADEMIC_COVERAGE_RECOVERY_INVALID')
    }
    if (saved?.review !== null && saved?.review !== undefined && saved.fingerprint === coverageFingerprint(input)) {
      parseCoverageReview(JSON.stringify({ aspects: saved.review.aspects, ...saved.review.gapTerms === undefined ? {} : {
        gapTerms: saved.review.gapTerms } }), input)
    }
    this.state = saved ?? { schemaVersion: policy.targeting === undefined ? 1 : 2, policy,
      requirements: input.brief.coverageRequirements ?? [],
      reviewCalls: 0, repairRounds: 0, repairedWorkVersionIds: [], repairCandidateIds: [],
      repairSearchRounds: 0,
      fingerprint: null, review: null, coverage: null, pending: null, failure: null }
  }

  /**
   * Read coverage without making a model call; stale or absent judgments remain incomplete.
   * @param input Current evidence snapshot.
   * @param admitted Global evidence admission outcome.
   * @param now Caller clock.
   * @returns Coverage with complete aspect gaps.
   */
  coverage(input: CoverageReviewInput, admitted: boolean, now: string): ResearchQuestionCoverageResult {
    return reviewedCoverage(input, this.state.fingerprint === coverageFingerprint(input) ? this.state.review
      : this.retainedReview(input, this.state.review),
    admitted, this.state.policy.minimumSupportingWorks, now)
  }

  /**
   * Reserve a dispatch, retain its judgment, and reuse it for an identical evidence snapshot.
   * @param input Current review input.
   * @param admitted Global evidence admission outcome.
   * @param now Clock used for the assessment.
   * @param reviewer Logged model callback.
   * @param signal Cancellation.
   * @returns Reviewed or explicitly unreviewed coverage; model failures never establish coverage.
   */
  async review(input: CoverageReviewInput, admitted: boolean, now: string,
    reviewer: (input: CoverageReviewInput, signal?: AbortSignal, budget?: CoverageModelBudget) => Promise<CoverageReview>,
    signal?: AbortSignal): Promise<ResearchQuestionCoverageResult> {
    const fingerprint = coverageFingerprint(input)
    if (this.state.pending === 'review') {
      const review = this.retainedReview(input, this.state.review)
      const coverage = reviewedCoverage(input, review, admitted, this.state.policy.minimumSupportingWorks, now)
      await this.commit({ ...this.state, fingerprint, review, coverage, pending: null, failure: 'review_failed' })
      return coverage
    }
    if (this.state.fingerprint === fingerprint && this.state.review !== null) return this.coverage(input, admitted, now)
    if (this.state.reviewCalls >= this.state.policy.maximumReviews || this.state.failure === 'review_failed') {
      return this.coverage(input, admitted, now)
    }
    const previous = this.state.review
    const digests = input.evidence.map(record => ({ evidenceId: record.evidenceId, digest: coverageEvidenceDigest(record,
      input.questionLinks.filter(link => link.evidenceId === record.evidenceId).map(link => link.question)) }))
    const delta = this.state.policy.targeting === undefined || previous === null ? undefined : {
      baseline: previous,
      newEvidenceIds: digests.filter(d => !this.state.evidenceDigests?.some(old => old.evidenceId === d.evidenceId))
        .map(d => d.evidenceId),
      aspectIds: previous.aspects.filter(a => a.status !== 'covered' || a.evidenceIds.some(id =>
        this.state.evidenceDigests?.find(d => d.evidenceId === id)?.digest !== digests.find(d => d.evidenceId === id)?.digest))
        .map(a => a.aspectId),
    }
    if (delta?.aspectIds.length === 0 && fingerprint !== this.state.fingerprint) {
      // New evidence may contradict a previously covered aspect, so it still receives a delta review.
      delta.aspectIds = previous?.aspects.map(a => a.aspectId) ?? []
    }
    await this.commit({ ...this.state, reviewCalls: this.state.reviewCalls + 1, pending: 'review',
      failure: null })
    let review: CoverageReview
    try {
      review = await this.runBounded(scoped => reviewer({ ...input, ...delta === undefined ? {} : { delta } }, scoped,
        this.state.policy.targeting === undefined ? undefined : this.modelBudget(true)), signal)
      if (delta !== undefined) {
        const changes = new Map(review.aspects.map(a => [a.aspectId, a]))
        const invalidated = new Set(review.invalidatedAspectIds ?? [])
        review = { aspects: delta.baseline.aspects.map(a => invalidated.has(a.aspectId)
          ? { ...a, status: 'uncertain', reason: '新增证据与已有判断可能冲突，需要复核。' } : changes.get(a.aspectId) ?? a) }
        parseCoverageReview(JSON.stringify(review), input)
      }
    } catch (error: unknown) {
      if (signal?.aborted || error instanceof WorkflowLogError || !(error instanceof EvidenceError)) throw error
      const retained = this.retainedReview(input, previous)
      const coverage = reviewedCoverage(input, retained, admitted, this.state.policy.minimumSupportingWorks, now)
      await this.commit({ ...this.state, fingerprint, pending: null, failure: 'review_failed', review: retained, coverage })
      return coverage
    }
    const coverage = reviewedCoverage(input, review, admitted, this.state.policy.minimumSupportingWorks, now)
    await this.commit({ ...this.state, fingerprint, review, coverage,
      ...this.state.policy.targeting === undefined ? {} : { evidenceDigests: digests }, pending: null })
    return coverage
  }

  private retainedReview(input: CoverageReviewInput, previous: CoverageReview | null): CoverageReview | null {
    if (previous === null || this.state.policy.targeting === undefined) return null
    const known = new Map(input.evidence.map(record => [record.evidenceId, coverageEvidenceDigest(record,
      input.questionLinks.filter(link => link.evidenceId === record.evidenceId).map(link => link.question))]))
    const allAffected = previous.aspects.every(aspect => aspect.status === 'covered')
      && this.state.fingerprint !== coverageFingerprint(input)
    return { aspects: previous.aspects.map((aspect) => {
      const unchanged = !allAffected && aspect.status === 'covered' && aspect.evidenceIds.every(id => known.has(id)
        && this.state.evidenceDigests?.find(d => d.evidenceId === id)?.digest === known.get(id))
      if (unchanged) return aspect
      const parent = this.state.requirements.find(r => r.aspects.some(a => a.aspectId === aspect.aspectId))?.question
      const evidenceIds = aspect.evidenceIds.filter(id => known.has(id)
        && input.questionLinks.some(link => link.evidenceId === id && link.question === parent))
      return { ...aspect, evidenceIds,
        status: aspect.status === 'covered' || aspect.status === 'partial' && evidenceIds.length === 0
          ? 'uncertain' as const : aspect.status,
        reason: `${aspect.reason} 新证据尚未完成覆盖核查，保留原有未完整覆盖状态。` }
    }) }
  }

  /**
   * Reserve the one repair round before work starts.
   * @returns Whether another round was authorized by the frozen limits.
   */
  async beginRepair(): Promise<boolean> {
    if (this.state.repairRounds >= this.state.policy.maximumRepairRounds) return false
    await this.commit({ ...this.state, repairRounds: this.state.repairRounds + 1, pending: 'repair' })
    return true
  }

  /**
   * Reserve one paper acquisition and its single extraction dispatch, including failed work.
   * @param id Existing included version.
   * @returns Whether the paper has a remaining repair reservation.
   */
  async reservePaper(id: WorkVersionId): Promise<boolean> {
    if (this.state.repairRounds === 0 || this.state.repairedWorkVersionIds.includes(id)
      || this.state.repairedWorkVersionIds.length >= this.state.policy.maximumRepairPapers) return false
    await this.commit({ ...this.state, repairedWorkVersionIds: [...this.state.repairedWorkVersionIds, id], pending: 'repair' })
    return true
  }

  /**
   * Reserve new candidate work without resetting the original run-wide candidate limit.
   * @param ids Proposed unscheduled versions.
   * @returns Only versions admitted by the remaining repair allowance.
   */
  async reserveCandidates(ids: readonly WorkVersionId[]): Promise<readonly WorkVersionId[]> {
    if (this.state.repairRounds === 0) return []
    const remaining = this.state.policy.maximumNewCandidateWorks - this.state.repairCandidateIds.length
    const accepted = ids.filter(id => !this.state.repairCandidateIds.includes(id)).slice(0, Math.max(0, remaining))
    await this.commit({ ...this.state, repairCandidateIds: [...this.state.repairCandidateIds, ...accepted], pending: 'repair' })
    return accepted
  }

  /**
   * Reserve a single gap-search round.
   * @returns Whether a search remains within the repair budget.
   */
  async reserveSearch(): Promise<boolean> {
    if (this.state.repairRounds === 0 || this.state.repairSearchRounds >= this.state.policy.maximumRepairRounds) return false
    await this.commit({ ...this.state, repairSearchRounds: this.state.repairSearchRounds + 1, pending: 'repair' })
    return true
  }

  /**
   * Retain an extraction failure without turning it into evidence or resetting its reservation.
   * @returns Completion of the durable state write.
   */
  async repairFailed(): Promise<void> { await this.commit({ ...this.state, pending: null, failure: 'repair_failed' }) }

  /** Retain completed paper repairs before the next model call. @returns Durable settlement. */
  async settleRepair(): Promise<void> { await this.commit({ ...this.state, pending: null }) }

  /**
   * Admit model work before dispatch and retain actual usage or the interrupted reservation.
   * @param review Whether this is a review allowed to use the reserved final-review allowance.
   * @returns Operation-owned admission and usage callbacks.
   */
  modelBudget(review = false): CoverageModelBudget {
    return {
      reserve: async (input, output) => {
        await this.startTargeting()
        const policy = this.state.policy.targeting, state = this.state.targeting
        if (policy === undefined || state === undefined) throw new Error('Targeting budget was not configured.')
        const spent = state.dispatches.reduce((n, d) => n + (d.actualTokens ?? d.reservedTokens), 0)
        if (state.dispatches.length >= policy.maximumModelCalls
          || spent + input + output + (review ? 0 : policy.finalReviewReserveTokens) > policy.maximumModelTokens) {
          await this.commit({ ...this.state, targeting: { ...state, exhausted: 'tokens' } })
          throw new EvidenceError('Coverage model allowance exhausted.', 'ACADEMIC_COVERAGE_TOKEN_BUDGET')
        }
        const reservation = state.dispatches.length
        await this.commit({ ...this.state, targeting: { ...state,
          dispatches: [...state.dispatches, { reservedTokens: input + output, actualTokens: null }] } })
        return reservation
      },
      settle: async (reservation, actualTokens) => {
        const state = this.state.targeting
        if (state === undefined || state.dispatches[reservation] === undefined) throw new Error('Coverage reservation is missing.')
        await this.commit({ ...this.state, targeting: { ...state, dispatches: state.dispatches.map((d, index) =>
          index === reservation ? { ...d, actualTokens: actualTokens ?? null } : d) } })
      },
    }
  }

  /**
   * Charge exact selected source characters before a repair dispatch.
   * @param characters Source characters to send, including repeated windows.
   * @returns Whether the frozen source allowance admits this selection.
   */
  async reserveCharacters(characters: number): Promise<boolean> {
    await this.startTargeting()
    const state = this.state.targeting, policy = this.state.policy.targeting
    if (state === undefined || policy === undefined) return true
    if (state.characters + characters > policy.maximumTotalCharacters) return false
    await this.commit({ ...this.state, targeting: { ...state, characters: state.characters + characters } })
    return true
  }

  /**
   * Reserve the single retained-pool candidate independently of existing-paper repairs.
   * @param id Exact approved-scope version selected for a missing aspect.
   * @returns Whether this candidate may be read, including failed attempts.
   */
  async reserveCandidateRead(id: WorkVersionId): Promise<boolean> {
    await this.startTargeting()
    const state = this.state.targeting, policy = this.state.policy.targeting
    if (state === undefined || policy === undefined || state.candidateReads.includes(id)
      || state.candidateReads.length >= policy.maximumCandidateReads) return false
    await this.commit({ ...this.state, targeting: { ...state, candidateReads: [...state.candidateReads, id] } })
    return true
  }

  /**
   * Apply one shared wall-time limit to reviews, acquisitions and repairs.
   * @param action Operation using the derived signal.
   * @param signal Parent cancellation, preserved as cancellation rather than a budget failure.
   * @returns The operation result within the frozen deadline.
   */
  async runBounded<T>(action: (signal?: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.startTargeting()
    const state = this.state.targeting, policy = this.state.policy.targeting
    if (state === undefined || policy === undefined) return action(signal)
    if (this.clock === undefined) throw new Error('Targeted coverage requires an explicit run clock.')
    const remaining = Date.parse(state.startedAt) + policy.maximumElapsedMs - Date.parse(this.clock())
    const deadline = AbortSignal.timeout(Math.max(0, Math.ceil(remaining)))
    try {
      if (remaining <= 0) throw new EvidenceError('Coverage time allowance exhausted.', 'ACADEMIC_COVERAGE_TIME_BUDGET')
      return await action(signal === undefined ? deadline : AbortSignal.any([signal, deadline]))
    } catch (error: unknown) {
      if (signal?.aborted || error instanceof WorkflowLogError) throw error
      if (deadline.aborted || remaining <= 0) {
        await this.commit({ ...this.state, targeting: { ...this.state.targeting ?? state, exhausted: 'time' } })
        throw new EvidenceError('Coverage time allowance exhausted.', 'ACADEMIC_COVERAGE_TIME_BUDGET', { cause: error })
      }
      throw error
    }
  }

  private async startTargeting(): Promise<void> {
    if (this.state.policy.targeting === undefined || this.state.targeting !== undefined) return
    if (this.clock === undefined) throw new Error('Targeted coverage requires an explicit run clock.')
    await this.commit({ ...this.state, targeting: { startedAt: this.clock(), characters: 0,
      candidateReads: [], dispatches: [], exhausted: null } })
  }

  private async commit(state: CoverageRepairState): Promise<void> {
    await this.persist(structuredClone(state))
    this.state = state
  }
}
