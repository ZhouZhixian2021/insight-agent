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

it('binds numbered bibliography links to captured webpages and preserves chapter navigation', () => {
  const raw = doc('<nav><a href="#chapter">[1]</a></nav><section id="chapter"><p>结论<sup><a href="#s7">[7]</a></sup>。'
    + '图示<a href="#sources">[[cite:I2]]</a>。</p><table><tr><td>条件<a href="' + url + '">[7]</a></td></tr></table></section>'
    + '<ol data-report-sources><li id="s7"><a href="' + url + '">本轮网页</a></li></ol>')
  const { html, markdown } = inspectProductHtml(raw, material).report!
  expect(html).toContain('<nav><a href="#chapter">[1]</a></nav>')
  const citation = '<sup class="dsh-cite"><a href="' + url + '" target="_blank" rel="noopener noreferrer">[1]</a></sup>'
  expect(html.split(citation)).toHaveLength(4)
  expect(html).not.toMatch(/href="#s7"|href="#sources"|<sup><sup|\[7\]/u)
  expect(markdown.match(/\[\\\[1\\\]\]\(<https:\/\/example\.com\/test>\)/gu)).toHaveLength(3)
  const bad = raw.replace('<a href="' + url + '">本轮网页', '<a href="https://unobserved.test/">样稿网页')
  const rejected = inspectProductHtml(bad, material)
  expect(rejected.report).toBeUndefined()
  expect(rejected.issues.map(i => i.original)).toEqual([expect.stringContaining('结论')])
})

it('accepts one complete document inside prose and fences while rejecting ambiguous or incomplete replies', async () => {
  const complete = doc('<p>首稿。[[cite:P1]]</p><img data-image="I2"><!-- </html> -->')
  const wrapped = ['这是报告。', '```html', complete, '```', '生成完成。'].join('\n')
  const report = await writeProductHtml(material, '{}', async (_request, attempt, _repair, check) => {
    expect(attempt).toBe(1)
    expect(check(wrapped)).toEqual([])
    return { text: wrapped, error: null }
  })
  expect(report.html).toBe(inspectProductHtml(complete, material).report?.html)
  for (const bad of [complete + complete, complete.slice(0,-7), '<script>' + complete + '</script>']) {
    expect(inspectProductHtml(bad, material).report).toBeUndefined()
  }
})

it('changes only the rejected HTML unit inside a wrapped draft and keeps previously supported prose', async () => {
  const authored = '为您生成以下文档。\n```html\n' + doc('<p>第一段。[[cite:P1]]</p><p>第二段。[[cite:P9]]</p>') + '\n```'
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
