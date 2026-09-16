/** PDF full-text preparation for raw `ctx.web.fetch()` results. */

import { createHash } from 'node:crypto'
import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs'

import { EvidenceError } from './types.ts'
import type { EvidenceContentSegment, EvidenceExtractionInput, FetchedAcademicFullTextInput } from './types.ts'

/**
 * Convert one complete PDF response into page-located extraction input.
 *
 * @param input - paper identity, provenance, settings, and raw PDF fetch result.
 * @param signal - optional cancellation checked between parsed pages.
 * @returns page-located text, the final URL, and a hash of the exact PDF bytes.
 */
export async function prepareFetchedAcademicPdf(
  input: FetchedAcademicFullTextInput,
  signal?: AbortSignal,
): Promise<EvidenceExtractionInput> {
  const { fetched } = input
  if (fetched.statusCode < 200 || fetched.statusCode >= 300) {
    invalid(`academic full-text fetch returned HTTP ${fetched.statusCode}`, 'EVIDENCE_FETCH_STATUS')
  }
  if (fetched.truncated) invalid('academic full-text fetch was truncated', 'EVIDENCE_FETCH_TRUNCATED')
  if (fetched.body.kind !== 'pdf') {
    invalid('academic PDF preparation requires a PDF response', 'EVIDENCE_FETCH_BODY_UNSUPPORTED')
  }

  signal?.throwIfAborted()
  const bytes = new Uint8Array(fetched.body.content)
  // getDocument transfers the data buffer to pdf.js, detaching this view; hash before parsing.
  const contentHash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  const loading = getDocument({ data: bytes, stopAtErrors: true, verbosity: VerbosityLevel.ERRORS })
  try {
    const document = await loading.promise
    const segments: EvidenceContentSegment[] = []
    for (let pdfPage = 1; pdfPage <= document.numPages; pdfPage++) {
      signal?.throwIfAborted()
      const page = await document.getPage(pdfPage)
      // includeMarkedContent defaults false, so every returned item is a text item.
      const items = (await page.getTextContent()).items as readonly { readonly str: string }[]
      const text = items
        .map(item => item.str)
        .join(' ')
        .replace(/\s+/gu, ' ')
        .trim()
      if (text.length > 0) {
        segments.push({ text, locator: { kind: 'page_section', sectionTitle: `PDF page ${pdfPage}`, pdfPage } })
      }
    }
    if (segments.length === 0) invalid('PDF contains no extractable text', 'EVIDENCE_FULLTEXT_UNCONFIRMED')
    const { fetched: _, ...provenance } = input
    return {
      ...provenance,
      sourceUrl: fetched.url,
      contentHash,
      segments,
    }
  } catch (error: unknown) {
    signal?.throwIfAborted()
    if (error instanceof EvidenceError) throw error
    throw new EvidenceError('failed to parse academic PDF', 'EVIDENCE_PDF_PARSE_FAILED', { cause: error })
  } finally {
    await loading.destroy()
  }
}

function invalid(message: string, code: string): never {
  throw new EvidenceError(message, code)
}
