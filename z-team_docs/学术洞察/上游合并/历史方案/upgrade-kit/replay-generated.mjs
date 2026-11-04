#!/usr/bin/env node
/**
 * Replay every generated artifact from the generator that owns it.
 *
 * Upgrade merges never resolve these files by hand: the branch takes the
 * upstream side, then this script rebuilds them from the resolved sources.
 * A second pass must be a no-op, which is what proves the artifacts are truly
 * generated rather than half hand-written.
 *
 * Usage:
 *   node scripts/upgrade/replay-generated.mjs            # print the plan
 *   node scripts/upgrade/replay-generated.mjs --apply    # run, verify idempotence
 *   node scripts/upgrade/replay-generated.mjs --apply --no-install
 *   node scripts/upgrade/replay-generated.mjs --apply --json
 *
 * This must run outside the write-restricted sandbox: the generators spawn
 * child processes (tsx/esbuild) whose piped stdio a confined token cannot open.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MAP_PATH = join(HERE, 'generated-map.json')

/** @param {string[]} argv */
function parseArgs(argv) {
  const options = { apply: false, json: false, repo: undefined, install: true }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') { options.apply = true; continue }
    if (arg === '--json') { options.json = true; continue }
    if (arg === '--no-install') { options.install = false; continue }
    if (arg === '--repo') { options.repo = argv[++index]; continue }
    if (arg === '--help' || arg === '-h') { options.help = true; continue }
    throw new Error(`unknown argument: ${arg}`)
  }
  return options
}

/**
 * Collapse per-file entries into one runnable command list.
 *
 * `pnpm install` comes first because the lockfile derives from the resolved
 * dependency manifests, and translation records come last because they hash
 * the text that the other generators have just rewritten.
 *
 * @param {{ entries: { path: string, command: string }[] }} map
 */
function planFor(map) {
  const unique = [...new Set(map.entries.map(entry => entry.command))]
  const rank = command => {
    if (command === 'pnpm install') return 0
    if (command.startsWith('pnpm run verify-translation-pairing')) return 2
    return 1
  }
  return unique.sort((left, right) => rank(left) - rank(right))
}

/**
 * @param {string} repo @param {string[]} commands @param {boolean} quiet
 */
function run(repo, commands, quiet) {
  for (const command of commands) {
    if (!quiet) process.stdout.write(`  $ ${command}\n`)
    // One command string through the platform shell: `pnpm` is a `.cmd` shim on
    // Windows, and pairing an argument array with `shell: true` triggers the
    // Node DEP0190 deprecation warning.
    const result = spawnSync(command, { cwd: repo, stdio: quiet ? 'ignore' : 'inherit', shell: true })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`failed (${String(result.status)}): ${command}`)
  }
}

/** @param {string} repo */
function statusOf(repo) {
  const result = spawnSync('git', ['status', '--porcelain=v1'], { cwd: repo, encoding: 'utf8' })
  if (result.error) throw result.error
  return result.stdout
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write('replay-generated [--apply] [--json]\n')
    return 0
  }
  const repo = resolve(options.repo ?? join(HERE, '..', '..'))
  const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'))
  const planned = planFor(map)
  // The lockfile only needs rebuilding when a merge touched the dependency
  // manifests; running it on every replay re-resolves the whole workspace.
  const commands = options.install ? planned : planned.filter(command => command !== 'pnpm install')

  if (!options.apply) {
    if (options.json) process.stdout.write(`${JSON.stringify({ commands, files: map.entries.length }, null, 2)}\n`)
    else {
      process.stdout.write(`replay plan (${String(map.entries.length)} artifacts, ${String(commands.length)} commands)\n`)
      for (const command of commands) process.stdout.write(`  $ ${command}\n`)
    }
    return 0
  }

  process.stdout.write(`replay: pass 1 (${String(commands.length)} commands)\n`)
  run(repo, commands, false)
  const afterFirst = statusOf(repo)

  process.stdout.write('replay: pass 2 (idempotence check)\n')
  run(repo, commands, true)
  const afterSecond = statusOf(repo)
  if (afterFirst !== afterSecond) {
    process.stderr.write('replay: second pass changed artifacts — at least one generator is not idempotent\n')
    return 1
  }
  process.stdout.write(`replay: stable (${String(afterFirst.split('\n').filter(Boolean).length)} changed path(s))\n`)
  return 0
}

try {
  process.exitCode = main()
} catch (error) {
  process.stderr.write(`replay-generated: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}
