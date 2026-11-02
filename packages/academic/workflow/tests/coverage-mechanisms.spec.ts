import { describe, expect, it } from 'vitest'
import type { ResearchAspectId, ResearchCoverageRequirement } from '@deepseek-ai/dsh-academic-model'
import type { EvidenceExtractionInput } from '@deepseek-ai/dsh-academic-evidence'
import { selectCoverageWindows, coverageWindowSegments } from '../src/coverage-targeting.ts'
import { parseCoverageEvidence } from '../src/coverage-extraction.ts'
import { evidenceMessages } from '../src/model-prompt.ts'
import { draftFixture } from './pipeline-fixture.ts'
import { CoverageRepairRuntime } from '../src/coverage-runtime.ts'
import { runResearchDraft } from '../src/pipeline.ts'
import { createRetrievalRunId } from '@deepseek-ai/dsh-academic-model'
import { EvidenceError } from '@deepseek-ai/dsh-academic-evidence'

const bdi = 'q1.bdi' as ResearchAspectId, rl = 'q1.rl' as ResearchAspectId, shift = 'q4.shift' as ResearchAspectId
const requirements: readonly ResearchCoverageRequirement[] = [
  { question: 'Explain the BDI and RL architectures', aspects: [
    { aspectId: bdi, label: 'BDI 概念与架构', evidenceRequirement: 'direct', searchTerms: ['BDI', 'belief', 'intention'] },
    { aspectId: rl, label: '强化学习智能体的概念与架构', evidenceRequirement: 'direct', searchTerms: ['reinforcement learning'] }] },
  { question: 'Explain the evaluation transition', aspects: [{ aspectId: shift, label: '评测从静态问答到交互环境的转变',
    evidenceRequirement: 'direct', searchTerms: ['interactive', 'benchmark', 'environment'] }] },
]
const policy = { maximumWindowsPerPaper: 2, maximumWindowCharacters: 1500, maximumSourceOptions: 0,
  maximumPreviewCharacters: 360, maximumTotalCharacters: 4500, contextCharacters: 240, maximumCandidateReads: 0,
  maximumModelTokens: 20000, maximumModelCalls: 3, maximumElapsedMs: 120000, repairMaxTokens: 4096,
  deltaReviewMaxTokens: 6000, candidateMaxTokens: 4096, finalReviewReserveTokens: 10000 }

function source(texts: readonly string[]): EvidenceExtractionInput {
  const version = draftFixture().records[0]!.workVersion
  return { academicWorkId: version.academicWorkId, workVersionId: version.workVersionId, contentHash: 'sha256:fixture',
    sourceProvider: 'fixture', sourceUrl: 'https://example.org', retrievedAt: '2026-10-30T00:00:00Z',
    extractionMethod: { method: 'fixture', methodVersion: '1' },
    segments: texts.map((text, i) => ({ text, locator: { kind: 'page_section', pdfPage: i + 1, sectionTitle: `PDF page ${i + 1}` } })) }
}

describe('mechanism-directed supplementation', () => {
  it('keeps unchanged covered aspects and does not promote new evidence when a delta review fails', async () => {
    const fixture = draftFixture(), result = await runResearchDraft(fixture.input, fixture.adapters)
    const input = { retrievalRunId: createRetrievalRunId(), brief: { ...fixture.input.brief, coverageRequirements: [requirements[0]!] },
      works: fixture.records.map(r => r.academicWork), evidence: result.papers.flatMap(p => 'evidence' in p ? p.evidence.evidenceRecords : []),
      questionLinks: result.papers.flatMap(p => 'evidence' in p ? p.evidence.questionLinks : []) }
    const runtime = new CoverageRepairRuntime(input, { minimumSupportingWorks: 1, maximumReviews: 2, maximumRepairRounds: 1,
      maximumRepairPapers: 2, maximumNewCandidateWorks: 0, maximumExcerptCharacters: 600, maximumRepairCharacters: 4500,
      targeting: policy }, undefined, async () => {}, () => '2026-10-30T00:00:00Z')
    const linked = { ...input, brief: { ...input.brief, questions: [requirements[0]!.question] },
      questionLinks: input.evidence.map(r => ({ evidenceId: r.evidenceId, question: requirements[0]!.question })) }
    await runtime.review(linked, true, 'now', async () => ({ aspects: [
      { aspectId: bdi, status: 'covered', evidenceIds: [input.evidence[0]!.evidenceId], reason: 'Known BDI mechanism.' },
      { aspectId: rl, status: 'partial', evidenceIds: [input.evidence[1]!.evidenceId], reason: 'Incomplete RL architecture.' }] }))
    const changed = { ...linked, evidence: [...linked.evidence].reverse() }
    const coverage = await runtime.review(changed, true, 'later', async () => {
      throw new EvidenceError('Output exhausted', 'EVIDENCE_MODEL_INCOMPLETE')
    })
    expect(coverage.questions[0]?.aspects?.map(a => a.status)).toEqual(['covered', 'partial'])
    expect(coverage.allQuestionsCovered).toBe(false)
    expect(runtime.state.failure).toBe('review_failed')
    expect(runtime.state.reviewCalls).toBe(2)
  })
  it('reads definitions and RL mechanisms instead of keyword-dense related work', () => {
    const parsed = source([
      'Related Work. Other authors combine traditional BDI and reinforcement learning. '.repeat(20),
      'Definition 1 (BDI Agent). The belief base, plan library and intention structure are the components of the BDI reasoning cycle.',
      'Definition 7 (POMDP). States, actions and a reward function define the model. A policy maps the belief state to an action.',
    ])
    const windows = selectCoverageWindows(parsed, [requirements[0]!], undefined, policy, 3000)
    expect(new Set(windows.map(w => w.segmentIndex))).toEqual(new Set([1, 2]))
    expect(windows.flatMap(w => w.aspectIds)).toContain(rl)
    expect(coverageWindowSegments(parsed, windows).every(s => parsed.segments.some(p => p.text.includes(s.text)))).toBe(true)
  })

  it('selects the explicit static-to-interactive relationship over generic benchmark mentions', () => {
    const parsed = source(['Interactive benchmark environment. '.repeat(30),
      'Unlike one-shot question answering, an agent uses a full loop: it selects actions, observes outcomes and updates its state.'])
    const windows = selectCoverageWindows(parsed, [requirements[1]!], undefined, policy, 1500)
    expect(windows[0]?.segmentIndex).toBe(1)
  })

  it('does not retain aspect matches beyond the actual remaining character allowance', () => {
    const parsed = source(['BDI beliefs. ' + 'padding '.repeat(80) + 'reinforcement learning reward function.'])
    const windows = selectCoverageWindows(parsed, [requirements[0]!], undefined, policy, 30)
    expect(windows.reduce((n, w) => n + w.end - w.start, 0)).toBeLessThanOrEqual(30)
    for (const w of windows) if (w.aspectIds.includes(rl)) {
      expect(coverageWindowSegments(parsed, [w])[0]?.text)
        .toMatch(/reinforcement learning|POMDP|policy function|reward function|fallback policy/)
    }
  })

  it('keeps the final complete sentence when the whole paragraph fits', () => {
    const text = 'BDI beliefs are represented explicitly. The plan library determines the next intention.'
    const parsed = source([text])
    const windows = selectCoverageWindows(parsed, [requirements[0]!], undefined, policy, 1500)
    expect(coverageWindowSegments(parsed, windows).some(s => s.text === text)).toBe(true)
  })

  it('uses one targeted output limit and does not repeat general extraction instructions', () => {
    const message = evidenceMessages({ instruction: 'UNRELATED GENERAL INSTRUCTIONS', focusQuestions: ['entire question'],
      segments: source(['A passage.']).segments }, 'minimal', [requirements[1]!])[0]!
    const part = message.content[0]!
    expect(part.type).toBe('text')
    if (part.type !== 'text') throw new Error('Expected text')
    expect(part.text).toContain('Return at most 2 new entries')
    expect(part.text).not.toContain('UNRELATED GENERAL INSTRUCTIONS')
    expect(part.text).not.toContain('Return at most 6')
    expect(part.text).toContain('targetAspects')
    expect(part.text).not.toContain(bdi)
  })

  it('derives exact parent links from approved aspect IDs instead of model question indexes', () => {
    const entry = { segmentIndex: 0, aspectIds: [rl, shift], sourcedStatement: 'A supported finding.',
      verbatimExcerpt: 'A supported finding.', section: 'findings' }
    expect(parseCoverageEvidence(JSON.stringify({ evidence: [entry] }), requirements)[0]?.questionIndexes).toEqual([0, 1])
    for (const aspectIds of [['invented'], [bdi, bdi], []]) {
      expect(() => parseCoverageEvidence(JSON.stringify({ evidence: [{ ...entry, aspectIds }] }), requirements)).toThrow()
    }
    expect(() => parseCoverageEvidence(JSON.stringify({ evidence: [{ ...entry, questionIndexes: [9] }] }), requirements)).toThrow()
    const valid = { ...entry, aspectIds: [shift] }
    expect(() => parseCoverageEvidence(JSON.stringify({ evidence: [valid, valid, valid] }), [requirements[1]!])).toThrow()
  })
})
