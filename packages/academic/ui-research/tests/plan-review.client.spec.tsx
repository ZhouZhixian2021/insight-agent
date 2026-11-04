// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QuestionComposer } from '../../../client/ui-user-questions/src/client/QuestionComposer.tsx'
import { planReviewOf, type QuestionComposerProps } from '../../../client/ui-user-questions/src/client/contract/slots.ts'
import { kit as baseKit, seatOver, questions, wait, decision } from '../../../client/ui-user-questions/tests/plan-review.fixture.client.ts'
import { en as questionEn, zh as questionZh } from '../../../client/ui-user-questions/src/client/locales.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { en as academicEn, zh as academicZh } from '../src/client/plan-locales.ts'
import { AcademicPlanContent, type AcademicPlanContentProps } from '../src/client/AcademicPlanContent.tsx'
import { academicPlanPresentation } from '../src/client/plan-review.ts'
afterEach(cleanup)
const en = { ...questionEn, ...academicEn }
const zh = { ...questionZh, ...academicZh }
const kit: Omit<QuestionComposerProps, 'matched'> = {
  ...baseKit,
  renderSlotChain: (_key, owner, opts) => {
    const content = owner as Pick<AcademicPlanContentProps, 'review' | 'busy' | 'editing' | 'setEditing' | 'revise'>
    const matched = academicPlanPresentation(content)
    return matched === null ? opts?.fallback
      : <AcademicPlanContent {...baseKit} {...content} matched={matched}
        t={key => zh[key as keyof typeof zh] ?? commonZh[key as keyof typeof commonZh] ?? key} />
  },
}

describe('Academic plan presentation', () => {
  it('folds the academic handoff while preserving readable scope and the original approval', () => {
    const plan = '# RAG 研究计划\n\n## 研究范围\n\n纳入预印本、录用稿、正式发表版本。\n\n```academic-research-brief-json\n{"schemaVersion":1}\n```\n\n证据不足时披露限制。'
    const items = questions().map(item => ({ ...item, detail: plan }))
    const { carrier, answer } = wait(items)
    render(<QuestionComposer matched={carrier} {...kit} />)
    expect(screen.getByRole('heading', { name: 'RAG 研究计划' })).toBeTruthy()
    expect(screen.getByText('纳入预印本、录用稿、正式发表版本。')).toBeTruthy()
    expect(screen.getByText('证据不足时披露限制。')).toBeTruthy()
    const details = screen.getByText(zh['plan.executionDetails']).closest('details')
    expect(details?.hasAttribute('open')).toBe(false)
    expect(details?.textContent).toContain('schemaVersion')
    expect(planReviewOf(items)?.plan).toBe(plan)
    fireEvent.click(screen.getByRole('button', { name: zh['plan.approve'] }))
    expect(answer).toHaveBeenCalledWith(decision('Approve'))
  })

  it.each([
    '```json\n{"schemaVersion":1}\n```',
    '```academic-research-brief-json\n{"schemaVersion":1}',
    '```academic-research-brief-json\n{}\n```\n```academic-research-brief-json\n{}\n```',
  ])('keeps ordinary or ambiguous code visible: %s', (code) => {
    const { carrier } = wait(questions().map(item => ({ ...item, detail: `# 研究计划\n\n${code}` })))
    render(<QuestionComposer matched={carrier} {...kit} />)
    expect(document.querySelector('details')).toBeNull()
    expect(screen.queryByRole('button', { name: zh['plan.revise'] })).toBeNull()
  })

})

describe('academic natural-language revision', () => {
  const plan = '研究目标：比较 RAG。核心问题：如何评测？研究范围：近三年、允许预印本。执行方式：检索并比较。交付结果：中文受限草稿。待确认事项：无。\n\n```academic-research-brief-json\n{"schemaVersion":5}\n```'

  it('separates readable decisions and sends revision text without granting approval', async () => {
    const { carrier, answer, cancel, result } = wait(questions().map(item => ({ ...item, detail: plan })))
    render(<QuestionComposer matched={carrier} {...kit} />)
    expect(screen.getByText('核心问题：如何评测？')).toBeTruthy()
    expect(screen.getByText('交付结果：中文受限草稿。')).toBeTruthy()
    expect(document.querySelector('details')?.open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: zh['plan.revise'] }))
    expect(screen.getByRole('button', { name: zh['plan.approve'] }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: zh['plan.revisionSend'] }).hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: zh['plan.revisionLabel'] }), {
      target: { value: '时间改为近三年。\n不纳入预印本。' },
    })
    fireEvent.click(screen.getByRole('button', { name: zh['plan.revisionSend'] }))
    const expected = { answers: [{ id: 'plan-review', selected: [], custom: '时间改为近三年。\n不纳入预印本。' }] }
    expect(answer).toHaveBeenCalledWith(expected)
    expect(await result).toEqual(expected)
    expect(cancel).not.toHaveBeenCalled()
    expect(planReviewOf(carrier.questions)?.plan).toBe(plan)
  })

  it('retains feedback on failure and renders a fresh review for a revised plan', async () => {
    const { carrier, answer } = wait(questions().map(item => ({ ...item, detail: plan })))
    answer.mockRejectedValue(new Error('not sent'))
    const view = render(<QuestionComposer matched={carrier} {...kit} />)
    fireEvent.click(screen.getByRole('button', { name: zh['plan.revise'] }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '不纳入预印本。' } })
    fireEvent.click(screen.getByRole('button', { name: zh['plan.revisionSend'] }))
    expect(await screen.findByText('not sent')).toBeTruthy()
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('不纳入预印本。')
    fireEvent.click(screen.getByRole('button', { name: zh['plan.revisionBack'] }))
    expect(screen.getByRole('button', { name: zh['plan.approve'] }).hasAttribute('disabled')).toBe(false)
    const next = wait(questions().map(item => ({ ...item, detail: plan.replace('允许预印本', '不纳入预印本') })))
    view.rerender(<QuestionComposer matched={next.carrier} {...kit} t={seatOver(en, commonEn)} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('研究范围：近三年、不纳入预印本。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['plan.approve'] }))
    expect(next.answer).toHaveBeenCalledWith(decision('Approve'))
  })
})
