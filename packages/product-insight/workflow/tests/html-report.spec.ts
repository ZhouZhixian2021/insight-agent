import { expect, it } from 'vitest'
import { inspectProductHtml, writeProductHtml } from '../src/html-report.ts'
import { htmlWritingRequest } from '../src/html-writing.ts'
import { readProductWritingReference } from '../src/writing-reference.ts'
import type { ProductSynthesisInput } from '../src/report.ts'

const url = 'https://example.com/test'
const card = { id: 'I2', pageUrl: url, imageUrl: url + '.png', caption: '测试图', summary: '测试画面', context: '', facts: [],
  dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }
const material: ProductSynthesisInput = { scope: '本轮范围', questions: [{ questionId:'a',question:'价格',evidence:[] }],
  images:[card], pageSummaries:[{ source:{ sourceId:'P1',title:'测试原文',url,sourceType:'official_documentation',observedAt:'2026-11-24T00:00:00Z' },summary:'测得 42 秒。' }] }
const doc = (content: string) => '<!doctype html><html lang="zh-CN"><head><title>自主标题</title><meta name="dsh-unanswered" content="Q1">'
  + '<style>main > p{color:teal}</style></head><body><main><h1>自主标题</h1>' + content
  + '<footer><h2>阅读来源</h2><ol data-report-sources></ol></footer></main></body></html>'

it('binds citations and originals to the supplied materials inside the authored layout', async () => {
  const reference = await readProductWritingReference()
  const request = JSON.parse(htmlWritingRequest(material,reference)) as { styleReference: unknown; images: [{ dataUrl?: string }] }
  expect(request.styleReference).toEqual(reference)
  expect(request.images[0].dataUrl).toBeUndefined()
  const view = inspectProductHtml(doc('<p>用时 42 秒。[[cite:P1]][[cite:I2]]</p><figure><img data-image="I2" alt="测试图"></figure>'),material).report!
  expect(view.html).toContain('main > p{color:teal}')
  expect(view.html).toContain('src="' + card.dataUrl + '"')
  expect(view.html).toMatch(/秒<sup[^>]+><a[^>]+>\[1\]<\/a><\/sup>。/u)
  expect(view.html.match(/<li>/gu)).toHaveLength(1)
  expect(view.html).not.toMatch(/调查问题覆盖情况|dsh-unanswered|未达标原因|\[\[cite:/u)
  expect(view.markdown).toContain('# 自主标题')
  expect(view.markdown).toContain('42 秒')
  expect(view.unanswered).toEqual(['a'])
})

it('sorts each sentence’s citations by their bibliography numbers and links duplicate aliases once', () => {
  const sources = Array.from({ length: 11 }, (_, i) => ({
    sourceId: 'P' + String(11 - i), title: '来源 ' + String(i + 1), url: url + '/' + String(i + 1),
    sourceType: 'official_documentation' as const, observedAt: '2026-11-24T00:00:00Z',
  }))
  const input: ProductSynthesisInput = { scope: '', questions: [], sources, images: [{ ...card, pageUrl: url + '/2' }] }
  const firstMentions = sources.map(source => '<p>材料。[[cite:' + source.sourceId + ']]</p>').join('')
  const raw = doc(firstMentions + '<p>发售安排。[[cite:P6]][[cite:I2,P1,P10]]</p>')
  const { html } = inspectProductHtml(raw, input).report!
  const paragraph = /<p>发售安(.*?)<\/p>/u.exec(html)?.[1] ?? ''
  expect(paragraph).toMatch(/^<span class="dsh-cited-end">排<sup.*<\/sup>。<\/span>$/u)
  expect([...paragraph.matchAll(/href="([^"]+)"[^>]*>\[(\d+)\]<\/a>/gu)].map(([, href, n]) => [href, n]))
    .toEqual([[url + '/2', '2'], [url + '/6', '6'], [url + '/11', '11']])
  expect([...html.matchAll(/<li><a href="([^"]+)"/gu)].map(([, href]) => href)).toEqual(sources.map(source => source.url))
  expect(html).toContain('来源 2</a>（图 I2）')
})

it('changes only the rejected HTML unit and keeps previously supported prose', async () => {
  const authored = doc('<p>第一段。[[cite:P1]]</p><p>第二段。[[cite:P9]]</p>')
  const report = await writeProductHtml(material,'{}',async (request, attempt, repair, validate) => {
    if (attempt === 1) return { text:authored,error:validate(authored).length ? 'invalid_output' : null }
    expect(repair).toBe(true)
    const { repair: unit } = JSON.parse(request) as { repair: [{ id: string; original: string }] }
    expect(unit).toHaveLength(1)
    expect(unit[0].original).toContain('第二段')
    const text = JSON.stringify([{ id:unit[0].id,html:'<p>修订段。[[cite:P1]]</p>' }])
    expect(validate(text)).toEqual([])
    return { text,error:null }
  })
  expect(report.markdown).toContain('第一段')
  expect(report.markdown).toContain('修订段')
  expect(report.markdown).not.toContain('第二段')
})
