/** Acquire selected product pages and persist their canonical text before publishing snapshots. */
import { createProductFailureId, createSourceSnapshotId,
  type AvailableSourceSnapshot, type CandidatePage, type ProductBatchResult, type ProductFailure, type SourceSnapshot,
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
  /** Enqueue downstream work once this individual capture has been saved. */
  readonly onPageSaved?: (page: CandidatePage, snapshot: AvailableSourceSnapshot, text: string, images: readonly ProductPageImage[]) => void
  /** Preserve HTML row boundaries for summary review, recognizing the previous representation on resume. */
  readonly reviewLayout?: { previousSnapshots?: readonly SourceSnapshot[] }
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
 * Refill up to eight capture slots as each page settles. Publish the batch in candidate order.
 * A failed page retains its own failed snapshot and successful siblings remain available.
 * @param candidates - Discovered pages; selected pages and legacy needs-review pages are fetched.
 * @param adapters - Web fetch, durable text storage, and clock.
 * @param signal - Optional cancellation stops dispatch and is propagated to active fetches, which are awaited before returning.
 * @param maximumCharacters - Optional approved text bound applied during preparation before persistence.
 * @returns Settled snapshots, failures, and cancellation status.
 */
export async function fetchProductPages(candidates: readonly CandidatePage[], adapters: ProductPageFetchAdapters,
  signal?: AbortSignal, maximumCharacters?: number): Promise<ProductPageFetchResult> {
  const settled: { snapshot: SourceSnapshot; images?: readonly ProductPageImage[]; failure?: ProductFailure }[] = []
  const previousHashes = new Map(adapters.reviewLayout?.previousSnapshots?.flatMap(s =>
    s.status === 'available' ? [[s.candidatePageId, s.contentHash] as const] : []))
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
      const previousHash = previousHashes.get(candidate.candidatePageId)
      const prepared = fetched.body.kind === 'pdf' ? await prepareProductPdf(fetched, maximumCharacters, signal)
        : prepareProductPage(fetched, maximumCharacters, adapters.reviewLayout && (previousHash ? { previousHash } : {}))
      return { ...prepared, images: fetched.body.kind === 'html' ? productPageImages(fetched.body.content, fetched.url) : [] }
    }
    signal?.throwIfAborted()
    const request = { url: candidate.url }
    const fetched = await adapters.web.fetch(request, signal)
    try {
      return await prepare(fetched)
    } catch (error) {
      if (fetched.body.kind !== 'text' || !(error instanceof ProductPageTextLimitError) || !adapters.web.fetchFullText) throw error
      signal?.throwIfAborted()
      return prepare(await adapters.web.fetchFullText(request, signal))
    }
  }
  const selected = candidates.filter(candidate => candidate.screening.status !== 'excluded')
  const entries = selected.entries()
  let stopped = false
  const stopping = () => stopped || signal?.aborted
  async function worker(): Promise<void> {
    for (const [index, candidate] of entries) {
      if (stopping()) return
      let prepared: Awaited<ReturnType<typeof acquire>>, snapshot: AvailableSourceSnapshot
      try {
        prepared = await acquire(candidate)
        signal?.throwIfAborted()
        const contentRef = await adapters.saveText(candidate, prepared.text, prepared.contentHash)
        signal?.throwIfAborted()
        if (contentRef.trim().length === 0) throw new RangeError('Saved page content reference is empty')
        snapshot = { schemaVersion: 1, sourceSnapshotId: createSourceSnapshotId(),
          candidatePageId: candidate.candidatePageId, observedAt: adapters.now(), status: 'available',
          contentRef, contentHash: prepared.contentHash,
          ...prepared.sourcePublishedAt === undefined ? {} : { sourcePublishedAt: prepared.sourcePublishedAt },
          ...prepared.sourceUpdatedAt === undefined ? {} : { sourceUpdatedAt: prepared.sourceUpdatedAt },
          ...prepared.productVersionLabel === undefined ? {} : { productVersionLabel: prepared.productVersionLabel },
          ...prepared.sourceRegionLabel === undefined ? {} : { sourceRegionLabel: prepared.sourceRegionLabel },
          ...prepared.declaredPublisher === undefined ? {} : { declaredPublisher: prepared.declaredPublisher } }
      } catch (error) {
        if (signal?.aborted) return
        const failure: ProductFailure = { schemaVersion: 1, failureId: createProductFailureId(),
          stage: 'fetch', category: category(error), message: error instanceof Error ? error.message : String(error),
          retryable: !(error instanceof RangeError), occurredAt: adapters.now(),
          candidatePageId: candidate.candidatePageId }
        settled[index] = { failure, snapshot: { schemaVersion: 1, sourceSnapshotId: createSourceSnapshotId(),
          candidatePageId: candidate.candidatePageId, observedAt: adapters.now(), status: 'failed',
          failureId: failure.failureId } }
        continue
      }
      settled[index] = { snapshot, images: prepared.images }
      if (!stopping()) adapters.onPageSaved?.(candidate, snapshot, prepared.text, prepared.images)
    }
  }
  const workers = Array.from({ length: Math.min(selected.length, PRODUCT_PAGE_FETCH_CONCURRENCY) }, () =>
    worker().catch((error: unknown) => { stopped = true; throw error }))
  for (const outcome of await Promise.allSettled(workers)) if (outcome.status === 'rejected') throw outcome.reason
  const snapshots = settled.flatMap(item => [item.snapshot])
  const images = settled.flatMap(item => item.images ?? [])
  const failures = settled.flatMap(item => item.failure ?? [])
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
