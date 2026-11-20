/** Prose and comparison tables in the order chosen by the report writer. */
type TableRows = [string[], ...string[][]]
type SectionBlock = { kind: 'paragraph'; text: string } | { kind: 'table'; rows: TableRows }

/** A section can cite images inline regardless of whether any original is displayed. */
export type SectionImageUse = { mode: 'cite_only' } | {
  mode: 'display'
  placements: { imageId: string; afterParagraph: number }[]
}

function cells(line: string): string[] | undefined {
  const row = line.trim()
  if (!row.includes('|')) return undefined
  const fields: string[] = []
  let cell = ''
  for (let i = 0; i < row.length; i++) {
    const ch = row.charAt(i)
    if (ch === '\\' && (row[i + 1] === '|' || row[i + 1] === '\\')) cell += row.charAt(++i)
    else if (ch === '|') { fields.push(cell.trim()); cell = '' }
    else cell += ch
  }
  fields.push(cell.trim())
  if (row.startsWith('|')) fields.shift()
  if (fields.at(-1) === '' && row.endsWith('|')) fields.pop()
  return fields
}

function table(block: string): TableRows | undefined {
  const rows = block.split('\n').map(cells)
  const [header, delimiter, ...body] = rows
  if (!header?.length || !delimiter || body.length === 0 || delimiter.length !== header.length
    || !delimiter.every(value => /^:?-{3,}:?$/u.test(value))
    || !body.every((row): row is string[] => row !== undefined && row.length === header.length)) return undefined
  return [header, ...body]
}

/**
 * Split blank-line-separated paragraphs and pipe tables for shared placement and rendering.
 * @param text - Section prose with optional comparison tables.
 * @returns Ordered blocks; only prose paragraphs count toward an image position.
 */
export function sectionBlocks(text: string): SectionBlock[] {
  return text.trim().replace(/\r\n?/gu, '\n').split(/\n[ \t]*\n(?:[ \t]*\n)*/u).filter(Boolean).map((block) => {
    const rows = table(block)
    return rows ? { kind: 'table', rows } : { kind: 'paragraph', text: block }
  })
}

/**
 * Check the writer's choice against the supplied originals and the section's actual prose paragraphs.
 * @param value - Section image decision from the model.
 * @param imageIds - Available original image identities.
 * @param text - Section text whose paragraphs are numbered from one.
 * @returns An explicit decision or the reason a layout-only correction is needed.
 */
export function sectionImageUse(value: unknown, imageIds: ReadonlySet<string>, text: string): SectionImageUse | string {
  if (!value || typeof value !== 'object' || !('mode' in value)) return 'Choose imageUse.mode cite_only or display.'
  if (value.mode === 'cite_only') return { mode: 'cite_only' }
  if (value.mode !== 'display' || !('placements' in value) || !Array.isArray(value.placements) || !value.placements.length) {
    return 'Use cite_only, or display with at least one placement.'
  }
  const paragraphCount = sectionBlocks(text).filter(block => block.kind === 'paragraph').length
  const seen = new Set<string>()
  const placements: { imageId: string; afterParagraph: number }[] = []
  for (const item of value.placements as unknown[]) {
    if (!item || typeof item !== 'object' || !('imageId' in item) || typeof item.imageId !== 'string'
      || !imageIds.has(item.imageId) || seen.has(item.imageId)) return 'Choose a supplied image ID once per section.'
    if (!('afterParagraph' in item) || typeof item.afterParagraph !== 'number' || !Number.isSafeInteger(item.afterParagraph)
      || item.afterParagraph < 1 || item.afterParagraph > paragraphCount) {
      return `afterParagraph must be a prose paragraph number from 1 to ${paragraphCount}.`
    }
    seen.add(item.imageId)
    placements.push({ imageId: item.imageId, afterParagraph: item.afterParagraph })
  }
  return { mode: 'display', placements }
}
