/** Recover an executable product plan from one explicit Session approval. */
import { createHash } from 'node:crypto'

import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { Product, ProductId, ProductPlan, ProductPlanId, ProductPlanLimits,
  ProductQuestionId, ProductSourceCriteria, ProductSourcePublisher } from '@deepseek-ai/dsh-product-insight-model'

const PLAN_FENCE = 'product-insight-plan-json'

/** Durable approval identity, reviewed Markdown, and owning Session. */
export interface ApprovedProductPlanInput {
  readonly sessionId: string
  readonly identity: string
  readonly markdown: string
  readonly reviewedAt: string
}

/** Stable product and executable plan reconstructed from one approval. */
export interface ApprovedProductPlan {
  readonly product: Product
  readonly plan: ProductPlan
  readonly approvalIdentity: string
}

/**
 * Find the latest native or PTC plan with an explicit, durable user approval.
 * @param events - Session events in log order.
 * @returns The reviewed plan content and identity, or undefined when none was approved.
 */
export function latestApprovedProductPlan(events: readonly SessionEvent[]):
Pick<ApprovedProductPlanInput, 'identity' | 'markdown' | 'reviewedAt'> | undefined {
  const calls = new Map<string, string>()
  let latest: Pick<ApprovedProductPlanInput, 'identity' | 'markdown' | 'reviewedAt'> | undefined
  for (const event of events) {
    if (event.type === 'tool/call' && event.data.name === 'exit_plan_mode') {
      try {
        const args: unknown = JSON.parse(event.data.arguments)
        if (isRecord(args) && typeof args.plan === 'string') calls.set(String(event.data.callId), args.plan)
      } catch { /* Invalid arguments cannot approve a plan. */ }
    } else if (event.type === 'tool/result') {
      const identity = String(event.data.message.toolCallId)
      const markdown = calls.get(identity)
      if (markdown !== undefined && !event.data.message.isError
        && isRecord(event.data.meta) && event.data.meta.approved === true) {
        latest = { identity, markdown, reviewedAt: eventTime(event.time) }
      }
    } else if (event.type === 'tool/ptc-dispatch' && event.data.name === 'exit_plan_mode'
      && !event.data.isError && isRecord(event.data.meta) && event.data.meta.approved === true
      && isRecord(event.data.arguments) && typeof event.data.arguments.plan === 'string') {
      latest = { identity: String(event.data.subCallId), markdown: event.data.arguments.plan,
        reviewedAt: eventTime(event.time) }
    }
  }
  return latest
}

function eventTime(time: number): string {
  const value = new Date(time)
  if (!Number.isFinite(value.valueOf())) throw new RangeError('Product plan review time is invalid')
  return value.toISOString()
}

/**
 * Rebuild exact, stable identities from the reviewed Markdown. A controller must
 * supply the identity and timestamp of an explicit approved `exit_plan_mode` result.
 * @param input - Approved Session handoff, including exact plan Markdown.
 * @returns Product and current-version approved plan with stable identities.
 */
export function productPlanFromApproval(input: ApprovedProductPlanInput): ApprovedProductPlan {
  const payload = parseProductPlanMarkdown(input.markdown)
  if (!input.sessionId.trim() || !input.identity.trim()) throw new RangeError('Approved plan identity is required')
  if (!Number.isFinite(Date.parse(input.reviewedAt))) throw new RangeError('Approved plan review time is invalid')
  const productKey = [payload.product.name, payload.product.developer, payload.product.officialUrl].join('\n')
  const productId = brandString<ProductId>(`product:${createHash('sha256').update(productKey).digest('hex')}`)
  const planId = brandString<ProductPlanId>(`${input.sessionId}:approved-product-plan:${input.identity}`)
  return {
    product: { schemaVersion: 1, productId, ...payload.product },
    plan: { schemaVersion: 1, planId, productId, version: 1,
      scope: payload.scope,
      questions: payload.questions.map((text, index) => ({
        questionId: brandString<ProductQuestionId>(`${planId}:question:${index + 1}`), text,
      })),
      limits: payload.limits,
      ...payload.sourcePublishers === undefined ? {} : { sourcePublishers: payload.sourcePublishers },
      ...payload.sourceCriteria === undefined ? {} : { sourceCriteria: payload.sourceCriteria },
      approval: { status: 'approved', approvedPlanVersion: 1,
        reviewedBy: 'session-user', reviewedAt: input.reviewedAt, comment: null } },
    approvalIdentity: input.identity,
  }
}

/**
 * Validate one structured block before review without granting approval.
 * External publisher domains cannot overlap the official host or its parent and child domains.
 * @param markdown - Proposed plan text containing one structured JSON block.
 * @returns Validated product, questions, scope, limits, and optional source criteria.
 */
export function parseProductPlanMarkdown(markdown: string): {
  readonly product: Pick<Product, 'name' | 'developer' | 'officialUrl'>
  readonly scope: string
  readonly questions: readonly string[]
  readonly limits: ProductPlanLimits
  readonly sourcePublishers?: readonly ProductSourcePublisher[]
  readonly sourceCriteria?: ProductSourceCriteria
} {
  const matches = [...markdown.matchAll(/(?:^|\n)```product-insight-plan-json\s*\n([\s\S]*?)\n```(?=\n|$)/gu)]
  if (matches.length !== 1) throw new RangeError(`Plan must contain exactly one ${PLAN_FENCE} block`)
  let value: unknown
  try { value = JSON.parse(matches[0]?.[1] ?? '') }
  catch { throw new RangeError('Product plan block must contain valid JSON') }
  if (!isRecord(value)) throw new RangeError('Product plan must be an object')
  exactKeys(value, ['schemaVersion', 'product', 'scope', 'questions', 'limits',
    'sourcePublishers', 'sourceCriteria'], 'Product plan')
  if (value.schemaVersion !== 1) throw new RangeError('Product plan schemaVersion must be 1')
  if (!isRecord(value.product)) throw new RangeError('Product identity must be an object')
  exactKeys(value.product, ['name', 'developer', 'officialUrl'], 'Product identity')
  const name = nonEmpty(value.product.name, 'Product name')
  const developer = nonEmpty(value.product.developer, 'Product developer')
  const officialUrl = nonEmpty(value.product.officialUrl, 'Product officialUrl')
  let official: URL
  try { official = new URL(officialUrl) }
  catch { throw new RangeError('Product officialUrl must be an HTTP(S) URL') }
  if (!['http:', 'https:'].includes(official.protocol) || official.username || official.password) {
    throw new RangeError('Product officialUrl must be an HTTP(S) URL without credentials')
  }
  const scope = nonEmpty(value.scope, 'Product scope')
  if (!Array.isArray(value.questions) || value.questions.length < 2 || value.questions.length > 5) {
    throw new RangeError('Product plan requires two to five questions')
  }
  const questions: string[] = []
  for (const question of value.questions) questions.push(nonEmpty(question, 'Product question'))
  if (new Set(questions).size !== questions.length) throw new RangeError('Product plan questions must be distinct')
  if (!isRecord(value.limits)) throw new RangeError('Product plan limits must be an object')
  exactKeys(value.limits, ['maximumCandidatePages', 'maximumElapsedMinutes',
    'maximumPageCharacters', 'maximumGapSearches', 'maximumGapReads'], 'Product plan limits')
  const limits = {
    maximumCandidatePages: positiveInteger(value.limits.maximumCandidatePages, 'maximumCandidatePages'),
    ...value.limits.maximumElapsedMinutes === undefined ? {} : {
      maximumElapsedMinutes: positiveNumber(value.limits.maximumElapsedMinutes, 'maximumElapsedMinutes'),
    },
    ...value.limits.maximumPageCharacters === undefined ? {} : {
      maximumPageCharacters: positiveInteger(value.limits.maximumPageCharacters, 'maximumPageCharacters'),
    },
    ...value.limits.maximumGapSearches === undefined ? {} : {
      maximumGapSearches: positiveInteger(value.limits.maximumGapSearches, 'maximumGapSearches'),
    },
    ...value.limits.maximumGapReads === undefined ? {} : {
      maximumGapReads: positiveInteger(value.limits.maximumGapReads, 'maximumGapReads'),
    },
  }
  if (limits.maximumCandidatePages > 30) throw new RangeError('maximumCandidatePages must be at most 30')
  if (limits.maximumGapSearches !== undefined && limits.maximumGapSearches > value.questions.length) {
    throw new RangeError('maximumGapSearches must not exceed the number of approved questions')
  }
  if (limits.maximumGapReads !== undefined && limits.maximumGapReads > questions.length) {
    throw new RangeError('maximumGapReads must not exceed the number of approved questions')
  }
  let sourcePublishers: ProductSourcePublisher[] | undefined
  if (value.sourcePublishers !== undefined) {
    if (!Array.isArray(value.sourcePublishers) || value.sourcePublishers.length > limits.maximumCandidatePages) {
      throw new RangeError('sourcePublishers must fit the approved candidate-page limit')
    }
    sourcePublishers = value.sourcePublishers.map((entry: unknown): ProductSourcePublisher => {
      if (!isRecord(entry)) throw new RangeError('sourcePublishers entries must be objects')
      exactKeys(entry, ['name', 'domain'], 'Source publisher')
      const publisherName = nonEmpty(entry.name, 'Source publisher name')
      const domain = nonEmpty(entry.domain, 'Source publisher domain').toLowerCase()
      let normalizedHost: string | undefined
      try { normalizedHost = new URL(`https://${domain}`).hostname }
      catch { /* A malformed hostname is rejected below. */ }
      if (domain === official.hostname || domain.endsWith(`.${official.hostname}`)
        || official.hostname.endsWith(`.${domain}`)) {
        throw new RangeError('Source publisher domain overlaps product.officialUrl; list external publishers only')
      }
      if (publisherName.length > 200 || publisherName.toLocaleLowerCase() === developer.toLocaleLowerCase()
        || domain.length > 253 || !/^[a-z0-9.-]+$/u.test(domain)
        || domain.startsWith('.') || domain.endsWith('.') || !domain.includes('.')
        || normalizedHost !== domain) {
        throw new RangeError('Source publisher domain must be a distinct bare hostname')
      }
      return { name: publisherName, domain }
    })
    const publishers = sourcePublishers
    if (new Set(publishers.map(item => item.domain)).size !== publishers.length
      || new Set(publishers.map(item => item.name.toLowerCase())).size !== publishers.length
      || publishers.some((publisher, index) => publishers.some((other, otherIndex) =>
        index !== otherIndex && publisher.domain.endsWith(`.${other.domain}`)))) {
      throw new RangeError('sourcePublishers must have distinct domains and names')
    }
  }
  let sourceCriteria: ProductSourceCriteria | undefined
  if (value.sourceCriteria !== undefined) {
    if (!isRecord(value.sourceCriteria)) throw new RangeError('sourceCriteria must be an object')
    exactKeys(value.sourceCriteria, ['region', 'productVersion', 'minimumSourceDate'], 'Source criteria')
    const region = value.sourceCriteria.region === undefined ? undefined : nonEmpty(value.sourceCriteria.region, 'Source region')
    const productVersion = value.sourceCriteria.productVersion === undefined ? undefined
      : nonEmpty(value.sourceCriteria.productVersion, 'Source productVersion')
    const minimumSourceDate = value.sourceCriteria.minimumSourceDate === undefined ? undefined
      : nonEmpty(value.sourceCriteria.minimumSourceDate, 'minimumSourceDate')
    if (region !== undefined && region.length > 120 || productVersion !== undefined && productVersion.length > 120) {
      throw new RangeError('Source region and productVersion must be at most 300 characters')
    }
    if (minimumSourceDate !== undefined && (!/^\d{4}-\d{2}-\d{2}$/u.test(minimumSourceDate)
      || !Number.isFinite(Date.parse(minimumSourceDate))
      || new Date(minimumSourceDate).toISOString().slice(0, 10) !== minimumSourceDate)) {
      throw new RangeError('minimumSourceDate must be a valid YYYY-MM-DD date')
    }
    sourceCriteria = { ...region === undefined ? {} : { region },
      ...productVersion === undefined ? {} : { productVersion },
      ...minimumSourceDate === undefined ? {} : { minimumSourceDate } }
  }
  return { product: { name, developer, officialUrl: official.href }, scope, questions, limits,
    ...sourcePublishers === undefined ? {} : { sourcePublishers },
    ...sourceCriteria === undefined ? {} : { sourceCriteria } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const extra = Object.keys(value).filter(key => !allowed.includes(key))
  if (extra.length) throw new RangeError(`${label} has unsupported field(s): ${extra.join(', ')}`)
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new RangeError(`${label} must be non-empty`)
  return value.trim()
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 1) {
    throw new RangeError(`${label} must be a positive integer`)
  }
  return value
}

function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be positive`)
  }
  return value
}
