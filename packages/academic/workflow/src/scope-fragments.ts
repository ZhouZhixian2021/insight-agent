/** Condition-targeted scope review with one dispatch budget shared by reads and re-reads. */
import type { EvidenceContentSegment, EvidenceGenerationRequest,
  ScreeningConditionQuery, ScreeningFragment } from '@deepseek-ai/dsh-academic-evidence'
import { selectScreeningFragments } from '@deepseek-ai/dsh-academic-evidence'
import type { PaperScopeDecision, PaperScopeRules, ScopeScreeningDispatch, ScopeScreeningPolicy,
  ScopeScreeningRecord } from './model-types.ts'

/** Outcome of one bounded fragment scope review. */
export interface ScopeScreeningOutcome {
  readonly decision: PaperScopeDecision
  readonly record: ScopeScreeningRecord
}

/**
 * Derive one condition query per approved rule, using only the rule text for terms.
 * Approved aliases remain the owner of better terms; these are a deterministic first pass.
 * @param scope - Approved inclusion and exclusion rules.
 * @returns Distinct conditions with their reviewed terms, in rule order.
 */
export function screeningConditions(scope: PaperScopeRules): readonly ScreeningConditionQuery[] {
  const rules = [
    ...scope.inclusionRules.map((rule, index) => ({ conditionId: `inclusion-${index + 1}`, rule })),
    ...scope.exclusionRules.map((rule, index) => ({ conditionId: `exclusion-${index + 1}`, rule })),
  ]
  return rules.map(({ conditionId, rule }) => ({ conditionId, terms: ruleTerms(rule) }))
    .filter(condition => condition.terms.length > 0)
}

/**
 * Review one paper by reading only the windows that serve undecided conditions.
 * Each dispatch consumes one budget unit; the returned record binds requests to replay.
 * @param request - Complete parsed paper content and approved focus questions.
 * @param conditions - Conditions still unresolved for this paper.
 * @param policy - Dispatch, window and length bounds.
 * @param review - Logged scope review of one window set and its completeness flag.
 * @returns The first conclusive decision, or the last unresolved decision at the budget limit.
 */
export async function reviewPaperScopeInFragments(request: EvidenceGenerationRequest,
  conditions: readonly ScreeningConditionQuery[], policy: ScopeScreeningPolicy,
  review: (request: EvidenceGenerationRequest, sourceComplete: boolean, record: ScopeScreeningRecord) => Promise<PaperScopeDecision>,
): Promise<ScopeScreeningOutcome> {
  validatePolicy(policy)
  const dispatches: ScopeScreeningDispatch[] = []
  const masked: MutableSegment[] = request.segments.map(segment => ({ text: segment.text, locator: segment.locator }))
  let decision: PaperScopeDecision = { status: 'needs_more_context', reason: 'No screening dispatch was available.' }
  for (let dispatch = 1; dispatch <= policy.maximumDispatches; dispatch++) {
    request.signal?.throwIfAborted()
    const selection = selectScreeningFragments(masked, conditions, {
      maximumFragments: policy.maximumFragments, maximumCharacters: policy.fragmentCharacters,
      leadCharacters: policy.leadCharacters,
    })
    const fresh = selection.fragments.filter(fragment => cut(masked, fragment).text.trim() !== '')
    if (fresh.length === 0) {
      const record = settle(dispatches, policy, dispatches.length === 0 ? 'no_content' : 'budget_exhausted')
      return { decision: dispatches.length === 0 ? decision : { ...decision,
        reason: `${decision.reason} No unread window remains for the undecided conditions.` }, record }
    }
    for (const fragment of fresh) mask(masked, fragment)
    const windows = fresh.map(fragment => cut(request.segments, fragment))
    const record = { dispatches: [...dispatches, { dispatch, fragments: fresh }],
      remainingDispatches: policy.maximumDispatches - dispatch, stopReason: 'budget_exhausted' as const }
    decision = await review({ ...request, segments: windows }, selection.sourceComplete && dispatch === 1, record)
    dispatches.push({ dispatch, fragments: fresh })
    if (decision.status !== 'needs_more_context') {
      return { decision, record: settle(dispatches, policy, 'decided') }
    }
  }
  return { decision, record: settle(dispatches, policy, 'budget_exhausted') }
}

function settle(dispatches: readonly ScopeScreeningDispatch[], policy: ScopeScreeningPolicy,
  stopReason: ScopeScreeningRecord['stopReason']): ScopeScreeningRecord {
  return { dispatches, remainingDispatches: Math.max(0, policy.maximumDispatches - dispatches.length), stopReason }
}

function cut(segments: readonly EvidenceContentSegment[], fragment: ScreeningFragment): EvidenceContentSegment {
  const segment = segments[fragment.segmentIndex]
  if (segment === undefined) throw new RangeError('Screening fragment references an unknown segment.')
  return { ...segment, text: segment.text.slice(fragment.start, fragment.end) }
}

/** Read-progress copy of one segment; the source segment stays immutable for locators and replay. */
interface MutableSegment {
  text: string
  readonly locator: EvidenceContentSegment['locator']
}

/** Blank an already-read window so the next selection cannot return it again. */
function mask(segments: MutableSegment[], fragment: ScreeningFragment): void {
  const segment = segments[fragment.segmentIndex]
  if (segment === undefined) throw new RangeError('Screening fragment references an unknown segment.')
  segment.text = `${segment.text.slice(0, fragment.start)}${' '.repeat(fragment.end - fragment.start)}${segment.text.slice(fragment.end)}`
}

function ruleTerms(rule: string): readonly string[] {
  const terms = rule.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .map(term => term.trim()).filter(term => term.length >= 3)
  return [...new Set(terms)].slice(0, 6)
}

function validatePolicy(policy: ScopeScreeningPolicy): void {
  for (const [name, value] of Object.entries({ maximumDispatches: policy.maximumDispatches,
    maximumFragments: policy.maximumFragments, fragmentCharacters: policy.fragmentCharacters })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive safe integer.`)
  }
  if (!Number.isSafeInteger(policy.leadCharacters) || policy.leadCharacters < 0) {
    throw new RangeError('leadCharacters must be a non-negative safe integer.')
  }
}
