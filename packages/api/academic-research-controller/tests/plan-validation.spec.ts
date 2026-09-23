import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { describe, expect, it, vi } from 'vitest'
import * as validation from '../src/plan-validation.ts'
import { validateAcademicPlan } from '../src/research-brief-plan.ts'

const template = readFileSync(new URL('../../../preset/agent-presets/presets/academic/skills/academic-insight-report/references/research-brief.md', import.meta.url), 'utf8')
const unsupported = template.replace('"accepted_manuscript", "version_of_record"', '"conference_paper", "journal_article"')

function templatePayload(): Record<string, unknown> {
  return JSON.parse(template.match(/```academic-research-brief-json\s*\n([\s\S]*?)\n```/u)![1]!) as Record<string, unknown>
}

function planWithPayload(payload: unknown): string {
  return `# 研究计划\n\n\`\`\`academic-research-brief-json\n${JSON.stringify(payload)}\n\`\`\``
}

function retrievalOf(payload: Record<string, unknown>): Record<string, unknown> {
  return ((payload.searchPlan as Record<string, unknown>[])[0]!.retrieval) as Record<string, unknown>
}

describe('Academic plan compatibility before review', () => {
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

  it('projects the version-3 hybrid policy from the shipped Chinese plan template', () => {
    const payload = templatePayload()
    expect(payload.schemaVersion).toBe(3)
    expect(retrievalOf(payload)).toEqual({
      channels: ['academic', 'web_discovery'],
      academicProviders: ['openalex', 'arxiv'],
      verificationProviders: ['openalex', 'arxiv', 'acl', 'pmlr', 'cvf'],
      maximumWebDiscoveryResults: 8,
      maximumReferenceVerifications: 5,
    })
    expect(() => { validateAcademicPlan(template) }).not.toThrow()
  })

  it('continues to read a version-2 approved search plan without inventing a retrieval policy', () => {
    const payload = structuredClone(templatePayload())
    payload.schemaVersion = 2
    for (const search of payload.searchPlan as Record<string, unknown>[]) delete search.retrieval
    expect(() => { validateAcademicPlan(planWithPayload(payload)) }).not.toThrow()
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
