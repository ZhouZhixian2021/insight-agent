/** Cross-source judgments for one answer selected from each approved question. */
import type { CandidatePage, Product, ProductClaim, ProductClaimId, ProductEvidence,
  ProductEvidenceId, ProductPlan, ProductQuestionId, SourceSnapshot } from '@deepseek-ai/dsh-product-insight-model'

/** One explicit relation between a key claim and another admitted source. */
export interface ProductCrossSourceJudgment {
  readonly evidenceId: ProductEvidenceId
  readonly relation: 'supports' | 'contradicts' | 'unrelated' | 'uncertain'
  readonly rationale: string
}

/** Complete or interrupted comparison set for one approved question. */
export interface ProductQuestionVerification {
  readonly questionId: ProductQuestionId
  readonly claimId: ProductClaimId
  readonly complete: boolean
  readonly judgments: readonly ProductCrossSourceJudgment[]
}

export interface ProductKeyClaim {
  readonly questionId: ProductQuestionId
  readonly claim: ProductClaim
}

/** Prefer the maker's admitted statement, then retain discovery order for a missing maker source. */
export function keyProductClaims(plan: ProductPlan, claims: readonly ProductClaim[],
  evidence: readonly ProductEvidence[], pages: readonly CandidatePage[]): readonly ProductKeyClaim[] {
  const evidenceById = new Map(evidence.map(item => [item.evidenceId, item]))
  const pageById = new Map(pages.map(item => [item.candidatePageId, item]))
  return plan.questions.flatMap((question) => {
    const matching = claims.filter(claim => claim.questionIds.includes(question.questionId))
    const selected = matching.find(claim => claim.evidenceLinks.some((link) => {
      const item = evidenceById.get(link.evidenceId)
      const page = item === undefined ? undefined : pageById.get(item.candidatePageId)
      return page !== undefined && page.sourceType !== 'other'
    })) ?? matching[0]
    return selected === undefined ? [] : [{ questionId: question.questionId, claim: selected }]
  })
}

/** Only admitted statements for the same question may corroborate or oppose a key claim. */
export function comparisonEvidence(questionId: ProductQuestionId, claim: ProductClaim,
  claims: readonly ProductClaim[], evidence: readonly ProductEvidence[]): readonly ProductEvidence[] {
  const admitted = new Set(claims.filter(item => item.questionIds.includes(questionId))
    .flatMap(item => item.evidenceLinks.filter(link => link.relation === 'supports').map(link => link.evidenceId)))
  const primary = new Set(claim.evidenceLinks.map(link => link.evidenceId))
  return evidence.filter(item => admitted.has(item.evidenceId) && !primary.has(item.evidenceId))
}

/** Reject invented, repeated, or omitted comparisons before any decision uses model output. */
export function checkCrossSourceJudgments(candidates: readonly ProductEvidence[],
  judgments: readonly ProductCrossSourceJudgment[]): void {
  const expected = new Set(candidates.map(item => item.evidenceId))
  if (expected.size !== candidates.length || judgments.length !== candidates.length
    || new Set(judgments.map(item => item.evidenceId)).size !== judgments.length
    || judgments.some(item => !expected.has(item.evidenceId)
      || !['supports', 'contradicts', 'unrelated', 'uncertain'].includes(item.relation)
      || !item.rationale.trim() || item.rationale.length > 600)) {
    throw new RangeError('Cross-source review must cover each admitted comparison exactly once')
  }
}

/** Site separation is a conservative URL-host check, not proof of publisher independence. */
export function distinctProductSites(left: CandidatePage | undefined, right: CandidatePage | undefined): boolean {
  if (!left || !right) return false
  try {
    const a = new URL(left.url).hostname.toLowerCase()
    const b = new URL(right.url).hostname.toLowerCase()
    return a !== b && !a.endsWith(`.${b}`) && !b.endsWith(`.${a}`)
  } catch { return false }
}

export interface ProductSourceEligibility {
  readonly eligible: boolean
  readonly publisher: string | null
  readonly reasons: readonly string[]
}

/** Apply the same independent publisher and site checks to gap selection and report delivery. */
export function assessProductCorroboration(context: {
  readonly product: Product
  readonly plan: ProductPlan
  readonly evidence: ReadonlyMap<ProductEvidenceId, ProductEvidence>
  readonly pages: ReadonlyMap<CandidatePage['candidatePageId'], CandidatePage>
  readonly snapshots: ReadonlyMap<CandidatePage['candidatePageId'], SourceSnapshot>
}, claim: ProductClaim, judgments: readonly ProductCrossSourceJudgment[]) {
  const { product, plan, evidence, pages, snapshots } = context
  const primaryLink = claim.evidenceLinks[0]
  const primary = primaryLink === undefined ? undefined : evidence.get(primaryLink.evidenceId)
  const primaryPage = primary === undefined ? undefined : pages.get(primary.candidatePageId)
  const primarySource = assessProductSource(product, plan, primaryPage,
    primary === undefined ? undefined : snapshots.get(primary.candidatePageId))
  const ineligible = new Set<string>()
  let corroborated = false
  for (const { evidenceId, relation } of judgments) {
    if (relation !== 'supports') continue
    const support = evidence.get(evidenceId)
    if (support === undefined) continue
    const supportPage = pages.get(support.candidatePageId)
    const source = assessProductSource(product, plan, supportPage, snapshots.get(support.candidatePageId))
    if (!source.eligible) source.reasons.forEach(reason => ineligible.add(reason))
    if (primarySource.eligible && source.eligible && source.publisher !== null && primarySource.publisher !== null
      && source.publisher.toLocaleLowerCase() !== primarySource.publisher.toLocaleLowerCase()
      && distinctProductSites(primaryPage, supportPage)) corroborated = true
  }
  return { primaryPage, primarySource, ineligible, corroborated }
}

/** Match observed source facts to user-approved publisher domains and explicit scope requirements. */
export function assessProductSource(product: Product, plan: ProductPlan, page: CandidatePage | undefined,
  snapshot: SourceSnapshot | undefined): ProductSourceEligibility {
  if (!page || snapshot?.status !== 'available' || snapshot.candidatePageId !== page.candidatePageId) {
    return { eligible: false, publisher: null, reasons: ['Source page or captured content is unavailable.'] }
  }
  const reasons: string[] = []
  let publisher: string | null = null
  try {
    const host = new URL(page.url).hostname.toLowerCase()
    const official = new URL(product.officialUrl).hostname.toLowerCase()
    if (host === official || host.endsWith(`.${official}`)) {
      publisher = product.developer
      if (page.publisher !== product.developer) reasons.push('Official source attribution differs from the approved product.')
      if (snapshot.declaredPublisher !== undefined
        && snapshot.declaredPublisher.toLocaleLowerCase() !== product.developer.toLocaleLowerCase()) {
        reasons.push('Official page publisher declaration differs from the approved developer.')
      }
    } else {
      const approved = plan.sourcePublishers?.find(item => host === item.domain
        || host.endsWith(`.${item.domain}`))
      if (!approved) reasons.push('External publisher domain was not approved in the plan.')
      else {
        publisher = approved.name
        if (page.publisher !== approved.name) reasons.push('Discovered publisher differs from the approved domain.')
        if (snapshot.declaredPublisher?.toLocaleLowerCase() !== approved.name.toLocaleLowerCase()) {
          reasons.push('Page publisher declaration is missing or differs from the approved publisher.')
        }
      }
    }
  } catch { reasons.push('Source URL has no verifiable HTTP host.') }
  const criteria = plan.sourceCriteria
  if (criteria?.region !== undefined
    && snapshot.sourceRegionLabel?.toLocaleLowerCase() !== criteria.region.toLocaleLowerCase()) {
    reasons.push('Source region is missing or differs from the approved scope.')
  }
  if (criteria?.productVersion !== undefined
    && snapshot.productVersionLabel?.toLocaleLowerCase() !== criteria.productVersion.toLocaleLowerCase()) {
    reasons.push('Source product version is missing or differs from the approved scope.')
  }
  if (criteria?.minimumSourceDate !== undefined) {
    const date = snapshot.sourceUpdatedAt ?? snapshot.sourcePublishedAt
    if (date === undefined || !Number.isFinite(Date.parse(date))
      || date.slice(0, 10) < criteria.minimumSourceDate
      || Date.parse(date) > Date.parse(snapshot.observedAt)) {
      reasons.push('Source date is missing, before the approved cutoff, or after observation.')
    }
  }
  return { eligible: reasons.length === 0, publisher, reasons }
}
