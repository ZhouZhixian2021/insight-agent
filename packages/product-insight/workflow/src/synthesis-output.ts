import type { ProductSynthesisInput } from './report.ts'

/** A transport outcome is separate from the usability of complete answers in its text. */
export interface SynthesisResponse {
  readonly text: string
  readonly error: 'invalid_output' | 'output_limit' | 'request_failed' | null
  readonly failureCode?: 'TRANSPORT' | 'TIMEOUT' | 'ABORTED'
}

/** Per-question diagnostics retain the previous draft for targeted correction. */
export interface SynthesisIssue {
  readonly questionId: string
  readonly reasons: readonly string[]
  readonly drafts: readonly unknown[]
}

/** Accepted answers contain only resolved, original evidence identities. */
export interface SynthesisInspection {
  readonly answers: ReadonlyMap<string, string>
  readonly issues: readonly SynthesisIssue[]
  readonly notes: readonly string[]
}

/**
 * Stable short references for one synthesis group, including its repair calls.
 * @param input - Original question and evidence pool.
 * @returns Short reference to original evidence identity mapping.
 */
export function synthesisAliases(input: ProductSynthesisInput): ReadonlyMap<string, string> {
  const ids = [...new Set(input.questions.flatMap(question => question.evidence.map(item => String(item.evidenceId))))]
  return new Map(ids.map((id, index) => [`E${index + 1}`, id]))
}

/**
 * Read one unambiguous array, retaining complete elements before a truncated tail.
 * @param text - Model output, optionally wrapped in prose or a code fence.
 * @returns Complete entries and any recovery notice.
 */
export function readEntries(text: string): { entries: unknown[]; note?: string } {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value) ? { entries: value } : { entries: [], note: 'Expected an answer array.' }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    // A wrapper or truncated array may still contain independently complete answers.
  }
  const arrays: { entries: unknown[]; complete: boolean }[] = []
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '[' || !/^\s*(?:\{|\])/u.test(text.slice(start + 1))) continue
    const entries: unknown[] = []
    let depth = 1, quoted = false, escaped = false, itemStart = start + 1, end = text.length
    let complete = false
    for (let index = start + 1; index < text.length; index++) {
      const char = text[index]
      if (quoted) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') quoted = false
        continue
      }
      if (char === '"') { quoted = true; continue }
      if (char === '[' || char === '{') depth++
      if (char === ']' || char === '}') depth--
      if (depth === 1 && char === ',' || depth === 0) {
        const part = text.slice(itemStart, index).trim()
        if (part) {
          try { entries.push(JSON.parse(part)) }
          catch (error) { if (!(error instanceof SyntaxError)) throw error }
        }
        itemStart = index + 1
      }
      if (depth === 0) { complete = true; end = index; break }
      // A fully closed last object can be kept even when the closing array bracket is missing.
      if (depth === 1 && char === '}') {
        const next = text.slice(index + 1).trimStart()
        if (!next || next[0] !== ',' && next[0] !== ']') {
          try { entries.push(JSON.parse(text.slice(itemStart, index + 1))) }
          catch (error) { if (!(error instanceof SyntaxError)) throw error }
          end = index
          break
        }
      }
    }
    arrays.push({ entries, complete })
    start = end
  }
  if (arrays.length !== 1) return { entries: [], note: 'No unique answer array could be identified.' }
  const array = arrays[0]
  return array === undefined ? { entries: [] } : { entries: array.entries,
    note: array.complete ? 'Removed output wrapper.' : 'Recovered complete answers from incomplete output.' }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Validate each answer independently; derive references from inline citations.
 * @param text - Raw model output, possibly wrapped or incomplete.
 * @param input - Questions and their eligible evidence.
 * @param aliases - Stable reference mapping shared with repair requests.
 * @returns Accepted prose, per-question errors and normalization notes.
 */
export function inspectProductSynthesis(text: string, input: ProductSynthesisInput,
  aliases: ReadonlyMap<string, string> = synthesisAliases(input)): SynthesisInspection {
  const parsed = readEntries(text)
  const notes = parsed.note === undefined ? [] : [parsed.note]
  const answers = new Map<string, string>()
  const issues: SynthesisIssue[] = []
  for (const entry of parsed.entries) {
    if (!object(entry) || !input.questions.some(question => question.questionId === entry.questionId)) {
      notes.push('Ignored an entry without an approved question identity.')
    }
  }
  for (const question of input.questions) {
    const entries = parsed.entries.filter(entry => object(entry) && entry.questionId === question.questionId)
    const allowed = new Set(question.evidence.map(item => String(item.evidenceId)))
    for (const note of input.pageSummaries ?? []) allowed.add(note.source.sourceId)
    for (const image of input.images ?? []) allowed.add(image.id)
    const reasons: string[] = []
    const normalized: string[] = []
    const resolve = (id: string): string | undefined => {
      if (allowed.has(id)) return id
      const alias = aliases.get(id)
      if (alias !== undefined && allowed.has(alias)) return alias
      const matches = /^[0-9a-f]{8,}$/iu.test(id) ? [...allowed].filter(full => full.startsWith(id)) : []
      return matches.length === 1 ? matches[0] : undefined
    }
    for (const entry of entries) {
      if (!object(entry) || typeof entry.text !== 'string' || !entry.text.trim()) {
        reasons.push('Answer text is missing or empty.'); continue
      }
      if (entry.status !== undefined && (typeof entry.status !== 'string'
        || !['answered', 'partial', 'insufficient'].includes(entry.status))) {
        reasons.push('Unknown answer coverage status.')
      }
      let body = entry.text.trim().replace(/\r\n?/gu, '\n')
      const unknown: string[] = []
      let count = 0
      // Whitespace and a single missing closing bracket have an unambiguous citation grammar.
      body = body.replace(/\[\[\s*cite\s*:\s*([^\]\s]+)\s*\]\]?/giu, (_marker, id: string) => {
        const resolved = resolve(id)
        if (resolved === undefined) { unknown.push(id); return `[[cite:${id}]]` }
        count++
        return `[[cite:${resolved}]]`
      })
      if (body !== entry.text.trim().replace(/\r\n?/gu, '\n')) notes.push(`${question.questionId}: Normalized citation syntax or identity.`)
      if (entry.evidenceIds !== undefined) notes.push(`${question.questionId}: Derived references from inline citations; ignored redundant evidenceIds.`)
      if (unknown.length) reasons.push(`Unknown or ambiguous evidence IDs: ${[...new Set(unknown)].join(', ')}.`)
      if (/\[\[\s*cite\b/iu.test(body.replace(/\[\[cite:[^\]\s]+\]\]/gu, ''))) {
        reasons.push('A citation marker is incomplete or malformed.')
      }
      const insufficient = entry.status === 'insufficient'
        || body === '现有材料不足以形成有依据的回答。'
      if (count === 0 && !insufficient) reasons.push('A substantive answer has no valid inline citations.')
      // An insufficient answer is a declared gap, never silently certified factual prose.
      if (count === 0 && insufficient && entry.status === 'insufficient') body = `资料不足：${body}`
      normalized.push(body)
    }
    if (entries.length === 0) reasons.push('The approved question is missing from the response.')
    if (new Set(normalized).size > 1) reasons.push('Different answers were returned for the same question.')
    const answer = normalized[0]
    if (reasons.length || answer === undefined) issues.push({ questionId: question.questionId,
      reasons: [...new Set(reasons)], drafts: entries })
    else answers.set(question.questionId, answer)
  }
  return { answers, issues, notes: [...new Set(notes)] }
}

/**
 * Serialize only the requested questions with stable, short evidence references.
 * @param input - Requested subset of the approved questions.
 * @param aliases - Original group's reference mapping.
 * @param correction - Failed question and prior request outcome, when repairing.
 * @returns Exact model input for trace and replay.
 */
export function synthesisRequest(input: ProductSynthesisInput, aliases: ReadonlyMap<string, string>,
  correction?: { issue: SynthesisIssue; response: SynthesisResponse }): string {
  const reverse = new Map([...aliases].map(([alias, id]) => [id, alias]))
  return JSON.stringify({ ...input, questions: input.questions.map(question => ({ ...question,
    evidence: question.evidence.map(item => ({ ...item, evidenceId: reverse.get(item.evidenceId) ?? item.evidenceId })) })),
  ...correction === undefined ? {} : { correction: {
    instruction: 'Repair only this question using its existing draft and the supplied evidence. Preserve valid prose. '
      + 'Correct citations by meaning, never by guessing. Revise unsupported sentences or declare the concrete gap. '
      + 'Return the one-question array, without repeating other answers. Keep it complete within the output budget.',
    reasons: correction.issue.reasons, drafts: correction.issue.drafts,
    previousOutcome: correction.response.error, failureCode: correction.response.failureCode,
    // Do not resend successful siblings just because this question has no recoverable draft.
  } } })
}

/**
 * Keep accepted siblings and repair each rejected question once.
 * @param input - Approved synthesis group.
 * @param invoke - Persisted model request adapter, including replay.
 * @param signal - User cancellation, which must not start correction calls.
 * @returns Accepted answers and explicit generation-failure notices for failed repairs.
 */
export async function repairProductSynthesis(input: ProductSynthesisInput,
  invoke: (user: string, ordinal: 1 | 2, subset: ProductSynthesisInput,
    aliases: ReadonlyMap<string, string>) => Promise<SynthesisResponse>, signal?: AbortSignal): Promise<ReadonlyMap<string, string>> {
  const aliases = synthesisAliases(input)
  signal?.throwIfAborted()
  const first = await invoke(synthesisRequest(input, aliases), 1, input, aliases)
  signal?.throwIfAborted()
  const inspected = inspectProductSynthesis(first.text, input, aliases)
  const answers = new Map(inspected.answers)
  // A failed connection with no usable answer is a request retry, not five content-repair requests.
  if (first.error === 'request_failed' && answers.size === 0 && inspected.issues.every(issue => issue.drafts.length === 0)) {
    const response = await invoke(synthesisRequest(input, aliases), 2, input, aliases)
    signal?.throwIfAborted()
    const retried = inspectProductSynthesis(response.text, input, aliases)
    return new Map(input.questions.map(question => [question.questionId,
      retried.answers.get(question.questionId) ?? synthesisFailureNotice(response)]))
  }
  for (const issue of inspected.issues) {
    signal?.throwIfAborted()
    const subset = { ...input, questions: input.questions.filter(question => question.questionId === issue.questionId) }
    const response = await invoke(synthesisRequest(subset, aliases, { issue, response: first }), 2, subset, aliases)
    signal?.throwIfAborted()
    const repaired = inspectProductSynthesis(response.text, subset, aliases)
    answers.set(issue.questionId, repaired.answers.get(issue.questionId) ?? synthesisFailureNotice(response))
  }
  return answers
}

function synthesisFailureNotice(response: SynthesisResponse): string {
  return response.error === 'request_failed'
    ? '本题报告生成请求失败，暂未形成可交付回答；这不表示没有相关资料，其他可用回答予以保留。'
    : '本题回答的格式或引用未完成修复，暂不展示未核对正文；这不表示没有相关资料，其他可用回答予以保留。'
}
