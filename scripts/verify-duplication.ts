/** Reject clone inventory changes against the reviewed A/U0 merge baseline. */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const baselinePath = join(root, '.jscpd-baseline.json')
const fingerprintPattern = /^[a-f0-9]{16}$/u

interface CloneBaseline {
  readonly version: 1
  readonly fingerprints: Readonly<Record<string, number>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export interface CloneInventoryDifference {
  readonly added: readonly string[]
  readonly stale: readonly string[]
}

function readCloneBaseline(path: string): CloneBaseline {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(raw)) {
    throw new Error('duplication baseline must be an object')
  }
  if (Object.keys(raw).sort().join(',') !== 'fingerprints,version' || raw.version !== 1) {
    throw new Error('duplication baseline requires version 1 and fingerprints')
  }
  const fingerprints = raw.fingerprints
  if (!isRecord(fingerprints)) {
    throw new Error('duplication baseline fingerprints must be an object')
  }
  const validated: Record<string, number> = {}
  for (const [fingerprint, count] of Object.entries(fingerprints)) {
    if (!fingerprintPattern.test(fingerprint) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) {
      throw new Error('duplication baseline contains an invalid fingerprint or count')
    }
    validated[fingerprint] = count
  }
  return { version: 1, fingerprints: validated }
}

/** Compare complete clone multisets so removing an old clone also needs review. */
export function compareCloneFingerprints(
  expected: Readonly<Record<string, number>>,
  actual: Readonly<Record<string, number>>,
): CloneInventoryDifference {
  const added: string[] = []
  const stale: string[] = []
  for (const [fingerprint, count] of Object.entries(actual)) {
    const increase = count - (expected[fingerprint] ?? 0)
    if (increase > 0) added.push(fingerprint + ' +' + String(increase))
  }
  for (const [fingerprint, count] of Object.entries(expected)) {
    const decrease = count - (actual[fingerprint] ?? 0)
    if (decrease > 0) stale.push(fingerprint + ' -' + String(decrease))
  }
  return { added: added.sort(), stale: stale.sort() }
}

function main(): void {
  const expected = readCloneBaseline(baselinePath)
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-duplication-'))
  const candidatePath = join(scratch, 'candidate.json')
  try {
    const require = createRequire(import.meta.url)
    const jscpd = require.resolve('jscpd/run-jscpd.js')
    const result = spawnSync(process.execPath, [
      jscpd, '--config', join(root, '.jscpd.json'),
      '--baseline', candidatePath, '--update-baseline', '--exit-code', '0',
      '--reporters', 'silent', 'packages', 'scripts',
    ], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
    if (result.error !== undefined || result.status !== 0 || !existsSync(candidatePath)) {
      throw new Error('duplication detector failed: ' + String(result.error ?? (result.stderr || result.stdout)))
    }
    const actual = readCloneBaseline(candidatePath)
    const difference = compareCloneFingerprints(expected.fingerprints, actual.fingerprints)
    if (difference.added.length > 0 || difference.stale.length > 0) {
      console.error('verify-duplication: clone inventory changed; review the exact source blocks before updating the baseline.')
      for (const item of difference.added) console.error('  new ' + item)
      for (const item of difference.stale) console.error('  stale ' + item)
      process.exitCode = 1
      return
    }
    const count = Object.values(actual.fingerprints).reduce((total, value) => total + value, 0)
    console.log('verify-duplication: ' + String(count) + ' reviewed clone fingerprints unchanged.')
  } finally {
    if (existsSync(candidatePath)) unlinkSync(candidatePath)
    rmdirSync(scratch)
  }
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) main()
