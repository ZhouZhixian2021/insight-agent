import { describe, expect, it } from 'vitest'
import { createQuestionEvidenceLedger } from '../src/question-ledger.ts'

describe('question evidence ledger', () => {
  it('starts every question at an even weight', () => {
    const ledger = createQuestionEvidenceLedger(['First?', 'Second?'])
    expect(ledger.weights()).toEqual([1, 1])
    expect(ledger.counts()).toEqual([0, 0])
  })

  it('lowers the weight of a question that already holds evidence', () => {
    const ledger = createQuestionEvidenceLedger(['First?', 'Second?'])
    ledger.observe([{ question: 'First?' }, { question: 'First?' }])
    expect(ledger.counts()).toEqual([2, 0])
    expect(ledger.weights()[0]).toBeLessThan(ledger.weights()[1] as number)
  })

  it('matches a question through its surrounding whitespace', () => {
    const ledger = createQuestionEvidenceLedger(['Which method?'])
    ledger.observe([{ question: '  Which   method? ' }])
    expect(ledger.counts()).toEqual([1])
  })

  it('ignores a link whose question is not part of the run', () => {
    const ledger = createQuestionEvidenceLedger(['Which method?'])
    ledger.observe([{ question: 'An unrelated question?' }])
    expect(ledger.counts()).toEqual([0])
  })
})
