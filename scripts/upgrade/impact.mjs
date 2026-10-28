#!/usr/bin/env node
/**
 * Predict which registered rewrites the next upgrade will touch.
 *
 * Run this before `git merge`: it intersects the files upstream changed since
 * our recorded baseline with the registered overrides, so the conflict surface
 * is known before any merge starts instead of discovered hunk by hunk.
 *
 * Usage:
 *   node scripts/upgrade/impact.mjs                  # baseline..upstream/master
 *   node scripts/upgrade/impact.mjs --to origin/master
 *   node scripts/upgrade/impact.mjs --from dsh-v0.2.1-rc.2 --to upstream/master
 *   node scripts/upgrade/impact.mjs --json
 *   node scripts/upgrade/impact.mjs --fail-on-overlap # CI: any overlap fails
 *
 * Exit codes: 0 = no overlap (or report only), 1 = overlap with --fail-on-overlap,
 * 2 = usage or environment error.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = join(HERE, 'upstream-overrides.json')

/** @param {string[]} argv */
function parseArgs(argv) {
  const options = { from: undefined, to: 'upstream/master', repo: undefined, json: false, failOnOverlap: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--from') { options.from = argv[++index]; continue }
    if (arg === '--to') { options.to = argv[++index]; continue }
    if (arg === '--repo') { options.repo = argv[++index]; continue }
    if (arg === '--json') { options.json = true; continue }
    if (arg === '--fail-on-overlap') { options.failOnOverlap = true; continue }
    if (arg === '--help' || arg === '-h') { options.help = true; continue }
    throw new Error(`unknown argument: ${arg}`)
  }
  return options
}

/** @param {string} repo @param {string[]} args @returns {string} */
function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${(result.stderr ?? '').trim()}`)
  return result.stdout
}

/** @param {string} repo @param {string} ref */
function resolves(repo, ref) {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: repo, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : undefined
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write('impact [--from <ref>] [--to <ref>] [--json] [--fail-on-overlap]\n')
    return 0
  }
  const repo = resolve(options.repo ?? join(HERE, '..', '..'))
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const from = options.from ?? manifest.upstream?.baseline
  if (from === undefined) throw new Error('no --from and no upstream.baseline in the manifest')
  const fromSha = resolves(repo, from)
  if (fromSha === undefined) throw new Error(`cannot resolve --from ${from}; fetch it or pass a local ref`)
  const toSha = resolves(repo, options.to)
  if (toSha === undefined) throw new Error(`cannot resolve --to ${options.to}; try git fetch upstream`)

  const changed = new Set(git(repo, ['diff', '--name-only', `${fromSha}..${toSha}`]).split('\n').filter(Boolean))
  const deleted = new Set(
    git(repo, ['diff', '--name-only', '--diff-filter=D', `${fromSha}..${toSha}`]).split('\n').filter(Boolean),
  )
  const byPath = new Map(manifest.entries.map(entry => [entry.path, entry]))
  const hits = [...changed]
    .filter(path => byPath.has(path))
    .map(path => {
      const entry = byPath.get(path)
      return {
        path,
        category: entry.category,
        owner: entry.owner,
        reason: entry.reason,
        upstreamDeleted: deleted.has(path),
        risk: Number(entry.upstreamChurn6mo ?? 0) * Math.max(1, Number(entry.addedLines ?? 0) + Number(entry.removedLines ?? 0)),
      }
    })
    .sort((left, right) => right.risk - left.risk)

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ from: fromSha.slice(0, 12), to: toSha.slice(0, 12), changed: changed.size, hits }, null, 2)}\n`)
  } else {
    process.stdout.write(`upstream changed ${String(changed.size)} file(s) in ${fromSha.slice(0, 12)}..${toSha.slice(0, 12)}\n`)
    if (hits.length === 0) process.stdout.write('no registered rewrite is touched; the merge has no conflict surface\n')
    else {
      process.stdout.write(`${String(hits.length)} registered rewrite(s) will conflict:\n`)
      for (const hit of hits) {
        const marker = hit.upstreamDeleted ? ' (upstream deleted it)' : ''
        process.stdout.write(`  ${String(hit.risk).padStart(7)}  ${hit.category.padEnd(9)}  ${hit.path}${marker}\n`)
      }
    }
  }
  return options.failOnOverlap && hits.length > 0 ? 1 : 0
}

try {
  process.exitCode = main()
} catch (error) {
  process.stderr.write(`impact: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}
