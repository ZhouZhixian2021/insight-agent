/** Explicit current-writer expectations for frozen SDK replay inputs. */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import {
  parseToolSchemasSnapshot,
  redactSessionSnapshotIds,
  scrubModelRequestBulk,
  sessionFixtureFiles,
  sessionHeaderVersion,
} from '@deepseek-ai/dsh-session-snapshot'
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'

const CASE = 'academic-plan-chinese'
const WRITER_FILES = ['system-prompt.expected.md', 'tool-schemas.expected.json', 'writer.expected.jsonl'] as const
const SHA256 = /^[a-f0-9]{64}$/u

interface OracleBase {
  readonly source: 'session.v4.jsonl'
  readonly sourceSha256: string
}

/** A registration without an approved current-writer expectation. */
export interface PendingSdkOracle extends OracleBase {
  readonly status: 'pending'
}

/** Current-writer files reviewed separately from the frozen replay input. */
export interface ActiveSdkOracle extends OracleBase {
  readonly status: 'active'
  readonly writerSha256: string
  readonly promptSha256: string
  readonly schemasSha256: string
  readonly writer: string
  readonly prompt: string
  readonly schemas: string
}

/** The single registered SDK scenario; pending entries cannot change comparisons. */
export type SdkOracle = PendingSdkOracle | ActiveSdkOracle

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function keys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const found = Object.keys(value).sort()
  if (JSON.stringify(found) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} fields must be ${expected.join(', ')}`)
  }
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256`)
  return value
}

/** Hash exact file content without transforming newline or Session payloads. */
export function sdkOracleSha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Read the one registered SDK oracle and reject unreviewed or mismatched active files.
 * @param oracleRoot - Directory containing registry.json and optional approved files.
 * @param scenarioDir - Frozen SDK-01 scenario directory, read only.
 * @returns Pending registration or reviewed current-writer file contents.
 */
export async function readSdkOracle(oracleRoot: string, scenarioDir: string): Promise<SdkOracle> {
  const registry = object(JSON.parse(await readFile(join(oracleRoot, 'registry.json'), 'utf8')) as unknown, 'SDK oracle registry')
  keys(registry, ['version', 'scenarios'], 'SDK oracle registry')
  if (registry.version !== 1) throw new Error('SDK oracle registry version must be 1')
  const scenarios = object(registry.scenarios, 'SDK oracle scenarios')
  keys(scenarios, [CASE], 'SDK oracle scenarios')
  const entry = object(scenarios[CASE], `SDK oracle ${CASE}`)
  const active = entry.status === 'active'
  if (!active && entry.status !== 'pending') throw new Error(`SDK oracle ${CASE} status must be pending or active`)
  keys(entry, active
    ? ['status', 'source', 'sourceSha256', 'writerSha256', 'promptSha256', 'schemasSha256']
    : ['status', 'source', 'sourceSha256'], `SDK oracle ${CASE}`)
  if (entry.source !== 'session.v4.jsonl') throw new Error(`SDK oracle ${CASE} must select session.v4.jsonl`)
  const sourceSha256 = digest(entry.sourceSha256, 'SDK oracle sourceSha256')
  const selected = sessionFixtureFiles(await readdir(scenarioDir))
  if (selected.length !== 1 || selected[0]?.name !== entry.source) {
    throw new Error(`SDK oracle ${CASE} selected replay input changed`)
  }
  const source = await readFile(join(scenarioDir, entry.source), 'utf8')
  if (sdkOracleSha256(source) !== sourceSha256) throw new Error(`SDK oracle ${CASE} replay input digest changed`)
  if (!active) {
    if (existsSync(join(oracleRoot, CASE))) throw new Error(`SDK oracle ${CASE} is pending but has output files`)
    return { status: 'pending', source: 'session.v4.jsonl', sourceSha256 }
  }

  const writerSha256 = digest(entry.writerSha256, 'SDK oracle writerSha256')
  const promptSha256 = digest(entry.promptSha256, 'SDK oracle promptSha256')
  const schemasSha256 = digest(entry.schemasSha256, 'SDK oracle schemasSha256')
  const expectedDir = join(oracleRoot, CASE)
  if ((await lstat(expectedDir)).isSymbolicLink()) throw new Error('SDK oracle output directory cannot be a symlink')
  const files = (await readdir(expectedDir)).sort()
  if (JSON.stringify(files) !== JSON.stringify([...WRITER_FILES].sort())) {
    throw new Error(`SDK oracle ${CASE} output inventory differs from the three declared files`)
  }
  const contents = await Promise.all(WRITER_FILES.map(async (name) => {
    const path = join(expectedDir, name)
    if (!(await lstat(path)).isFile()) throw new Error(`SDK oracle ${CASE}/${name} must be a regular file`)
    return readFile(path, 'utf8')
  }))
  const [prompt, schemas, writer] = contents as [string, string, string]
  if (sdkOracleSha256(writer) !== writerSha256 || sdkOracleSha256(prompt) !== promptSha256
    || sdkOracleSha256(schemas) !== schemasSha256) {
    throw new Error(`SDK oracle ${CASE} output digest changed`)
  }
  if (writerSha256 === sourceSha256) throw new Error(`SDK oracle ${CASE} cannot copy replay input as writer output`)
  if (prompt.trim().length === 0) throw new Error(`SDK oracle ${CASE} prompt must not be empty`)
  if (sessionHeaderVersion(writer, WRITER_FILES[2]) !== SESSION_FORMAT_VERSION) {
    throw new Error(`SDK oracle ${CASE} writer is not the current Session format`)
  }
  if (redactSessionSnapshotIds([writer])[0] !== writer || scrubModelRequestBulk(writer) !== writer) {
    throw new Error(`SDK oracle ${CASE} writer is not a redacted fixture fixed point`)
  }
  parseToolSchemasSnapshot(schemas)
  return {
    status: 'active', source: 'session.v4.jsonl', sourceSha256,
    writerSha256, promptSha256, schemasSha256, writer, prompt, schemas,
  }
}

/** Reject every write-capable mode for a registered frozen SDK scenario. */
export function assertSdkOracleReplayMode(mode: string): void {
  if (mode !== 'replay') throw new Error(`SDK oracle ${CASE} is read only; ${mode} cannot write frozen fixtures`)
}

/**
 * Save exact persisted SDK output for independent review without writing the repository.
 * @param repositoryRoot - Checkout containing the frozen SDK scenario.
 * @param evidenceDirectory - Existing empty directory outside all Git checkouts.
 * @param oracle - Registration that pins the replay input.
 * @param logs - Native persisted JSONL content in parent/child role order.
 */
export async function captureSdkOracleEvidence(
  repositoryRoot: string,
  evidenceDirectory: string,
  oracle: SdkOracle,
  logs: readonly { readonly content: string }[],
): Promise<void> {
  if (!isAbsolute(evidenceDirectory)) throw new Error('SDK oracle evidence directory must be absolute')
  const destination = await realpath(evidenceDirectory)
  const checkout = await realpath(repositoryRoot)
  const within = relative(checkout, destination)
  if (within === '' || within === '.' || within !== '..' && !within.startsWith(`..${sep}`) && !isAbsolute(within)) {
    throw new Error('SDK oracle evidence directory must be outside the checkout')
  }
  for (let cursor = destination; ; cursor = dirname(cursor)) {
    if (existsSync(join(cursor, '.git'))) throw new Error('SDK oracle evidence directory cannot be in a Git checkout')
    const parent = dirname(cursor)
    if (parent === cursor) break
  }
  if ((await readdir(destination)).length !== 0) throw new Error('SDK oracle evidence directory must be empty')
  if (logs.length !== 1) throw new Error('SDK oracle SDK-01 capture requires exactly one persisted Session')
  const raw = logs[0]?.content
  if (raw === undefined || sessionHeaderVersion(raw, 'SDK oracle capture') !== SESSION_FORMAT_VERSION) {
    throw new Error('SDK oracle capture requires current-writer Session JSONL')
  }
  const file = 'writer.raw.jsonl'
  await writeFile(join(destination, file), raw, { flag: 'wx' })
  await writeFile(join(destination, 'capture.json'), `${JSON.stringify({
    version: 1,
    scenario: CASE,
    source: oracle.source,
    sourceSha256: oracle.sourceSha256,
    writerFile: file,
    writerSha256: sdkOracleSha256(raw),
  }, null, 2)}\n`, { flag: 'wx' })
}
