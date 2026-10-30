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
 * Segment indexes that belong to the work's body, in their original order.
 * Falls back to every segment when no segment carries a body heading, so an unknown layout
 * keeps the parsed content instead of reporting nothing.
 * @param segments - Parsed content segments in their original order.
 * @returns Indexes into `segments`.
 */
export function bodySegmentIndexes(segments: readonly EvidenceContentSegment[]): readonly number[] {
  const body = segments.flatMap((segment, index) => isBackMatterSection(segmentSectionTitle(segment)) ? [] : [index])
  return body.length > 0 ? body : segments.map((_, index) => index)
}
