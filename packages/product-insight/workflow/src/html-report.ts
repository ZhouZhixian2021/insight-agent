import { parse, parseFragment, Parser, type DefaultTreeAdapterTypes as Tree, type Token } from 'parse5'
import type { ProductSynthesisInput } from './report.ts'
import { synthesisAliases } from './synthesis-output.ts'

export interface AuthoredProductReport {
  html: string
  markdown: string
  unanswered: string[]
  repairNote?: string
}

interface Source { url: string; title: string }
type Element = Tree.Element
type Node = Tree.ChildNode
const allowed = new Set('main article section header footer aside nav address h1 h2 h3 h4 h5 h6 p div span ul ol li dl dt dd table caption colgroup col thead tbody tfoot tr th td figure figcaption blockquote strong em b i small mark abbr time cite code pre kbd sub sup br hr a details summary'.split(' '))
const discard = new Set('script style noscript iframe object embed svg math link meta base form input button audio video template'.split(' '))
const element = (n: Node): n is Element => 'tagName' in n
const attr = (e: Element, key: string) => e.attrs.find(a => a.name === key)?.value
const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const textOf = (n: Node): string => 'value' in n ? n.value : element(n) ? n.childNodes.map(textOf).join('') : ''
const matches = (p: Tree.ParentNode, tag: string): Element[] => p.childNodes.flatMap(n =>
  element(n) ? [...(n.tagName === tag ? [n] : []), ...matches(n, tag)] : [])
const raster = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/]+=*$/iu
function httpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return /^https?:$/u.test(url.protocol) && !url.username && !url.password
  } catch { return false }
}
const cleanCss = (v: string) => /[<\\]|@import\b|url\s*\(|image-set\s*\(|expression\s*\(/iu.test(v) ? '' : v
const marker = /\[\[\s*cite\s*:\s*([^\]]+?)\s*\]\]/giu
const citationLabel = /^(?:\[\s*\d+(?:\s*[,，、–-]\s*\d+)*\s*\]\s*)+$/u
const contentPolicy = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"
const mechanics = '.dsh-cited-end{white-space:nowrap}sup.dsh-cite{font-size:.72em;line-height:0;vertical-align:super;white-space:nowrap}sup.dsh-cite a{color:inherit;text-decoration:none;border:0}img{max-width:100%;height:auto}.dsh-table-scroll{max-width:100%;overflow-x:auto}'

function publicationUrl(value: string): string {
  const link = new URL(value)
  if (['www.bing.com','bing.com'].includes(link.hostname) && link.pathname.toLowerCase() === '/news/apiclick.aspx') {
    const target = link.searchParams.get('url')
    if (target && httpUrl(target)) return target
  }
  return value
}

function sourceCatalog(input: ProductSynthesisInput): Map<string, Source> {
  const catalog = new Map<string, Source>()
  for (const page of [...(input.sources ?? []), ...(input.pageSummaries ?? []).map(s => s.source)]) {
    if (httpUrl(page.url)) catalog.set(page.sourceId, { url: publicationUrl(page.url), title: page.title || publicationUrl(page.url) })
  }
  const evidence = new Map(input.questions.flatMap(q => q.evidence.map(e => [String(e.evidenceId), e] as const)))
  for (const [alias, key] of synthesisAliases(input)) {
    const page = catalog.get(evidence.get(key)?.sourceId ?? '')
    if (page) catalog.set(alias, page)
  }
  for (const image of input.images ?? []) {
    if (!httpUrl(image.pageUrl)) continue
    const url = publicationUrl(image.pageUrl)
    const page = [...catalog.values()].find(s => s.url === url)
    catalog.set(image.id, page ?? { url, title: image.caption || url })
  }
  return catalog
}

function attributes(node: Element): string {
  return node.attrs.flatMap(({ name, value }) => {
    if (name === 'style') value = cleanCss(value)
    else if (!/^(?:class|id|lang|dir|title|role|scope|rowspan|colspan|datetime|open|aria-label|aria-labelledby)$/u.test(name)) return []
    return value || name === 'open' ? [' ' + name + '="' + esc(value) + '"'] : []
  }).join('')
}

export interface HtmlRepairUnit { id: string; original: string; reason: string; start: number; end: number }
export interface HtmlInspection { report?: AuthoredProductReport; issues: HtmlRepairUnit[]; problem?: string }

// Track explicit document boundaries before HTML tree correction merges adjacent documents.
// The parser ignores apparent tags in comments, scripts, styles and quoted attributes.
class ReportEnvelope extends Parser<Tree.DefaultTreeAdapterMap> {
  readonly opens = new Set<number>()
  readonly closes = new Set<number>()
  readonly doctypes: Token.Location[] = []

  override onStartTag(token: Token.TagToken): void {
    if (token.tagName === 'html' && token.location) this.opens.add(token.location.startOffset)
    super.onStartTag(token)
  }
  override onEndTag(token: Token.TagToken): void {
    if (token.tagName === 'html' && token.location) this.closes.add(token.location.endOffset)
    super.onEndTag(token)
  }
  override onDoctype(token: Token.DoctypeToken): void {
    if (token.location) this.doctypes.push(token.location)
    super.onDoctype(token)
  }
}

/** Bind actual captured sources and images, preserving the author's static layout. */
export function inspectProductHtml(raw: string, input: ProductSynthesisInput): HtmlInspection {
  const envelope = new ReportEnvelope({ sourceCodeLocationInfo: true })
  envelope.tokenizer.write(raw, true)
  const [open] = envelope.opens, [end] = envelope.closes
  if (envelope.opens.size !== 1 || envelope.closes.size !== 1 || open === undefined || end === undefined || end <= open) {
    return { issues: [], problem: '写作响应必须包含唯一且完整的 HTML 文档。' }
  }
  const doctype = envelope.doctypes.find(d => d.endOffset <= open && !raw.slice(d.endOffset, open).trim())
  const start = doctype?.startOffset ?? open
  const doc = start === 0 && end === raw.length ? envelope.document : parse(raw.slice(start,end), { sourceCodeLocationInfo: true })
  const root = matches(doc, 'html')[0], head = matches(doc, 'head')[0], body = matches(doc, 'body')[0]
  if (!root || !head || !body) return { issues: [], problem: '写作响应缺少完整的 HTML 正文。' }
  const title = matches(head, 'title').map(textOf).find(t => t.trim())
  if (!title || !matches(body, 'h1').some(h => textOf(h).trim())
    || !textOf(body).trim()) return { issues: [], problem: '需要完整的 HTML 文档、文档标题和有内容的正文标题。' }
  const catalog = sourceCatalog(input)
  const sourceIdForUrl = (href: string) => {
    if (!httpUrl(href)) return undefined
    const url = publicationUrl(href)
    return [...catalog].find(([, source]) => source.url === url)?.[0]
  }
  const images = new Map((input.images ?? []).map(image => [image.id, image]))
  const used = new Map<string, { number: number; source: Source; imageIds: Set<string> }>()
  const issues = new Map<number, HtmlRepairUnit>()
  let bibliography: Element | undefined
  const citationsFor = (ids: readonly string[]) => {
    const group = new Map<number, string>()
    for (const id of ids) {
      const source = catalog.get(id)
      if (!source) continue
      let ref = used.get(source.url)
      if (!ref) {
        ref = { number: used.size + 1, source, imageIds: new Set() }
        used.set(source.url, ref)
      }
      if (images.has(id)) ref.imageIds.add(id)
      group.set(ref.number, source.url)
    }
    return [...group].sort(([a], [b]) => a - b).map(([number, url]) =>
      '<sup class="dsh-cite"><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">[' + String(number) + ']</a></sup>').join('')
  }
  const issue = (owner: Element, why: string) => {
    let block = owner
    while (!['p','li','td','th','figcaption','figure','h1','h2','h3','dd'].includes(block.tagName)
      && block.parentNode && 'tagName' in block.parentNode && block.parentNode.tagName !== 'body') block = block.parentNode
    const loc = block.sourceCodeLocation
    if (!loc) return
    const existing = issues.get(loc.startOffset)
    if (existing) existing.reason += ' ' + why
    else issues.set(loc.startOffset, { id: 'R' + String(issues.size + 1), start: start + loc.startOffset,
      end: start + loc.endOffset, original: raw.slice(start + loc.startOffset, start + loc.endOffset), reason: why })
  }
  // Keep the citation group and the last character of its sentence together even on a narrow screen.
  const citedText = (value: string, owner: Element): string => {
    const groups = /([^\s[\]，。！？；：、,.!?;:])?([。！？；：，、.,!?;:”’）)]*)[ \t]*((?:\[\[\s*cite\s*:\s*[^\]]+\]\](?:[ \t]*(?=\[\[\s*cite))?)+)/giu
    let result = '', last = 0
    for (const group of value.matchAll(groups)) {
      result += esc(value.slice(last,group.index))
      const ids = [...(group[3] ?? '').matchAll(marker)].flatMap(m => (m[1] ?? '').trim().toUpperCase().split(/[\s,，、;；]+/u))
      const unknown = ids.filter(id => !catalog.has(id))
      if (unknown.length) issue(owner, '核对引用 ' + unknown.join('、') + '，只使用实际支持此句的本轮编号；缺乏依据时改写该句。')
      const citations = citationsFor(ids)
      result += '<span class="dsh-cited-end">' + esc(group[1] ?? '') + citations + esc(group[2] ?? '') + '</span>'
      last = group.index + group[0].length
    }
    result += esc(value.slice(last))
    if (/\[\[\s*cite\b/iu.test(result)) issue(owner, '引用标记不完整，请保留对应句子并更正材料编号。')
    return result
  }
  const render = (n: Node, owner: Element, inNavigation = false, inLink = false): string => {
    if ('value' in n) return citedText(n.value, owner)
    if (!element(n) || discard.has(n.tagName)) return ''
    const tag = n.tagName
    if (attr(n, 'data-report-sources') !== undefined && ['ol','ul','div','section'].includes(tag)) {
      if (bibliography) return ''
      const token = '<!--dsh-report-sources-->'
      bibliography = n
      return token
    }
    if (tag === 'img') {
      const id = attr(n, 'data-image')?.trim().toUpperCase()
      const image = id && images.get(id)
      if (!image || !raster.test(image.dataUrl) || !catalog.has(image.id)) {
        issue(n, '只能展示本轮提供的有效原图。请在这个位置更正图片编号或移除配图。')
        return ''
      }
      return '<img alt="' + esc(attr(n,'alt') || image.caption || image.summary) + '" src="' + image.dataUrl + '"'
        + (httpUrl(image.imageUrl) ? ' data-original="' + esc(image.imageUrl) + '"' : '') + '>' + citationsFor([image.id])
    }
    const navigation = inNavigation || tag === 'nav' || attr(n, 'role') === 'navigation'
    const children = n.childNodes.map(c => render(c, n, navigation, inLink || tag === 'a')).join('')
    if (!allowed.has(tag)) return children
    let attrs = attributes(n)
    if (tag === 'sup') {
      if (children.includes('<sup class="dsh-cite">')) return children
      if (!inLink && !navigation && !matches(n, 'a').length && citationLabel.test(textOf(n).trim())) {
        issue(n, '这个数字上标没有对应的本轮材料。请在原句写入对应材料标记。')
        return ''
      }
    }
    if (tag === 'a') {
      const href = attr(n, 'href') ?? ''
      // An author can wrap a material marker in a link copied from the style example.
      if (children.includes('<sup class="dsh-cite">')) return children
      const label = textOf(n).trim()
      const numbered = !navigation && (citationLabel.test(label)
        || /^\d+$/u.test(label) && (owner.tagName === 'sup' || matches(n, 'sup').length > 0 || attr(n, 'role') === 'doc-noteref'))
      if (numbered && (!href || href.startsWith('#'))) {
        const entries = href.length > 1 ? matches(body, 'li').filter(li => attr(li, 'id') === href.slice(1)) : []
        const entry = entries.length === 1 ? entries[0] : undefined
        const links = entry ? matches(entry, 'a').map(a => attr(a, 'href') ?? '').filter(u => !u.startsWith('#')) : []
        const ids = links.map(sourceIdForUrl)
        if (ids.length && ids.every((id): id is string => Boolean(id))) return citationsFor(ids)
        issue(n, '这个数字角标缺少可确认的来源网址。请在原句使用本轮材料编号 [[cite:P…]]、[[cite:I…]] 或 [[cite:E…]]。')
        return ''
      }
      if (/^#[^\s"'<>]+$/u.test(href)) attrs += ' href="' + esc(href) + '"'
      else if (href) {
        const id = sourceIdForUrl(href)
        if (!id) { issue(n, '链接不在本轮来源中，请改为有依据的句末引用或去掉未经提供的链接。'); return children }
        return (numbered ? '' : children) + citationsFor([id])
      }
    }
    if (['br','hr','col'].includes(tag)) return '<' + tag + attrs + '>'
    const markup = '<' + tag + attrs + '>' + children + '</' + tag + '>'
    return tag === 'table' ? '<div class="dsh-table-scroll">' + markup + '</div>' : markup
  }
  const bodyHtml = body.childNodes.map(n => render(n, body)).join('')
  if (issues.size) {
    const ordered = [...issues.values()].sort((a, b) => a.start - b.start)
    return { issues: ordered.filter((unit, i) => !ordered.slice(0, i).some(p => p.end >= unit.end)) }
  }
  if (catalog.size && !used.size) return { issues: [], problem: '正文需要为本轮材料支持的事实标注句末引用。' }
  const list = '<ol' + (bibliography ? attributes(bibliography) : '') + '>' + [...used.values()].map(({ source,imageIds }) =>
    '<li><a href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(source.title) + '</a>'
    + (imageIds.size ? '（图 ' + [...imageIds].map(esc).join('、') + '）' : '') + '</li>').join('') + '</ol>'
  const content = bibliography ? bodyHtml.replace('<!--dsh-report-sources-->', () => list) : bodyHtml + (used.size ? list : '')
  const styles = matches(head, 'style').map(textOf).map(cleanCss).filter(Boolean).join('\n')
  const html = '<!doctype html><html' + attributes(root) + '><head><meta charset="utf-8">'
    + '<meta http-equiv="Content-Security-Policy" content="' + contentPolicy + '"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + esc(title) + '</title><style>' + styles + '\n' + mechanics + '</style></head><body' + attributes(body) + '>'
    + content + '</body></html>'
  const missing = matches(head,'meta').find(m => attr(m,'name') === 'dsh-unanswered')
  const indexes = new Set((missing && attr(missing,'content') || '').toUpperCase().split(/[\s,，、]+/u))
  return { issues: [], report: { html, markdown: markdownFromHtml(html),
    unanswered: input.questions.flatMap((q,i) => indexes.has('Q' + String(i + 1)) ? [q.questionId] : []) } }
}

/** Secondary, lightweight Markdown view of the same finished report. */
function markdownFromHtml(html: string): string {
  const body = matches(parse(html), 'body')[0]
  if (!body) throw Error('保存的 HTML 缺少正文。')
  const md = (n: Node): string => {
    if ('value' in n) return n.value.replace(/\s+/gu, ' ')
    if (!element(n)) return ''
    const tag = n.tagName, children = n.childNodes.map(md).join('')
    if (tag === 'img') return '![' + (attr(n,'alt') ?? '').replaceAll(']','\\]') + '](<' + (attr(n,'data-original') ?? '') + '>)'
    const href = attr(n, 'href')
    if (tag === 'a' && href) return '[' + children.replace(/[[\]]/gu,'\\$&') + '](<' + href + '>)'
    if (/^h[1-6]$/u.test(tag)) return '\n\n' + '#'.repeat(Number(tag[1])) + ' ' + children.trim() + '\n\n'
    if (tag === 'br') return '  \n'
    if (tag === 'hr') return '\n\n---\n\n'
    if (tag === 'strong' || tag === 'b') return '**' + children.trim() + '**'
    if (tag === 'em' || tag === 'i') return '*' + children.trim() + '*'
    if (tag === 'table') {
      const rows = matches(n,'tr').map(r => r.childNodes.filter(element).filter(c => ['td','th'].includes(c.tagName))
        .map(c => c.childNodes.map(md).join('').trim().replaceAll('|','\\|').replace(/\s*\n\s*/gu,' '))).filter(r => r.length)
      if (!rows[0]) return ''
      const caption = matches(n,'caption')[0]
      return '\n\n' + (caption ? textOf(caption).trim() + '\n\n' : '') + [rows[0],rows[0].map(() => '---'),...rows.slice(1)].map(c => '| ' + c.join(' | ') + ' |').join('\n') + '\n\n'
    }
    if (tag === 'li') {
      const parent = n.parentNode
      const number = parent && 'tagName' in parent && parent.tagName === 'ol' ? parent.childNodes.filter(element).indexOf(n) + 1 : 0
      return (number ? String(number) + '. ' : '- ') + children.trim() + '\n'
    }
    if (['p','div','li','dl','dt','dd','blockquote','pre','figure','figcaption','ul','ol','section','header','footer','article','aside'].includes(tag)) return '\n\n' + children.trim() + '\n\n'
    return children
  }
  return body.childNodes.map(md).join('').replace(/\n[ \t]+\n/gu,'\n\n').replace(/\n{3,}/gu,'\n\n').trim() + '\n'
}

/** Save a clearly limited draft when the writer fails, using the captured material only. */
export function productHtmlDraft(title: string, input: ProductSynthesisInput): AuthoredProductReport {
  const catalog = sourceCatalog(input)
  const notes = (input.pageSummaries ?? []).map(p => ({ id: p.source.sourceId, text: p.summary, title: p.source.title || p.source.url }))
  if (!notes.length) for (const [id,key] of synthesisAliases(input)) {
    const fact = input.questions.flatMap(q => q.evidence).find(e => String(e.evidenceId) === key)
    if (fact) notes.push({ id,text:fact.sourcedStatement,title:catalog.get(id)?.title ?? '' })
  }
  if (!notes.length) for (const pic of input.images ?? []) notes.push({ id:pic.id,text:pic.summary,title:pic.caption })
  const usable = notes.filter(n => catalog.has(n.id))
  const literal = (value: string) => esc(value).replaceAll('[','［')
  const label = literal(title + ' · 资料草稿')
  if (!usable.length) {
    const sentence = '本轮资料尚不足以形成可引用的产品判断。'
    const document = '<!doctype html><html lang="zh-CN"><head><title>' + label + '</title></head><body><h1>' + label
      + '</h1><p>' + sentence + '</p></body></html>'
    const { report } = inspectProductHtml(document, { scope: input.scope, questions: [] })
    if (!report) throw Error('资料草稿缺少有效的标题或正文。')
    return { ...report, unanswered: input.questions.map(q => q.questionId), repairNote: sentence }
  }
  const html = '<!doctype html><html lang="zh-CN"><head><title>' + label + '</title></head><body><h1>' + label
    + '</h1><p>综合写作未完成。以下为本轮可追溯的资料。</p>' + usable.map(n =>
    '<section><h2>' + literal(n.title) + '</h2><p>' + literal(n.text) + '[[cite:' + n.id + ']]</p></section>').join('')
    + '<ol data-report-sources></ol></body></html>'
  const result = inspectProductHtml(html,input)
  if (!result.report) throw Error('本轮材料无法形成可溯源的资料草稿。')
  return result.report
}

/** Keep successful prose intact when only an individual citation or illustration needs repair. */
type HtmlCall = (user: string, attempt: 1 | 2, correction: boolean,
  validate: (text: string) => string[]) => Promise<{ text: string; error: string | null }>

export async function writeProductHtml(input: ProductSynthesisInput, material: string, call: HtmlCall,
  signal?: AbortSignal): Promise<AuthoredProductReport> {
  let last: { raw: string; inspected: HtmlInspection } | undefined
  const inspect = (raw: string) => {
    if (last?.raw !== raw) last = { raw, inspected: inspectProductHtml(raw,input) }
    return last.inspected
  }
  const reasons = (v: HtmlInspection) => v.problem ? [v.problem] : v.issues.map(i => i.id + ': ' + i.reason)
  const validate = (raw: string) => reasons(inspect(raw))
  const first = await call(material,1,false,validate)
  signal?.throwIfAborted()
  const inspected = inspect(first.text)
  if (first.error === null && inspected.report) return inspected.report
  if (inspected.issues.length && (first.error === null || first.error === 'invalid_output')) {
    const units = inspected.issues
    const merge = (text: string): string => {
      let edits: { id: string; html: string }[] = []
      try {
        const parsed: unknown = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/giu, ''))
        if (Array.isArray(parsed)) edits = (parsed as unknown[]).flatMap(e =>
          e && typeof e === 'object' && 'id' in e && typeof e.id === 'string' && 'html' in e && typeof e.html === 'string'
            ? [{ id: e.id, html: e.html }] : [])
      } catch { return first.text }
      let draft = first.text
      for (const unit of [...units].reverse()) {
        const candidates = edits.filter(e => e.id === unit.id)
        if (candidates.length !== 1 || typeof candidates[0]?.html !== 'string') continue
        const replacement = candidates[0].html.trim()
        const nodes = parseFragment(replacement).childNodes.filter(n => element(n) || 'value' in n && n.value.trim())
        const tag = unit.original.match(/^<([a-z0-9]+)/iu)?.[1]?.toLowerCase()
        const replacementNode = nodes[0]
        if (nodes.length !== 1 || !replacementNode || !element(replacementNode) || replacementNode.tagName !== tag) continue
        draft = draft.slice(0,unit.start) + replacement + draft.slice(unit.end)
      }
      return draft
    }
    const user = JSON.stringify({ ...JSON.parse(material), repair: units.map(({ id,original,reason }) => ({ id,original,reason })) })
    const second = await call(user,2,true,text => validate(merge(text)))
    signal?.throwIfAborted()
    let draft = second.error === null || second.error === 'invalid_output' ? merge(second.text) : first.text
    const repaired = inspect(draft)
    if (repaired.report) return repaired.report
    for (const unit of [...repaired.issues].reverse()) {
      const tag = unit.original.match(/^<([a-z0-9]+)/iu)?.[1]?.toLowerCase() ?? 'p'
      const gap = tag === 'img' ? '' : '<' + tag + '>本轮资料未能核实此处内容。</' + tag + '>'
      draft = draft.slice(0,unit.start) + gap + draft.slice(unit.end)
    }
    const partial = inspect(draft)
    if (partial.report) return { ...partial.report, repairNote: '个别引用或配图未能修复，对应位置已标明资料缺口。' }
    throw Error(reasons(repaired).join(' ') || '局部修订未能形成可溯源的报告。')
  }
  const retry = await call(JSON.stringify({ ...JSON.parse(material), correction: inspected.problem ?? '前次文档未完整交付，请完成 HTML 成稿。' }),2,false,validate)
  signal?.throwIfAborted()
  const final = inspect(retry.text)
  if (retry.error === null && final.report) return final.report
  throw Error(reasons(final).join(' ') || '写作调用未交付完整 HTML。')
}
