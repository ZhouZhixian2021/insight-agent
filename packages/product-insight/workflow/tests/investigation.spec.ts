import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import { createProductId, createProductPlanId, createProductQuestionId,
  type Product, type ProductPlan } from '@deepseek-ai/dsh-product-insight-model'
import { latestApprovedProductPlan, parseProductPlanMarkdown, productPlanFromApproval,
  evaluateProductReport, runApprovedProductInvestigation, runProductInvestigation,
  type ProductInvestigationAdapters, type ProductInvestigationCheckpoint } from '../src/index.ts'
import { productSynthesisInput, renderProductReport } from '../src/report.ts'
import { latestProductBackgroundRun } from '../src/background-run.ts'
import { completedProductModelText, fitsProductModelInput, parseDrafts, reconcileProductSourceRevalidation } from '../src/session-tool.ts'

const productId = createProductId()
const questionId = createProductQuestionId()
const otherQuestionId = createProductQuestionId()
const product: Product = { schemaVersion: 1, productId, name: 'Example', developer: 'Example Inc',
  officialUrl: 'https://example.com/' }
const plan: ProductPlan = { schemaVersion: 1, planId: createProductPlanId(), version: 1, productId,
  questions: [{ questionId, text: 'What does it do?' }, { questionId: otherQuestionId, text: 'What does it cost?' }],
  scope: 'Current features', approval: { status: 'approved', approvedPlanVersion: 1,
    reviewedBy: 'user', reviewedAt: '2026-11-06T00:00:00Z', comment: null },
  sourcePublishers: [{ name: 'Review Test', domain: 'review.test' }],
  sourceCriteria: { region: 'US', productVersion: 'v1', minimumSourceDate: '2026-10-01' } }
const pageHtml = (content: string, publisher: string) => `<head><meta name="publisher" content="${publisher}">
<meta name="article:modified_time" content="2026-11-01">
<meta name="product:version" content="v1"><meta name="product:region" content="US"></head>
<article>${content}</article>`
const texts = new Map<string, string>()
const reports: string[] = []
const adapters: ProductInvestigationAdapters = { now: () => '2026-11-06T00:00:00Z',
  web: { search: async () => ({ sources: [{ url: 'https://example.com/features', title: 'Example features' }], truncated: false }),
    fetch: async () => ({ url: 'https://example.com/features', statusCode: 200,
      truncated: false, body: { kind: 'text', content: 'Example supports export.' } }) },
  saveText: async (page, text) => {
    const ref = `page:${page.candidatePageId}`
    texts.set(ref, text)
    return ref
  },
  readText: async ref => texts.get(ref) ?? '',
  savePages: async () => {},
  saveCheckpoint: async () => {},
  proposeEvidence: async () => [{ verbatimExcerpt: 'Example supports export.',
    sourcedStatement: 'Example supports export.', questionIds: [questionId] }],
  saveEvidence: async () => {},
  reviewEvidence: async evidence => evidence.map(item => ({ evidenceId: item.evidenceId,
    verdict: 'supported', questionIds: item.questionIds,
    rationale: 'The excerpt explicitly says export is supported.' })),
  saveClaims: async () => {},
  compareClaim: async () => [],
  saveVerification: async () => {},
  saveReport: async (markdown) => { reports.push(markdown); return 'report:1' } }

describe('approved product investigation', () => {
  it('reuses only the completed response paired with the exact saved model request', () => {
    const events = [
      { type: 'product/model-result-v1', data: { candidatePageId: 'page', status: 'completed', text: 'unpaired' } },
      { type: 'product/model-request-v1', data: { candidatePageId: 'page', user: 'same' } },
      { type: 'product/model-result-v1', data: { candidatePageId: 'other', status: 'completed', text: 'other' } },
      { type: 'product/model-result-v1', data: { candidatePageId: 'page', status: 'completed', text: 'saved' } },
      { type: 'product/model-request-v1', data: { candidatePageId: 'page', user: 'same' } },
      { type: 'product/model-result-v1', data: { candidatePageId: 'page', status: 'failed', text: 'partial' } },
      { type: 'product/model-request-v1', data: { candidatePageId: 'page', user: 'same' } },
      { type: 'product/model-request-v1', data: { candidatePageId: 'page', user: 'new question and range' } },
      { type: 'product/model-result-v1', data: { candidatePageId: 'page', status: 'completed', text: 'different window' } },
    ] as SessionEvent[]
    const request = (event: SessionEvent) => event.type === 'product/model-request-v1'
      && event.data.candidatePageId === 'page' && event.data.user === 'same'
    const result = (event: SessionEvent) => event.type === 'product/model-result-v1'
      && event.data.candidatePageId === 'page'
      ? event.data.status === 'completed' ? event.data.text : null : undefined
    expect(completedProductModelText(events, request, result,
      event => event.type === 'product/model-request-v1' && event.data.candidatePageId === 'page')).toBe('saved')
    expect(completedProductModelText(events.slice(0, 1), request, result)).toBeUndefined()
  })

  it('retains validated offsets for repeated excerpts in model proposals', () => {
    const draft = { verbatimExcerpt: 'Same.', sourcedStatement: 'Same.',
      questionIds: [String(questionId)], startHint: 6 }
    expect(parseDrafts(JSON.stringify([draft]))[0]?.startHint).toBe(6)
    expect(() => parseDrafts(JSON.stringify([{ ...draft, startHint: -1 }]))).toThrow(/invalid draft/u)
  })

  it('recovers a wrong offset only when the exact excerpt has one location', async () => {
    const excerpt = 'Example supports export.'
    const run = (content: string) => runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, { ...adapters,
      web: { ...adapters.web, fetch: async () => ({ url: 'https://example.com/features', statusCode: 200,
        truncated: false, body: { kind: 'text', content } }) },
      proposeEvidence: async () => [{ verbatimExcerpt: excerpt, sourcedStatement: excerpt,
        questionIds: [questionId], startHint: 5 }] })
    const unique = await run(excerpt)
    expect(unique.evidence).toMatchObject([{ locator: { kind: 'text_range', start: 0 } }])
    expect(unique.run.failures).toHaveLength(0)
    const repeated = await run(`${excerpt} ${excerpt}`)
    expect(repeated.evidence).toHaveLength(0)
    expect(repeated.run.failures).toMatchObject([{ message: 'Fragment 1, draft 0: invalid_start_hint' }])
  })

  it('delivers a cited report with scope limitations and unanswered questions', async () => {
    const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, adapters)
    expect(result.run.state).toBe('completed')
    expect(result.run.outcome).toBe('partial_success')
    expect(result.evidence).toHaveLength(1)
    expect(result.claims).toHaveLength(1)
    expect(result.claims[0]?.evidenceSnapshot.evidenceItems[0]?.contentHash).toBe(result.evidence[0]?.contentHash)
    expect(result.gaps).toMatchObject([{ questionId: otherQuestionId, status: 'open' }])
    expect(result.delivery.status).toBe('final')
    expect(reports.at(-1)).toContain('[来源](https://example.com/features)')
    expect(result.assessment.status).toBe('ready')
    expect(result.delivery.reasons.some(reason => reason.startsWith('No admitted claim answers:'))).toBe(false)
    expect(result.delivery.reasons.some(reason => reason.startsWith('Cross-site review does not prove'))).toBe(false)
    expect(result.delivery.report?.limitations).toContain('Cross-site judgments do not prove publisher independence or product behavior.')
    expect(reports.at(-1)).not.toContain('交付未达标原因')
    expect(reports.at(-1)).toContain('检索与取证范围')
    expect(reports.at(-1)).toContain('候选网页 1 个；入选 1 个；已获取正文 1 个')
    expect(reports.at(-1)).toContain('搜索结果仅用于发现候选网页')
    const report = reports.at(-1)!
    expect(report).toContain('内容限制与未回答问题')
    expect(report.indexOf('## 产品分析')).toBeLessThan(report.indexOf('## 证据附录'))
    expect(report).not.toContain('关键来源陈述：')
    expect(report).not.toContain('置信度：低')
  })

  it('delivers a grounded report with unanswered questions and missing independent support disclosed', async () => {
    const synthesizeReport = vi.fn<NonNullable<ProductInvestigationAdapters['synthesizeReport']>>(async (material) => {
      expect(material.questions).toHaveLength(1)
      expect(material.questions[0]?.evidence).toHaveLength(1)
      expect(material.questions[0]?.limitations?.join(' ')).toContain('缺少符合要求的独立来源佐证')
      return new Map([[String(questionId), `产品资料说明支持导出，可用于保存已有内容。[[cite:${material.questions[0]!.evidence[0]!.evidenceId}]]当前仅有单一来源，尚不能视为独立实测。`]])
    })
    const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, { ...adapters, synthesizeReport,
      web: { ...adapters.web, fetch: async () => ({ url: 'https://example.com/features', statusCode: 200,
        truncated: false, body: { kind: 'html', content: pageHtml('Example supports export.', 'Example Inc') } }) } })
    expect(synthesizeReport).toHaveBeenCalledTimes(1)
    expect(result.delivery.status).toBe('final')
    expect(result.assessment.status).toBe('ready')
    const markdown = reports.at(-1)!
    expect(markdown).toContain('## 综合回答')
    expect(markdown).toContain('产品资料说明支持导出')
    expect(markdown).toContain('### What does it cost?')
    expect(markdown).toContain('现有材料不足以形成有依据的回答')
    expect(markdown).toContain('保存已有内容。[^product-source-1]当前')
    expect(markdown).toContain('[^product-source-1]: [查看来源原文](https://example.com/features)')
    expect(markdown).not.toContain('## 产品分析')
  })


  it('keeps valid sibling reviews and discloses missing records without downgrading delivery', async () => {
    const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, { ...adapters,
      proposeEvidence: async () => ['First export fact.', 'Second export fact.'].map(sourcedStatement => ({
        verbatimExcerpt: 'Example supports export.', sourcedStatement, questionIds: [questionId] })),
      reviewEvidence: async evidence => evidence.slice(0, 1).map(item => ({ evidenceId: item.evidenceId,
        verdict: 'supported', questionIds: [otherQuestionId], rationale: 'The excerpt answers this approved question.' })) })
    expect(result.evidence).toHaveLength(2)
    expect(result.reviews).toHaveLength(1)
    expect(result.claims).toHaveLength(1)
    expect(result.claims[0]?.questionIds).toEqual([otherQuestionId])
    expect(result.delivery.status).toBe('final')
    expect(reports.at(-1)).toContain('未取得有效的原文支持审核记录')
    expect(reports.at(-1)).toContain('与提取阶段的问题归属不同')
  })

  it('delivers an explicit unanswered report when every source statement is unsupported', async () => {
    const synthesizeReport = vi.fn<NonNullable<ProductInvestigationAdapters['synthesizeReport']>>()
    const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, { ...adapters, synthesizeReport,
      reviewEvidence: async evidence => evidence.map(item => ({ evidenceId: item.evidenceId,
        verdict: 'unsupported', questionIds: [], rationale: 'The excerpt does not establish the statement.' })) })
    expect(result.evidence.length).toBeGreaterThan(0)
    expect(result.claims).toHaveLength(0)
    expect(result.delivery.status).toBe('final')
    expect(synthesizeReport).not.toHaveBeenCalled()
    expect(reports.at(-1)).toContain('现有材料不足以形成有依据的回答')
    expect(reports.at(-1)).toContain('摘录不支持该陈述')
    expect(reports.at(-1)).not.toContain('交付未达标原因')
  })

  it('passes scope limitations with supported evidence to synthesis', async () => {
    const synthesizeReport = vi.fn(async () => new Map([[String(questionId), '资料支持导出；适用地区和版本尚未确认。']]))
    const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, { ...adapters, synthesizeReport })
    expect(result.evidence).toHaveLength(1)
    expect(result.delivery.status).toBe('final')
    expect(synthesizeReport).toHaveBeenCalledOnce()
    expect(reports.at(-1)).toContain('## 综合回答')
    expect(reports.at(-1)).toContain('地区缺失或与计划要求不一致')
  })

  it('discloses truncated and failed searches without exposing provider errors', async () => {
    let calls = 0
    const search = vi.fn(async () => {
      if (++calls === 1) return { sources: [
        { url: 'https://example.com/features', title: 'Example features' }], truncated: true }
      throw new Error('provider secret=private-token')
    })
    const scopedPlan = { ...plan, scope: 'Current features <img src=x onerror=alert(1)>' }
    const result = await runProductInvestigation({ product, plan: scopedPlan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, { ...adapters,
      web: { ...adapters.web, search } })
    expect(result.delivery.status).toBe('final')
    expect(reports.at(-1)).toContain('返回 1 条；新增候选 1 个；检索覆盖受限')
    expect(reports.at(-1)).toContain('What does it cost?：失败')
    expect(reports.at(-1)).not.toContain('private-token')
    expect(reports.at(-1)).toContain('&lt;img src=x onerror=alert\\(1\\)&gt;')
    expect(reports.at(-1)).not.toContain('<img')
  })

  it('keeps search failures and limited coverage as disclosures when usable claims remain', async () => {
    let calls = 0
    const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, { ...adapters,
      web: { search: async () => {
        if (++calls > 1) throw new Error('private search diagnostic')
        return { sources: [{ url: 'https://example.com/features' }], truncated: true }
      }, fetch: async request => ({ url: request.url, statusCode: 200, truncated: false,
        body: { kind: 'html', content: pageHtml('Example supports export.', 'Example Inc') } }) } })
    expect(result.run.failures.length).toBeGreaterThan(0)
    expect(result.assessment.status).toBe('ready')
    expect(result.delivery.status).toBe('final')
    const markdown = reports.at(-1)!
    expect(markdown).toContain('部分操作失败：网页发现')
    expect(markdown).toContain('检索覆盖受限')
    expect(markdown).toContain('记录未细分')
    expect(markdown).toContain('缺少符合要求的独立来源佐证')
    expect(markdown).toContain('### What does it cost?')
    expect(markdown).toContain('当前资料尚不足以回答这个问题')
    expect(markdown).not.toContain('交付未达标原因')
    expect(markdown).not.toContain('private search diagnostic')
    const input = { product, plan, discovery: result.discovery, pages: result.pages,
      evidence: result.evidence, reviews: result.reviews, claims: result.claims,
      verifications: result.verifications, gaps: [], failures: result.run.failures, cancelled: false }
    expect(evaluateProductReport(input).status).toBe('ready')
    expect(evaluateProductReport({ ...input, failures: result.run.failures.map(failure =>
      ({ ...failure, stage: 'report' as const })) }).status).toBe('draft')
    expect(evaluateProductReport({ ...input, evidence: [] }).status).toBe('blocked')
    expect(evaluateProductReport({ ...input, discovery: { ...input.discovery,
      searches: input.discovery.searches.map(search => ({ ...search, questionId: createProductQuestionId() })) } }).status).toBe('draft')
  })

  it('delivers current cited claims and still rejects invalid source identities', async () => {
    const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } },
    { ...adapters,
      web: { search: async () => ({ sources: [
        { url: 'https://example.com/features', title: 'Example features' },
        { url: 'https://review.test/example', title: 'Example review' }], truncated: false }),
      fetch: async request => ({ url: request.url, statusCode: 200,
        truncated: false, body: { kind: 'html', content: pageHtml('Example supports export. Example costs $10.',
          request.url.includes('review.test') ? 'Review Test' : 'Example Inc') } }) },
      proposeEvidence: async (_page, _text, questions) => [
        { verbatimExcerpt: 'Example supports export.', sourcedStatement: 'Example supports export.',
          questionIds: [questions[0]!.questionId] },
        { verbatimExcerpt: 'Example costs $10.', sourcedStatement: 'Example costs $10.',
          questionIds: [questions[1]!.questionId] },
      ],
      compareClaim: async (claim, _questionId, candidates) => candidates.map(item => ({
        evidenceId: item.evidenceId, relation: item.sourcedStatement === claim.text ? 'supports' : 'unrelated',
        rationale: 'The other page states the same fact.' })) })
    expect(result.assessment.status).toBe('ready')
    expect(result.delivery.status).toBe('final')
    expect(result.delivery.report?.claimIds).toHaveLength(2)
    expect(result.verifications).toHaveLength(0)
    expect(reports.at(-1)).toContain('产品资料调查报告')
    expect(reports.at(-1)).toContain('来源按实际获取记录列示')
    const changedEvidence = [{ ...result.evidence[0]!, contentHash: 'changed' }, ...result.evidence.slice(1)]
    expect(evaluateProductReport({ product, plan, discovery: result.discovery, pages: result.pages,
      evidence: changedEvidence, reviews: result.reviews, claims: result.claims,
      verifications: result.verifications, gaps: result.gaps,
      failures: result.run.failures, cancelled: false }).status).toBe('ready')
    expect(evaluateProductReport({ product: { ...product, productId: createProductId() }, plan,
      discovery: result.discovery, pages: result.pages, evidence: result.evidence,
      reviews: result.reviews, claims: result.claims, verifications: result.verifications, gaps: result.gaps,
      failures: result.run.failures, cancelled: false }).status).toBe('draft')
    const reportInput = { product, plan, discovery: result.discovery, pages: result.pages,
      evidence: result.evidence, reviews: result.reviews, claims: result.claims,
      verifications: result.verifications, gaps: result.gaps, failures: result.run.failures, cancelled: false }
    const officialSnapshots = result.pages.snapshots.items.map(snapshot => snapshot.status === 'available'
      && result.discovery.candidates.items.some(page => page.candidatePageId === snapshot.candidatePageId
        && page.url.startsWith(product.officialUrl))
      ? { ...snapshot, declaredPublisher: 'Official Newsroom (China)' } : snapshot)
    expect(evaluateProductReport({ ...reportInput, pages: { ...result.pages,
      snapshots: { ...result.pages.snapshots, items: officialSnapshots } } }).status).toBe('ready')
    for (const changed of [
      { sourceRegionLabel: 'EU' },
      { productVersionLabel: 'v2' }, { sourceUpdatedAt: '2026-09-01T00:00:00.000Z' },
    ]) {
      const externalPage = result.discovery.candidates.items.find(page => page.url.includes('review.test'))
      const snapshots = result.pages.snapshots.items.map(snapshot => snapshot.status === 'available'
        && snapshot.candidatePageId === externalPage?.candidatePageId ? { ...snapshot, ...changed } : snapshot)
      expect(evaluateProductReport({ ...reportInput, pages: { ...result.pages,
        snapshots: { ...result.pages.snapshots, items: snapshots } } }).status).toBe('ready')
    }
    for (const declaration of [undefined, 'Another Publisher']) {
      const changed = { ...reportInput, pages: { ...result.pages, snapshots: { ...result.pages.snapshots,
        items: result.pages.snapshots.items.map((snapshot) => {
          if (snapshot.status !== 'available') return snapshot
          const updated = { ...snapshot }
          if (declaration === undefined) delete updated.declaredPublisher
          else updated.declaredPublisher = declaration
          return updated
        }) } } }
      const assessment = evaluateProductReport(changed)
      expect(assessment.status).toBe('ready')
      const material = productSynthesisInput(changed)
      expect(material.questions.flatMap(question => question.evidence).length).toBeGreaterThan(0)
      expect(renderProductReport(changed, assessment)).toContain('页面发布方未确定')
    }
    expect(evaluateProductReport({ ...reportInput, plan: { ...plan, sourcePublishers: [] } }).status).toBe('ready')
  })

  it('resumes each complete checkpoint without repeating prior source or model work', async () => {
    let retained: ProductInvestigationCheckpoint | undefined
    const lastCheckpoint = (): ProductInvestigationCheckpoint => {
      if (retained === undefined) throw new Error('No recovery checkpoint was saved')
      return retained
    }
    let interruptAt = 'evidence:1'
    const search = vi.fn(async () => ({ sources: [
      { url: 'https://example.com/features', title: 'Example features' },
      { url: 'https://review.test/example', title: 'Example review' }], truncated: false }))
    const fetch = vi.fn(async (request: { readonly url: string }) => ({ url: request.url, statusCode: 200,
      truncated: false, body: { kind: 'html' as const,
        content: pageHtml('Example supports export. Example costs $10.',
          request.url.includes('review.test') ? 'Review Test' : 'Example Inc') } }))
    const proposeEvidence = vi.fn(async (_page: unknown, _text: string,
      questions: ProductPlan['questions']) => [
      { verbatimExcerpt: 'Example supports export.', sourcedStatement: 'Example supports export.',
        questionIds: [questions[0]!.questionId] },
      { verbatimExcerpt: 'Example costs $10.', sourcedStatement: 'Example costs $10.',
        questionIds: [questions[1]!.questionId] },
    ])
    const reviewEvidence = vi.fn(adapters.reviewEvidence)
    const compareClaim = vi.fn(async (claim: Parameters<ProductInvestigationAdapters['compareClaim']>[0],
      _questionId: Parameters<ProductInvestigationAdapters['compareClaim']>[1],
      candidates: Parameters<ProductInvestigationAdapters['compareClaim']>[2]) => candidates.map(item => ({
      evidenceId: item.evidenceId, relation: item.sourcedStatement === claim.text ? 'supports' as const : 'unrelated' as const,
      rationale: 'The other page states the same fact.' })))
    const resumable: ProductInvestigationAdapters = { ...adapters, web: { search, fetch },
      proposeEvidence, reviewEvidence, compareClaim,
      saveCheckpoint: async (checkpoint) => {
        retained = checkpoint
        if (`${checkpoint.stage}:${checkpoint.nextIndex}` === interruptAt) throw new Error('Simulated restart')
      } }
    const input = { product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }
    await expect(runProductInvestigation(input, resumable)).rejects.toThrow('Simulated restart')
    expect(search).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(proposeEvidence).toHaveBeenCalledTimes(1)
    interruptAt = 'claims:4'
    await expect(runProductInvestigation({ ...input, checkpoint: lastCheckpoint() }, resumable))
      .rejects.toThrow('Simulated restart')
    expect(proposeEvidence).toHaveBeenCalledTimes(2)
    expect(reviewEvidence).toHaveBeenCalledTimes(1)
    interruptAt = 'none'
    const result = await runProductInvestigation({ ...input, checkpoint: lastCheckpoint() }, resumable)
    expect(result.delivery.status).toBe('final')
    expect(search).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(proposeEvidence).toHaveBeenCalledTimes(2)
    expect(reviewEvidence).toHaveBeenCalledTimes(1)
    expect(compareClaim).not.toHaveBeenCalled()
    const fresh = { ...result.pages, snapshots: { ...result.pages.snapshots,
      items: result.pages.snapshots.items.map(snapshot => ({ ...snapshot, observedAt: '2026-11-06T01:00:00Z' })) } }
    const unchanged = reconcileProductSourceRevalidation(lastCheckpoint(), fresh, 1_000)
    expect(unchanged).toMatchObject({ unchanged: true, checkpoint: { stage: 'claims',
      evidence: result.evidence, elapsedMilliseconds: 1_000 } })
    const checked = await runProductInvestigation({ ...input, checkpoint: lastCheckpoint(),
      sourceRevalidation: fresh }, resumable)
    expect(checked.delivery.status).toBe('final')
    expect(reports.at(-1)).toContain('最近复核：')
    expect(proposeEvidence).toHaveBeenCalledTimes(2)
    expect(reviewEvidence).toHaveBeenCalledTimes(1)
    expect(compareClaim).not.toHaveBeenCalled()
    const changed = { ...fresh, snapshots: { ...fresh.snapshots,
      items: fresh.snapshots.items.map((snapshot, index) => index === 0 && snapshot.status === 'available'
        ? { ...snapshot, sourceRegionLabel: 'EU' } : snapshot) } }
    const refreshed = reconcileProductSourceRevalidation(lastCheckpoint(), changed, 1_000)
    expect(refreshed).toMatchObject({ unchanged: false, checkpoint: { stage: 'claims',
      evidence: result.evidence, reviews: result.reviews, claims: result.claims } })
    const failedRevalidation = { ...fresh, snapshots: { ...fresh.snapshots, items: [] } }
    const retainedDecision = reconcileProductSourceRevalidation(lastCheckpoint(), failedRevalidation, 1_000)
    const unconfirmed = await runProductInvestigation({ ...input, checkpoint: retainedDecision.checkpoint,
      sourceRevalidation: failedRevalidation }, resumable)
    expect(unconfirmed.delivery.status).toBe('final')
    expect(reports.at(-1)).toContain('无法重新确认')
    await expect(runProductInvestigation({ ...input,
      checkpoint: { ...lastCheckpoint(), planId: createProductPlanId() } }, resumable))
      .rejects.toThrow(/does not match the approved plan/u)
    await expect(runProductInvestigation({ ...input,
      checkpoint: { ...lastCheckpoint(), elapsedMilliseconds: 21 * 60_000 },
      plan: { ...plan, limits: { maximumElapsedMinutes: 20 } } }, resumable))
      .rejects.toThrow(/time is exhausted/u)
    const rerun = await runProductInvestigation({ ...input, checkpoint: refreshed.checkpoint, sourceRevalidation: changed }, resumable)
    expect(rerun.delivery.status).toBe('final')
    expect(rerun.evidence).toEqual(result.evidence)
    expect(reports.at(-1)).toContain('依据原保存快照')
    expect(proposeEvidence).toHaveBeenCalledTimes(2)
    expect(reviewEvidence).toHaveBeenCalledTimes(1)
  })

  it('resumes a long page at its next fragment and cites offsets in the complete source', async () => {
    const body = `Example supports export.${'x'.repeat(12_500)}Example costs $10.`
    const longPlan: ProductPlan = { ...plan, limits: { maximumPageCharacters: 30_000 } }
    let retained: ProductInvestigationCheckpoint | undefined
    let interrupt = true
    const fetch = vi.fn(async (request: { readonly url: string }) => ({ url: request.url,
      statusCode: 200, truncated: false, body: { kind: 'text' as const, content: body } }))
    const proposeEvidence = vi.fn(async (_page: unknown, text: string,
      questions: ProductPlan['questions']) => text.includes('costs $10')
      ? [{ verbatimExcerpt: 'Example costs $10.', sourcedStatement: 'Example costs $10.',
        questionIds: [questions[1]!.questionId] }]
      : [{ verbatimExcerpt: 'Example supports export.', sourcedStatement: 'Example supports export.',
        questionIds: [questions[0]!.questionId] }])
    const resumable: ProductInvestigationAdapters = { ...adapters,
      web: { ...adapters.web, fetch }, proposeEvidence,
      saveCheckpoint: async (checkpoint) => {
        retained = checkpoint
        if (interrupt && checkpoint.stage === 'evidence' && checkpoint.fragmentIndex === 1) {
          throw new Error('Simulated restart after first fragment')
        }
      } }
    const input = { product, plan: longPlan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }
    await expect(runProductInvestigation(input, resumable)).rejects.toThrow('Simulated restart after first fragment')
    const priceOffset = body.indexOf('Example costs $10.')
    expect(retained).toMatchObject({ schemaVersion: 3, stage: 'evidence', nextIndex: 0, fragmentIndex: 1,
      fragmentOrder: [10_501, 0], evidence: [{ locator: { kind: 'text_range', start: priceOffset, end: body.length } }] })
    if (retained === undefined) throw new Error('Fragment checkpoint was not saved')
    const rankedCheckpoint = retained
    interrupt = false
    const result = await runProductInvestigation({ ...input, checkpoint: rankedCheckpoint }, resumable)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(proposeEvidence).toHaveBeenCalledTimes(2)
    expect(proposeEvidence.mock.calls[1]?.[1]).toBe(body.slice(0, 12_000))
    expect(result.evidence.map(item => item.locator)).toEqual([
      { kind: 'text_range', start: priceOffset, end: body.length },
      { kind: 'text_range', start: 0, end: 24 },
    ])
    expect(result.run.failures).toHaveLength(0)
    await expect(runProductInvestigation({ ...input, checkpoint: { ...rankedCheckpoint, fragmentOrder: [10_502, 0] } }, resumable))
      .rejects.toThrow(/fragment order does not match captured source text/u)
    const { fragmentOrder: _rankedOrder, ...previousCheckpoint } = rankedCheckpoint
    await expect(runProductInvestigation({ ...input, checkpoint: previousCheckpoint }, resumable)).rejects.toThrow(/stage cursor/u)
    const versionTwo = await runProductInvestigation({ ...input,
      checkpoint: { ...previousCheckpoint, schemaVersion: 2, evidence: result.evidence.slice(1) } }, resumable)
    expect(proposeEvidence.mock.calls[2]?.[1]).toBe(body.slice(10_501))
    expect(versionTwo.evidence.map(item => item.locator)).toEqual([...result.evidence].reverse().map(item => item.locator))
    const legacy = await runProductInvestigation({ ...input, plan }, resumable)
    expect(legacy.pages.snapshots.status).toBe('success')
    expect(proposeEvidence).toHaveBeenCalledTimes(4)
    const partial = await runProductInvestigation(input, { ...resumable,
      proposeEvidence: async (page, text, questions) => {
        if (text.includes('costs $10')) throw new Error('Second fragment unavailable')
        return proposeEvidence(page, text, questions)
      } })
    expect(partial.evidence).toHaveLength(1)
    expect(partial.delivery.status).toBe('final')
    expect(partial.run.failures).toMatchObject([{ stage: 'extraction', category: 'unknown' }])
  })

  it('recovers boundary excerpts and avoids duplicate evidence across overlapping windows', async () => {
    const repeated = 'Example supports export.'
    const boundary = 'Example costs $10.'
    const body = `${'a'.repeat(11_000)}${repeated}${'b'.repeat(966)}${boundary}${'c'.repeat(2_000)}`
    const longPlan: ProductPlan = { ...plan, limits: { maximumPageCharacters: 30_000 },
      questions: [{ questionId, text: 'What can it export?' }, { questionId: otherQuestionId, text: 'What does it cost?' }] }
    let retained: ProductInvestigationCheckpoint | undefined
    let interrupt = true
    const proposeEvidence = vi.fn(async (_page: unknown, text: string,
      questions: ProductPlan['questions']) => [
      ...text.includes(repeated) ? [{ verbatimExcerpt: repeated, sourcedStatement: repeated,
        questionIds: [questions[0]!.questionId] }] : [],
      ...text.includes(boundary) ? [{ verbatimExcerpt: boundary, sourcedStatement: boundary,
        questionIds: [questions[1]!.questionId] }] : [],
    ])
    const resumable: ProductInvestigationAdapters = { ...adapters,
      web: { ...adapters.web, fetch: async request => ({ url: request.url, statusCode: 200,
        truncated: false, body: { kind: 'text', content: body } }) }, proposeEvidence,
      saveCheckpoint: async (checkpoint) => {
        retained = checkpoint
        if (interrupt && checkpoint.stage === 'evidence' && checkpoint.fragmentIndex === 1) {
          throw new Error('Simulated restart after first window')
        }
      } }
    const input = { product, plan: longPlan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }
    await expect(runProductInvestigation(input, resumable)).rejects.toThrow('Simulated restart after first window')
    expect(retained).toMatchObject({ schemaVersion: 3, fragmentOverlapCharacters: 1_499, fragmentOrder: [0, 10_501] })
    if (retained === undefined) throw new Error('Fragment checkpoint was not saved')
    const firstCheckpoint = retained
    interrupt = false
    const result = await runProductInvestigation({ ...input, checkpoint: firstCheckpoint }, resumable)
    expect(proposeEvidence).toHaveBeenCalledTimes(2)
    expect(result.evidence.map(item => item.locator)).toEqual([
      { kind: 'text_range', start: 11_000, end: 11_000 + repeated.length },
      { kind: 'text_range', start: 11_990, end: 11_990 + boundary.length },
    ])
    expect(result.run.failures).toHaveLength(0)
    const { fragmentOverlapCharacters: _oldField, fragmentOrder: _rankedOrder, ...legacyCheckpoint } = firstCheckpoint
    proposeEvidence.mockClear()
    await expect(runProductInvestigation({ ...input, checkpoint: legacyCheckpoint }, resumable))
      .rejects.toThrow(/invalid stage cursor/u)
    const legacy = await runProductInvestigation({ ...input,
      checkpoint: { ...legacyCheckpoint, schemaVersion: 1 } }, resumable)
    expect(proposeEvidence).toHaveBeenCalledTimes(1)
    expect(proposeEvidence.mock.calls[0]?.[1]).toBe(body.slice(12_000))
    expect(legacy.evidence).toHaveLength(1)
    await expect(runProductInvestigation({ ...input, checkpoint: {
      ...firstCheckpoint, fragmentOverlapCharacters: 12 } }, resumable)).rejects.toThrow(/invalid stage cursor/u)
    await expect(runProductInvestigation({ ...input, checkpoint: {
      ...firstCheckpoint, schemaVersion: 1 } }, resumable)).rejects.toThrow(/invalid stage cursor/u)
  })

  it('prioritizes questions without excerpts and preserves the order and allowances across source revalidation', async () => {
    const official = 'https://example.com/features'
    const review = 'https://review.test/example'
    const feature = 'Example supports export.'
    const price = 'Example costs $10.'
    const body = `${feature} ${'x'.repeat(48_000 - feature.length - price.length - 2)} ${price}`
    const rankedPlan: ProductPlan = { ...plan, limits: { maximumPageCharacters: 48_000 },
      questions: [{ questionId, text: 'What can it export?' }, { questionId: otherQuestionId, text: 'What does it cost?' }] }
    const proposeEvidence = vi.fn<ProductInvestigationAdapters['proposeEvidence']>(async (_page, text) => [
      ...text.includes(feature) ? [{ verbatimExcerpt: feature, sourcedStatement: feature, questionIds: [questionId] }] : [],
      ...text.includes(price) ? [{ verbatimExcerpt: price, sourcedStatement: price, questionIds: [otherQuestionId] }] : [],
    ])
    let saved: ProductInvestigationCheckpoint | undefined
    const setup: ProductInvestigationAdapters = { ...adapters, proposeEvidence,
      web: { search: async () => ({ sources: [{ url: official }, { url: review }], truncated: false }),
        fetch: async ({ url }) => ({ url, statusCode: 200, truncated: false,
          body: { kind: 'text', content: url === official ? feature : body } }) },
      saveCheckpoint: async (checkpoint) => {
        if (checkpoint.nextIndex === 1 && checkpoint.fragmentIndex === 1) {
          saved = checkpoint
          throw new Error('Interrupted after the first ranked window')
        }
      } }
    const input = { product, plan: rankedPlan, maxResultsPerQuery: 4, extractionMethod: { name: 'review', version: '1' } }
    await expect(runProductInvestigation(input, setup)).rejects.toThrow('Interrupted after the first ranked window')
    if (saved === undefined) throw new Error('Ranked checkpoint was not saved')
    expect(saved.fragmentOrder).toEqual([42_004, 0, 10_501, 21_002, 31_503])
    const fresh = { ...saved.pages, snapshots: { ...saved.pages.snapshots, items: saved.pages.snapshots.items.map((snapshot, index) =>
      index === 0 && snapshot.status === 'available' ? { ...snapshot, sourceRegionLabel: 'EU' } : snapshot) } }
    const reconciled = reconcileProductSourceRevalidation(saved, fresh, 1_000)
    expect(reconciled.checkpoint).toMatchObject({ nextIndex: saved.nextIndex, fragmentIndex: 1, fragmentOrder: saved.fragmentOrder })
    const result = await runProductInvestigation({ ...input, checkpoint: reconciled.checkpoint, sourceRevalidation: fresh },
      { ...setup, saveCheckpoint: async () => {} })
    expect(proposeEvidence.mock.calls.filter(call => call[0].url === review).map(call => [call[4]?.start, call[5]]))
      .toEqual([42_004, 0, 10_501, 21_002, 31_503].map(start => [start, Number.MAX_SAFE_INTEGER]))
    expect(result.evidence.find(item => item.verbatimExcerpt === price))
      .toEqual(saved.evidence.find(item => item.verbatimExcerpt === price))
  })

  it('splits a failed evidence-model window once and keeps successful child evidence', async () => {
    const body = `Example supports export.${'x'.repeat(9_500)}Example costs $10.`
    const calls: { readonly length: number; readonly allowance?: number; readonly start?: number }[] = []
    const proposeEvidence: ProductInvestigationAdapters['proposeEvidence'] = async (
      _page, text, questions, _signal, fragment, allowance) => {
      calls.push({ length: text.length, ...allowance === undefined ? {} : { allowance },
        ...fragment === undefined ? {} : { start: fragment.start } })
      if (text.length > 7_000) throw new SyntaxError('Evidence response was malformed')
      return [
        ...text.includes('Example supports export.')
          ? [{ verbatimExcerpt: 'Example supports export.', sourcedStatement: 'Example supports export.',
            questionIds: [questions[0]!.questionId] }] : [],
        ...text.includes('Example costs $10.')
          ? [{ verbatimExcerpt: 'Example costs $10.', sourcedStatement: 'Example costs $10.',
            questionIds: [questions[1]!.questionId] }] : [],
      ]
    }
    const recovery: ProductInvestigationAdapters = { ...adapters,
      web: { ...adapters.web, fetch: async request => ({ url: request.url, statusCode: 200,
        truncated: false, body: { kind: 'text', content: body } }) },
      proposeEvidence, recoverEvidenceFailure: error => error instanceof SyntaxError }
    const input = { product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }
    const result = await runProductInvestigation(input, recovery)
    expect(calls.map(call => call.allowance)).toEqual([Number.MAX_SAFE_INTEGER,
      Math.ceil(Number.MAX_SAFE_INTEGER / 2), Math.floor(Number.MAX_SAFE_INTEGER / 2)])
    expect(calls[1]?.length).toBeLessThan(calls[0]!.length)
    expect(calls[2]?.length).toBeLessThan(calls[0]!.length)
    expect(calls[2]?.start).toBeGreaterThan(0)
    expect(result.evidence.map(item => item.verbatimExcerpt)).toEqual([
      'Example supports export.', 'Example costs $10.',
    ])
    expect(result.run.failures).toHaveLength(0)
    const partial = await runProductInvestigation(input, { ...recovery,
      proposeEvidence: async (page, text, questions, signal, fragment, allowance) => {
        if (text.length <= 7_000 && text.includes('costs $10')) throw new Error('Recovery child unavailable')
        return proposeEvidence(page, text, questions, signal, fragment, allowance)
      } })
    expect(partial.evidence).toHaveLength(1)
    expect(partial.run.failures[0]?.stage).toBe('extraction')
    expect(partial.run.failures[0]?.message).toContain('recovery 2: Recovery child unavailable')
    expect(partial.delivery.status).toBe('final')
  })

  it('uses one same-window retry without starting a split when the retry output is invalid', async () => {
    const body = `Example supports export.${'x'.repeat(9_500)}`
    const temporary = new Error('Transient model failure')
    const proposeEvidence = vi.fn<ProductInvestigationAdapters['proposeEvidence']>()
      .mockRejectedValueOnce(temporary)
      .mockRejectedValue(new SyntaxError('Invalid evidence output'))
    const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, {
      ...adapters,
      web: { ...adapters.web, fetch: async ({ url }) => ({ url, statusCode: 200,
        truncated: false, body: { kind: 'text', content: body } }) },
      proposeEvidence,
      recoverEvidenceFailure: error => error === temporary ? 'retry' : error instanceof SyntaxError,
    })
    expect(proposeEvidence).toHaveBeenCalledTimes(2)
    expect(proposeEvidence.mock.calls[1]).toEqual(proposeEvidence.mock.calls[0])
    expect(result.evidence).toEqual([])
    expect(result.run.failures).toMatchObject([{ stage: 'extraction', message: 'Fragment 1: Invalid evidence output' }])
  })

  it('counts transient retries and split children against the same page call cap', async () => {
    const temporary = new Error('Transient model failure')
    const seen = new Set<number>()
    const proposeEvidence = vi.fn<ProductInvestigationAdapters['proposeEvidence']>(async (
      _page, _text, _questions, _signal, fragment, _allowance) => {
      if (_text.length === 12_000 && (fragment?.start ?? 0) < 31_503) throw new SyntaxError('Invalid evidence output')
      if (fragment !== undefined && fragment.start >= 31_503 && !seen.has(fragment.start)) {
        seen.add(fragment.start)
        throw temporary
      }
      return []
    })
    const result = await runProductInvestigation({ product, plan: { ...plan, limits: { maximumPageCharacters: 48_000 } },
      maxResultsPerQuery: 4, extractionMethod: { name: 'review', version: '1' } }, {
      ...adapters,
      web: { ...adapters.web, fetch: async ({ url }) => ({ url, statusCode: 200,
        truncated: false, body: { kind: 'text', content: 'x'.repeat(48_000) } }) },
      proposeEvidence,
      recoverEvidenceFailure: error => error === temporary ? 'retry' : error instanceof SyntaxError,
    })
    expect(proposeEvidence).toHaveBeenCalledTimes(12)
    expect(proposeEvidence.mock.calls.slice(-3).map(call => call[4]?.start)).toEqual([31_503, 31_503, 42_004])
    expect(result.run.failures).toMatchObject([{ stage: 'extraction', message: 'Fragment 5: Transient model failure' }])
  })

  it('cancels the evidence retry wait and saves elapsed time without advancing the recovery cursor', async () => {
    const controller = new AbortController()
    const retryScheduled = Promise.withResolvers<undefined>()
    const proposeEvidence = vi.fn<ProductInvestigationAdapters['proposeEvidence']>()
      .mockRejectedValue(new Error('Transient model failure'))
    const checkpoints: ProductInvestigationCheckpoint[] = []
    const run = runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, {
      ...adapters, proposeEvidence,
      saveCheckpoint: async (saved) => { checkpoints.push(saved) },
      recoverEvidenceFailure: () => { retryScheduled.resolve(undefined); return 'retry' },
    }, controller.signal)
    try {
      await retryScheduled.promise
      controller.abort()
      const result = await run
      expect(proposeEvidence).toHaveBeenCalledTimes(1)
      expect(result.run.state).toBe('cancelled')
      expect(result.run.failures).toEqual([])
      expect(checkpoints).toHaveLength(2)
      expect(checkpoints[0]).toMatchObject({ stage: 'pages', nextIndex: 0 })
      const [first, second] = checkpoints
      expect({ ...second, elapsedMilliseconds: first!.elapsedMilliseconds }).toEqual(first)
      expect(second!.elapsedMilliseconds).toBeGreaterThan(first!.elapsedMilliseconds)
    } finally {
      controller.abort()
      await run
    }
  })

  it('retains differing source statements for synthesis without a separate comparison call', async () => {
    const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, {
      ...adapters,
      web: { search: async () => ({ sources: [
        { url: 'https://example.com/features', title: 'Example features' },
        { url: 'https://review.test/example', title: 'Example review' }], truncated: false }),
      fetch: async request => ({ url: request.url, statusCode: 200, truncated: false,
        body: { kind: 'html', content: pageHtml(request.url.includes('review.test')
          ? 'Example supports export. Example costs $20.'
          : 'Example supports export. Example costs $10.',
        request.url.includes('review.test') ? 'Review Test' : 'Example Inc') } }) },
      proposeEvidence: async (_page, text, questions) => [
        { verbatimExcerpt: 'Example supports export.', sourcedStatement: 'Example supports export.',
          questionIds: [questions[0]!.questionId] },
        { verbatimExcerpt: text.includes('$20') ? 'Example costs $20.' : 'Example costs $10.',
          sourcedStatement: text.includes('$20') ? 'Example costs $20.' : 'Example costs $10.',
          questionIds: [questions[1]!.questionId] },
      ],
      compareClaim: async (claim, _questionId, candidates) => candidates.map(item => ({
        evidenceId: item.evidenceId, relation: item.sourcedStatement === claim.text ? 'supports' : 'contradicts',
        rationale: 'The stated prices disagree under the same scope.' })),
    })
    expect(result.assessment.status).toBe('ready')
    expect(result.verifications).toEqual([])
    expect(result.claims.some(claim => claim.text.includes('$10'))).toBe(true)
    expect(result.claims.some(claim => claim.text.includes('$20'))).toBe(true)
    expect(reports.at(-1)).not.toContain('### 跨来源核对')
    for (const relation of ['uncertain', 'contradicts'] as const) {
      const claim = result.claims.find(item => item.questionIds.includes(otherQuestionId))!
      const candidate = result.evidence.find(item => item.questionIds.includes(otherQuestionId)
        && !claim.evidenceLinks.some(link => link.evidenceId === item.evidenceId))!
      const historical = { product, plan, discovery: result.discovery, pages: result.pages,
        evidence: result.evidence, reviews: result.reviews, claims: result.claims,
        verifications: [{ questionId: otherQuestionId, claimId: claim.claimId, complete: true,
          judgments: [{ evidenceId: candidate.evidenceId, relation, rationale: 'Different test conditions.' }] }],
        gaps: result.gaps, failures: result.run.failures, cancelled: false }
      const assessment = evaluateProductReport(historical)
      expect(assessment.status).toBe('ready')
      const material = productSynthesisInput(historical)
      const statements = material.questions.flatMap(question => question.evidence.map(item => item.sourcedStatement))
      expect(statements).toContain('Example costs $10.')
      expect(statements).toContain('Example costs $20.')
      expect(renderProductReport(historical, assessment)).toContain('Different test conditions')
    }

  })

  it('delivers maker-only claims while disclosing missing independent support', async () => {
    const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, {
      ...adapters,
      web: { ...adapters.web, fetch: async () => ({ url: 'https://example.com/features',
        statusCode: 200, truncated: false,
        body: { kind: 'html', content: pageHtml('Example supports export. Example costs $10.', 'Example Inc') } }) },
      proposeEvidence: async (_page, _text, questions) => [
        { verbatimExcerpt: 'Example supports export.', sourcedStatement: 'Example supports export.',
          questionIds: [questions[0]!.questionId] },
        { verbatimExcerpt: 'Example costs $10.', sourcedStatement: 'Example costs $10.',
          questionIds: [questions[1]!.questionId] },
      ],
    })
    expect(result.claims).toHaveLength(2)
    expect(result.assessment.status).toBe('ready')
    expect(result.assessment.reasons.filter(reason => reason.includes('No approved independent publisher'))).toHaveLength(0)
    expect(reports.at(-1)).toContain('缺少符合要求的独立来源佐证')
  })

  it('rejects an unapproved revision before calling providers', async () => {
    await expect(runProductInvestigation({ product, plan: { ...plan, version: 2 }, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, adapters)).rejects.toThrow(/approved plan version/u)
  })

  it('keeps an unsupported statement out of claims and marks its question unanswered', async () => {
    const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } },
    { ...adapters, reviewEvidence: async evidence => evidence.map(item => ({ evidenceId: item.evidenceId,
      verdict: 'unsupported', questionIds: [],
      rationale: 'The excerpt does not establish the broader statement.' })) })
    expect(result.evidence).toHaveLength(1)
    expect(result.claims).toHaveLength(0)
    expect(result.gaps).toHaveLength(2)
    expect(reports.at(-1)).toContain('尚无通过语义审核的来源陈述')
    expect(reports.at(-1)).toContain('The excerpt does not establish the broader statement')
  })

  it('rejects incomplete semantic judgments without admitting any claim', async () => {
    const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } },
    { ...adapters, reviewEvidence: async () => [] })
    expect(result.claims).toHaveLength(0)
    expect(result.run.failures.some(failure => failure.stage === 'analysis'
      && failure.message.includes('Missing or invalid'))).toBe(true)
  })

  it('uses approved gap search after an incomplete semantic review', async () => {
    const scopedPlan = { ...plan, limits: { maximumCandidatePages: 2,
      maximumElapsedMinutes: 10, maximumGapSearches: 1 } }
    const search = vi.fn(async (request: { readonly query: string }) => ({ sources: [{
      url: request.query.includes('site:') ? 'https://review.test/example' : 'https://example.com/features',
      title: 'Example product' }], truncated: false }))
    const result = await runProductInvestigation({ product, plan: scopedPlan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, { ...adapters,
      web: { ...adapters.web, search, fetch: async request => ({ url: request.url,
        statusCode: 200, truncated: false, body: { kind: 'html', content: pageHtml('Example supports export.',
          request.url.includes('review.test') ? 'Review Test' : 'Example Inc') } }) },
      reviewEvidence: async () => [] })
    expect(result.run.failures.some(failure => failure.stage === 'analysis')).toBe(true)
    expect(result.discovery.searches.some(item => item.reason === 'evidence_gap')).toBe(true)
    expect(search).toHaveBeenCalledTimes(3)
    expect(result.delivery.status).toBe('final')
  })

  it('does not search for corroboration when the key page lacks scope metadata', async () => {
    const scopedPlan: ProductPlan = { ...plan, questions: [plan.questions[0]!],
      limits: { maximumCandidatePages: 2, maximumElapsedMinutes: 10, maximumGapSearches: 1 } }
    const search = vi.fn(async (request: { readonly query: string }) => ({ sources: [{
      url: request.query.includes('site:') ? 'https://review.test/example' : 'https://example.com/features',
      title: 'Example product' }], truncated: false }))
    const result = await runProductInvestigation({ product, plan: scopedPlan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }, { ...adapters,
      web: { search, fetch: async request => ({ url: request.url, statusCode: 200, truncated: false,
        body: { kind: 'html', content: request.url.includes('review.test')
          ? pageHtml('Example supports export.', 'Review Test')
          : '<article>Example supports export.</article>' } }) },
      compareClaim: async (_claim, _question, candidates) => candidates.map(item => ({
        evidenceId: item.evidenceId, relation: 'supports', rationale: 'Same product fact.' })) })
    expect(result.discovery.searches.some(item => item.reason === 'corroboration_gap')).toBe(false)
    expect(search).toHaveBeenCalledTimes(1)
    expect(result.delivery.status).toBe('final')
  })

  it('reviews a failed batch in two bounded halves and retains the successful half', async () => {
    const statements = ['Example supports export.', 'Example supports import.',
      'Example costs $10.', 'Example offers a trial.']
    const calls: number[] = []
    const reviewEvidence: ProductInvestigationAdapters['reviewEvidence'] = async (items) => {
      calls.push(items.length)
      return items.length > 2 ? [] : adapters.reviewEvidence(items, plan.questions)
    }
    const reviewed: ProductInvestigationAdapters = { ...adapters,
      web: { ...adapters.web, fetch: async request => ({ url: request.url, statusCode: 200,
        truncated: false, body: { kind: 'text', content: statements.join(' ') } }) },
      proposeEvidence: async (_page, _text, questions) => statements.map((statement, index) => ({
        verbatimExcerpt: statement, sourcedStatement: statement,
        questionIds: [questions[index < 2 ? 0 : 1]!.questionId] })),
      reviewEvidence, recoverReviewFailure: error => error instanceof RangeError,
      compareClaim: async (_claim, _questionId, candidates) => candidates.map(item => ({
        evidenceId: item.evidenceId, relation: 'unrelated', rationale: 'Different product fact.' })) }
    const input = { product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }
    const result = await runProductInvestigation(input, reviewed)
    expect(calls).toEqual([4, 2, 2])
    expect(result.reviews).toHaveLength(4)
    expect(result.claims).toHaveLength(4)
    expect(result.run.failures).toHaveLength(0)
    let attempt = 0
    const partial = await runProductInvestigation(input, { ...reviewed,
      reviewEvidence: async (items, questions) => {
        attempt += 1
        if (attempt === 3) throw new Error('Second review half unavailable')
        return reviewEvidence(items, questions)
      } })
    expect(partial.reviews).toHaveLength(2)
    expect(partial.claims).toHaveLength(2)
    expect(partial.run.failures[0]?.message).toContain('recovery 2: Second review half unavailable')
    expect(partial.delivery.status).toBe('final')
  })

  it('never dispatches cross-source model batches even with many eligible statements', async () => {
    const scopedPlan: ProductPlan = { ...plan, questions: [plan.questions[0]!] }
    const statements = Array.from({ length: 10 }, (_, index) => index === 0
      ? 'Example supports export.' : index === 5 ? 'Example supports export in v1.'
        : `Example feature ${index}.`)
    const input = { product, plan: scopedPlan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }
    const calls: { size: number; batch: number }[] = []
    const compareClaim: ProductInvestigationAdapters['compareClaim'] = async (
      _claim, _questionId, candidates, _evidence, _pages, batchIndex) => {
      calls.push({ size: candidates.length, batch: batchIndex })
      if (candidates.length > 4) throw new RangeError('Comparison output incomplete')
      return candidates.map(item => ({ evidenceId: item.evidenceId,
        relation: item.sourcedStatement.startsWith('Example supports export') ? 'supports' : 'unrelated',
        rationale: 'The other source describes the product feature.' }))
    }
    const setup: ProductInvestigationAdapters = { ...adapters,
      web: { search: async () => ({ sources: [
        { url: 'https://example.com/features', title: 'Example features' },
        { url: 'https://review.test/example', title: 'Example review' }], truncated: false }),
      fetch: async request => ({ url: request.url, statusCode: 200, truncated: false,
        body: { kind: 'html', content: pageHtml(statements.slice(request.url.includes('review.test') ? 5 : 0,
          request.url.includes('review.test') ? 10 : 5).join(' '),
        request.url.includes('review.test') ? 'Review Test' : 'Example Inc') } }) },
      proposeEvidence: async (page, _text, questions) => statements
        .slice(page.url.includes('review.test') ? 5 : 0, page.url.includes('review.test') ? 10 : 5)
        .map(statement => ({ verbatimExcerpt: statement, sourcedStatement: statement,
          questionIds: [questions[0]!.questionId] })),
      compareClaim, recoverComparisonFailure: error => error instanceof RangeError }
    const recovered = await runProductInvestigation(input, setup)
    expect(calls).toEqual([])
    expect(recovered.verifications).toEqual([])
    expect(recovered.claims).toHaveLength(10)
    expect(recovered.run.failures).toHaveLength(0)
    expect(recovered.delivery.status).toBe('final')
  })

  it('rejects a review linked to a question outside the approved plan', async () => {
    const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } },
    { ...adapters, reviewEvidence: async evidence => evidence.map(item => ({ evidenceId: item.evidenceId,
      verdict: 'supported', questionIds: [createProductQuestionId()],
      rationale: 'The excerpt supports a different question.' })) })
    expect(result.claims).toHaveLength(0)
    expect(result.gaps).toHaveLength(2)
    expect(result.run.failures.some(failure => failure.stage === 'analysis')).toBe(true)
  })

  it('searches an unanswered question once within the approved allowance and resumes its new page', async () => {
    const boundedPlan: ProductPlan = { ...plan,
      limits: { maximumCandidatePages: 2, maximumElapsedMinutes: 10, maximumGapSearches: 1 } }
    const input = { product, plan: boundedPlan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }
    const search = vi.fn(async (request: { readonly query: string }) => ({ sources: [request.query.includes('site:')
      ? { url: 'https://review.test/example', title: 'Example price review' }
      : { url: 'https://example.com/features', title: 'Example features' }], truncated: false }))
    const fetch = vi.fn(async (request: { readonly url: string }) => ({ url: request.url,
      statusCode: 200, truncated: false, body: { kind: 'html' as const,
        content: request.url.includes('review.test')
          ? pageHtml('Example costs $10.', 'Review Test')
          : pageHtml('Example supports export.', 'Example Inc') } }))
    let saved: ProductInvestigationCheckpoint | undefined
    const setup: ProductInvestigationAdapters = { ...adapters, web: { search, fetch },
      proposeEvidence: async (_page, text, questions) => text.includes('costs $10')
        ? [{ verbatimExcerpt: 'Example costs $10.', sourcedStatement: 'Example costs $10.',
          questionIds: [questions.find(question => question.questionId === otherQuestionId)!.questionId] }]
        : [{ verbatimExcerpt: 'Example supports export.', sourcedStatement: 'Example supports export.',
          questionIds: [questions.find(question => question.questionId === questionId)!.questionId] }],
      saveCheckpoint: async (checkpoint) => {
        saved = checkpoint
        if (checkpoint.stage === 'evidence' && checkpoint.nextIndex === 1
          && checkpoint.discovery.searches.length === 3) throw new Error('Restart after gap search')
      } }
    await expect(runProductInvestigation(input, setup)).rejects.toThrow('Restart after gap search')
    expect(search).toHaveBeenCalledTimes(3)
    expect(search.mock.calls[2]?.[0].query).toContain('site:review.test')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(saved).toMatchObject({ stage: 'evidence', nextIndex: 1,
      discovery: { searches: [{}, {}, { reason: 'evidence_gap' }] },
      evidence: [{}], reviews: [{}], claims: [{}] })
    if (saved === undefined) throw new Error('Gap checkpoint was not saved')
    const resumed = await runProductInvestigation({ ...input, checkpoint: saved }, {
      ...setup, saveCheckpoint: async () => {} })
    expect(search).toHaveBeenCalledTimes(3)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(resumed.discovery.candidates.items).toHaveLength(2)
    expect(resumed.discovery.searches.filter(search => search.reason === 'corroboration_gap')).toHaveLength(0)
    expect(resumed.evidence).toHaveLength(2)
    expect(resumed.claims).toHaveLength(2)
    expect(resumed.gaps).toHaveLength(0)
    expect(resumed.delivery.status).toBe('final')
    expect(reports.at(-1)).toContain('针对资料缺口补充搜索')

    const oldPlan = { ...boundedPlan,
      limits: { maximumCandidatePages: 2, maximumElapsedMinutes: 10 } }
    const old = await runProductInvestigation({ ...input, plan: oldPlan }, {
      ...setup, saveCheckpoint: async () => {} })
    expect(old.discovery.searches).toHaveLength(2)
    expect(old.gaps).toHaveLength(1)

    const empty = await runProductInvestigation(input, { ...setup,
      web: { ...setup.web, search: request => request.query.includes('site:')
        ? Promise.resolve({ sources: [], truncated: false }) : search(request) },
      saveCheckpoint: async () => {} })
    expect(empty.discovery.searches).toHaveLength(3)
    expect(empty.discovery.searches[2]).toMatchObject({ reason: 'evidence_gap', recordedCount: 0 })
  })

  it('uses a saved-page gap read after a gap search brings in the first readable page', async () => {
    const scoped: ProductPlan = { ...plan,
      questions: [{ questionId, text: 'Example supports export?' }, plan.questions[1]!],
      limits: { maximumCandidatePages: 2, maximumGapSearches: 1, maximumGapReads: 1 } }
    const checkpoints: ProductInvestigationCheckpoint[] = []
    let calls = 0
    const proposeEvidence = vi.fn<ProductInvestigationAdapters['proposeEvidence']>(async (_page, _text, questions) =>
      ++calls === 1 ? [] : [{ verbatimExcerpt: 'Example supports export.',
        sourcedStatement: 'Example supports export.', questionIds: [questions[0]!.questionId] }])
    const result = await runProductInvestigation({ product, plan: scoped, maxResultsPerQuery: 2,
      extractionMethod: { name: 'review', version: '1' } }, { ...adapters,
      web: { search: async ({ query }) => ({ sources: query.includes('site:')
        ? [{ url: 'https://example.com/features', title: 'Example features' }]
        : [{ url: 'https://unrelated.test/article' }], truncated: false }),
      fetch: async () => ({ url: 'https://example.com/features', statusCode: 200, truncated: false,
        body: { kind: 'html', content: pageHtml('Example supports export.', 'Example Inc') } }) },
      proposeEvidence, saveCheckpoint: async (checkpoint) => { checkpoints.push(checkpoint) } })
    expect(result.discovery.searches.filter(search => search.reason === 'evidence_gap')).toHaveLength(1)
    expect(proposeEvidence).toHaveBeenCalledTimes(2)
    expect(result.evidence).toHaveLength(1)
    expect(checkpoints.find(checkpoint => checkpoint.pages.snapshots.items.length === 0)?.gapReadCompleted)
      .toBeUndefined()
    expect(checkpoints.at(-1)?.gapReadCompleted).toBe(true)
  })

  it('resumes the new gap evidence at review without reopening the saved page for extraction', async () => {
    const boundedPlan: ProductPlan = { ...plan,
      limits: { maximumCandidatePages: 1, maximumGapReads: 1, maximumElapsedMinutes: 10 } }
    const input = { product, plan: boundedPlan, maxResultsPerQuery: 4, extractionMethod: { name: 'review', version: '1' } }
    const content = `Example supports export. ${'General information. '.repeat(200)}Example costs $10.`
    const proposeEvidence = vi.fn<ProductInvestigationAdapters['proposeEvidence']>(async (_page, _text, questions) =>
      questions[0]?.questionId === otherQuestionId
        ? [{ verbatimExcerpt: 'Example costs $10.', sourcedStatement: 'Example costs $10.', questionIds: [otherQuestionId] }]
        : [{ verbatimExcerpt: 'Example supports export.', sourcedStatement: 'Example supports export.', questionIds: [questionId] }])
    const reviewEvidence = vi.fn(adapters.reviewEvidence)
    let saved: ProductInvestigationCheckpoint | undefined
    const setup: ProductInvestigationAdapters = { ...adapters, proposeEvidence, reviewEvidence,
      web: { ...adapters.web, fetch: async request => ({ url: request.url, statusCode: 200, truncated: false,
        body: { kind: 'html', content: pageHtml(content, 'Example Inc') } }) },
      saveCheckpoint: async (checkpoint) => {
        if (checkpoint.gapReadCompleted) {
          saved = checkpoint
          throw new Error('Restart after gap read')
        }
      } }
    await expect(runProductInvestigation(input, setup)).rejects.toThrow('Restart after gap read')
    expect(saved).toMatchObject({ stage: 'claims', nextIndex: 1, gapReadCompleted: true, evidence: [
      { questionIds: [questionId] }, { questionIds: [otherQuestionId],
        locator: { kind: 'text_range', start: content.indexOf('Example costs $10.') } },
    ], reviews: [{ questionIds: [questionId] }] })
    if (saved === undefined) throw new Error('Gap read checkpoint was not saved')
    const result = await runProductInvestigation({ ...input, checkpoint: saved }, { ...setup, saveCheckpoint: async () => {} })
    expect(proposeEvidence).toHaveBeenCalledTimes(2)
    expect(reviewEvidence.mock.calls.map(([items]) => items.map(item => item.questionIds)))
      .toEqual([[[questionId]], [[otherQuestionId]]])
    expect(result.gaps).toHaveLength(0)

    const temporary = new Error('Gap extraction timed out')
    const failGapRead = vi.fn<ProductInvestigationAdapters['proposeEvidence']>(async (...args) => {
      if (args[2][0]?.questionId === otherQuestionId) throw temporary
      return proposeEvidence(...args)
    })
    const exhausted = await runProductInvestigation(input, { ...setup, proposeEvidence: failGapRead,
      saveCheckpoint: async () => {}, recoverEvidenceFailure: error => error === temporary ? 'retry' : false })
    expect(failGapRead).toHaveBeenCalledTimes(2)
    expect(exhausted.gaps.map(gap => gap.questionId)).toEqual([otherQuestionId])
    expect(exhausted.run.failures).toMatchObject([{ stage: 'extraction',
      message: 'Targeted extraction from a saved source did not complete.' }])
  })

  it('resumes legacy verification checkpoints without further comparisons or corroboration searches', async () => {
    const boundedPlan: ProductPlan = { ...plan,
      limits: { maximumCandidatePages: 3, maximumElapsedMinutes: 10, maximumGapSearches: 1 } }
    const input = { product, plan: boundedPlan, maxResultsPerQuery: 4, extractionMethod: { name: 'review', version: '1' } }
    const search = vi.fn(async (request: { readonly query: string }) => ({ sources: [request.query.includes('site:')
      ? { url: 'https://review.test/features', title: 'Example review' }
      : { url: 'https://example.com/features', title: 'Example features' }], truncated: false }))
    const reviewEvidence = vi.fn(adapters.reviewEvidence)
    const compareClaim = vi.fn<ProductInvestigationAdapters['compareClaim']>(async (_claim, _questionId, candidates) =>
      candidates.map(item => ({ evidenceId: item.evidenceId, relation: 'supports', rationale: 'Same source statement.' })))
    let saved: ProductInvestigationCheckpoint | undefined
    const setup: ProductInvestigationAdapters = { ...adapters, reviewEvidence, compareClaim,
      web: { search, fetch: async request => ({ url: request.url, statusCode: 200, truncated: false,
        body: { kind: 'html', content: request.url.includes('review.test')
          ? pageHtml('Example supports export.', 'Review Test')
          : pageHtml('Example supports export. Example costs $10.', 'Example Inc') } }) },
      proposeEvidence: async (_page, text) => [
        { verbatimExcerpt: 'Example supports export.', sourcedStatement: 'Example supports export.', questionIds: [questionId] },
        { verbatimExcerpt: 'Example costs $10.', sourcedStatement: 'Example costs $10.', questionIds: [otherQuestionId] },
      ].filter(item => text.includes(item.verbatimExcerpt)),
      saveCheckpoint: async (checkpoint) => { saved = checkpoint } }
    const first = await runProductInvestigation(input, setup)
    expect(saved?.stage).toBe('claims')
    if (!saved) throw new Error('No checkpoint')
    // A legacy run may already have saved one settled verification before upgrading.
    const legacy: ProductInvestigationCheckpoint = { ...saved, stage: 'verification', nextIndex: 1,
      verifications: [{ questionId, claimId: first.claims[0]!.claimId, complete: true, judgments: [] }] }
    const result = await runProductInvestigation({ ...input, checkpoint: legacy }, setup)
    expect(search).toHaveBeenCalledTimes(2)
    expect(reviewEvidence).toHaveBeenCalledTimes(1)
    expect(compareClaim).not.toHaveBeenCalled()
    expect(result.discovery.searches.some(item => item.reason === 'corroboration_gap')).toBe(false)
    expect(result.verifications).toEqual(legacy.verifications)
    expect(result.delivery.status).toBe('final')
  })

  it('blocks delivery but keeps evidence when report storage fails', async () => {
    const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } },
    { ...adapters, saveReport: async () => { throw new Error('Storage unavailable') } })
    expect(result.evidence).toHaveLength(1)
    expect(result.delivery.status).toBe('blocked')
    expect(result.run.failures).toMatchObject([{ stage: 'report', message: 'Storage unavailable' }])
  })

  it('stops at the approved elapsed-time limit', async () => {
    const boundedPlan = { ...plan, limits: { maximumElapsedMinutes: 0.00002 } }
    const result = await runProductInvestigation({ product, plan: boundedPlan, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } },
    { ...adapters, web: { ...adapters.web, fetch: async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
      return { url: 'https://example.com/features', statusCode: 200,
        truncated: false, body: { kind: 'text', content: 'Example supports export.' } }
    } } })
    expect(result.run.state).toBe('failed')
    expect(result.run.failures).toMatchObject([{ category: 'timeout' }])
  })
})

describe('product plan approval handoff', () => {
  const payload = { schemaVersion: 1, product: { name: 'Example', developer: 'Example Inc',
    officialUrl: 'https://example.com' }, scope: 'Current features',
  questions: ['What does it do?', 'What does it cost?'],
  limits: { maximumCandidatePages: 4, maximumElapsedMinutes: 10 } }
  const markdown = (value: object) => `# 产品调查计划\n\n\`\`\`product-insight-plan-json\n${JSON.stringify(value)}\n\`\`\``

  it('reads only explicit approval from durable native and PTC tool results', () => {
    const call = (id: string, plan: string) => ({ type: 'tool/call', time: 1,
      data: { name: 'exit_plan_mode', callId: id, arguments: JSON.stringify({ plan }) } })
    const result = (id: string, approved: boolean, time: number) => ({ type: 'tool/result', time,
      data: { message: { toolCallId: id, isError: false }, meta: { approved } } })
    const events = [call('first', markdown(payload)), result('first', false, 2),
      call('second', markdown(payload)), result('second', true, 3),
      { type: 'tool/ptc-dispatch', time: 4, data: { name: 'exit_plan_mode', subCallId: 'ptc-third',
        arguments: { plan: markdown(payload) }, isError: false, meta: { approved: true } } }] as SessionEvent[]
    expect(latestApprovedProductPlan(events.slice(0, 2))).toBeUndefined()
    expect(latestApprovedProductPlan(events.slice(0, 4))).toMatchObject({ identity: 'second',
      reviewedAt: '1970-01-01T00:00:00.003Z' })
    expect(latestApprovedProductPlan(events)).toMatchObject({ identity: 'ptc-third',
      reviewedAt: '1970-01-01T00:00:00.004Z' })
  })

  it('starts the bounded investigation from the approved Session event', async () => {
    const approvedPlan = markdown(payload)
    const events = [
      { type: 'tool/call', time: 1, data: { name: 'exit_plan_mode', callId: 'approved-call',
        arguments: JSON.stringify({ plan: approvedPlan }) } },
      { type: 'tool/result', time: 2, data: { message: { toolCallId: 'approved-call', isError: false },
        meta: { approved: true } } },
    ] as SessionEvent[]
    const input = { sessionId: 'session-1', events, maxResultsPerQuery: 4,
      extractionMethod: { name: 'review', version: '1' } }
    const search = vi.fn((...args: Parameters<typeof adapters.web.search>) => adapters.web.search(...args))
    const adapted: ProductInvestigationAdapters = { ...adapters, web: { ...adapters.web, search },
      proposeEvidence: async (_page, _text, questions) => [{ verbatimExcerpt: 'Example supports export.',
        sourcedStatement: 'Example supports export.',
        questionIds: [questions[0]!.questionId] }] }
    await expect(runApprovedProductInvestigation({ ...input, events: events.slice(0, 1) }, adapted))
      .rejects.toThrow(/explicit plan approval/u)
    expect(search).not.toHaveBeenCalled()
    const result = await runApprovedProductInvestigation(input, adapted)
    expect(search).toHaveBeenCalled()
    expect(result.delivery.status).toBe('final')
    expect(result.evidence).toHaveLength(1)
  })

  it('rebuilds stable identities only from an explicitly reviewed plan', () => {
    const input = { sessionId: 'session-1', identity: 'tool-call-1', markdown: markdown(payload),
      reviewedAt: '2026-11-06T00:00:00Z' }
    const first = productPlanFromApproval(input)
    const replayed = productPlanFromApproval(input)
    expect(first).toEqual(replayed)
    expect(first.plan.approval).toMatchObject({ status: 'approved', approvedPlanVersion: 1 })
    expect(first.plan.questions).toHaveLength(2)
    expect(first.plan.limits?.maximumPageCharacters).toBeUndefined()
    expect(first.plan.limits?.maximumGapSearches).toBeUndefined()
    expect(productPlanFromApproval({ ...input, markdown: markdown({ ...payload,
      limits: { ...payload.limits, maximumPageCharacters: 48_000 } }) }).plan.limits?.maximumPageCharacters)
      .toBe(48_000)
    expect(productPlanFromApproval({ ...input, markdown: markdown({ ...payload,
      limits: { ...payload.limits, maximumGapSearches: 2 } }) }).plan.limits?.maximumGapSearches)
      .toBe(2)
    expect(first.plan.planId).not.toBe(productPlanFromApproval({ ...input, identity: 'tool-call-2' }).plan.planId)
  })

  it('rejects missing, duplicate or malformed structured blocks', () => {
    expect(() => parseProductPlanMarkdown('# No executable plan')).toThrow(/exactly one/u)
    expect(() => parseProductPlanMarkdown(`${markdown(payload)}\n${markdown(payload)}`)).toThrow(/exactly one/u)
    expect(() => parseProductPlanMarkdown(markdown({ ...payload, extra: true }))).toThrow(/unsupported/u)
    expect(() => parseProductPlanMarkdown(markdown({ ...payload,
      product: { ...payload.product, officialUrl: 'file:///secret' } }))).toThrow(/HTTP/u)
    expect(() => parseProductPlanMarkdown(markdown({ ...payload,
      questions: ['Same?', 'Same?'] }))).toThrow(/distinct/u)
    expect(() => parseProductPlanMarkdown(markdown({ ...payload,
      questions: ['Only one?'] }))).toThrow(/two to five/u)
    expect(() => parseProductPlanMarkdown(markdown({ ...payload, limits: undefined }))).toThrow(/limits/u)
    expect(() => parseProductPlanMarkdown(markdown({ ...payload,
      limits: { maximumCandidatePages: 31, maximumElapsedMinutes: 10 } }))).toThrow(/at most 30/u)
    expect(() => parseProductPlanMarkdown(markdown({ ...payload,
      limits: { ...payload.limits, maximumPageCharacters: -1 } }))).toThrow(/positive/u)
    expect(() => parseProductPlanMarkdown(markdown({ ...payload,
      limits: { ...payload.limits, maximumGapSearches: 3 } }))).toThrow(/approved questions/u)
    expect(() => parseProductPlanMarkdown(markdown({ ...payload,
      sourcePublishers: [{ name: 'Mirror', domain: 'docs.example.com' }] }))).toThrow(/overlaps product\.officialUrl/u)
    expect(() => parseProductPlanMarkdown(markdown({ ...payload,
      sourcePublishers: [{ name: 'Mirror', domain: 'example.com' }] }))).toThrow(/overlaps product\.officialUrl/u)
    expect(() => parseProductPlanMarkdown(markdown({ ...payload,
      product: { ...payload.product, officialUrl: 'https://docs.example.com/' },
      sourcePublishers: [{ name: 'Mirror', domain: 'example.com' }] }))).toThrow(/overlaps product\.officialUrl/u)
    expect(() => parseProductPlanMarkdown(markdown({ ...payload,
      sourcePublishers: [{ name: 'Review Test', domain: 'review.test' },
        { name: 'Subreview', domain: 'sub.review.test' }] }))).toThrow(/distinct domains and names/u)
    expect(() => parseProductPlanMarkdown(markdown({ ...payload,
      sourceCriteria: { minimumSourceDate: '2026-02-30' } }))).toThrow(/valid YYYY-MM-DD/u)
  })

  it('checks product plans before review and removes the guard on disposal', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      const review = vi.fn(() => Promise.resolve([{ type: 'text' as const, text: 'review reached' }]))
      ctx.tools.register(defineContentToolFixture({ name: 'exit_plan_mode', description: 'Review fixture',
        parameters: { plan: { type: 'string', required: true } }, execute: review }))
      const validation = await ctx.plugin(await import('../src/index.ts'))
      expect(ctx.tools.get('run_product_investigation')).toBeDefined()
      expect(ctx.tools.get('get_product_investigation')).toBeDefined()
      const call = (plan: string) => ctx.tools.execute({ callId: ToolCallId('review'), name: 'exit_plan_mode',
        arguments: { plan }, signal: new AbortController().signal })
      const rejected = await call(markdown({ ...payload, limits: {} }))
      expect(rejected.isError).toBe(true)
      expect(rejected.content[0]).toHaveProperty('text', expect.stringContaining('maximumCandidatePages'))
      expect((await call('# No executable plan')).isError).toBe(true)
      expect(review).not.toHaveBeenCalled()
      expect((await call(markdown(payload))).isError).not.toBe(true)
      expect(review).toHaveBeenCalledTimes(1)
      await validation.dispose()
      expect(ctx.tools.get('run_product_investigation')).toBeUndefined()
      expect(ctx.tools.get('get_product_investigation')).toBeUndefined()
      expect((await call(markdown({ ...payload, limits: {} }))).isError).not.toBe(true)
      expect(review).toHaveBeenCalledTimes(2)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

describe('durable product background state', () => {
  it('marks an unclosed task interrupted only when its live job is absent', () => {
    const state = { planId: String(plan.planId), jobId: 'product-insight-1', state: 'running' as const,
      startedAt: '2026-11-06T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z',
      reportRef: null, deliveryStatus: null, error: null }
    const events = [{ type: 'product/background-run-v1', data: state }] as SessionEvent[]
    expect(latestProductBackgroundRun(events, String(plan.planId), () => true)?.state).toBe('running')
    expect(latestProductBackgroundRun(events, String(plan.planId), () => false)?.state).toBe('interrupted')
    expect(latestProductBackgroundRun(events, 'another-plan', () => false)).toBeUndefined()
  })
})


it('reads the complete cleaned source and keeps more than eight excerpts and two synthesis references', async () => {
  const facts = Array.from({ length: 12 }, (_, index) => `Example supports feature ${index}.`)
  const body = facts.join(' ') + ' More context.'.repeat(8_000)
  const proposeEvidence = vi.fn(async (_page: unknown, text: string) => {
    expect(text).toBe(body)
    return facts.map(text => ({ verbatimExcerpt: text, sourcedStatement: text, questionIds: [questionId] }))
  })
  const synthesizeReport = vi.fn(async (input: import('../src/report.ts').ProductSynthesisInput) => {
    expect(input.questions[0]?.evidence).toHaveLength(12)
    return new Map(input.questions.map(question => [question.questionId, '完整解释功能与使用条件。']))
  })
  const result = await runProductInvestigation({ product, plan, maxResultsPerQuery: 60,
    extractionMethod: { name: 'model', version: '1' } }, { ...adapters, proposeEvidence, synthesizeReport,
    web: { ...adapters.web, fetch: async ({ url }) => ({ url, statusCode: 200, truncated: false,
      body: { kind: 'html', content: pageHtml(body, product.developer) } }) } })
  expect(proposeEvidence).toHaveBeenCalledTimes(1)
  expect(result.evidence).toHaveLength(12)
  expect(synthesizeReport).toHaveBeenCalledTimes(1)
})

it('accepts long complete evidence and reserves model response capacity', () => {
  const drafts = Array.from({ length: 12 }, () => ({ verbatimExcerpt: '原文'.repeat(1000),
    sourcedStatement: '说明'.repeat(400), questionIds: [questionId] }))
  expect(parseDrafts(JSON.stringify(drafts))).toHaveLength(12)
  expect(fitsProductModelInput('Instructions', 'Source', 32_000, 8_000)).toBe(true)
  expect(fitsProductModelInput('Instructions', 'Source', 8_000, 8_000)).toBe(false)
})
