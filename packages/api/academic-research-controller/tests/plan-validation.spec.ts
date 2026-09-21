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

describe('Academic plan compatibility before review', () => {
  it('accepts the shipped template and diagnoses publication categories without changing the plan', () => {
    expect(() => { validateAcademicPlan(template) }).not.toThrow()
    expect(() => { validateAcademicPlan(unsupported) }).toThrow('includedWorkTypes=["conference_paper","journal_article"]')
    expect(unsupported).toContain('"conference_paper", "journal_article"')
  })

  it('rejects a new handoff with no search plan before asking the user to approve it', () => {
    const payload = JSON.parse(template.match(/```academic-research-brief-json\s*\n([\s\S]*?)\n```/u)![1]!) as Record<string, unknown>
    delete payload.searchPlan
    const missing = `# 研究计划\n\n\`\`\`academic-research-brief-json\n${JSON.stringify(payload)}\n\`\`\``
    expect(() => { validateAcademicPlan(missing) }).toThrow('missing: searchPlan')
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
