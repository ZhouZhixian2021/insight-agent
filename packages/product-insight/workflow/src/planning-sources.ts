/** Recover observed links from historical or explicitly customized planning sessions. */
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { WebSearchResult } from '@deepseek-ai/dsh-web'

/**
 * Read structured results from successful searches before the approved plan call.
 * Earlier turns and later tool results cannot contribute links to this plan.
 * @param events - Ordered history of the owning Session.
 * @param approvalIdentity - Native call or PTC subcall that supplied the approved plan.
 * @returns Observed search links, never assistant-written URLs or report evidence.
 */
export function planningSearchSources(events: readonly SessionEvent[], approvalIdentity: string): WebSearchResult['sources'] {
  const end = events.findIndex(event => event.type === 'tool/call'
    ? String(event.data.callId) === approvalIdentity
    : event.type === 'tool/ptc-dispatch' && String(event.data.subCallId) === approvalIdentity)
  if (end < 0) return []
  let start = 0
  for (let index = 0; index < end; index += 1) {
    if (events[index]?.type === 'turn/start') start = index
  }
  const searches = new Set<string>()
  const sources: WebSearchResult['sources'][number][] = []
  function collect(meta: unknown): void {
    if (typeof meta !== 'object' || meta === null || !('sources' in meta) || !Array.isArray(meta.sources)) return
    for (const source of meta.sources as unknown[]) {
      if (typeof source !== 'object' || source === null || !('url' in source) || typeof source.url !== 'string') continue
      sources.push({ url: source.url,
        ...'title' in source && typeof source.title === 'string' ? { title: source.title } : {},
        ...'snippet' in source && typeof source.snippet === 'string' ? { snippet: source.snippet } : {} })
    }
  }
  for (const event of events.slice(start, end)) {
    if (event.type === 'tool/call' && event.data.name === 'web_search') searches.add(String(event.data.callId))
    else if (event.type === 'tool/result' && !event.data.message.isError
      && searches.has(String(event.data.message.toolCallId))) collect(event.data.meta)
    else if (event.type === 'tool/ptc-dispatch' && event.data.name === 'web_search' && !event.data.isError) collect(event.data.meta)
  }
  return sources
}
