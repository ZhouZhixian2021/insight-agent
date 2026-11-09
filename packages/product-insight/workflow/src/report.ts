/** Evaluate delivery separately from investigation settlement and render only cited records. */
import { checkProductClaimFreshness, type CandidatePage, type Product, type ProductClaim,
  type ProductEvidence, type ProductEvidenceGap, type ProductFailure, type ProductPlan } from '@deepseek-ai/dsh-product-insight-model'
import { sameProductPageFacts, type ProductDiscoveryResult,
  type ProductPageFetchResult } from '@deepseek-ai/dsh-product-insight-source'
import type { ProductSemanticReview } from './claim-review.ts'
import { assessProductCorroboration, assessProductSource, checkCrossSourceJudgments, comparisonEvidence,
  distinctProductSites, keyProductClaims, type ProductQuestionVerification } from './claim-verification.ts'

export const MAX_PRODUCT_REPORT_BYTES = 64_000

/** Ready means the approved investigation is complete enough to deliver, not independently true. */
export interface ProductReportAssessment {
  readonly status: 'ready' | 'draft' | 'blocked'
  readonly reasons: readonly string[]
}

/** Captured run facts and reviewed conclusions consumed by report assessment. */
export interface ProductReportInput {
  readonly product: Product
  readonly plan: ProductPlan
  readonly discovery: ProductDiscoveryResult
  readonly pages: ProductPageFetchResult
  /** Fresh observations of unchanged saved pages after an explicit resume. */
  readonly sourceRevalidation?: ProductPageFetchResult
  readonly evidence: readonly ProductEvidence[]
  readonly reviews: readonly ProductSemanticReview[]
  readonly claims: readonly ProductClaim[]
  readonly verifications: readonly ProductQuestionVerification[]
  readonly gaps: readonly ProductEvidenceGap[]
  readonly failures: readonly ProductFailure[]
  readonly cancelled: boolean
}

/** Approved questions with the key excerpt and a corroborating excerpt per question. */
export interface ProductSynthesisInput {
  readonly scope: string
  readonly sourceCriteria?: NonNullable<ProductPlan['sourceCriteria']>
  readonly questions: readonly {
    readonly questionId: string
    readonly question: string
    readonly evidence: readonly Pick<ProductEvidence, 'evidenceId' | 'sourcedStatement' | 'verbatimExcerpt'>[]
  }[]
}

/** Build synthesis material after the report delivery checks have passed. */
export function productSynthesisInput(input: ProductReportInput): ProductSynthesisInput {
  const pages = new Map(input.discovery.candidates.items.map(page => [page.candidatePageId, page]))
  const evidence = new Map(input.evidence.map(item => [item.evidenceId, item]))
  const keys = keyProductClaims(input.plan, input.claims, input.evidence, input.discovery.candidates.items)
  const questions = keys.map(({ questionId, claim }) => {
    const question = input.plan.questions.find(item => item.questionId === questionId)
    const primaryId = claim.evidenceLinks[0]?.evidenceId
    const primary = primaryId === undefined ? undefined : evidence.get(primaryId)
    const primaryPage = primary === undefined ? undefined : pages.get(primary.candidatePageId)
    const verification = input.verifications.find(item => item.questionId === questionId)
    const support = verification?.judgments.filter(item => item.relation === 'supports')
      .map(item => evidence.get(item.evidenceId)).find((item) => {
        const page = item === undefined ? undefined : pages.get(item.candidatePageId)
        return page?.publisher?.toLocaleLowerCase() !== primaryPage?.publisher?.toLocaleLowerCase()
          && distinctProductSites(primaryPage, page)
      })
    if (question === undefined || primary === undefined || support === undefined) {
      throw new RangeError('Product synthesis requires a key claim and corroborating evidence for each question')
    }
    return { questionId, question: question.text,
      evidence: [primary, support].map(({ evidenceId, sourcedStatement, verbatimExcerpt }) =>
        ({ evidenceId, sourcedStatement, verbatimExcerpt })) }
  })
  return { scope: input.plan.scope, questions,
    ...input.plan.sourceCriteria === undefined ? {} : { sourceCriteria: input.plan.sourceCriteria } }
}

/** Insert validated prose with links resolved from the captured evidence. */
export function renderProductSynthesis(input: ProductReportInput, material: ProductSynthesisInput,
  paragraphs: ReadonlyMap<string, string>): string {
  const pages = new Map(input.discovery.candidates.items.map(page => [page.candidatePageId, page.url]))
  const evidence = new Map(input.evidence.map(item => [item.evidenceId, item]))
  return ['## 综合回答', '', '以下综合表述依据已核对的来源陈述。逐条摘录和适用范围见下文。', '',
    ...material.questions.flatMap(({ questionId, question, evidence: references }) => {
      const text = paragraphs.get(questionId)
      if (text === undefined) throw new RangeError('Product synthesis is missing an approved answer')
      const links = references.map(({ evidenceId }, index) => {
        const item = evidence.get(evidenceId)
        const url = item === undefined ? undefined : pages.get(item.candidatePageId)
        if (item === undefined || url === undefined || !safeSourceUrl(url)) throw new RangeError('Product synthesis source URL is unavailable')
        return `[来源 ${index + 1}](${citationLink(url, item)})`
      })
      return [`### ${escape(question)}`, '', `${escape(text)} ${links.join(' ')}`, '']
    })].join('\n')
}

/**
 * Check complete source, question, judgment and claim identities before final delivery.
 * @param input - Captured discovery, pages, evidence, judgments, and run failures.
 * @returns Ready, cited draft, or blocked status with explicit reasons.
 */
export function evaluateProductReport(input: ProductReportInput): ProductReportAssessment {
  if (input.evidence.length === 0) {
    return { status: 'blocked', reasons: ['No verified product evidence was found.'] }
  }
  const reasons: string[] = []
  if (input.product.productId !== input.plan.productId
    || input.discovery.candidates.items.some(page =>
      page.planId !== input.plan.planId || page.productId !== input.product.productId)) {
    reasons.push('The report contains a product or page outside the approved plan.')
  }
  if (input.cancelled || input.discovery.cancelled) reasons.push('The investigation was cancelled or interrupted.')
  if (input.failures.length) reasons.push(`${input.failures.length} investigation operation(s) failed.`)
  if (input.failures.some(failure => failure.stage === 'report')) {
    reasons.push('报告综合生成未完成。请参考下方已核对的来源陈述。')
  }
  const approvedQuestionIds = new Set(input.plan.questions.map(question => question.questionId))
  if (input.discovery.searches.length < input.plan.questions.length
    || input.discovery.searches.some(search => !approvedQuestionIds.has(search.questionId)
      || search.status !== 'success' || search.truncated)
    || input.plan.questions.some(question => !input.discovery.searches.some(search =>
      search.questionId === question.questionId && search.status === 'success' && !search.truncated))) {
    reasons.push('Some approved source searches did not complete within the reviewed scope.')
  }
  if (input.gaps.length) reasons.push(...input.gaps.map(gap => `Unanswered question: ${gap.missingContent}`))
  const evidenceById = new Map(input.evidence.map(item => [item.evidenceId, item]))
  const reviewsById = new Map(input.reviews.map(item => [item.evidenceId, item]))
  const pageById = new Map(input.discovery.candidates.items.map(page => [page.candidatePageId, page]))
  const latestByPage = new Map(input.pages.snapshots.items.map(item => [item.candidatePageId, item]))
  if (input.sourceRevalidation !== undefined) {
    const checked = new Map(input.sourceRevalidation.snapshots.items.map(item => [item.candidatePageId, item]))
    if (input.sourceRevalidation.cancelled || input.sourceRevalidation.snapshots.failures.length
      || input.discovery.candidates.items.some(page => page.screening.status === 'selected'
        && !sameProductPageFacts(latestByPage.get(page.candidatePageId), checked.get(page.candidatePageId)))) {
      reasons.push('A resumed source changed or could not be revalidated against its saved snapshot.')
    }
  }
  if (input.evidence.some((item) => {
    const snapshot = latestByPage.get(item.candidatePageId)
    return snapshot?.status !== 'available' || snapshot.sourceSnapshotId !== item.sourceSnapshotId
      || snapshot.contentHash !== item.contentHash || !pageById.has(item.candidatePageId)
  })) reasons.push('Some evidence does not match its captured source snapshot.')
  if (evidenceById.size !== input.evidence.length || reviewsById.size !== input.evidence.length
    || input.reviews.length !== input.evidence.length
    || input.evidence.some(item => !reviewsById.has(item.evidenceId))) {
    reasons.push('Some accepted evidence lacks one complete semantic review.')
  }
  if (input.discovery.candidates.items.some(page => page.screening.status === 'selected'
    && !latestByPage.has(page.candidatePageId))) {
    reasons.push('A selected product page has no settled source snapshot.')
  }
  if (input.claims.length === 0) reasons.push('No source-bound product claim passed semantic review.')
  if (new Set(input.claims.map(claim => claim.claimId)).size !== input.claims.length) {
    reasons.push('Report claim identities are not unique.')
  }
  for (const question of input.plan.questions) {
    if (!input.claims.some(claim => claim.questionIds.includes(question.questionId))) {
      reasons.push(`No admitted claim answers: ${question.text}`)
    }
  }
  for (const claim of input.claims) {
    if (!validClaimLinks(input.plan, claim, evidenceById, reviewsById, pageById)) {
      reasons.push(`Claim ${claim.claimId} has an invalid source or question link.`)
      continue
    }
    for (const link of claim.evidenceLinks) {
      const item = evidenceById.get(link.evidenceId)
      const source = assessProductSource(input.product, input.plan,
        item === undefined ? undefined : pageById.get(item.candidatePageId),
        item === undefined ? undefined : latestByPage.get(item.candidatePageId))
      if (!source.eligible) reasons.push(`Claim ${claim.claimId} uses an ineligible source: ${source.reasons.join(' ')}`)
    }
    const freshness = checkProductClaimFreshness(claim, input.plan, evidenceById, latestByPage)
    if (freshness.status !== 'current') {
      reasons.push(`Claim ${claim.claimId} has ${freshness.status} source content.`)
    }
  }
  const selected = keyProductClaims(input.plan, input.claims, input.evidence, input.discovery.candidates.items)
  if (input.verifications.length !== selected.length
    || new Set(input.verifications.map(item => item.questionId)).size !== input.verifications.length) {
    reasons.push('Cross-source checks do not cover every answered question exactly once.')
  }
  for (const { questionId, claim } of selected) {
    const questionText = input.plan.questions.find(item => item.questionId === questionId)?.text ?? 'unknown question'
    const verification = input.verifications.find(item => item.questionId === questionId)
    const candidates = comparisonEvidence(questionId, claim, input.claims, input.evidence)
    if (!verification || verification.claimId !== claim.claimId || !verification.complete) {
      reasons.push(`Cross-source check is incomplete for: ${questionText}`)
      continue
    }
    try { checkCrossSourceJudgments(candidates, verification.judgments) }
    catch { reasons.push(`Cross-source check has invalid evidence links for: ${questionText}`); continue }
    if (verification.judgments.some(item => item.relation === 'contradicts')) {
      reasons.push(`Conflicting source statements remain for: ${questionText}`)
    }
    if (verification.judgments.some(item => item.relation === 'uncertain')) {
      reasons.push(`Source scope or meaning remains uncertain for: ${questionText}`)
    }
    const { primarySource, ineligible, corroborated } = assessProductCorroboration({
      product: input.product, plan: input.plan, evidence: evidenceById, pages: pageById, snapshots: latestByPage,
    }, claim, verification.judgments)
    if (!primarySource.eligible) {
      reasons.push(`Key source is not eligible for ${questionText}: ${primarySource.reasons.join(' ')}`)
    }
    if (ineligible.size) reasons.push(`Supporting source is not eligible for ${questionText}: ${[...ineligible].join(' ')}`)
    if (!corroborated) reasons.push(`No approved independent publisher corroborates the key claim for: ${questionText}`)
  }
  return reasons.length ? { status: 'draft', reasons }
    : { status: 'ready', reasons: ['Approved questions have current, cited statements corroborated across sites.'] }
}

function validClaimLinks(plan: ProductPlan, claim: ProductClaim,
  evidenceById: ReadonlyMap<ProductEvidence['evidenceId'], ProductEvidence>,
  reviewsById: ReadonlyMap<ProductEvidence['evidenceId'], ProductSemanticReview>,
  pageById: ReadonlyMap<CandidatePage['candidatePageId'], CandidatePage>): boolean {
  if (claim.questionIds.length === 0 || claim.evidenceLinks.length === 0
    || claim.confidence === 'insufficient' || claim.scope !== plan.scope
    || claim.questionIds.some(id => !plan.questions.some(question => question.questionId === id))
    || claim.evidenceSnapshot.evidenceItems.length !== claim.evidenceLinks.length
    || new Set(claim.evidenceLinks.map(link => link.evidenceId)).size !== claim.evidenceLinks.length
    || new Set(claim.evidenceSnapshot.evidenceItems.map(item => item.evidenceId)).size
      !== claim.evidenceSnapshot.evidenceItems.length) return false
  for (const link of claim.evidenceLinks) {
    const evidence = evidenceById.get(link.evidenceId)
    const review = reviewsById.get(link.evidenceId)
    if (!evidence || !review || link.relation !== 'supports' || review.verdict !== 'supported'
      || claim.text !== evidence.sourcedStatement || !link.rationale.trim()
      || claim.questionIds.some(id => !review.questionIds.includes(id))
      || !claim.evidenceSnapshot.evidenceItems.some(item => item.evidenceId === link.evidenceId
        && item.candidatePageId === evidence.candidatePageId && item.contentHash === evidence.contentHash)
      || !safeSourceUrl(pageById.get(evidence.candidatePageId)?.url)) return false
  }
  return true
}

function safeSourceUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
  } catch { return false }
}

/**
 * Reassess inside report preparation so a caller cannot render a forged ready decision.
 * @param input - Captured run facts and reviewed conclusions.
 * @returns Delivery assessment and cited Markdown when evidence permits a report.
 */
export function prepareProductReport(input: ProductReportInput): {
  readonly assessment: ProductReportAssessment
  readonly markdown: string | null
} {
  const assessment = evaluateProductReport(input)
  return { assessment, markdown: assessment.status === 'blocked' ? null : renderProductReport(input, assessment) }
}

/** Keep rejected source statements visible without phrasing them as admitted claims. */
export function renderProductReport(input: ProductReportInput, assessment: ProductReportAssessment,
  synthesis?: string): string {
  if (assessment.status === 'blocked') throw new RangeError('A blocked product report has no renderable evidence')
  const pageById = new Map(input.discovery.candidates.items.map(page => [page.candidatePageId, page]))
  const snapshotByPage = new Map(input.pages.snapshots.items.map(item => [item.candidatePageId, item]))
  const checkedByPage = new Map(input.sourceRevalidation?.snapshots.items.map(item => [item.candidatePageId, item]) ?? [])
  const reviewByEvidence = new Map(input.reviews.map(review => [review.evidenceId, review]))
  const keyByQuestion = new Map(keyProductClaims(input.plan, input.claims, input.evidence,
    input.discovery.candidates.items).map(item => [item.questionId, item.claim]))
  const title = assessment.status === 'ready' ? '产品资料调查报告' : '产品资料调查草稿'
  const notice = assessment.status === 'ready'
    ? '已按获批域名和页面声明完成跨站来源核对；页面自报发布方不证明实际归属，也不等于对来源真实性或产品实际行为的核实。'
    : '交付条件尚未全部满足；以下内容是带来源的调查草稿。'
  const lines = [`# ${escape(input.product.name)} — ${title}`, '',
    `调查范围：${escape(input.plan.scope)}`, '', notice, '']
  if (assessment.status === 'draft') {
    lines.push('## 交付未达标原因', '', ...assessment.reasons.map(reason => `- ${escape(reason)}`), '')
  }
  if (synthesis !== undefined) lines.push(synthesis, '')
  lines.push(...renderDiscoveryDisclosure(input))
  lines.push('## 来源身份与适用范围', '')
  for (const page of input.discovery.candidates.items.filter(item => item.screening.status === 'selected')) {
    const snapshot = snapshotByPage.get(page.candidatePageId)
    const checked = checkedByPage.get(page.candidatePageId)
    if (!safeSourceUrl(page.url)) continue
    const source = assessProductSource(input.product, input.plan, page, snapshot)
    const details = snapshot?.status === 'available'
      ? `页面声明发布方：${snapshot.declaredPublisher ?? '未知'}；发布日期：${snapshot.sourcePublishedAt ?? '未知'}；更新日期：${snapshot.sourceUpdatedAt ?? '未知'}；产品版本：${snapshot.productVersionLabel ?? '未知'}；地区：${snapshot.sourceRegionLabel ?? '未知'}`
      : '页面内容未获取'
    lines.push(`- [来源](${safeLink(page.url)})；计划发布方：${escape(source.publisher ?? '未知')}；${escape(details)}；${checked?.status === 'available' ? `最近复核：${escape(checked.observedAt)}；` : ''}${source.eligible ? '适用' : `待核实：${escape(source.reasons.join(' '))}`}`)
  }
  lines.push('')
  for (const question of input.plan.questions) {
    lines.push(`## ${escape(question.text)}`, '')
    const reviewed = input.claims.filter(item => item.questionIds.includes(question.questionId))
    const key = keyByQuestion.get(question.questionId)
    if (key !== undefined) {
      const verification = input.verifications.find(item => item.questionId === question.questionId)
      lines.push(`关键来源陈述：${escape(key.text)}（置信度：低；${escape(key.confidenceReasons[0])}）`, '')
      if (verification) {
        const counts = { supports: 0, contradicts: 0, unrelated: 0, uncertain: 0 }
        for (const item of verification.judgments) counts[item.relation] += 1
        lines.push(`交叉来源核对：支持 ${counts.supports}、冲突 ${counts.contradicts}、范围或语义不明 ${counts.uncertain}；${verification.complete ? '已核对全部入选陈述' : '核对未完成'}。`, '')
        for (const item of verification.judgments.filter(item =>
          item.relation === 'supports' || item.relation === 'contradicts' || item.relation === 'uncertain')) {
          const evidence = input.evidence.find(candidate => candidate.evidenceId === item.evidenceId)
          const page = evidence === undefined ? undefined : pageById.get(evidence.candidatePageId)
          if (!evidence || !page || !safeSourceUrl(page.url)) continue
          const label = item.relation === 'supports' ? '支持来源'
            : item.relation === 'contradicts' ? '冲突来源' : '待核实来源'
          lines.push(`${label}：${escape(evidence.sourcedStatement)} [来源](${citationLink(page.url, evidence)})；${escape(item.rationale)}`, '')
        }
      }
      const other = reviewed.filter(item => item.claimId !== key.claimId)
      if (other.length) lines.push(...other.map(item => `其他已审核来源陈述：${escape(item.text)}`), '')
    }
    else lines.push('尚无通过语义审核的来源陈述。', '')
    const matching = input.evidence.filter(item => item.questionIds.includes(question.questionId))
    for (const item of matching) {
      const page = pageById.get(item.candidatePageId)
      if (page === undefined || !safeSourceUrl(page.url)) continue
      const sourceUrl = citationLink(page.url, item)
      const review = reviewByEvidence.get(item.evidenceId)
      const assessmentText = review === undefined ? '语义审核未完成'
        : review.verdict === 'supported' ? '语义审核通过'
          : `语义审核${review.verdict === 'uncertain' ? '不确定' : '未通过'}：${escape(review.rationale)}`
      lines.push(`> ${escape(item.verbatimExcerpt)}`, '',
        `${assessmentText}；来源陈述：${escape(item.sourcedStatement)} [来源](${sourceUrl})`, '')
    }
    if (matching.length === 0) lines.push('未找到可核对的来源摘录。', '')
  }
  if (input.gaps.length) lines.push('## 资料缺口', '', ...input.gaps.map(gap => `- ${escape(gap.missingContent)}`), '')
  return lines.join('\n')
}

/** Show settled search and acquisition facts without treating search metadata as evidence. */
function renderDiscoveryDisclosure(input: ProductReportInput): string[] {
  const selected = input.discovery.candidates.items.filter(page => page.screening.status === 'selected')
  const snapshots = new Map(input.pages.snapshots.items.map(item => [item.candidatePageId, item]))
  const available = selected.filter(page => snapshots.get(page.candidatePageId)?.status === 'available').length
  const failed = selected.filter(page => snapshots.get(page.candidatePageId)?.status === 'failed').length
  const pending = selected.length - available - failed
  const needsReview = input.discovery.candidates.items.filter(page => page.screening.status === 'needs_review').length
  const lines = ['## 检索与取证范围', '',
    '搜索结果仅用于发现候选网页；下文引用来自已获取并核对的网页正文。检索未报告截断也不代表覆盖全部公开资料。', '',
    `候选网页 ${input.discovery.candidates.items.length} 个；入选 ${selected.length} 个；已获取正文 ${available} 个；获取失败 ${failed} 个；未完成获取 ${pending} 个；待审 ${needsReview} 个。`, '']
  for (const question of input.plan.questions) {
    const attempts = input.discovery.searches.filter(search => search.questionId === question.questionId)
    if (attempts.length === 0) {
      lines.push(`- ${escape(question.text)}：未执行搜索。`)
      continue
    }
    for (const search of attempts) {
      const status = search.status === 'success' ? '完成' : search.status === 'failed' ? '失败'
        : search.status === 'cancelled' ? '已取消' : '未执行'
      const counts = search.status === 'success'
        ? `；返回 ${search.returnedCount ?? '未知'} 条；新增候选 ${search.recordedCount ?? '未知'} 个` : ''
      const reason = search.reason === undefined ? '' : search.reason === 'evidence_gap'
        ? '；针对资料缺口补充搜索' : search.reason === 'corroboration_gap'
          ? '；针对独立佐证不足补充搜索' : `；原因：${escape(search.reason)}`
      lines.push(`- ${escape(question.text)}：${status}${counts}；截断或提前停止：${search.truncated ? '是' : '否'}${reason}；查询：${escape(search.query)}。`)
    }
  }
  return [...lines, '']
}

function citationLink(value: string, evidence: ProductEvidence): string {
  const pdfPage = evidence.locator.kind === 'text_range' ? evidence.locator.pdfPage : undefined
  if (pdfPage === undefined || !Number.isSafeInteger(pdfPage) || pdfPage < 1) return safeLink(value)
  const url = new URL(value)
  url.hash = `page=${pdfPage}`
  return safeLink(url.href)
}

function safeLink(value: string): string {
  return encodeURI(new URL(value).href).replace(/\(/gu, '%28').replace(/\)/gu, '%29')
}

function escape(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/[\\`*_{}\[\]()#+.!|~-]/gu, '\\$&').replace(/\r?\n/gu, ' ')
}
