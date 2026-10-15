import { describe, expect, it, vi } from 'vitest'
import { EvidenceError } from '@deepseek-ai/dsh-academic-evidence'
import { runResearchDraft } from '../src/index.ts'
import { draftFixture } from './pipeline-fixture.ts'

// These are scripted source/model responses, not quotations or findings from real papers.
const topics = [
  {
    topic: 'RAG 与大模型幻觉',
    questions: ['检索材料何时改善回答忠实性？', '检索材料何时引入错误？'],
    query: 'retrieval augmented generation hallucination',
    excerpt: 'Synthetic retrieval evidence supports one approved question.',
  },
  {
    topic: 'Transformer 与 BERT 的机制',
    questions: ['自注意力如何处理长距离依赖？', 'BERT 如何使用双向预训练？'],
    query: 'Transformer BERT attention pretraining',
    excerpt: 'Synthetic attention evidence supports one approved question.',
  },
  {
    topic: 'Agent 研究现状与未来发展',
    questions: ['当前 Agent 研究有哪些可核验的能力？', '哪些未来发展仅是预测？'],
    query: 'AI agent evaluation future directions',
    excerpt: 'Synthetic agent evidence supports one approved question.',
  },
] as const

describe('A-PE4 cross-module topic acceptance', () => {
  it.each(topics)('returns a limited, traceable draft for $topic after another paper fails', async (caseData) => {
    const { input, adapters } = draftFixture()
    input.brief = { ...input.brief, topic: caseData.topic, questions: [...caseData.questions] }
    input.searches = [{ query: caseData.query, channels: ['academic'] }]
    adapters.fetcher = async url => ({ url, statusCode: 200, truncated: false,
      body: { kind: 'html', content: `<article><h2>Methods</h2><p>${caseData.excerpt}</p></article>` } })
    let attempted = 0
    adapters.generator = async (_request, source) => {
      if (++attempted === 2) throw new EvidenceError('Scripted model timeout', 'EVIDENCE_MODEL_TIMEOUT')
      const segmentIndex = source.segments.findIndex(segment => segment.text.includes(caseData.excerpt))
      if (segmentIndex < 0) throw new Error('Scripted source was not parsed')
      return { scope: { status: 'included', reason: 'Synthetic in-scope paper.' },
        evidence: [{ segmentIndex, questionIndexes: [0], sourcedStatement: caseData.excerpt,
          verbatimExcerpt: caseData.excerpt, cardItems: [] }] }
    }
    adapters.synthesize = vi.fn(adapters.synthesize)

    const result = await runResearchDraft(input, adapters)

    expect(result.retrievalRun.queries).toEqual([caseData.query])
    expect(result.retrievalRun.coverageSummary.includedWorks).toBe(1)
    expect(result.papers.map(paper => paper.status)).toEqual(['extracted'])
    expect(result.failures).toHaveLength(1)
    expect(result.synthesis.status).toBe('partial_success')
    expect(result.report?.mode).toBe('draft')
    expect(result.report?.evaluation.status).not.toBe('ready')
    expect(result.report?.evidence).toHaveLength(1)
    expect(result.report?.evidence[0]?.verbatimExcerpt).toEqual({ status: 'available', value: caseData.excerpt })
    expect(result.report?.markdown).toContain(caseData.questions[0])
    expect(result.report?.markdown).toContain(caseData.questions[1])
    expect(result.report?.markdown).toContain('回答状态：尚未回答')
    expect(result.report?.markdown).toContain('Plan 至少要求 2 篇')
    const synthesisInput = vi.mocked(adapters.synthesize).mock.calls[0]?.[0]
    expect(synthesisInput?.analysisInput.questionLinks?.map(link => link.question)).toEqual([caseData.questions[0]])
  })

  it('stops before synthesis when the same fixed cohort yields no verified evidence', async () => {
    const { input, adapters } = draftFixture()
    adapters.generator = async () => ({ scope: { status: 'included', reason: 'Synthetic in-scope paper.' }, evidence: [] })
    const result = await runResearchDraft(input, adapters)
    expect(result.retrievalRun.coverageSummary.includedWorks).toBe(0)
    expect(result.synthesis.status).toBe('blocked')
    expect(result.report).toBeNull()
    expect(adapters.synthesize).not.toHaveBeenCalled()
  })
})
