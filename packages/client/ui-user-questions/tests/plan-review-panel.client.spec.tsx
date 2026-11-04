// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { PendingQuestion, planReviewOf, type QuestionComposerProps } from '../src/client/contract/slots.ts'
import { QuestionComposer } from '../src/client/QuestionComposer.tsx'
import { en, zh } from '../src/client/locales.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { SID, seatOver, kit, PLAN, questions, wait, decision } from './plan-review.fixture.client.ts'
afterEach(cleanup)

describe('planReviewOf', () => {
  it('narrows a plan-review request to its decision, options included', () => {
    expect(planReviewOf(questions())).toEqual({
      id: 'plan-review',
      question: 'Approve this plan and leave plan mode?',
      plan: PLAN,
      approve: { label: 'Approve', description: 'Leave plan mode; the plan is carried out from the next step.' },
      decline: { label: 'Keep planning', description: 'Stay in plan mode; feedback goes back to the model.' },
    })
  })

  it('retains the logged invocation so the review can reopen its exact plan', () => {
    const question = questions()[0]!
    const callId = 'plan-call' as ToolCallId
    const review = planReviewOf([{
      ...question,
      intent: { kind: 'plan-review', approve: 'Approve', callId },
    }])
    expect(review).toEqual({ ...planReviewOf([question]), callId })
  })

  it('leaves the decline absent when the asker offered approve alone', () => {
    const [question] = questions()
    const review = planReviewOf([{ ...question as object, options: [{ label: 'Approve' }] } as never])
    expect(review?.approve).toEqual({ label: 'Approve' })
    expect(review === undefined ? true : 'decline' in review).toBe(false)
  })

  it.each([
    ['a batch of more than one question', () => [...questions(), ...questions()]],
    ['no intent at all', () => [{ ...questions()[0] as object, intent: undefined }]],
    ['an intent without the plan as detail', () => [{ ...questions()[0] as object, detail: undefined }]],
    ['an intent whose approve names no option', () => [{
      ...questions()[0] as object, intent: { kind: 'plan-review', approve: 'Ship it' },
    }]],
    ['an intent with no options at all', () => [{ ...questions()[0] as object, options: undefined }]],
    // Two buttons cannot send a third label or a combination, and the generic
    // flow can: an intent never costs the user a reachable answer.
    ['a third option the card could not offer', () => [{
      ...questions()[0] as object,
      options: [{ label: 'Approve' }, { label: 'Keep planning' }, { label: 'Start over' }],
    }]],
    ['a multi-select decision', () => [{ ...questions()[0] as object, multiSelect: true }]],
  ])('declines %s, leaving the request to the generic flow', (_case, build) => {
    expect(planReviewOf(build() as never)).toBeUndefined()
  })

  it('declines an empty batch, which the generic flow reports as such', () => {
    expect(planReviewOf([])).toBeUndefined()
  })
})

describe('PlanReviewPanel', () => {
  it('passes distinct pending request identities to the preview action for unlogged reviews', () => {
    const rendered = vi.fn<(key: string, owner: unknown) => void>()
    const renderSlot: QuestionComposerProps['renderSlot'] = (key, owner) => { rendered(key, owner); return null }
    const first = wait()
    const second = wait()
    const view = render(<QuestionComposer matched={first.carrier} {...kit} renderSlot={renderSlot} />)
    expect(rendered).toHaveBeenLastCalledWith('conversation.plan-review.actions', {
      review: planReviewOf(first.carrier.questions), requestKey: first.carrier.key,
    })
    view.rerender(<QuestionComposer matched={second.carrier} {...kit} renderSlot={renderSlot} />)
    expect(rendered).toHaveBeenLastCalledWith('conversation.plan-review.actions', {
      review: planReviewOf(second.carrier.questions), requestKey: second.carrier.key,
    })
    expect(first.carrier.key).not.toBe(second.carrier.key)
    expect(first.answer).not.toHaveBeenCalled()
    expect(second.answer).not.toHaveBeenCalled()
  })
  it('shows the plan title and summary above two review actions', () => {
    const { carrier } = wait()
    render(<QuestionComposer matched={carrier} {...kit} />)

    expect(document.querySelector('[data-plan-review-key]')?.getAttribute('data-plan-review-key')).toBe(carrier.key)
    expect(screen.getByText(zh['plan.header'])).toBeTruthy()
    expect(document.querySelector('[data-plan-review-key] [data-state="warning"]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Ship the picker' })).toBeTruthy()
    expect(screen.getByText('read the store')).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.queryByText('render the rows')).toBeNull()
    expect(document.querySelector('[data-plan-review-scroll]')).not.toBeNull()
    // The question text stays as the card's accessible name rather than a title
    // that reads like a test item.
    expect(screen.getByLabelText('Approve this plan and leave plan mode?')).toBeTruthy()
    // No pager, no numbered options, no skip, no custom answer.
    expect(screen.queryByText('1 / 1')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByText(zh['action.skip'])).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('extracts a plain summary and keeps a heading-only plan compact', () => {
    const question = questions()[0]!
    const detail = '# **Release** plan\n\nReview the [changes](https://example.com) before **shipping**.\n\n## Steps\n- Build'
    const { carrier } = wait([{ ...question, detail }])
    const view = render(<QuestionComposer matched={carrier} {...kit} />)
    expect(screen.getByRole('heading', { name: 'Release plan' })).toBeTruthy()
    expect(screen.getByText('Review the changes before shipping.')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    const onlyTitle = wait([{ ...question, detail: '# Plan without a summary' }])
    view.rerender(<QuestionComposer matched={onlyTitle.carrier} {...kit} />)
    expect(screen.getByRole('heading', { name: 'Plan without a summary' })).toBeTruthy()
    expect(document.querySelector('[data-plan-review-key] p')).toBeNull()
    const paragraph = wait([{ ...question, detail: 'A single paragraph plan.' }])
    view.rerender(<QuestionComposer matched={paragraph.carrier} {...kit} />)
    expect(screen.getAllByText('A single paragraph plan.')).toHaveLength(1)
  })

  it('answers with the asker\'s approve label and keeps its description as the tooltip', () => {
    const { carrier, answer } = wait()
    render(<QuestionComposer matched={carrier} {...kit} />)

    const approve = screen.getByRole('button', { name: zh['plan.approve'] })
    expect(approve.getAttribute('title')).toBe('Leave plan mode; the plan is carried out from the next step.')
    fireEvent.click(approve)
    expect(answer).toHaveBeenCalledWith(decision('Approve'))
    expect(document.querySelector('[data-plan-review-key] [data-state="ongoing"]')).not.toBeNull()
    expect(document.querySelector('[data-plan-review-key] section')?.getAttribute('aria-busy')).toBe('true')
    // One-shot: every action locks until the host's resolved frame lands.
    expect(approve.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: zh['plan.discuss'] }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(approve)
    expect(answer).toHaveBeenCalledTimes(1)
  })

  it('hides a continued plan decision after steering its reply', async () => {
    const carrier = new PendingQuestion(SID, questions(), 'continued-plan' as ToolCallId)
    const answer = vi.fn(async () => true)
    const hide = vi.fn()
    carrier.attachRpc({ answer })
    carrier.attachSeat({ hide })
    carrier.setState('continued')
    render(<QuestionComposer matched={carrier} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['plan.approve'] }))
    await vi.waitFor(() => { expect(hide).toHaveBeenCalledOnce() })
    expect(screen.getByRole('button', { name: zh['plan.approve'] }).hasAttribute('disabled')).toBe(false)
    expect(answer).toHaveBeenCalledOnce()
  })

  it('reports a sent plan reply when hiding its panel fails', async () => {
    const carrier = new PendingQuestion(SID, questions(), 'continued-plan-hide-error' as ToolCallId)
    const answer = vi.fn(async () => true)
    carrier.attachRpc({ answer })
    carrier.attachSeat({ hide: () => { throw new Error('hide failed') } })
    carrier.setState('continued')
    render(<QuestionComposer matched={carrier} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['plan.approve'] }))
    expect(await screen.findByText(zh['status.sent'])).toBeTruthy()
    expect(answer).toHaveBeenCalledOnce()
  })


  it('dismisses the request so the composer returns for a plain message', () => {
    const { carrier, cancel, answer } = wait()
    render(<QuestionComposer matched={carrier} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['plan.discuss'] }))
    expect(cancel).toHaveBeenCalledWith()
    expect(answer).not.toHaveBeenCalled()
  })

  it('omits the tooltip for an option carrying no description', () => {
    const { carrier } = wait([{
      ...questions()[0] as object,
      options: [{ label: 'Approve' }, { label: 'Keep planning' }],
    }] as never)
    render(<QuestionComposer matched={carrier} {...kit} />)

    expect(screen.getByRole('button', { name: zh['plan.approve'] }).hasAttribute('title')).toBe(false)
  })

  it('hides the decline action when the asker offered approve alone', () => {
    const { carrier } = wait([{
      ...questions()[0] as object, options: [{ label: 'Approve' }],
    }] as never)
    render(<QuestionComposer matched={carrier} {...kit} />)

    expect(screen.queryByRole('button', { name: zh['plan.decline'] })).toBeNull()
    expect(screen.getByRole('button', { name: zh['plan.approve'] })).toBeTruthy()
  })

  it('re-arms the actions and says why when the decision does not land', async () => {
    const { carrier, answer } = wait()
    answer.mockRejectedValue(new Error('question response rejected: not-pending'))
    render(<QuestionComposer matched={carrier} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['plan.approve'] }))
    const failure = await screen.findByText('question response rejected: not-pending')
    expect(failure.getAttribute('role')).toBe('status')
    // Re-armed for the retry: a lost click must not leave a dead card.
    expect(screen.getByRole('button', { name: zh['plan.approve'] }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: zh['plan.approve'] }))
    expect(answer).toHaveBeenCalledTimes(2)
  })

  it('reports a non-Error transport failure as its stringified value', async () => {
    // A non-Error rejection is the case under test: a carrier can reject with
    // anything, and the panel must still show the user something.
    const { carrier, cancel } = wait()
    cancel.mockRejectedValue('socket gone')
    render(<QuestionComposer matched={carrier} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['plan.discuss'] }))
    expect(await screen.findByText('socket gone')).toBeTruthy()
  })

  it('carries the same decision surface in English', () => {
    const { carrier } = wait()
    render(<QuestionComposer matched={carrier} {...kit} t={seatOver(en, commonEn)} />)

    expect(screen.getByText('Plan review')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Refuse' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeTruthy()
  })
})
