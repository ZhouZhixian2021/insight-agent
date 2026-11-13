/** Evaluate delivery separately from investigation settlement and render only cited records. */
import { checkProductClaimFreshness, type CandidatePage, type Product, type ProductClaim,
  type ProductEvidence, type ProductEvidenceGap, type ProductFailure, type ProductPlan } from '@deepseek-ai/dsh-product-insight-model'
import { sameProductPageFacts, type ProductDiscoveryResult,
  type ProductPageFetchResult } from '@deepseek-ai/dsh-product-insight-source'
import type { ProductSemanticReview } from './claim-review.ts'
import { assessProductSource, checkCrossSourceJudgments, comparisonEvidence,
  distinctProductSites, keyProductClaims, type ProductQuestionVerification } from './claim-verification.ts'


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

/** Approved questions with reviewed source evidence and disclosed limitations. */
export interface ProductSynthesisInput {
  readonly scope: string
  readonly sourceCriteria?: NonNullable<ProductPlan['sourceCriteria']>
  readonly questions: readonly {
    readonly questionId: string
    readonly question: string
    readonly limitations?: readonly string[]
    readonly evidence: readonly Pick<ProductEvidence, 'evidenceId' | 'sourcedStatement' | 'verbatimExcerpt'>[]
  }[]
}

/** Build source-supported writing material independently of final delivery status. */
export function productSynthesisInput(input: ProductReportInput): ProductSynthesisInput {
  const pages = new Map(input.discovery.candidates.items.map(page => [page.candidatePageId, page]))
  const evidence = new Map(input.evidence.map(item => [item.evidenceId, item]))
  const reviews = new Map(input.reviews.map(item => [item.evidenceId, item]))
  const snapshots = new Map(input.pages.snapshots.items.map(item => [item.candidatePageId, item]))
  const claims = input.claims.filter(claim => validClaimLinks(input.plan, claim, evidence, reviews, pages)
    && checkProductClaimFreshness(claim, input.plan, evidence, snapshots).status === 'current',
  )
  const eligibleIds = new Set(claims.flatMap(claim => claim.evidenceLinks.map(link => link.evidenceId)))
  const keys = keyProductClaims(input.plan, claims, input.evidence, input.discovery.candidates.items)
  const questions = input.plan.questions.map((question) => {
    const claim = keys.find(item => item.questionId === question.questionId)?.claim
    const primaryId = claim?.evidenceLinks[0]?.evidenceId
    const primary = primaryId === undefined ? undefined : evidence.get(primaryId)
    const primaryPage = primary === undefined ? undefined : pages.get(primary.candidatePageId)
    const verification = input.verifications.find(item => item.questionId === question.questionId
      && item.claimId === claim?.claimId && item.complete)
    const support = verification?.judgments.filter(item => item.relation === 'supports' && eligibleIds.has(item.evidenceId))
      .map(item => evidence.get(item.evidenceId)).find((item) => {
        const page = item === undefined ? undefined : pages.get(item.candidatePageId)
        return item?.questionIds.includes(question.questionId)
          && page?.publisher?.toLocaleLowerCase() !== primaryPage?.publisher?.toLocaleLowerCase()
          && distinctProductSites(primaryPage, page)
      })
    const limitations = input.gaps.filter(gap => gap.questionId === question.questionId).map(gap => gap.missingContent)
    limitations.push(...sourceDisclosures(input, question.questionId))
    if (!primary) limitations.push('当前没有满足来源、原文关联与审核要求的材料，尚不能回答本题。')
    else if (!support) limitations.push('当前说法有来源摘录支持，但缺少符合要求的独立来源佐证；不能视为独立实测结论。')
    for (const judgment of verification?.judgments ?? []) {
      if (judgment.relation === 'contradicts') limitations.push(`跨来源比较提示可能存在冲突：${judgment.rationale} 应保留各自的产品与测试条件，不能合并为一致结论。`)
      if (judgment.relation === 'uncertain') limitations.push(`跨来源比较尚不确定：${judgment.rationale} 未完整佐证不等于原始陈述错误。`)
    }
    for (const item of input.evidence.filter(item => eligibleIds.has(item.evidenceId)
      && claims.some(claim => claim.questionIds.includes(question.questionId)
        && claim.evidenceLinks.some(link => link.evidenceId === item.evidenceId)))) {
      const page = pages.get(item.candidatePageId)
      const snapshot = snapshots.get(item.candidatePageId)
      if (page === undefined || snapshot?.status !== 'available') continue
      const host = new URL(page.url).hostname.toLowerCase()
      const approved = input.plan.sourcePublishers?.find(source => host === source.domain || host.endsWith(`.${source.domain}`))
      if (approved && snapshot.declaredPublisher?.toLocaleLowerCase() !== approved.name.toLocaleLowerCase()) {
        limitations.push(`来源“${page.title ?? page.url}”的页面发布方未确定：${snapshot.declaredPublisher === undefined
          ? '未提取到发布方声明' : '页面声明与计划登记名称不一致'}；按已批准域名纳入，结论仍须由原文支持。`)
      }
    }
    return { questionId: question.questionId, question: question.text, limitations: [...new Set(limitations)],
      evidence: input.evidence.filter(item => eligibleIds.has(item.evidenceId)
        && claims.some(claim => claim.questionIds.includes(question.questionId)
          && claim.evidenceLinks.some(link => link.evidenceId === item.evidenceId)))
        .map(({ evidenceId, sourcedStatement, verbatimExcerpt }) => ({ evidenceId, sourcedStatement, verbatimExcerpt })) }
  })
  return { scope: input.plan.scope, questions,
    ...input.plan.sourceCriteria === undefined ? {} : { sourceCriteria: input.plan.sourceCriteria } }
}

/** Disclose source limitations without changing the report delivery state. */
function sourceDisclosures(input: ProductReportInput, questionId: ProductPlan['questions'][number]['questionId']): string[] {
  const notes: string[] = []
  const missing = input.evidence.filter(item => item.questionIds.includes(questionId)
    && !input.reviews.some(review => review.evidenceId === item.evidenceId))
  if (missing.length) notes.push(`${missing.length} 条材料未取得有效的原文支持审核记录，保留供核查，不作为已确认结论；不影响其他已核对内容交付。`)
  for (const review of input.reviews) {
    const item = input.evidence.find(item => item.evidenceId === review.evidenceId)
    if (review.questionIds.includes(questionId) && item && !item.questionIds.includes(questionId)) {
      notes.push('部分材料经原文审核后关联到本题，与提取阶段的问题归属不同；保留原始归属和审核记录供核查。')
    }
  }
  const items = input.evidence.filter(item => item.questionIds.includes(questionId))
  for (const item of items) {
    const page = input.discovery.candidates.items.find(page => page.candidatePageId === item.candidatePageId)
    const snapshot = input.pages.snapshots.items.find(snapshot => snapshot.candidatePageId === item.candidatePageId)
    const label = page?.title ?? page?.url ?? '来源记录'
    if (snapshot?.status !== 'available' || snapshot.sourceSnapshotId !== item.sourceSnapshotId
      || snapshot.contentHash !== item.contentHash) {
      notes.push(`来源“${label}”的证据与保存正文版本不一致或无法对应；该材料保留供核查，不作为已确认结论。`)
    }
    const source = assessProductSource(input.product, input.plan, page, snapshot)
    for (const reason of source.reasons) {
      const detail = reason.includes('domain') || reason.includes('publisher')
        ? '未获计划来源批准或来源归属待确认'
        : reason.includes('region') ? '地区缺失或与计划要求不一致'
          : reason.includes('version') ? '产品版本缺失或与计划要求不一致'
            : reason.includes('date') ? '来源日期缺失或不满足计划要求'
              : '来源正文或身份尚无法确认'
      notes.push(`来源“${label}”：${detail}；仅按原文实际适用条件理解，不代表满足批准范围。`)
    }
    if (input.sourceRevalidation !== undefined && !sameProductPageFacts(snapshot,
      input.sourceRevalidation.snapshots.items.find(value => value.candidatePageId === item.candidatePageId))) {
      notes.push(`来源“${label}”在恢复时发生变化或无法重新确认；本报告依据原保存快照，不代表网页当前内容。`)
    }
  }
  return [...new Set(notes)]
}

/** Insert validated prose with links resolved from the captured evidence. */
export function renderProductSynthesis(input: ProductReportInput, material: ProductSynthesisInput,
  paragraphs: ReadonlyMap<string, string>): string {
  const pages = new Map(input.discovery.candidates.items.map(page => [page.candidatePageId, page.url]))
  const evidence = new Map(input.evidence.map(item => [item.evidenceId, item]))
  const footnotes = new Map<string, { number: number; url: string }>()
  const sections = material.questions.flatMap(({ questionId, question, evidence: references, limitations = [] }) => {
    const text = references.length === 0 ? '现有材料不足以形成有依据的回答。' : paragraphs.get(questionId)
    if (text === undefined) throw new RangeError('Product synthesis is missing an approved answer')
    const allowed = new Set(references.map(item => String(item.evidenceId)))
    const parts: string[] = []
    let offset = 0
    for (const match of text.matchAll(/\[\[cite:([^\]\s]+)\]\]/gu)) {
      const id = match[1] ?? ''
      const item = references.find(reference => reference.evidenceId === id)
      const record = item === undefined ? undefined : evidence.get(item.evidenceId)
      const url = record === undefined ? undefined : pages.get(record.candidatePageId)
      if (!allowed.has(id) || record === undefined || url === undefined || !safeSourceUrl(url)) {
        throw new RangeError('Product synthesis citation is outside its question evidence')
      }
      const citation = footnotes.get(id) ?? { number: footnotes.size + 1, url: citationLink(url, record) }
      footnotes.set(id, citation)
      parts.push(escape(text.slice(offset, match.index)), `[^product-source-${citation.number}]`)
      offset = match.index + match[0].length
    }
    parts.push(escape(text.slice(offset)))
    return [`### ${escape(question)}`, '', parts.join(''), '', ...limitations.map(note => `资料限制：${escape(note)}`), '']
  })
  return ['## 综合回答', '', '正文上标对应具体句子的来源，点击可查看引用。', '', ...sections,
    ...[...footnotes.values()].map(({ number, url }) => `[^product-source-${number}]: [查看来源原文](${url})`), ''].join('\n')
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
  if (input.failures.some(failure => failure.stage === 'report')) {
    reasons.push('报告综合生成未完成。请参考下方已核对的来源陈述。')
  }
  const approvedQuestionIds = new Set(input.plan.questions.map(question => question.questionId))
  if (input.discovery.searches.some(search => !approvedQuestionIds.has(search.questionId))) {
    reasons.push('A source search refers to a question outside the approved plan.')
  }
  const evidenceById = new Map(input.evidence.map(item => [item.evidenceId, item]))
  const reviewsById = new Map(input.reviews.map(item => [item.evidenceId, item]))
  const pageById = new Map(input.discovery.candidates.items.map(page => [page.candidatePageId, page]))
  const latestByPage = new Map(input.pages.snapshots.items.map(item => [item.candidatePageId, item]))
  if (input.discovery.candidates.items.some(page => page.screening.status === 'selected'
    && !latestByPage.has(page.candidatePageId))) {
    reasons.push('A selected product page has no settled source snapshot.')
  }
  if (new Set(input.claims.map(claim => claim.claimId)).size !== input.claims.length) {
    reasons.push('Report claim identities are not unique.')
  }
  for (const claim of input.claims) {
    if (!validClaimLinks(input.plan, claim, evidenceById, reviewsById, pageById)) {
      reasons.push(`Claim ${claim.claimId} has an invalid source or question link.`)
      continue
    }
  }

  const selected = keyProductClaims(input.plan, input.claims, input.evidence, input.discovery.candidates.items)
  // Historical comparisons remain inspectable; new investigations do not require them.
  for (const verification of input.verifications) {
    const selectedClaim = selected.find(item => item.questionId === verification.questionId
      && item.claim.claimId === verification.claimId)
    if (!selectedClaim) {
      reasons.push('A saved cross-source check has an invalid claim or question link.')
      continue
    }
    const { questionId, claim } = selectedClaim
    const questionText = input.plan.questions.find(item => item.questionId === questionId)?.text ?? 'unknown question'
    const candidates = comparisonEvidence(questionId, claim, input.claims, input.evidence)
    if (!verification.complete) continue
    try { checkCrossSourceJudgments(candidates, verification.judgments) }
    catch { reasons.push(`Cross-source check has invalid evidence links for: ${questionText}`); continue }

  }
  return reasons.length ? { status: 'draft', reasons }
    : { status: 'ready', reasons: ['Report structure checks passed; source limitations and unanswered questions are disclosed separately.'] }
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
        && item.candidatePageId === evidence.candidatePageId)
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

/** Render reader-facing answers first and keep source checks in a separate evidence appendix. */
export function renderProductReport(input: ProductReportInput, assessment: ProductReportAssessment,
  synthesis?: string): string {
  if (assessment.status === 'blocked') throw new RangeError('A blocked product report has no renderable evidence')
  const pageById = new Map(input.discovery.candidates.items.map(page => [page.candidatePageId, page]))
  const reviewById = new Map(input.reviews.map(review => [review.evidenceId, review]))
  const title = assessment.status === 'ready' ? '产品资料调查报告' : '产品资料调查草稿'
  const lines = [`# ${escape(input.product.name)} — ${title}`, '',
    `调查范围：${escape(input.plan.scope)}`, '',
    '本报告依据本次获取的资料；来源说明和测试结论不等于对产品实际行为的独立验证。', '']
  lines.push('## 交付状态', '', assessment.status === 'ready'
    ? '当前已执行的交付检查通过。内容适用范围和资料限制仍需结合下文阅读。'
    : '交付条件尚未全部满足，以下保留已有依据与可回答的内容。', '')
  if (assessment.status === 'draft') {
    lines.push('### 交付未达标原因', '',
      ...[...new Set(assessment.reasons.map(productDeliveryReason))].map(reason => `- ${escape(reason)}`), '')
  }
  if (synthesis !== undefined) lines.push(synthesis, '')
  else {
    const material = productSynthesisInput(input)
    const usable = new Set(material.questions.flatMap(question => question.evidence.map(item => item.evidenceId)))
    lines.push('## 产品分析', '', '以下为已核对的来源陈述；尚未完成连贯的模型综合，不据此推断普遍适用的选用建议。', '')
    const shown = new Set<string>()
    for (const question of input.plan.questions) {
      const claims = input.claims.filter(claim => claim.questionIds.includes(question.questionId)
        && claim.evidenceLinks.every(link => usable.has(link.evidenceId)))
      lines.push(`### ${escape(question.text)}`, '')
      const fresh = claims.filter(claim => !shown.has(claim.text))
      for (const claim of fresh) {
        if (shown.has(claim.text)) continue
        const links = claim.evidenceLinks.flatMap((link) => {
          const evidence = input.evidence.find(item => item.evidenceId === link.evidenceId)
          const page = evidence === undefined ? undefined : pageById.get(evidence.candidatePageId)
          return evidence === undefined || page === undefined || !safeSourceUrl(page.url) ? []
            : [`[来源](${citationLink(page.url, evidence)})`]
        })
        if (links.length === 0) continue
        lines.push(`${escape(claim.text)} ${[...new Set(links)].join(' ')}`, '')
        shown.add(claim.text)
      }
      if (claims.length === 0) lines.push('尚无通过语义审核的来源陈述，当前资料尚不足以回答这个问题。', '')
      else if (fresh.length === 0) lines.push('本题与前述问题共用来源陈述，尚无额外的独立发现。', '')
    }
  }
  lines.push('## 内容限制与未回答问题', '',
    '- 结论仅适用于原文说明的版本、套餐、地区和测试条件；未说明的条件保持未知。',
    '- 官方说明、宣传、第三方测试和用户反馈应按各自来源理解；不同条件的结果不能直接排名。',
    '- 本次未找到依据，不代表产品不存在相关功能，也不代表已覆盖全部公开资料。',
    ...(synthesis === undefined ? productSynthesisInput(input).questions.flatMap(question =>
      (question.limitations ?? []).map(note => `- ${escape(question.question)}：${escape(note)}`)) : []), '')
  lines.push('## 参考来源', '', '来源按实际获取记录列示；未获计划批准或适用范围未确认的材料另行说明。', '')
  const referenced = new Set(input.evidence.map(item => item.candidatePageId))
  for (const page of input.discovery.candidates.items.filter(page => referenced.has(page.candidatePageId))) {
    if (!safeSourceUrl(page.url)) continue
    const snapshot = input.pages.snapshots.items.find(item => item.candidatePageId === page.candidatePageId)
    const checked = input.sourceRevalidation?.snapshots.items.find(item => item.candidatePageId === page.candidatePageId)
    if (checked?.status === 'available') lines.push(`最近复核：${escape(checked.observedAt)}`)
    lines.push(`- [${escape(page.title ?? page.url)}](${safeLink(page.url)})；发布方：${escape(page.publisher ?? '未知')}；${snapshot?.status === 'available'
      ? `获取时间：${escape(snapshot.observedAt)}；页面声明发布方：${escape(snapshot.declaredPublisher ?? '未知')}；发布日期：${escape(snapshot.sourcePublishedAt ?? '未知')}；更新日期：${escape(snapshot.sourceUpdatedAt ?? '未知')}；版本：${escape(snapshot.productVersionLabel ?? '未知')}；地区：${escape(snapshot.sourceRegionLabel ?? '未知')}`
      : '正文不可用'}`)
  }
  lines.push('', '## 证据附录', '')
  const seen = new Set<string>()
  for (const item of input.evidence) {
    if (seen.has(item.evidenceId)) continue
    seen.add(item.evidenceId)
    const page = pageById.get(item.candidatePageId)
    if (!page || !safeSourceUrl(page.url)) continue
    const review = reviewById.get(item.evidenceId)
    const state = review?.verdict === 'supported' ? '来源陈述获摘录支持'
      : review?.verdict === 'unsupported' ? '摘录不支持该陈述'
        : review?.verdict === 'uncertain' ? '支持关系仍不确定' : '尚未审核支持关系'
    lines.push(`### 证据 ${seen.size}`, '', `> ${escape(item.verbatimExcerpt)}`, '',
      `${state}；来源陈述：${escape(item.sourcedStatement)} [来源](${citationLink(page.url, item)})`, '')
    if (review) lines.push(`核对说明：${escape(review.rationale)}`, '')
  }
  if (input.verifications.length) lines.push('### 历史跨来源核对', '')
  for (const verification of input.verifications) {
    const question = input.plan.questions.find(item => item.questionId === verification.questionId)
    lines.push(`**${escape(question?.text ?? '研究问题')}**：${verification.complete ? '核对完成' : '核对未完成'}`, '')
    for (const judgment of verification.judgments) {
      const evidence = input.evidence.find(item => item.evidenceId === judgment.evidenceId)
      const page = evidence && pageById.get(evidence.candidatePageId)
      if (!evidence || !page || !safeSourceUrl(page.url)) continue
      const label = judgment.relation === 'supports' ? '支持来源' : judgment.relation === 'contradicts'
        ? '冲突来源' : judgment.relation === 'uncertain' ? '待核实来源' : '无关来源'
      lines.push(`- ${label}：[来源](${citationLink(page.url, evidence)})；${escape(judgment.rationale)}`)
    }
    lines.push('')
  }
  lines.push(...renderDiscoveryDisclosure(input))
  if (assessment.status === 'draft') lines.push('## 原始交付诊断', '',
    ...[...new Set(assessment.reasons)].map(reason => `- ${escape(reason)}`), '')
  return lines.join('\n')
}

/** Translate known delivery failures without exposing record identities in the reading summary. */
function productDeliveryReason(reason: string): string {
  if (reason.startsWith('Unanswered question: ')) return `尚未回答：${reason.slice('Unanswered question: '.length)}`
  if (reason.startsWith('No admitted claim answers: ')) return `缺少有效结论：${reason.slice(26)}`
  if (reason.includes('independent publisher')) return '部分问题的关键结论缺少获批的独立来源佐证。'
  if (reason.includes('Conflicting source')) return '部分来源的陈述仍存在冲突。'
  if (reason.includes('scope or meaning')) return '部分来源的适用范围或含义仍不明确。'
  if (reason.includes('searches did not complete')) return '部分获批检索未完成，或受到数量和范围限制。'
  if (reason.includes('operation(s) failed')) return '部分调查操作失败，已有成果已保留。'
  if (reason.includes('cancelled or interrupted')) return '调查已取消或中断，尚未完成全部步骤。'
  if (reason.includes('semantic review')) return '部分来源陈述尚未完成有效的支持关系审核。'
  if (reason.includes('source') || reason.startsWith('Claim ')) return '部分来源、版本、证据关联或交叉核对未满足交付要求。'
  if (reason.includes('Cross-source')) return '部分问题的跨来源核对尚未完成或关联无效。'
  if (/[\u4e00-\u9fff]/u.test(reason)) return reason
  return '另有交付检查未通过，具体记录见原始交付诊断。'
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
  if (input.failures.length) {
    const stages: Record<string, string> = { discovery: '网页发现', screening: '网页筛选', fetch: '正文获取', extraction: '证据提取',
      analysis: '语义审核与分析', report: '报告生成' }
    const counts = new Map<string, number>()
    for (const failure of input.failures) counts.set(failure.stage, (counts.get(failure.stage) ?? 0) + 1)
    lines.push(`部分操作失败：${[...counts].map(([stage, count]) => `${stages[stage] ?? '其他处理'} ${count} 次`).join('；')}。已保留可用结果；失败次数不单独决定交付状态，具体错误见运行追踪。`, '')
  }
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
      const scopeNote = search.status === 'failed' ? '；本次未获得可用搜索结果，可用资料以其他成功查询为准'
        : search.truncated
          ? '；检索覆盖受限：记录未细分数量上限、部分搜索源失败或辅助恢复等原因，不能据此判定本次搜索无结果'
          : '；未记录覆盖受限，不代表完整检索'
      const reason = search.reason === undefined ? '' : search.reason === 'candidate_limit'
        ? '；候选网页数量已达到计划上限' : search.reason === 'elapsed_limit'
          ? '；已达到计划耗时上限' : search.reason === 'cancelled' ? '；调查已取消' : search.reason === 'evidence_gap'
            ? '；针对资料缺口补充搜索' : search.reason === 'corroboration_gap'
              ? '；针对独立佐证不足补充搜索' : `；原因：${escape(search.reason)}`
      lines.push(`- ${escape(question.text)}：${status}${counts}${scopeNote}${reason}；查询：${escape(search.query)}。`)
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
