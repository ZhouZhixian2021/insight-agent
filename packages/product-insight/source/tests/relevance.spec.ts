import { describe, expect, it } from 'vitest'
import type { Product } from '@deepseek-ai/dsh-product-insight-model'
import { MINIMUM_QUESTION_TERM_HITS, relevanceSignals, scoreCandidateRelevance } from '../src/relevance.ts'

const apple: Product = { schemaVersion: 1, productId: 'product' as Product['productId'],
  name: '苹果 M6 芯片', developer: 'Apple', officialUrl: 'https://www.apple.com/' }
const question = '苹果官方公布的 M6 规格是什么——制程、CPU、GPU 核心数与内存带宽？'
const signals = relevanceSignals(apple, question)

describe('result relevance', () => {
  it('rejects the unrelated pages a degraded engine returned', () => {
    for (const candidate of [
      { url: 'https://example.test/congratulations', title: '恭喜祝福语大全' },
      { url: 'https://example.test/currency', title: 'MYR 兑换 USD 实时汇率' },
      { url: 'https://example.test/property', title: '新加坡物业登录页' },
      { url: 'https://example.test/wallpaper', title: '4K 壁纸下载' },
    ]) {
      expect(scoreCandidateRelevance(candidate, signals).relevant, candidate.title).toBe(false)
    }
  })

  it('admits a result whose title names the product line token', () => {
    const verdict = scoreCandidateRelevance({ url: 'https://review.test/m6-laptop', title: 'MacBook Pro M6 review' }, signals)
    expect(verdict.relevant).toBe(true)
    expect(verdict.reason).toContain('m6')
  })

  it('admits a result whose path alone names the product line', () => {
    expect(scoreCandidateRelevance({ url: 'https://example.test/news/m6-announcement', title: 'Announcement' }, signals).relevant)
      .toBe(true)
  })

  it('admits a result whose snippet names the product but whose title does not', () => {
    expect(scoreCandidateRelevance({ url: 'https://review.test/best-laptops', title: 'Best laptops of the year',
      snippet: 'The new 苹果 M6 芯片 leads every benchmark we ran.' }, signals).relevant).toBe(true)
  })

  it('admits a result matching enough approved question terms', () => {
    const verdict = scoreCandidateRelevance({ url: 'https://news.test/silicon', title: 'Apple silicon roadmap',
      snippet: '核心数与内存带宽的官方数据' }, signals)
    expect(verdict.relevant).toBe(true)
    expect(verdict.reason).toContain('question terms')
  })

  it('rejects a result matching fewer question terms than the threshold', () => {
    const verdict = scoreCandidateRelevance({ url: 'https://news.test/silicon', title: 'Apple silicon roadmap',
      snippet: '核心数略有提升' }, signals)
    expect(verdict.relevant).toBe(false)
    expect(verdict.reason).toContain(String(MINIMUM_QUESTION_TERM_HITS))
  })

  it('does not match a product name inside a longer word', () => {
    const example: Product = { ...apple, name: 'M6' }
    const verdict = scoreCandidateRelevance({ url: 'https://example.test/other', title: 'M600 printer driver' },
      relevanceSignals(example, 'printer setup'))
    expect(verdict.relevant).toBe(false)
  })

  it('treats a product without digit tokens as its whole name', () => {
    const printer: Product = { ...apple, name: 'LaserWriter', aliases: ['Laser Writer'] }
    const verdict = scoreCandidateRelevance({ url: 'https://review.test/printer', title: 'LaserWriter review' },
      relevanceSignals(printer, 'How fast does it print?'))
    expect(verdict.relevant).toBe(true)
    expect(verdict.reason).toContain('laserwriter')
  })

  it('rejects a result with no readable metadata', () => {
    const verdict = scoreCandidateRelevance({ url: 'not a url' }, relevanceSignals(apple, ''))
    expect(verdict.relevant).toBe(false)
    expect(verdict.reason).toContain('no title')
  })

  it('scores a product-line match above a question-term match', () => {
    const line = scoreCandidateRelevance({ url: 'https://review.test/m6', title: 'M6 review' }, signals)
    const terms = scoreCandidateRelevance({ url: 'https://news.test/silicon', title: 'Apple silicon roadmap',
      snippet: '官方公布的规格' }, signals)
    expect(line.relevant && terms.relevant).toBe(true)
    expect(line.score).toBeGreaterThan(terms.score)
  })

  it('ignores single-character question terms', () => {
    const verdict = scoreCandidateRelevance({ url: 'https://news.test/silicon', title: 'Apple silicon roadmap',
      snippet: '核心数略有提升' }, signals)
    expect(verdict.relevant).toBe(false)
  })
})
