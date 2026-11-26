import type { AvailableSourceSnapshot, CandidatePage } from '@deepseek-ai/dsh-product-insight-model'
import { fetchProductPages, type ProductPageFetchAdapters, type ProductPageFetchResult, type ProductPageImage } from '@deepseek-ai/dsh-product-insight-source'
import type { ProductInvestigationAdapters, ProductInvestigationCheckpoint } from './index.ts'
import type { ReviewedProductPage } from './page-summary.ts'
import type { ProductImageCard } from './report.ts'

/** Maximum simultaneous text and visual model operations in a default investigation. */
export const DEFAULT_MATERIAL_MODEL_CONCURRENCY = 6

type Branch = 'text' | 'image'

/** Share a fixed number of slots equally when both branches have ready work. */
export class ProductWorkQueue {
  private readonly running = { text: 0, image: 0 }
  private readonly waiting: Record<Branch, (() => void)[]> = { text: [], image: [] }

  constructor(private readonly limit: number, private readonly signal: AbortSignal) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Product work concurrency must be a positive integer')
  }

  private acquire(branch: Branch, resume = false): Promise<void> | undefined {
    if (this.running.text + this.running.image < this.limit) {
      this.running[branch]++
      return
    }
    return new Promise<void>((resolve) => {
      if (resume) this.waiting[branch].unshift(resolve)
      else this.waiting[branch].push(resolve)
    })
  }

  private release(branch: Branch): void {
    this.running[branch]--
    const other = branch === 'text' ? 'image' : 'text'
    const nextBranch = this.waiting[other].length && (!this.waiting[branch].length || this.running[other] <= this.running[branch])
      ? other : branch
    const next = this.waiting[nextBranch].shift()
    if (next) {
      // Reserve synchronously so a new arrival cannot claim this same slot before the waiter wakes.
      this.running[nextBranch]++
      next()
    }
  }

  /** Run one task; a page may return a borrowed slot between its model requests. */
  async run<T>(branch: Branch, work: (beforeNextRequest: () => Promise<void>) => Promise<T>): Promise<T> {
    this.signal.throwIfAborted()
    await this.acquire(branch)
    try {
      this.signal.throwIfAborted()
      return await work(async () => {
        this.signal.throwIfAborted()
        const other = branch === 'text' ? 'image' : 'text'
        if (this.waiting[other].length && this.running[branch] > this.limit / 2) {
          this.release(branch)
          await this.acquire(branch, true)
          this.signal.throwIfAborted()
        }
      })
    } finally {
      this.release(branch)
    }
  }
}

export type ScheduleImageModel = <T>(read: () => Promise<T>) => Promise<T>
export interface ProductImageReader {
  enqueue(images: readonly ProductPageImage[]): void
  collect(images: readonly ProductPageImage[]): Promise<ProductImageCard[]>
  drain(): Promise<void>
}

type PageOutcome = { summary: ReviewedProductPage } | { error: unknown; page: CandidatePage }

/** Start captured materials immediately; publish source numbers and recovery cursors in candidate order. */
export async function reviewCapturedPages(options: {
  candidates: readonly CandidatePage[]
  adapters: Pick<ProductPageFetchAdapters, 'web' | 'now' | 'saveText'>
    & Pick<ProductInvestigationAdapters, 'readText' | 'openImageReader' | 'extractImages'>
  summarize: NonNullable<ProductInvestigationAdapters['summarizePage']>
  maximumCharacters: number
  modelConcurrency?: number
  checkpoint?: ProductInvestigationCheckpoint
  signal?: AbortSignal
  onCaptured: (pages: ProductPageFetchResult) => Promise<void>
  onSettled: (nextIndex: number, outcome?: PageOutcome) => Promise<void>
}): Promise<{ pages: ProductPageFetchResult; images: ProductImageCard[] }> {
  const { candidates, adapters, checkpoint, maximumCharacters } = options
  const lifetime = new AbortController()
  const active = options.signal ? AbortSignal.any([options.signal, lifetime.signal]) : lifetime.signal
  const capacity = options.modelConcurrency ?? DEFAULT_MATERIAL_MODEL_CONCURRENCY
  const slots = new ProductWorkQueue(capacity, active)
  const imageReader = adapters.openImageReader?.(active, read => slots.run('image', read), capacity)
  const tasks = new Map<string, Promise<PageOutcome>>()
  const enqueue = (page: CandidatePage, snapshot: AvailableSourceSnapshot, load: () => string | Promise<string>) => {
    const task = slots.run('text', async (beforeNextRequest) => {
      const text = await load()
      active.throwIfAborted()
      if (!text.length || text.length > maximumCharacters) throw new RangeError('Saved product page has no readable text within the approved limit')
      return options.summarize(page, snapshot, text, active, beforeNextRequest)
    }).then(summary => ({ summary }), (error: unknown) => ({ page, error }))
    tasks.set(snapshot.candidatePageId, task)
  }
  let imageTask: Promise<ProductImageCard[]> | undefined
  try {
    const pages = checkpoint?.pages ?? await fetchProductPages(candidates, { ...adapters, reviewLayout: {},
      onPageSaved(page, snapshot, text, images) {
        enqueue(page, snapshot, () => text)
        imageReader?.enqueue(images)
      },
    }, active, maximumCharacters)
    await options.onCaptured(pages)
    const snapshots = pages.snapshots.items
    const start = !checkpoint || checkpoint.stage === 'pages' ? 0
      : checkpoint.stage === 'evidence' ? checkpoint.nextIndex : snapshots.length
    if (checkpoint && !active.aborted) {
      const byId = new Map(candidates.map(page => [page.candidatePageId, page]))
      for (const snapshot of snapshots.slice(start)) {
        if (snapshot.status !== 'available') continue
        const page = byId.get(snapshot.candidatePageId)
        if (!page) throw new RangeError('Saved page has no discovered candidate')
        enqueue(page, snapshot, () => adapters.readText(snapshot.contentRef))
      }
    }
    if (imageReader && pages.images?.length && !active.aborted) {
      imageTask = imageReader.collect(pages.images)
      // Observe a storage failure immediately, including while an earlier text page is still running.
      void imageTask.catch((error: unknown) => { lifetime.abort(error) })
    }
    for (const [index, snapshot] of snapshots.entries()) {
      if (index < start) continue
      if (active.aborted) break
      const outcome = await tasks.get(snapshot.candidatePageId)
      if (snapshot.status === 'available' && !outcome) throw new Error('Saved page is missing its review task')
      // The signal may change while waiting for a task. Do not advance the cursor on cancellation.
      if (options.signal?.aborted || lifetime.signal.aborted) break
      await options.onSettled(index + 1, outcome)
    }
    let images: ProductImageCard[] = []
    if (imageTask) images = await imageTask
    else if (!imageReader && !active.aborted && pages.images?.length && adapters.extractImages) {
      images = await adapters.extractImages(pages.images, active)
    }
    return { pages, images }
  } finally {
    lifetime.abort()
    await Promise.allSettled([...tasks.values(), imageTask, imageReader?.drain()])
  }
}
