import { createHash } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, it } from 'vitest'
import type { AvailableSourceSnapshot, CandidatePage, CandidatePageId, ProductId,
  ProductPlanId, ProductQuestionId, SourceSnapshotId } from '@deepseek-ai/dsh-product-insight-model'
import { extractProductPageEvidence, fetchProductPages, prepareProductPage, rankProductPageFragments,
  sameProductPageFacts, splitFailedProductFragment, splitProductPageText,
  PRODUCT_PAGE_FRAGMENT_OVERLAP_CHARACTERS } from '../src/index.ts'

const candidatePageId = brandString<CandidatePageId>('candidate')
const questionId = brandString<ProductQuestionId>('question')
const candidate: CandidatePage = { schemaVersion: 1, candidatePageId,
  planId: brandString<ProductPlanId>('plan'), productId: brandString<ProductId>('product'),
  url: 'https://example.com/features', sourceType: 'official_product_page',
  discoveredAt: '2026-11-06T00:00:00Z', questionIds: [questionId],
  screening: { status: 'selected', reason: 'official', screenedAt: '2026-11-06T00:00:00Z' } }
const fetched = { url: candidate.url, statusCode: 200, truncated: false,
  body: { kind: 'html' as const, content: '<article><h1>Features</h1><p>Fast search &amp; export.</p><script>ignore</script></article>' } }

describe('product page evidence', () => {
  it('rotates ranked windows across approved questions and leaves unmatched text in source order', () => {
    const windows = ['General context.', 'Export settings.', '价格为十元。', 'Export formats and settings.', 'Other details.']
      .map((text, index) => ({ start: index * 100, end: index * 100 + text.length, text }))
    const result = rankProductPageFragments(windows, ['Export formats and settings?', '价格是多少？'])
    expect(result.map(window => window.start)).toEqual([300, 200, 100, 0, 400])
    for (const window of result) expect(window).toBe(windows[window.start / 100])
    expect(rankProductPageFragments(windows, ['What is it?'])).toEqual(windows)
  })

  it('keeps long-page fragment offsets contiguous without splitting a surrogate pair', () => {
    const text = `${'a'.repeat(11_999)}😀${'b'.repeat(13_000)}`
    const fragments = splitProductPageText(text)
    expect(fragments.map(item => item.text).join('')).toBe(text)
    expect(fragments.map(item => item.text.length)).toEqual([11_999, 12_000, 1_002])
    expect(fragments.map(item => item.start)).toEqual([0, 11_999, 23_999])
  })

  it('repeats enough context to contain a boundary excerpt without splitting Unicode characters', () => {
    const excerpt = 'Example supports export across this boundary.'
    const text = `${'a'.repeat(11_990)}${excerpt}${'😀'.repeat(7_000)}`
    const fragments = splitProductPageText(text, PRODUCT_PAGE_FRAGMENT_OVERLAP_CHARACTERS)
    expect(fragments).toHaveLength(3)
    expect(fragments.every(item => item.text.length <= 12_000
      && item.text === text.slice(item.start, item.end))).toBe(true)
    expect(fragments[1]?.start).toBe(10_501)
    expect(fragments.some(item => item.text.includes(excerpt))).toBe(true)
    expect(fragments.every(item => item.start === 0 || text.charCodeAt(item.start) < 0xdc00
      || text.charCodeAt(item.start) > 0xdfff)).toBe(true)
    expect(splitProductPageText('x'.repeat(48_000), PRODUCT_PAGE_FRAGMENT_OVERLAP_CHARACTERS))
      .toHaveLength(5)
    const pairedStart = splitProductPageText(`${'a'.repeat(10_500)}😀${'b'.repeat(13_000)}`,
      PRODUCT_PAGE_FRAGMENT_OVERLAP_CHARACTERS)
    expect(pairedStart[1]?.start).toBe(10_500)
    expect(pairedStart[1]?.text.startsWith('😀')).toBe(true)
    expect(() => splitProductPageText(text, 1_500)).toThrow(/overlap/u)
  })

  it('splits a failed model window into smaller overlapping source ranges', () => {
    const excerpt = 'Example supports export across a recovery edge.'
    const text = `${'a'.repeat(5_990)}${excerpt}${'😀'.repeat(2_980)}`
    const children = splitFailedProductFragment({ start: 100, end: 100 + text.length, text })
    expect(children).not.toBeNull()
    if (children === null) return
    expect(children.every(item => item.text.length < text.length
      && item.text === text.slice(item.start - 100, item.end - 100))).toBe(true)
    expect(children.some(item => item.text.includes(excerpt))).toBe(true)
    expect(children[0].end - children[1].start).toBeGreaterThanOrEqual(1_499)
    expect(splitFailedProductFragment({ start: 0, end: 2_999, text: 'x'.repeat(2_999) })).toBeNull()
    expect(() => splitFailedProductFragment({ start: 0, end: 1, text })).toThrow(/offsets/u)
  })

  it('retains only bounded source declarations from HTML metadata', () => {
    const page = prepareProductPage({ ...fetched, body: { kind: 'html', content: `<head>
      <meta content="Review &amp; Test" name="publisher">
      <meta name="article:published_time" content="2026-10-01">
      <meta name="article:modified_time" content="2026-11-01">
      <meta name="product:version" content="v1"><meta name="product:region" content="US">
      </head><article>Example supports export.</article>` } })
    expect(page.text).toBe('Example supports export.')
    expect(page).toMatchObject({ declaredPublisher: 'Review & Test',
      sourcePublishedAt: '2026-10-01T00:00:00.000Z', sourceUpdatedAt: '2026-11-01T00:00:00.000Z',
      productVersionLabel: 'v1', sourceRegionLabel: 'US' })
    const unknown = prepareProductPage({ ...fetched, body: { kind: 'html',
      content: '<meta name="article:modified_time" content="not a date"><article>Example</article>' } })
    expect(unknown.sourceUpdatedAt).toBeUndefined()
    const impossible = prepareProductPage({ ...fetched, body: { kind: 'html',
      content: '<meta name="article:modified_time" content="2026-02-30"><article>Example</article>' } })
    expect(impossible.sourceUpdatedAt).toBeUndefined()
  })

  it('persists complete page text before publishing a source snapshot', async () => {
    const saved: string[] = []
    const result = await fetchProductPages([candidate], { now: () => '2026-11-06T00:00:00Z',
      web: { fetch: async () => fetched },
      saveText: async (_page, text) => { saved.push(text); return 'store:1' } })
    expect(saved).toEqual(['Features\nFast search & export.'])
    expect(result.snapshots.status).toBe('success')
    const snapshot = result.snapshots.items[0] as AvailableSourceSnapshot
    expect(snapshot.contentRef).toBe('store:1')
    expect(sameProductPageFacts(snapshot, { ...snapshot,
      sourceSnapshotId: brandString<SourceSnapshotId>('fresh'), observedAt: '2026-11-07T00:00:00Z' })).toBe(true)
    expect(sameProductPageFacts(snapshot, { ...snapshot, sourceUpdatedAt: '2026-11-07T00:00:00Z' })).toBe(false)
    const extraction = extractProductPageEvidence(candidate, snapshot, saved[0] ?? '', [
      { verbatimExcerpt: 'Fast search & export.', sourcedStatement: 'The product supports export.', questionIds: [questionId] },
      { verbatimExcerpt: 'unseen feature', sourcedStatement: 'Unsupported.', questionIds: [questionId] },
    ], { name: 'review', version: '1' })
    expect(extraction.evidence).toMatchObject([{ sourceSnapshotId: snapshot.sourceSnapshotId,
      locator: { kind: 'text_range', start: 9, end: 30 } }])
    expect(extraction.rejected).toEqual([{ draftIndex: 1, reason: 'excerpt_not_found' }])
    expect(() => extractProductPageEvidence(candidate, snapshot, 'changed', [], { name: 'review', version: '1' }))
      .toThrow(/saved snapshot/u)
  })

  it('rejects partial fetches while retaining another page and a failed attempt', async () => {
    const second = { ...candidate, candidatePageId: brandString<CandidatePageId>('second'), url: 'https://example.com/second' }
    const secondFetched = Promise.withResolvers<undefined>()
    const result = await fetchProductPages([candidate, second], { now: () => '2026-11-06T00:00:00Z',
      web: { fetch: async ({ url }) => {
        if (url === candidate.url) {
          await secondFetched.promise
          return { ...fetched, truncated: true }
        }
        secondFetched.resolve(undefined)
        return { ...fetched, url }
      } },
      saveText: async () => 'store:2' })
    expect(result.snapshots.status).toBe('partial_success')
    expect(result.snapshots.items.map(item => item.status)).toEqual(['failed', 'available'])
    expect(result.snapshots.failures).toMatchObject([{ stage: 'fetch', category: 'parse_failed', candidatePageId }])
    expect(() => prepareProductPage({ ...fetched, body: { kind: 'pdf', content: new Uint8Array() } }))
      .toThrow(/PDF extraction/u)
  })

  it('saves an oversized HTML article within the approved limit and anchors excerpts to its full readable text', async () => {
    const excerpt = 'Price starts at $999 & includes export.'
    const html = { ...fetched, body: { kind: 'html' as const, content: `<head>
      <meta name="article:published_time" content="2026-09-09"></head><main><article>
      <nav><div>${'Navigation. '.repeat(3_000)}</div></nav>
      <div hidden><article>Hidden duplicate.</article>${'Hidden content. '.repeat(3_000)}</div>
      <h1>Features 😀</h1><div>Price starts at <strong>$999</strong> &amp; includes export.</div>
      <table><tr><th>Storage</th><td>256 GB</td></tr></table>
      <aside><p>Available in select markets.</p></aside>
      <figure><video><p>Video fallback.</p></video><figcaption>Folds flat.</figcaption></figure>
      </article></main>` } }
    const saved: string[] = []
    const result = await fetchProductPages([candidate], { now: () => '2026-11-06T00:00:00Z',
      web: { fetch: async () => html },
      saveText: async (_page, text) => { saved.push(text); return 'store:1' } }, undefined, 36_000)
    expect(saved).toEqual([`Features 😀\n${excerpt}\nStorage\n256 GB\nAvailable in select markets.\nFolds flat.`])
    const [snapshot] = result.snapshots.items
    expect(snapshot).toMatchObject({ status: 'available', sourcePublishedAt: '2026-09-09T00:00:00.000Z' })
    if (snapshot?.status !== 'available') throw new Error('Expected an available snapshot')
    const text = saved[0]!
    const extraction = extractProductPageEvidence(candidate, snapshot, text, [
      { verbatimExcerpt: excerpt, sourcedStatement: 'The starting price is $999.', questionIds: [questionId] },
    ], { name: 'review', version: '1' })
    expect(extraction.evidence).toMatchObject([{ locator: { kind: 'text_range', start: 12, end: 12 + excerpt.length } }])
    expect(extraction.rejected).toEqual([])
  })

  it('rejects substantive text that still exceeds the limit after HTML preparation', () => {
    expect(() => prepareProductPage({ ...fetched,
      body: { kind: 'html', content: `<main><div>${'😀'.repeat(18_001)}</div></main>` } }, 36_000))
      .toThrow(/approved text limit/u)
    expect(() => prepareProductPage({ ...fetched, body: { kind: 'text', content: 'a'.repeat(36_001) } }, 36_000))
      .toThrow(/approved text limit/u)
  })

  it('retains provider Markdown prose, captions and source order within the bound', () => {
    const destination = `https://example.com/${'a'.repeat(36_000)}(large)`
    const page = prepareProductPage({ ...fetched, body: { kind: 'text', content: `# Product

[![Folded display](${destination})](https://example.com/photo)

The [export feature](https://example.com/support "Support") is available.

\`[literal](example)\`

See https://example.com/legal.` } }, 36_000)
    expect(page.text).toBe('# Product\n\nFolded display\n\nThe export feature is available.\n\n`[literal](example)`'
      + '\n\nSee https://example.com/legal.')
    expect(page.contentHash).toBe(`sha256:${createHash('sha256').update(page.text).digest('hex')}`)
  })

  it('tries complete HTML for the same candidate when converted text still exceeds the approved bound', async () => {
    const calls: string[] = []
    const saved: string[] = []
    const result = await fetchProductPages([candidate], {
      now: () => '2026-11-06T00:00:00Z',
      web: {
        fetch: async ({ url }) => {
          calls.push(url)
          return { ...fetched, body: { kind: 'text', content: 'Converted text. '.repeat(3_000) } }
        },
        fetchFullText: async ({ url }) => {
          calls.push(url)
          return fetched
        },
      },
      saveText: async (_page, text) => { saved.push(text); return 'store:1' },
    }, undefined, 36_000)
    expect(calls).toEqual([candidate.url, candidate.url])
    expect(saved).toEqual(['Features\nFast search & export.'])
    expect(result.snapshots.items).toMatchObject([{ status: 'available', candidatePageId }])
  })

  it('stops dispatch on cancellation and waits for active fetches without saving their text', async () => {
    const pages = Array.from({ length: 5 }, (_, index) => ({ ...candidate,
      candidatePageId: brandString<CandidatePageId>(`page-${index}`), url: `https://example.com/${index}` }))
    const gates = new Map(pages.map(page => [page.url, Promise.withResolvers<undefined>()]))
    const fourthStarted = Promise.withResolvers<undefined>()
    const abort = new AbortController()
    const started: string[] = []
    const finished: string[] = []
    const saved: string[] = []
    const run = fetchProductPages(pages, {
      now: () => '2026-11-06T00:00:00Z',
      web: { fetch: async ({ url }, signal) => {
        expect(signal).toBe(abort.signal)
        started.push(url)
        if (started.length === 4) fourthStarted.resolve(undefined)
        await gates.get(url)?.promise
        finished.push(url)
        return { ...fetched, url }
      } },
      saveText: async (page) => { saved.push(page.url); return `store:${page.candidatePageId}` },
    }, abort.signal)
    try {
      expect(started).toEqual(pages.slice(0, 3).map(page => page.url))
      gates.get(started[0]!)?.resolve(undefined)
      await fourthStarted.promise
      abort.abort()
      for (const gate of gates.values()) gate.resolve(undefined)
      const result = await run
      expect(result.cancelled).toBe(true)
      expect(started).toEqual(pages.slice(0, 4).map(page => page.url))
      expect(finished).toEqual(started)
      expect(saved).toEqual(started.slice(0, 1))
      expect(result.snapshots.items).toMatchObject([
        { candidatePageId: pages[0]?.candidatePageId, status: 'available' },
      ])
      expect(result.snapshots.failures).toEqual([])
    } finally {
      abort.abort()
      for (const gate of gates.values()) gate.resolve(undefined)
      await run
    }
  })

  it('marks the batch failed when no page was saved', async () => {
    const result = await fetchProductPages([candidate], { now: () => '2026-11-06T00:00:00Z',
      web: { fetch: async () => fetched }, saveText: async () => { throw new Error('Storage unavailable') } })
    expect(result.snapshots.status).toBe('failed')
    expect(result.snapshots.items).toMatchObject([{ status: 'failed' }])
    expect(result.snapshots.failures).toMatchObject([{ stage: 'fetch', message: 'Storage unavailable' }])
  })

  it('does not attribute another host to an official page', async () => {
    const result = await fetchProductPages([candidate], { now: () => '2026-11-06T00:00:00Z',
      web: { fetch: async () => ({ ...fetched, url: 'https://unrelated.example/features' }) },
      saveText: async () => { throw new Error('must not save') } })
    expect(result.snapshots.status).toBe('failed')
    expect(result.snapshots.failures[0]?.message).toMatch(/different host/u)
  })

  it('requires a start hint when an excerpt occurs twice', () => {
    const prepared = prepareProductPage({ ...fetched, body: { kind: 'text', content: 'Same. Same.' } })
    const snapshot: AvailableSourceSnapshot = { schemaVersion: 1,
      sourceSnapshotId: brandString<SourceSnapshotId>('snapshot'), candidatePageId,
      status: 'available', observedAt: '2026-11-06T00:00:00Z', contentRef: 'store:3',
      contentHash: prepared.contentHash }
    const draft = { verbatimExcerpt: 'Same.', sourcedStatement: 'Repeated.', questionIds: [questionId] }
    expect(extractProductPageEvidence(candidate, snapshot, prepared.text, [draft], { name: 'review', version: '1' })
      .rejected).toEqual([{ draftIndex: 0, reason: 'ambiguous_excerpt' }])
    expect(extractProductPageEvidence(candidate, snapshot, prepared.text, [{ ...draft, startHint: 6 }],
      { name: 'review', version: '1' }).evidence[0]?.locator).toEqual({ kind: 'text_range', start: 6, end: 11 })
  })

  it('locates excerpts on physical PDF pages and rejects excerpts crossing a page boundary', () => {
    const text = '\fExample manual.\f\fExample costs $10.'
    const snapshot: AvailableSourceSnapshot = { schemaVersion: 1, sourceSnapshotId: brandString<SourceSnapshotId>('pdf'),
      candidatePageId, status: 'available', observedAt: '2026-11-06T00:00:00Z', contentRef: 'store:pdf',
      contentHash: `sha256:${createHash('sha256').update(text).digest('hex')}` }
    const result = extractProductPageEvidence(candidate, snapshot, text, [
      { verbatimExcerpt: 'Example costs $10.', sourcedStatement: 'Example costs $10.', questionIds: [questionId] },
      { verbatimExcerpt: 'manual.\f\fExample', sourcedStatement: 'Cross-page text.', questionIds: [questionId] },
    ], { name: 'review', version: '1' })
    expect(result.evidence[0]?.locator).toEqual({ kind: 'text_range', start: text.indexOf('Example costs'), end: text.length, pdfPage: 3 })
    expect(result.rejected).toEqual([{ draftIndex: 1, reason: 'crosses_pdf_page' }])
  })
})
