/** Exact retained findings shared by the two documentation checks. */

import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const digest = z.string().regex(/^[a-f0-9]{64}$/u)
const gateSchema = z.enum(['repository-reference', 'concrete-term'])
const entrySchema = z.strictObject({
  gate: gateSchema,
  file: z.string().min(1).refine(file => !file.includes('\\') && !file.startsWith('/')
    && !file.includes(':') && file.split('/').every(part => part !== '..' && part !== '.' && part !== '')),
  reason: z.enum(['historical-identity', 'dependency-pin', 'frozen-sample', 'visible-text',
    'frozen-field-consumer', 'model-instruction']),
  fileSha256: digest.optional(),
  matches: z.array(z.strictObject({
    kind: z.enum(['commit-hash', 'organization-url', 'concrete-term']),
    contextSha256: digest,
    count: z.number().int().positive(),
  })).min(1),
}).refine(entry => !['historical-identity', 'dependency-pin', 'frozen-sample'].includes(entry.reason)
  || entry.fileSha256 !== undefined, 'Retained evidence requires a whole-file digest')
const registrySchema = z.strictObject({ version: z.literal(1), entries: z.array(entrySchema) })

/** One explicitly retained file and its expected finding multiplicities. */
export type RetainedDocumentEntry = z.infer<typeof entrySchema>

/** A raw detector result before retained findings are reconciled. */
export interface DocumentFinding {
  /** Repository-relative file path. */
  file: string
  /** One-based line, or null for a path finding. */
  line: number | null
  /** Reference detector category; absent for the terminology detector. */
  kind?: 'commit-hash' | 'organization-url'
}

/**
 * Hash normalized text, preserving all differences except checkout line endings.
 * @param text - Source text or symlink target.
 * @returns SHA-256 of the LF-normalized text.
 */
export function documentTextDigest(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/gu, '\n')).digest('hex')
}

/**
 * Fingerprint a finding with its immediate neighboring lines.
 * @param finding - Raw path or line finding.
 * @param source - Complete file text.
 * @returns Context digest independent of line-number shifts and checkout line endings.
 */
export function documentFindingDigest(finding: DocumentFinding, source: string): string {
  if (finding.line === null) return documentTextDigest(`path\n${finding.file}`)
  const lines = source.replace(/\r\n/gu, '\n').split('\n')
  return documentTextDigest(JSON.stringify({
    before: lines[finding.line - 2] ?? null,
    current: lines[finding.line - 1] ?? null,
    after: lines[finding.line] ?? null,
  }))
}

/**
 * Accept only registered findings with unchanged context, counts, and pinned file text.
 * @param gate - Detector whose complete result is supplied.
 * @param findings - Raw findings, without pre-filtering.
 * @param sources - Current text for every detected or registered file.
 * @param entries - Validated retained-finding registry.
 * @returns Unregistered findings, invalid or stale entries, and the retained count.
 */
export function reviewRetainedDocumentFindings<T extends DocumentFinding>(
  gate: z.infer<typeof gateSchema>,
  findings: readonly T[],
  sources: ReadonlyMap<string, string>,
  entries: readonly RetainedDocumentEntry[],
): { unregistered: T[]; errors: string[]; retained: number } {
  const errors: string[] = []
  const expected = new Map<string, number>()
  const actual = new Map<string, number>()
  const seen = new Set<string>()
  const key = (file: string, kind: string, hash: string) => JSON.stringify([file, kind, hash])
  for (const entry of entries.filter(entry => entry.gate === gate)) {
    if (seen.has(entry.file)) errors.push(`${entry.file}: duplicate retained file entry`)
    seen.add(entry.file)
    const source = sources.get(entry.file)
    if (source === undefined) errors.push(`${entry.file}: retained file is missing`)
    else if (entry.fileSha256 !== undefined && documentTextDigest(source) !== entry.fileSha256) {
      errors.push(`${entry.file}: retained file digest changed`)
    }
    for (const match of entry.matches) {
      if ((gate === 'concrete-term') !== (match.kind === 'concrete-term')) {
        errors.push(`${entry.file}: retained finding belongs to another detector`)
      }
      const id = key(entry.file, match.kind, match.contextSha256)
      if (expected.has(id)) errors.push(`${entry.file}: duplicate retained context`)
      expected.set(id, match.count)
    }
  }
  const unregistered: T[] = []
  for (const finding of findings) {
    const source = sources.get(finding.file)
    const id = key(finding.file, finding.kind ?? 'concrete-term', documentFindingDigest(finding, source ?? ''))
    if (source === undefined || !expected.has(id)) unregistered.push(finding)
    else actual.set(id, (actual.get(id) ?? 0) + 1)
  }
  for (const [id, count] of expected) {
    const found = actual.get(id) ?? 0
    if (found !== count) errors.push(`${id}: retained count ${String(found)} differs from ${String(count)}`)
  }
  return { unregistered, errors, retained: findings.length - unregistered.length }
}

/**
 * Load the strict registry and reconcile one detector against current repository files.
 * @param repoRoot - Repository containing scripts/retained-document-findings.json.
 * @param gate - Detector whose complete result is supplied.
 * @param findings - Raw detector results.
 * @returns Exact retained matches and failures; malformed or missing registries throw.
 */
export function checkRetainedDocumentFindings<T extends DocumentFinding>(
  repoRoot: string, gate: z.infer<typeof gateSchema>, findings: readonly T[],
): ReturnType<typeof reviewRetainedDocumentFindings<T>> {
  const entries = loadRetainedDocumentEntries(repoRoot)
  const files = new Set([...findings.map(finding => finding.file),
    ...entries.filter(entry => entry.gate === gate).map(entry => entry.file)])
  const sources = new Map<string, string>()
  for (const file of files) {
    const path = resolve(repoRoot, file)
    const stat = lstatSync(path, { throwIfNoEntry: false })
    if (stat?.isSymbolicLink() === true) sources.set(file, readlinkSync(path))
    else if (stat?.isFile() === true) sources.set(file, readFileSync(path, 'utf8'))
  }
  return reviewRetainedDocumentFindings(gate, findings, sources, entries)
}

/**
 * Read and validate exact retained findings for a repository checkout.
 * @param repoRoot - Repository containing the retained-finding registry.
 * @returns Validated entries used by documentation detectors and reconciliation.
 */
export function loadRetainedDocumentEntries(repoRoot: string): RetainedDocumentEntry[] {
  return registrySchema.parse(JSON.parse(readFileSync(
    resolve(repoRoot, 'scripts/retained-document-findings.json'), 'utf8',
  ))).entries
}
