/** Acquire selected product pages and persist their canonical text before publishing snapshots. */
import { createProductFailureId, createSourceSnapshotId,
  type CandidatePage, type ProductBatchResult, type ProductFailure, type SourceSnapshot,
} from '@deepseek-ai/dsh-product-insight-model'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'

import { productPageImages, type ProductPageImage, prepareProductPage, prepareProductPdf, ProductPageTextLimitError } from './page-content.ts'

/** Web, durable text storage, and clock supplied by the owning investigation. */
export interface ProductPageFetchAdapters {
  readonly web: {
    fetch(request: { readonly url: string }, signal?: AbortSignal): Promise<WebFetchResult>
    /** Optional raw retrieval of the same approved URL when converted text exceeds the bound. */
    fetchFullText?(request: { readonly url: string }, signal?: AbortSignal): Promise<WebFetchResult>
  }
  /** Must return only after the complete canonical text is durably available at the reference. */
  readonly saveText: (page: CandidatePage, text: string, contentHash: string) => Promise<string>
  readonly now: () => string
}

/** Settled selected-page snapshots and cancellation state. */
export interface ProductPageFetchResult {
  readonly snapshots: ProductBatchResult<SourceSnapshot>
  readonly images?: readonly ProductPageImage[]
  readonly cancelled: boolean
}

/**
 * Match a fresh fetch to the cited page content and every declared applicability fact.
 * @param saved - Snapshot cited by retained evidence.
 * @param fetched - Newly acquired snapshot of the selected page.
 * @returns Whether both pages are available and their content and declarations match.
 */
export function sameProductPageFacts(saved: SourceSnapshot | undefined, fetched: SourceSnapshot | undefined): boolean {
  return saved?.status === 'available' && fetched?.status === 'available'
    && saved.candidatePageId === fetched.candidatePageId && saved.contentHash === fetched.contentHash
    && saved.sourcePublishedAt === fetched.sourcePublishedAt && saved.sourceUpdatedAt === fetched.sourceUpdatedAt
    && saved.productVersionLabel === fetched.productVersionLabel
    && saved.sourceRegionLabel === fetched.sourceRegionLabel && saved.declaredPublisher === fetched.declaredPublisher
}

const PRODUCT_PAGE_FETCH_CONCURRENCY = 8

/**
 * Fetch up to eight selected pages concurrently, then persist text and settle snapshots in candidate order.
 * A failed page retains its own failed snapshot and successful siblings remain available.
 * @param candidates - Discovered pages; selected pages and legacy needs-review pages are fetched.
 * @param adapters - Web fetch, durable text storage, and clock.
 * @param signal - Optional cancellation stops dispatch and is propagated to active fetches, which are awaited before returning.
 * @param maximumCharacters - Optional approved text bound applied during preparation before persistence.
 * @returns Settled snapshots, failures, and cancellation status.
 */
export async function fetchProductPages(candidates: readonly CandidatePage[], adapters: ProductPageFetchAdapters,
  signal?: AbortSignal, maximumCharacters?: number): Promise<ProductPageFetchResult> {
  const images: ProductPageImage[] = []
  const snapshots: SourceSnapshot[] = []
  const failures: ProductFailure[] = []
  const acquire = async (candidate: CandidatePage) => {
    const prepare = async (fetched: WebFetchResult) => {
      signal?.throwIfAborted()
      // A redirector or media link lands on the publisher that actually serves
      // the page, so a discovered page need not keep the host it was found on.
      // The official page keeps its host: a redirect out of it would attribute
      // the vendor's own page to someone else. The transport validates every
      // hop, and the cited URL stays the one discovery recorded.
      if (candidate.sourceType === 'official_product_page'
        && new URL(fetched.url).hostname !== new URL(candidate.url).hostname) {
        throw new RangeError('Product official page redirected to a different host; review the publisher before using it')
      }
      const prepared = fetched.body.kind === 'pdf' ? await prepareProductPdf(fetched, maximumCharacters, signal)
        : prepareProductPage(fetched, maximumCharacters)
      return { ...prepared, images: fetched.body.kind === 'html' ? productPageImages(fetched.body.content, fetched.url) : [] }
    }
    try {
      signal?.throwIfAborted()
      const request = { url: candidate.url }
      const fetched = await adapters.web.fetch(request, signal)
      try {
        return { prepared: await prepare(fetched) }
      } catch (error) {
        if (fetched.body.kind !== 'text' || !(error instanceof ProductPageTextLimitError) || !adapters.web.fetchFullText) throw error
        signal?.throwIfAborted()
        return { prepared: await prepare(await adapters.web.fetchFullText(request, signal)) }
      }
    } catch (error) {
      return { error }
    }
  }
  const selected = candidates.filter(candidate => candidate.screening.status !== 'excluded')
  const start = (candidate: CandidatePage) => ({ candidate, acquired: acquire(candidate) })
  const pending = selected.slice(0, PRODUCT_PAGE_FETCH_CONCURRENCY).map(start)
  let nextIndex = pending.length
  try {
    while (!signal?.aborted) {
      const next = pending.shift()
      if (next === undefined) break
      const { candidate } = next
      try {
        const outcome = await next.acquired
        signal?.throwIfAborted()
        if ('error' in outcome) throw outcome.error
        const { prepared } = outcome
        const contentRef = await adapters.saveText(candidate, prepared.text, prepared.contentHash)
        signal?.throwIfAborted()
        if (contentRef.trim().length === 0) throw new RangeError('Saved page content reference is empty')
        images.push(...prepared.images)
        snapshots.push({ schemaVersion: 1, sourceSnapshotId: createSourceSnapshotId(),
          candidatePageId: candidate.candidatePageId, observedAt: adapters.now(), status: 'available',
          contentRef, contentHash: prepared.contentHash,
          ...prepared.sourcePublishedAt === undefined ? {} : { sourcePublishedAt: prepared.sourcePublishedAt },
          ...prepared.sourceUpdatedAt === undefined ? {} : { sourceUpdatedAt: prepared.sourceUpdatedAt },
          ...prepared.productVersionLabel === undefined ? {} : { productVersionLabel: prepared.productVersionLabel },
          ...prepared.sourceRegionLabel === undefined ? {} : { sourceRegionLabel: prepared.sourceRegionLabel },
          ...prepared.declaredPublisher === undefined ? {} : { declaredPublisher: prepared.declaredPublisher } })
      } catch (error) {
        if (signal?.aborted) break
        const failure: ProductFailure = { schemaVersion: 1, failureId: createProductFailureId(),
          stage: 'fetch', category: category(error), message: error instanceof Error ? error.message : String(error),
          retryable: !(error instanceof RangeError), occurredAt: adapters.now(),
          candidatePageId: candidate.candidatePageId }
        failures.push(failure)
        snapshots.push({ schemaVersion: 1, sourceSnapshotId: createSourceSnapshotId(),
          candidatePageId: candidate.candidatePageId, observedAt: adapters.now(), status: 'failed',
          failureId: failure.failureId })
      }
      const replacement = selected[nextIndex++]
      if (replacement !== undefined && !signal?.aborted) pending.push(start(replacement))
    }
  } finally {
    await Promise.all(pending.map(item => item.acquired))
  }
  const available = snapshots.some(snapshot => snapshot.status === 'available')
  return { ...(images.length ? { images } : {}), snapshots: { schemaVersion: 1,
    status: failures.length === 0 ? 'success' : available ? 'partial_success' : 'failed',
    items: snapshots, failures }, cancelled: signal?.aborted ?? false }
}

function category(error: unknown): ProductFailure['category'] {
  if (error instanceof RangeError) return 'parse_failed'
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout'
  return 'network_error'
}
