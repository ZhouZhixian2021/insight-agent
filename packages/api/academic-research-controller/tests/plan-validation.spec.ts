import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { describe, expect, it, vi } from 'vitest'
import * as validation from '../src/plan-validation.ts'
import { researchPlanFromApproval, validateAcademicPlan } from '../src/research-brief-plan.ts'

const template = readFileSync(new URL('../../../bundle/web-app/presets/academic/skills/academic-insight-report/references/research-brief.md', import.meta.url), 'utf8')
const pe1Plan = readFileSync(new URL('../../../../z-team_docs/interface-samples/academic-model-v1/academic-pe1-plan.sample.md', import.meta.url), 'utf8')
const unsupported = template.replace('"accepted_manuscript", "version_of_record"', '"conference_paper", "journal_article"')

function templatePayload(): Record<string, unknown> {
  return JSON.parse(template.match(/```academic-research-brief-json\s*\n([\s\S]*?)\n```/u)![1]!) as Record<string, unknown>
}

function planWithPayload(payload: unknown): string {
  const scope = (payload as Record<string, unknown>).scopeDecision as {
    requestedBreadth: string
    deepDiveDirections: string[]
    overviewDirections: string[]
    notSystematicallyCovered: string[]
  } | undefined
  const readable = scope === undefined ? '# 研究计划' : [
    '# 选定方向专题研究计划',
    scope.requestedBreadth === 'domain' ? '原需求为领域级，本轮按选定方向形成专题报告。' : '本轮研究为专题。',
    '## 研究范围',
    '### 本轮深入研究', ...scope.deepDiveDirections,
    '### 仅作概览', ...(scope.overviewDirections.length ? scope.overviewDirections : ['无']),
    '### 不作系统覆盖', ...(scope.notSystematicallyCovered.length ? scope.notSystematicallyCovered : ['无']),
  ].join('\n')
  return `${readable}\n\n\`\`\`academic-research-brief-json\n${JSON.stringify(payload)}\n\`\`\``
}

function retrievalOf(payload: Record<string, unknown>): Record<string, unknown> {
  return ((payload.searchPlan as Record<string, unknown>[])[0]!.retrieval) as Record<string, unknown>
}

function screeningPayload(alias: string): Record<string, unknown> {
  const payload = templatePayload()
  payload.candidateScreening = {
    questions: [{ question: '<中文研究问题>', concepts: [[alias]] }],
    methods: [['tool use', '工具调用']], evidence: [['benchmark', '基准']], contributions: [],
  }
  return payload
}

describe('Academic plan compatibility before review', () => {
  it.each([
    { endMode: 'run_start', timeZone: 'Asia/Shanghai', inclusionRuleKinds: [], exclusionRuleKinds: ['content'] },
    { endMode: 'fixed', timeZone: 'Asia/Shanghai', inclusionRuleKinds: ['content'], exclusionRuleKinds: ['content'] },
    { endMode: 'run_start', timeZone: 'invalid/time-zone', inclusionRuleKinds: ['content'], exclusionRuleKinds: ['content'] },
    { endMode: 'today', timeZone: 'UTC', inclusionRuleKinds: ['content'], exclusionRuleKinds: ['content'] },
    { endMode: 'run_start', timeZone: 'UTC', inclusionRuleKinds: ['date_or_content'], exclusionRuleKinds: ['content'] },
  ])('rejects an incomplete or contradictory date policy: %j', (policy) => {
    const payload = templatePayload()
    payload.publicationDatePolicy = policy
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).toThrow(/publicationDatePolicy/u)
  })

  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-10-00'])('rejects invalid publication date %s', (iso) => {
    const payload = templatePayload()
    payload.publicationWindow = { start: { iso, precision: 'day' }, end: null, dateBasis: 'published' }
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).toThrow('valid calendar date')
  })

  it('reads legacy version 5 without inventing a date policy', () => {
    const payload = templatePayload()
    payload.schemaVersion = 5
    delete payload.publicationDatePolicy
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).not.toThrow()
  })
  it('keeps the fixed A-PE1 review decisions aligned with an executable plan', () => {
    const visible = pe1Plan.slice(0, pe1Plan.indexOf('## 系统执行信息'))
    const match = pe1Plan.match(/```academic-research-brief-json\s*\n([\s\S]*?)\n```/u)
    const payload = JSON.parse(match?.[1] ?? 'null') as Record<string, unknown>
    const requirements = payload.evidenceRequirements as Record<string, unknown>
    const publication = payload.publicationWindow as Record<string, unknown>
    expect(() => { validateAcademicPlan(pe1Plan) }).not.toThrow()
    expect((payload.questions as string[]).every(question => visible.includes(question))).toBe(true)
    expect(visible).toContain('2020 年以来')
    expect(publication).toMatchObject({ start: { iso: '2020', precision: 'year' }, dateBasis: 'published' })
    expect(visible).toContain('允许预印本')
    expect(requirements).toMatchObject({ targetIncludedWorks: 5, minimumEvidenceLevel: 'fulltext',
      allowPreprints: true, requireLocatableEvidence: true, insufficientEvidencePolicy: 'continue_with_warning' })
    expect(visible).toContain('约五篇')
    expect(visible).toContain('完全没有有效证据时停止')
    expect(visible).not.toMatch(/OpenAlex|arXiv|Provider|JSON|candidateScreening|maximumCandidateWorks/u)
    expect(pe1Plan.match(/```academic-research-brief-json/gu)).toHaveLength(1)
  })

  it('accepts the shipped template and diagnoses publication categories without changing the plan', () => {
    expect(() => { validateAcademicPlan(template) }).not.toThrow()
    expect(() => { validateAcademicPlan(unsupported) }).toThrow('includedWorkTypes=["conference_paper","journal_article"]')
    expect(unsupported).toContain('"conference_paper", "journal_article"')
  })

  it('rejects a new handoff with no search plan before asking the user to approve it', () => {
    const payload = templatePayload()
    delete payload.searchPlan
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).toThrow('missing: searchPlan')
  })

  it('projects the version-8 scope, target, aspect criteria, hybrid policy, and reviewed screening cues', () => {
    const payload = templatePayload()
    expect(payload.schemaVersion).toBe(8)
    expect(payload.scopeDecision).toMatchObject({ requestedBreadth: 'domain',
      deepDiveDirections: ['<本轮深入的方向>'], notSystematicallyCovered: ['<本轮不作系统覆盖的已知方向>'] })
    expect(payload.coverageRequirements).toMatchObject([{ question: '<中文研究问题>', aspects: [{ evidenceRequirement: 'direct' }] }])
    expect((payload.evidenceRequirements as Record<string, unknown>).targetIncludedWorks).toBe(6)
    expect(payload.candidateScreening).toMatchObject({
      questions: [{ question: '<中文研究问题>' }],
      methods: [['<方法线索及其同义表达>']],
      evidence: [['<实验或评估线索及其同义表达>']],
    })
    expect(retrievalOf(payload)).toEqual({
      channels: ['academic', 'web_discovery'],
      academicProviders: ['openalex', 'arxiv'],
      verificationProviders: ['openalex', 'arxiv', 'acl', 'pmlr', 'cvf'],
      maximumWebDiscoveryResults: 8,
      maximumReferenceVerifications: 5,
    })
    expect(() => { validateAcademicPlan(template) }).not.toThrow()
  })

  it('requires an explicit direction decision in new plans and keeps old plans readable', () => {
    const payload = templatePayload()
    delete payload.scopeDecision
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).toThrow('scopeDecision')
    payload.schemaVersion = 7
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).not.toThrow()
  })

  it('rejects a domain plan without disclosed omitted directions', () => {
    const payload = templatePayload()
    const scope = payload.scopeDecision as Record<string, unknown>
    scope.notSystematicallyCovered = []
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).toThrow('领域级计划必须明确列出')
  })

  it('rejects direction choices missing from the readable review', () => {
    const payload = templatePayload()
    const visible = planWithPayload(payload).replace('<本轮不作系统覆盖的已知方向>', '另一个方向')
    expect(() => { validateAcademicPlan(visible) }).toThrow('可读计划须分别列出')
  })

  it('rejects a deep-dive direction without an approved query purpose', () => {
    const payload = templatePayload()
    const search = (payload.searchPlan as Record<string, unknown>[])[0]!
    search.purpose = '其他主题的检索'
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).toThrow('每个本轮深入研究方向须出现在')
  })

  it('keeps technical direction names containing a hash mark readable', () => {
    const payload = templatePayload()
    const scope = payload.scopeDecision as { deepDiveDirections: string[] }
    scope.deepDiveDirections = ['C# 运行时系统']
    const search = (payload.searchPlan as Record<string, unknown>[])[0]!
    search.purpose = 'C# 运行时系统：检索论文'
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).not.toThrow()
  })

  it('rejects a domain plan titled as a complete field report', () => {
    const payload = templatePayload()
    payload.topic = '操作系统领域研究报告'
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).toThrow('计划标题和执行主题')
  })

  it('retains the reviewed scope decision in the executable Brief', () => {
    const markdown = planWithPayload(templatePayload())
    const approved = researchPlanFromApproval('session-1', { identity: 'review-1', markdown,
      reviewedAt: '2026-11-02T00:00:00.000Z' })
    expect(approved.brief.scopeDecision).toEqual((templatePayload().scopeDecision))
  })

  it('requires approved aspect criteria in new plans while retaining version-6 readers', () => {
    const payload = templatePayload()
    delete payload.coverageRequirements
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).toThrow('coverageRequirements')
    payload.schemaVersion = 6
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).not.toThrow()
  })

  it.each(['duplicate_id', 'unknown_question', 'empty_aspects'])('rejects invalid approved aspect scope: %s', (scenario) => {
    const payload = templatePayload()
    const requirements = payload.coverageRequirements as { question: string; aspects: object[] }[]
    if (scenario === 'duplicate_id') requirements[0]!.aspects.push(requirements[0]!.aspects[0]!)
    else if (scenario === 'unknown_question') requirements[0]!.question = 'unapproved question'
    else requirements[0]!.aspects = []
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).toThrow('coverageRequirements')
  })

  it('keeps per-paper eligibility separate from collection coverage goals in the shipped template', () => {
    const payload = templatePayload()
    expect(payload.inclusionRules).toEqual([
      '<每篇候选论文都必须满足、可由该论文独立判断的中文纳入条件>',
    ])
    expect(payload.exclusionRules).toEqual([
      '<可根据单篇候选论文独立判断的中文排除条件>',
    ])
    expect(template).toContain('`inclusionRules` 和 `exclusionRules` 只记录逐篇规则')
    expect(template).toContain('不得写入这两个数组')
    expect(template).toContain('“整体覆盖 RAGTruth、HaluEval 或 GaRAGe”属于文献组合覆盖目标')
  })

  it('continues to read a version-2 approved search plan without inventing a retrieval policy', () => {
    const payload = structuredClone(templatePayload())
    delete payload.publicationDatePolicy
    payload.schemaVersion = 2
    delete payload.candidateScreening
    delete (payload.evidenceRequirements as Record<string, unknown>).targetIncludedWorks
    for (const search of payload.searchPlan as Record<string, unknown>[]) delete search.retrieval
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).not.toThrow()
  })

  it.each(['planning 规划', 'tool use 工具调用', '规划 planning', 'benchmark（基准）', '基准 (benchmark)'])(
    'rejects a bilingual annotation before review: %s', (alias) => {
      expect(() => { validateAcademicPlan(planWithPayload(screeningPayload(alias))) })
        .toThrow('candidateScreening.questions[0].concepts[0][0] 包含拼接的中英文别名')
    },
  )

  it.each(['methods', 'evidence', 'contributions'] as const)(
    'diagnoses the exact malformed %s cue', (field) => {
      const payload = screeningPayload('planning')
      const screening = payload.candidateScreening as Record<string, unknown>
      screening[field] = field === 'contributions'
        ? [{ classification: 'core_method', concepts: [['planning 规划']] }]
        : [['planning 规划']]
      expect(() => { validateAcademicPlan(planWithPayload(payload)) })
        .toThrow(`candidateScreening.${field}${field === 'contributions' ? '[0].concepts' : ''}[0][0]`)
    },
  )

  it.each(['tool use', 'reinforcement learning', 'LLM智能体', '基于 LLM 的规划', '智能体规划'])(
    'keeps a complete term unchanged: %s', (alias) => {
      const plan = planWithPayload(screeningPayload(alias))
      expect(() => { validateAcademicPlan(plan) }).not.toThrow()
      expect(plan).toContain(alias)
    },
  )

  it('accepts separate bilingual aliases and preserves concept groups', () => {
    const payload = screeningPayload('planning')
    const screening = payload.candidateScreening as Record<string, unknown>
    screening.questions = [{ question: '<中文研究问题>', concepts: [['agent', '智能体'], ['planning', '规划']] }]
    const before = JSON.stringify(payload)
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).not.toThrow()
    expect(JSON.stringify(payload)).toBe(before)
    expect(template).toContain('["planning", "规划"]')
    expect(template).toContain('不得拼成')
  })

  it.each([
    ['missing screening', (payload: Record<string, unknown>) => { delete payload.candidateScreening },
      'missing: candidateScreening'],
    ['unreviewed question', (payload: Record<string, unknown>) => {
      ((payload.candidateScreening as Record<string, unknown>).questions as Record<string, unknown>[])[0]!.question = '其他问题'
    }, 'must cover every exact research question once'],
    ['missing method concepts', (payload: Record<string, unknown>) => {
      (payload.candidateScreening as Record<string, unknown>).methods = []
    }, 'methods must contain at least one concept'],
    ['empty evidence aliases', (payload: Record<string, unknown>) => {
      (payload.candidateScreening as Record<string, unknown>).evidence = [[]]
    }, 'evidence[0] must contain at least one item'],
    ['unknown screening field', (payload: Record<string, unknown>) => {
      (payload.candidateScreening as Record<string, unknown>).extra = true
    }, 'unknown: extra'],
  ])('rejects invalid reviewed candidate cues: %s', (_label, mutate, message) => {
    const payload = structuredClone(templatePayload())
    mutate(payload)
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).toThrow(message)
  })

  it.each([
    ['missing policy', (_retrieval: Record<string, unknown>, search: Record<string, unknown>) => { delete search.retrieval },
      'missing: retrieval'],
    ['unknown channel', (retrieval: Record<string, unknown>) => { retrieval.channels = ['academic', 'browser'] },
      'channels[1] must be one of'],
    ['duplicate channel', (retrieval: Record<string, unknown>) => { retrieval.channels = ['academic', 'academic'] },
      'channels must not contain duplicate values'],
    ['empty channels', (retrieval: Record<string, unknown>) => { retrieval.channels = [] },
      'channels must contain at least one item'],
    ['unsupported direct provider', (retrieval: Record<string, unknown>) => { retrieval.academicProviders = ['semantic-scholar'] },
      'academicProviders[0] must be one of'],
    ['duplicate direct provider', (retrieval: Record<string, unknown>) => { retrieval.academicProviders = ['arxiv', 'arxiv'] },
      'academicProviders must not contain duplicate values'],
    ['blank direct provider', (retrieval: Record<string, unknown>) => { retrieval.academicProviders = [''] },
      'academicProviders[0] must be one of'],
    ['missing direct provider', (retrieval: Record<string, unknown>) => { retrieval.academicProviders = [] },
      'academicProviders must be non-empty'],
    ['unsupported verification provider', (retrieval: Record<string, unknown>) => { retrieval.verificationProviders = ['crossref'] },
      'verificationProviders[0] must be one of'],
    ['duplicate verification provider', (retrieval: Record<string, unknown>) => {
      retrieval.verificationProviders = ['arxiv', 'arxiv']
    }, 'verificationProviders must not contain duplicate values'],
    ['missing verification provider', (retrieval: Record<string, unknown>) => { retrieval.verificationProviders = [] },
      'verificationProviders must be non-empty'],
    ['negative Web bound', (retrieval: Record<string, unknown>) => { retrieval.maximumWebDiscoveryResults = -1 },
      'must be a non-negative integer'],
    ['excessive Web bound', (retrieval: Record<string, unknown>) => { retrieval.maximumWebDiscoveryResults = 9 },
      'must not exceed 8'],
    ['excessive verification bound', (retrieval: Record<string, unknown>) => { retrieval.maximumReferenceVerifications = 9 },
      'must not exceed 8'],
    ['unknown policy field', (retrieval: Record<string, unknown>) => { retrieval.extra = true }, 'unknown: extra'],
  ])('rejects an invalid retrieval policy: %s', (_label, mutate, message) => {
    const payload = structuredClone(templatePayload())
    const search = (payload.searchPlan as Record<string, unknown>[])[0]!
    mutate(retrievalOf(payload), search)
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).toThrow(message)
  })

  it('accepts consistent academic-only and Web-only policies', () => {
    const academicOnly = structuredClone(templatePayload())
    Object.assign(retrievalOf(academicOnly), {
      channels: ['academic'],
      verificationProviders: [],
      maximumWebDiscoveryResults: 0,
      maximumReferenceVerifications: 0,
    })
    expect(() => { validateAcademicPlan(planWithPayload(academicOnly)) }).not.toThrow()

    const webOnly = structuredClone(templatePayload())
    Object.assign(retrievalOf(webOnly), { channels: ['web_discovery'], academicProviders: [] })
    expect(() => { validateAcademicPlan(planWithPayload(webOnly)) }).not.toThrow()
  })

  it.each([
    ['direct providers while academic is disabled', {
      channels: ['web_discovery'],
    }, 'academicProviders must be non-empty exactly when'],
    ['verification providers while Web is disabled', {
      channels: ['academic'],
      maximumWebDiscoveryResults: 0,
      maximumReferenceVerifications: 0,
    }, 'verificationProviders must be non-empty exactly when'],
    ['zero Web-results budget while Web is enabled', {
      maximumWebDiscoveryResults: 0,
    }, 'maximumWebDiscoveryResults must be positive exactly when'],
    ['zero verification budget while Web is enabled', {
      maximumReferenceVerifications: 0,
    }, 'maximumReferenceVerifications must be positive exactly when'],
  ])('rejects inconsistent channel-dependent fields: %s', (_label, patch, message) => {
    const payload = structuredClone(templatePayload())
    Object.assign(retrievalOf(payload), patch)
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).toThrow(message)
  })

  it('blocks review dispatch, delegates compatible and ordinary plans, and removes the guard on disposal', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      const review = vi.fn(() => Promise.resolve([{ type: 'text' as const, text: 'review reached' }]))
      ctx.tools.register(defineContentToolFixture({ name: 'exit_plan_mode', description: 'Review fixture',
        parameters: { plan: { type: 'string', required: true } }, execute: review }))
      const fiber = await ctx.plugin(validation)
      const call = (plan: string) => ctx.tools.execute({ callId: ToolCallId('review'), name: 'exit_plan_mode',
        arguments: { plan }, signal: new AbortController().signal })
      const rejected = await call(unsupported)
      expect(rejected.isError).toBe(true)
      expect(rejected.content[0]).toHaveProperty('text', expect.stringContaining('includedWorkTypes'))
      const malformedAlias = await call(planWithPayload(screeningPayload('planning 规划')))
      expect(malformedAlias.isError).toBe(true)
      expect(malformedAlias.content[0]).toHaveProperty('text', expect.stringContaining('请将同义表达分别写成同组的独立字符串'))
      expect(review).not.toHaveBeenCalled()
      expect(await call(template)).not.toHaveProperty('isError', true)
      expect(await call('# Ordinary coding plan')).not.toHaveProperty('isError', true)
      expect(review).toHaveBeenCalledTimes(2)
      await fiber.dispose()
      expect(await call(unsupported)).not.toHaveProperty('isError', true)
      expect(review).toHaveBeenCalledTimes(3)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
