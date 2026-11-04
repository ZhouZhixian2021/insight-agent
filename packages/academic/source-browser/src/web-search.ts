/** Project observed scholarly records through the existing Web search service. */
import type { AcademicSourceProvider } from '@deepseek-ai/dsh-academic-source'
import type { WebSearchProvider } from '@deepseek-ai/dsh-web'

/**
 * Use scholarly browser search behind the standard web_search tool.
 * @param source Registered Academic provider owning discovery, cancellation, and PDF locations.
 * @returns Web provider with official paper links, published abstracts, and declared coverage.
 */
export function academicBrowserWebSearch(source: AcademicSourceProvider): WebSearchProvider {
  return {
    id: source.id,
    available: () => source.available(),
    async search(request, signal) {
      const result = await source.search(request, signal)
      const scopes = source.limitations === undefined ? [] : source.limitations
      return {
        content: ['浏览器学术站内搜索。', ...scopes].join('\n'),
        sources: result.works.flatMap(work => work.workVersion.sourceRecords
          .filter(record => record.provider === source.id)
          .map(record => ({ url: record.recordId, title: work.academicWork.title,
            ...(work.metadata?.abstract.status === 'available' ? { snippet: work.metadata.abstract.value } : {}),
          }))),
        truncated: result.truncated,
      }
    },
  }
}
