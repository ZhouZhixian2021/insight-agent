import { describe, expect, it, vi } from 'vitest'
import type { ProductSynthesisInput } from '../src/report.ts'
import { createProductEvidenceId } from '@deepseek-ai/dsh-product-insight-model'
import { inspectProductSynthesis, repairProductSynthesis, synthesisAliases, synthesisRequest,
  type SynthesisResponse } from '../src/synthesis-output.ts'

const first = createProductEvidenceId(), second = createProductEvidenceId()
const input: ProductSynthesisInput = { scope: '产品能力', questions: [
  { questionId: 'features', question: '功能是什么？', evidence: [{ evidenceId: first,
    sourcedStatement: '支持离线部署。', verbatimExcerpt: 'Offline deployment is supported.' }] },
  { questionId: 'price', question: '价格是多少？', evidence: [{ evidenceId: second,
    sourcedStatement: '每月十元。', verbatimExcerpt: 'Ten yuan per month.' }] },
] }
const feature = { questionId: 'features', status: 'answered', text: '支持离线部署。[[cite:E1]]' }
const price = { questionId: 'price', status: 'answered', text: '每月十元。[[cite:E2]]' }
const response = (entries: unknown[]): SynthesisResponse => ({ text: JSON.stringify(entries), error: null })

describe('independent synthesis validation and repair', () => {
  it('normalizes wrappers, extra fields, stale reference lists, spacing and unique short IDs', () => {
    const text = `Explanation\n\`\`\`json\n${JSON.stringify([
      { ...feature, text: `支持离线部署。[[ cite: ${String(first).slice(0, 8)} ]`, evidenceIds: ['wrong', 'wrong'], extra: true },
      { ...price, text: '每月十元，网址 www.example.com 是产品内容。[[cite:E2]]' },
    ])}\n\`\`\``
    const result = inspectProductSynthesis(text, input)
    expect(result.issues).toEqual([])
    expect(result.answers.get('features')).toBe(`支持离线部署。[[cite:${first}]]`)
    expect(result.answers.get('price')).toContain('www.example.com')
  })

  it('derives references from inline markers and ignores extra unapproved answers', () => {
    const result = inspectProductSynthesis(JSON.stringify([
      { ...feature, evidenceIds: ['invented'] }, feature, price,
      { questionId: 'other', text: '额外问题' },
    ]), input)
    expect(result.answers.size).toBe(2)
    expect(result.issues).toEqual([])
    expect(result.notes).toContain('Ignored an entry without an approved question identity.')
  })

  it('does not guess ambiguous identity prefixes or accept uncited factual answers', () => {
    const alias = synthesisAliases(input)
    const result = inspectProductSynthesis(JSON.stringify([
      { ...feature, text: '支持。[[cite:invented]]' }, { ...price, text: '每月十元。' },
    ]), input, alias)
    expect(result.answers.size).toBe(0)
    expect(result.issues[0]?.reasons.join(' ')).toContain('Unknown or ambiguous')
    expect(result.issues[1]?.reasons.join(' ')).toContain('no valid inline citations')
  })

  it('retains complete objects before a truncated tail without constructing unfinished text', () => {
    const result = inspectProductSynthesis(`[${JSON.stringify(feature)}, {"questionId":"price","text":"每月`, input)
    expect(result.answers.get('features')).toContain(String(first))
    expect(result.issues.map(issue => issue.questionId)).toEqual(['price'])
    const missingBracket = inspectProductSynthesis(`[${JSON.stringify(feature)}`, input)
    expect(missingBracket.answers.has('features')).toBe(true)
    expect(inspectProductSynthesis(`${JSON.stringify([feature])}\n${JSON.stringify([price])}`, input).answers.size).toBe(0)
  })

  it('flags conflicting duplicates and malformed citations only on the affected question', () => {
    const result = inspectProductSynthesis(JSON.stringify([feature, { ...feature, text: '有条件支持。[[cite:E1]]' }, price]), input)
    expect(result.answers.has('price')).toBe(true)
    expect(result.issues[0]?.reasons).toContain('Different answers were returned for the same question.')
    expect(inspectProductSynthesis(JSON.stringify([{ ...feature, text: '支持。[[cite:E1' }, price]), input)
      .issues[0]?.reasons).toContain('A citation marker is incomplete or malformed.')
  })

  it('permits a naturally worded explicit evidence gap, without presenting it as a verified answer', () => {
    const result = inspectProductSynthesis(JSON.stringify([feature,
      { questionId: 'price', status: 'insufficient', text: '现有材料没有配置加价表，无法计算总价。' }]), input)
    expect(result.issues).toEqual([])
    expect(result.answers.get('price')).toBe('资料不足：现有材料没有配置加价表，无法计算总价。')
  })

  it('repairs only the invalid question, carrying its draft, diagnostics and stable aliases', async () => {
    const bad = { ...price, text: '每月十元。[[cite:missing]]' }
    const invoke = vi.fn(async (user: string, ordinal: 1 | 2): Promise<SynthesisResponse> => {
      if (ordinal === 1) return response([feature, bad])
      const request = JSON.parse(user) as { questions: { questionId: string; evidence: { evidenceId: string }[] }[]
        correction: { drafts: unknown[]; reasons: string[] } }
      expect(request.questions.map((question: { questionId: string }) => question.questionId)).toEqual(['price'])
      expect(request.questions[0]?.evidence[0]?.evidenceId).toBe('E2')
      expect(request.correction.drafts).toEqual([bad])
      expect(request.correction.reasons.join(' ')).toContain('missing')
      return response([price])
    })
    const result = await repairProductSynthesis(input, invoke)
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(result.get('features')).toBe(`支持离线部署。[[cite:${first}]]`)
    expect(result.get('price')).toBe(`每月十元。[[cite:${second}]]`)
  })

  it('does not call the model again when programmatic normalization is sufficient', async () => {
    const invoke = vi.fn(async () => response([{ ...feature, evidenceIds: ['wrong'] }, price]))
    expect((await repairProductSynthesis(input, invoke)).size).toBe(2)
    expect(invoke).toHaveBeenCalledOnce()
  })

  it.each(['output_limit', 'request_failed'] as const)('preserves usable partial output after %s and only repairs missing answers', async (error) => {
    const invoke = vi.fn(async (_user: string, ordinal: 1 | 2): Promise<SynthesisResponse> => ordinal === 1
      ? { text: `[${JSON.stringify(feature)},`, error, ...(error === 'request_failed' ? { failureCode: 'TIMEOUT' as const } : {}) }
      : response([price]))
    const result = await repairProductSynthesis(input, invoke)
    expect(result.size).toBe(2)
    const request = JSON.parse(invoke.mock.calls[1]?.[0] ?? '{}') as { questions: unknown[] }
    expect(request.questions).toHaveLength(1)
  })

  it('keeps successful siblings after a repair request fails, without claiming evidence is absent', async () => {
    const invoke = vi.fn(async (_user: string, ordinal: 1 | 2): Promise<SynthesisResponse> => ordinal === 1
      ? response([feature]) : { text: '', error: 'request_failed', failureCode: 'TRANSPORT' })
    const result = await repairProductSynthesis(input, invoke)
    expect(result.get('features')).toContain(String(first))
    expect(result.get('price')).toContain('生成请求失败')
    expect(result.get('price')).toContain('不表示没有相关资料')
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('retries an empty transport failure once as a request rather than one retry per question', async () => {
    const invoke = vi.fn(async (): Promise<SynthesisResponse> => ({ text: '', error: 'request_failed', failureCode: 'TIMEOUT' }))
    const result = await repairProductSynthesis(input, invoke)
    expect(invoke).toHaveBeenCalledTimes(2)
    expect([...result.values()].every(text => text.includes('请求失败'))).toBe(true)
  })

  it('rejects ambiguous prefixes while retaining an independently valid question', () => {
    const collision = (String(first).slice(0, 8) + String(second).slice(8)) as typeof second
    const base = input.questions[0]!
    const material = { ...input, questions: [{ ...base, evidence: [...base.evidence,
      { evidenceId: collision, sourcedStatement: '另一条材料', verbatimExcerpt: 'Other material' }] }, ...input.questions.slice(1)] }
    const result = inspectProductSynthesis(JSON.stringify([
      { ...feature, text: `支持。[[cite:${String(first).slice(0, 8)}]]` },
      { ...price, text: `每月十元。[[cite:${second}]]` },
    ]), material)
    expect(result.answers.has('features')).toBe(false)
    expect(result.answers.has('price')).toBe(true)
  })

  it('never retries cancellation and never loses short-ID mappings when a question is repaired alone', async () => {
    const controller = new AbortController()
    const invoke = vi.fn(async () => { controller.abort(); return response([feature]) })
    await expect(repairProductSynthesis(input, invoke, controller.signal)).rejects.toThrow()
    expect(invoke).toHaveBeenCalledOnce()
    const user = synthesisRequest({ ...input, questions: input.questions.slice(1) }, synthesisAliases(input))
    const request = JSON.parse(user) as { questions: { evidence: { evidenceId: string }[] }[] }
    expect(request.questions[0]?.evidence[0]?.evidenceId).toBe('E2')
  })
})
