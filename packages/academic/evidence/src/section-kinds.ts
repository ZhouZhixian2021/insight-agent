/** Section headings that name back matter rather than the work's own body. */
import type { EvidenceContentSegment } from './types.ts'

/**
 * Headings whose paragraphs repeat sourced terms without describing the work itself.
 * A window inside them answers no inclusion rule and yields no evidence about the paper,
 * so both scope review and evidence extraction skip these sections.
 */
const BACK_MATTER = new RegExp(
  '^(?:(?:\\d+(?:\\.\\d+)*|[ivxlcdm]+|[A-Z])(?:[.)]\\s*|\\s+))?'
  + '(?:references|bibliography|works cited|literature cited'
  + '|acknowledge?ments?|funding|author contributions|conflicts? of interest|data availability'
  + '|appendix|appendices|supplementary (?:materials?|information)|supporting information'
  + '|参考文献|引用文献|致谢|鸣谢|附录|补充材料)(?:$|[\\s:：])',
  'iu',
)

/**
 * A reference-list heading found inside one page's text.
 *
 * A page segment carries a page number instead of a section heading, so the list has to be found in the text:
 * either a line that opens the list, or the capitalized heading followed by its first entry.
 */
const REFERENCE_HEADING = new RegExp(
  '(?:^|\\n)[ \\t]{0,6}(?:references|bibliography|works cited|literature cited|参考文献)\\b'
  + '|\\bReferences\\s*(?=\\[?\\d|[A-Z])',
  'u',
)

/** Appended matter that keeps a page following the reference list inside the work's body. */
const APPENDIX_HEADING = new RegExp(
  '(?:^|\\n)[ \\t]{0,6}(?:appendix|appendices|supplementary (?:materials?|information)'
  + '|supporting information|附录|补充材料)(?:\\b|$)',
  'iu',
)

/**
 * Whether one section heading names reference or tail matter.
 * @param sectionTitle - Parsed heading text, or null when the segment has no heading.
 * @returns True when the heading names a reference list, acknowledgement, or appendix.
 */
export function isBackMatterSection(sectionTitle: string | null): boolean {
  return sectionTitle !== null && BACK_MATTER.test(sectionTitle)
}

/**
 * Section heading carried by one parsed content segment.
 * @param segment - Parsed content segment.
 * @returns The heading text, or null when the locator carries none.
 */
export function segmentSectionTitle(segment: EvidenceContentSegment): string | null {
  return 'sectionTitle' in segment.locator ? segment.locator.sectionTitle ?? null : null
}

/**
 * Offset where one page starts listing cited works.
 * @param text - Page text as parsed.
 * @returns The offset of the heading, or -1 when the page carries no reference heading.
 */
export function referenceHeadingOffset(text: string): number {
  return text.search(REFERENCE_HEADING)
}

/**
 * First page that lists cited works, among pages that carry no section heading to match instead.
 * @param segments - Parsed content segments in their original order.
 * @returns The lowest page number with a reference heading, or undefined when no page has one.
 */
export function referenceStartPage(segments: readonly EvidenceContentSegment[]): number | undefined {
  const pages = segments.flatMap(segment => segment.locator.kind === 'page_section'
    && referenceHeadingOffset(segment.text) >= 0 ? [segment.locator.pdfPage] : [])
  return pages.length === 0 ? undefined : Math.min(...pages)
}

/**
 * Whether one segment belongs to back matter.
 *
 * A heading decides for segments that carry one; pages decide by position, because every page after the first
 * reference page repeats cited works, while an appendix page still belongs to the work.
 * @param segment - Parsed content segment.
 * @param firstReferencePage - Page that starts the reference list, as {@link referenceStartPage} reports.
 * @returns True when the segment is a reference list, acknowledgement, or appendix.
 */
export function isBackMatterSegment(segment: EvidenceContentSegment, firstReferencePage?: number): boolean {
  if (isBackMatterSection(segmentSectionTitle(segment))) return true
  const { locator } = segment
  if (locator.kind !== 'page_section' || firstReferencePage === undefined) return false
  return locator.pdfPage > firstReferencePage && !APPENDIX_HEADING.test(segment.text)
}

/**
 * The part of one segment that can describe the work itself.
 *
 * A page that opens its reference list mid-page keeps the body above it, because the list below repeats every
 * reviewed term without describing the work. Blanking instead of cutting keeps window offsets aligned.
 * @param segment - Parsed content segment.
 * @returns The segment text with a trailing reference list blanked out.
 */
export function bodyText(segment: EvidenceContentSegment): string {
  const offset = segment.locator.kind === 'page_section' ? referenceHeadingOffset(segment.text) : -1
  return offset < 0 ? segment.text : segment.text.slice(0, offset) + ' '.repeat(segment.text.length - offset)
}

/**
 * Segment indexes that belong to the work's body, in their original order.
 * Falls back to every segment when no segment carries a body heading, so an unknown layout
 * keeps the parsed content instead of reporting nothing.
 * @param segments - Parsed content segments in their original order.
 * @returns Indexes into `segments`.
 */
export function bodySegmentIndexes(segments: readonly EvidenceContentSegment[]): readonly number[] {
  const firstReferencePage = referenceStartPage(segments)
  const body = segments.flatMap((segment, index) =>
    isBackMatterSegment(segment, firstReferencePage) ? [] : [index])
  return body.length > 0 ? body : segments.map((_, index) => index)
}

/**
 * Whether a parse carries any segment outside back matter.
 *
 * {@link bodySegmentIndexes} falls back to every segment so extraction never reports nothing for an unrecognized
 * layout; admission cannot use that fallback, because a parse of headings and references alone has no body to read.
 * @param segments - Parsed content segments in their original order.
 * @returns True when at least one segment carries text outside back matter.
 */
export function hasBodySegment(segments: readonly EvidenceContentSegment[]): boolean {
  const firstReferencePage = referenceStartPage(segments)
  return segments.some(segment => !isBackMatterSegment(segment, firstReferencePage) && bodyText(segment).trim() !== '')
}
