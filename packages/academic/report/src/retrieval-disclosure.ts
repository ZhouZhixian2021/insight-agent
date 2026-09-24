/** Report-owned presentation of observed retrieval; contains no candidate bibliography. */
import { escapeMarkdown } from './synthesis-render.ts'

/** Localized observation rows supplied by a consumer of the formal retrieval result. */
export interface RetrievalDisclosure {
  readonly title: string
  /** Channels and stages use producer statuses; missing data is explicitly described. */
  readonly observations: readonly { readonly label: string; readonly value: string | number }[]
  /** Explains Web discovery-only use and that absence of reported limits is not proof of completeness. */
  readonly scopeNotice: string
  readonly limitations: readonly string[]
  readonly failures: readonly string[]
}

/**
 * Append escaped runtime facts without promoting discovery URLs to references.
 * @param markdown Original report body, retained verbatim.
 * @param disclosure Localized facts obtained from the actual run, never model-generated statistics.
 * @returns The original report followed by a labeled retrieval disclosure appendix.
 */
export function appendRetrievalDisclosure(markdown: string, disclosure: RetrievalDisclosure): string {
  return `${markdown}\n\n## ${escapeMarkdown(disclosure.title)}\n\n${escapeMarkdown(disclosure.scopeNotice)}\n\n${[
    ...disclosure.observations.map(row => `${row.label}: ${row.value}`),
    ...disclosure.limitations,
    ...disclosure.failures,
  ].map(line => `- ${escapeMarkdown(line)}`).join('\n')}\n`
}
