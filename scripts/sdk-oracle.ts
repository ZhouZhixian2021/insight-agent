/** Explicit current-writer expectations for frozen SDK replay inputs. */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import {
  parseToolSchemasSnapshot,
  redactSessionSnapshotIds,
  scrubModelRequestBulk,
  sessionFixtureFiles,
  sessionHeaderVersion,
} from '@deepseek-ai/dsh-session-snapshot'
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'

const WRITER_FILES = ['system-prompt.expected.md', 'tool-schemas.expected.json', 'writer.expected.jsonl'] as const
/** The optional wire projection of a scenario that retains SDK protocol goldens. */
const WIRE_FILES = ['notifications.expected.jsonl', 'result.expected.json'] as const
const SHA256 = /^[a-f0-9]{64}$/u
const REGISTRY_FILE = 'registry.json'

interface OracleBase {
  readonly scenario: string
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
  /** Normalized notifications of the same run, present only when the scenario keeps wire goldens. */
  readonly notifications?: string
  /** Normalized run result of the same run, present only when the scenario keeps wire goldens. */
  readonly result?: string
}

/** One registered SDK scenario; pending entries cannot change comparisons. */
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

function scenarioEntries(registry: Record<string, unknown>): Record<string, Record<string, unknown>> {
  keys(registry, ['version', 'scenarios'], 'SDK oracle registry')
  if (registry.version !== 1) throw new Error('SDK oracle registry version must be 1')
  const scenarios = object(registry.scenarios, 'SDK oracle scenarios')
  const entries: Record<string, Record<string, unknown>> = {}
  for (const [name, value] of Object.entries(scenarios)) {
    if (name.trim().length === 0) throw new Error('SDK oracle scenario name must not be empty')
    entries[name] = object(value, `SDK oracle ${name}`)
  }
  return entries
}

/**
 * Names registered in the SDK oracle registry.
 * @param oracleRoot - Directory containing registry.json.
 * @returns Registered scenario names, sorted, for test selection before any replay runs.
 */
export function sdkOracleRegistryNames(oracleRoot: string): readonly string[] {
  const parsed: unknown = JSON.parse(readFileSync(join(oracleRoot, REGISTRY_FILE), 'utf8'))
  return Object.keys(scenarioEntries(object(parsed, 'SDK oracle registry'))).sort()
}

/**
 * Read the oracle registered for one scenario and reject unreviewed or mismatched active files.
 * @param oracleRoot - Directory containing registry.json and optional approved files.
 * @param scenarioDir - Frozen SDK scenario directory whose name selects the registration.
 * @returns Pending registration, reviewed current-writer files, or undefined for an unregistered scenario.
 */
export async function readSdkOracle(oracleRoot: string, scenarioDir: string): Promise<SdkOracle | undefined> {
  const scenario = basename(scenarioDir)
  const parsed: unknown = JSON.parse(await readFile(join(oracleRoot, REGISTRY_FILE), 'utf8'))
  const entry = scenarioEntries(object(parsed, 'SDK oracle registry'))[scenario]
  if (entry === undefined) return undefined
  const active = entry.status === 'active'
  if (!active && entry.status !== 'pending') throw new Error(`SDK oracle ${scenario} status must be pending or active`)
  const wire = entry.notificationsSha256 !== undefined || entry.resultSha256 !== undefined
  if (wire && !active) throw new Error(`SDK oracle ${scenario} cannot register wire goldens while pending`)
  keys(entry, active
    ? ['status', 'source', 'sourceSha256', 'writerSha256', 'promptSha256', 'schemasSha256',
      ...wire ? ['notificationsSha256', 'resultSha256'] : []]
    : ['status', 'source', 'sourceSha256'], `SDK oracle ${scenario}`)
  if (entry.source !== 'session.v4.jsonl') throw new Error(`SDK oracle ${scenario} must select session.v4.jsonl`)
  const sourceSha256 = digest(entry.sourceSha256, 'SDK oracle sourceSha256')
  const selected = sessionFixtureFiles(await readdir(scenarioDir))
  if (selected.length !== 1 || selected[0]?.name !== entry.source) {
    throw new Error(`SDK oracle ${scenario} selected replay input changed`)
  }
  const source = await readFile(join(scenarioDir, entry.source), 'utf8')
  if (sdkOracleSha256(source) !== sourceSha256) throw new Error(`SDK oracle ${scenario} replay input digest changed`)
  if (!active) {
    if (existsSync(join(oracleRoot, scenario))) throw new Error(`SDK oracle ${scenario} is pending but has output files`)
    return { scenario, status: 'pending', source: 'session.v4.jsonl', sourceSha256 }
  }

  const writerSha256 = digest(entry.writerSha256, 'SDK oracle writerSha256')
  const promptSha256 = digest(entry.promptSha256, 'SDK oracle promptSha256')
  const schemasSha256 = digest(entry.schemasSha256, 'SDK oracle schemasSha256')
  const notificationsSha256 = wire ? digest(entry.notificationsSha256, 'SDK oracle notificationsSha256') : undefined
  const resultSha256 = wire ? digest(entry.resultSha256, 'SDK oracle resultSha256') : undefined
  const expectedDir = join(oracleRoot, scenario)
  if ((await lstat(expectedDir)).isSymbolicLink()) throw new Error('SDK oracle output directory cannot be a symlink')
  const declared = [...WRITER_FILES, ...wire ? WIRE_FILES : []]
  const files = (await readdir(expectedDir)).sort()
  if (JSON.stringify(files) !== JSON.stringify([...declared].sort())) {
    throw new Error(`SDK oracle ${scenario} output inventory differs from its declared files`)
  }
  const contents = await Promise.all(declared.map(async (name) => {
    const path = join(expectedDir, name)
    if (!(await lstat(path)).isFile()) throw new Error(`SDK oracle ${scenario}/${name} must be a regular file`)
    return readFile(path, 'utf8')
  }))
  const [prompt, schemas, writer, notifications, result] = contents as [
    string, string, string, string | undefined, string | undefined,
  ]
  if (sdkOracleSha256(writer) !== writerSha256 || sdkOracleSha256(prompt) !== promptSha256
    || sdkOracleSha256(schemas) !== schemasSha256) {
    throw new Error(`SDK oracle ${scenario} output digest changed`)
  }
  if (notifications !== undefined && sdkOracleSha256(notifications) !== notificationsSha256) {
    throw new Error(`SDK oracle ${scenario} notifications digest changed`)
  }
  if (result !== undefined && sdkOracleSha256(result) !== resultSha256) {
    throw new Error(`SDK oracle ${scenario} result digest changed`)
  }
  if (writerSha256 === sourceSha256) throw new Error(`SDK oracle ${scenario} cannot copy replay input as writer output`)
  if (prompt.trim().length === 0) throw new Error(`SDK oracle ${scenario} prompt must not be empty`)
  if (sessionHeaderVersion(writer, WRITER_FILES[2]) !== SESSION_FORMAT_VERSION) {
    throw new Error(`SDK oracle ${scenario} writer is not the current Session format`)
  }
  if (redactSessionSnapshotIds([writer])[0] !== writer || scrubModelRequestBulk(writer) !== writer) {
    throw new Error(`SDK oracle ${scenario} writer is not a redacted fixture fixed point`)
  }
  parseToolSchemasSnapshot(schemas)
  return {
    scenario, status: 'active', source: 'session.v4.jsonl', sourceSha256,
    writerSha256, promptSha256, schemasSha256, writer, prompt, schemas,
    ...notifications === undefined ? {} : { notifications },
    ...result === undefined ? {} : { result },
  }
}

/**
 * Reject every mode that would rewrite a registered frozen scenario.
 * @param mode - Snapshot mode under test.
 * @param scenario - Registered scenario name for the diagnostic.
 */
export function assertSdkOracleReplayMode(mode: string, scenario: string): void {
  if (mode !== 'replay') throw new Error(`SDK oracle ${scenario} is read only; ${mode} cannot write frozen fixtures`)
}

/**
 * Save exact persisted SDK output for independent review without writing the repository.
 * @param repositoryRoot - Checkout containing the frozen SDK scenario.
 * @param evidenceDirectory - Existing empty directory outside all Git checkouts.
 * @param oracle - Registration that pins the replay input.
 * @param logs - Native persisted JSONL content in parent/child role order.
 * @param modelInput - Assembled system prompt and tool schemas the replay actually sent.
 * @param wire - Normalized notifications and run result when the scenario keeps wire goldens.
 */
export async function captureSdkOracleEvidence(
  repositoryRoot: string,
  evidenceDirectory: string,
  oracle: SdkOracle,
  logs: readonly { readonly content: string }[],
  modelInput?: { readonly prompt: string; readonly schemas: string },
  wire?: { readonly notifications: string; readonly result: string },
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
  const raw = logs[0]?.content
  if (logs.length !== 1) throw new Error(`SDK oracle ${oracle.scenario} capture requires exactly one persisted Session`)
  if (raw === undefined || sessionHeaderVersion(raw, 'SDK oracle capture') !== SESSION_FORMAT_VERSION) {
    throw new Error('SDK oracle capture requires current-writer Session JSONL')
  }
  const files: Array<readonly [string, string]> = [['writer.raw.jsonl', raw]]
  if (modelInput !== undefined) {
    files.push(['system-prompt.expected.md', modelInput.prompt], ['tool-schemas.expected.json', modelInput.schemas])
  }
  if (wire !== undefined) {
    files.push(['notifications.expected.jsonl', wire.notifications], ['result.expected.json', wire.result])
  }
  for (const [name, content] of files) await writeFile(join(destination, name), content, { flag: 'wx' })
  await writeFile(join(destination, 'capture.json'), `${JSON.stringify({
    version: 1,
    scenario: oracle.scenario,
    source: oracle.source,
    sourceSha256: oracle.sourceSha256,
    files: files.map(([name, content]) => ({ name, sha256: sdkOracleSha256(content) })),
  }, null, 2)}\n`, { flag: 'wx' })
}
