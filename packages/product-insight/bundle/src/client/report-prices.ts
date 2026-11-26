import { parseGfmWithMath } from '@deepseek-ai/dsh-client-ui-primitives'

type Block = ReturnType<typeof parseGfmWithMath>['children'][number]
type Table = Extract<Block, { type: 'table' }>

function withoutPriceCitations(value: string): string {
  return value.trim().replace(/(?:\s*(?:\[\^product-source-\d+\]|\[\\\[\d+\\\]\]\(<https?:\/\/[^<>\s]+>\)))+$/gu, '')
}

function amount(value: string, market: string) {
  const bare = withoutPriceCitations(value)
  const match = /^(US\\?\$|\\?\$|USD|RMB|CNY|人民币|美元)\s*(\d+(?:,\d{3})*(?:\\?\.\d+)?)$/u.exec(bare)
  if (!match?.[1] || !match[2]) return undefined
  const [, unit, price] = match
  if ((unit === '$' || unit === '\\$') && market !== '美国') return undefined
  return { currency: /^(?:RMB|CNY|人民币)$/u.test(unit) ? '人民币' : '美元', price: price + value.trim().slice(bare.length) }
}

/** Expand explicitly labelled pairs in older Chinese regional price tables, retaining their original source markers. */
function regionalPrices(rows: string[][]): string | undefined {
  const header = rows.at(0), body = rows.slice(1)
  if (!header || !body.length || !body.every(row => row.length === header.length)) return undefined
  const markets = header.flatMap((label, index) => {
    const region = /^(.+?)起售价$/u.exec(label)?.[1]
    return index > 0 && region && !/常规|零售|教育|优惠|官方|标准|建议|普通/u.test(region) ? [{ region, index }] : []
  })
  if (!markets.length) return undefined
  const priceRows: string[][] = []
  let hasPair = false
  for (const row of body) {
    for (const { region, index } of markets) {
      const value = row[index] ?? ''
      const pair = value.split(/[；;]\s*教育(?:优惠(?:起售)?价?)?\s*/u)
      const regular = amount(pair[0] ?? '', region), education = amount(pair[1] ?? '', region)
      if (pair.length === 2 && regular && education?.currency === regular.currency) {
        hasPair = true
        priceRows.push([row[0] ?? '', `${region}（${regular.currency}）`, regular.price, education.price])
      } else if (/^(?:官方摘录未给|未披露|未提供|未注明)$/u.test(withoutPriceCitations(value))) {
        priceRows.push([row[0] ?? '', region + '（币种未列）', value, value])
      } else return undefined
    }
  }
  if (!hasPair) return undefined
  const table = (head: string[], data: string[][]) => [head, head.map(() => '---'), ...data]
    .map(row => '| ' + row.join(' | ') + ' |').join('\n')
  const prices = table([header[0] ?? '', '地区（币种）', '常规起售价', '教育优惠起售价'], priceRows)
  const nonPrice = header.map((_, i) => i).filter(i => !markets.some(market => market.index === i))
  if (nonPrice.length === 1) return prices
  const keep = (row: string[]) => nonPrice.map(i => row[i] ?? '')
  return table(keep(header), body.map(keep)) + '\n\n' + prices
}

/**
 * Format a saved report for display or download, preserving source links, code and genuine TeX expressions.
 * @param text - Original product-report Markdown.
 * @returns Markdown with literal price pairs and separately labelled historical price columns when unambiguous.
 */
export function productPriceMarkdown(text: string): string {
  // The workflow escaped ordinary parentheses in the original generated report format.
  const escapedReport = /^# [^\n]+ — 产品洞察报告(?:（草稿）)?\r?$/mu.test(text) && text.includes('\n## 证据附录')
  if (!/\$\d|[；;]\s*教育/u.test(text) && !(escapedReport && text.includes('\\('))) return text
  const { children } = parseGfmWithMath(text)
  const replacements = new Map<number, string>()
  function visit(node: Block): void {
    if ('children' in node) node.children.forEach(visit)
    const start = node.position?.start.offset, end = node.position?.end.offset
    if (node.type !== 'inlineMath' || start === undefined || end === undefined) return
    const source = text.slice(start, end)
    const prices = /^\$\d/u.test(source) && /^\$\d/u.test(text.slice(end - 1, end + 1))
      && /^\d[\d,]*(?:\\?\.\d+)?(?:\s|[；;，、(–—-])/u.test(node.value) && !/^\d[\d,.]*\s*[+*=^]/u.test(node.value)
    if (prices) {
      replacements.set(start, '\\$')
      replacements.set(end - 1, '\\$')
    }
    if (escapedReport && (prices || source.startsWith('\\(')) && text[start - 1] !== '\\') {
      for (const match of source.matchAll(/(?<!\\)\\[()]/gu)) replacements.set(start + match.index, '')
    }
  }
  children.forEach(visit)
  const ordered = [...replacements].sort(([a], [b]) => a - b)
  const literal = (start: number, end: number): string => {
    let value = '', cursor = start
    for (const [pos, replacement] of ordered) {
      if (pos >= end) break
      if (pos < start) continue
      value += text.slice(cursor, pos) + replacement
      cursor = pos + 1
    }
    return value + text.slice(cursor, end)
  }
  const cellText = (cell: Table['children'][number]['children'][number]): string => {
    const start = cell.children[0]?.position?.start.offset, end = cell.children.at(-1)?.position?.end.offset
    return start === undefined || end === undefined ? '' : literal(start, end)
  }
  let result = '', cursor = 0
  for (const block of children) {
    const start = block.position?.start.offset, end = block.position?.end.offset
    if (block.type !== 'table' || start === undefined || end === undefined || !/[；;]\s*教育/u.test(text.slice(start, end))) continue
    const prices = regionalPrices(block.children.map(row => row.children.map(cellText)))
    if (prices !== undefined) {
      result += literal(cursor, start) + prices
      cursor = end
    }
  }
  return result + literal(cursor, text.length)
}
