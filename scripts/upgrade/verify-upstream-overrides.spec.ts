/**
 * Behaviour of the upstream-override gate against small throwaway repositories.
 *
 * The gate is a CLI, so each case builds a repository whose `upstream/master`
 * ref marks the fork point, then runs the shipped script with that repository
 * as its root. Copying the script into the fixture keeps its manifest lookup
 * (`<script>/upstream-overrides.json`) inside the fixture.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'verify-upstream-overrides.mjs')

const scratch: string[] = []

afterEach(() => {
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true })
})

interface FixtureOptions {
  /** Files committed on the fork point. */
  upstream: Record<string, string>
  /** Files added or changed on the branch under test. */
  work: Record<string, string>
  manifest: unknown
}

/** Create a repository whose `upstream/master` ref is the fork point. */
function fixture(options: FixtureOptions): string {
  const repo = mkdtempSync(join(tmpdir(), 'dsh-upgrade-spec-'))
  scratch.push(repo)
  const git = (args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const write = (path: string, content: string): void => {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), content)
  }
  for (const [path, content] of Object.entries(options.upstream)) write(path, content)
  git(['init', '--quiet', '-b', 'main'])
  git(['config', 'user.email', 'spec@example.com'])
  git(['config', 'user.name', 'spec'])
  git(['add', '-A'])
  git(['commit', '--quiet', '-m', 'upstream'])
  git(['branch', 'upstream/master'])
  git(['switch', '--quiet', '-c', 'work'])
  for (const [path, content] of Object.entries(options.work)) write(path, content)
  write('scripts/upgrade/verify-upstream-overrides.mjs', readFileSync(SCRIPT, 'utf8'))
  write('scripts/upgrade/upstream-overrides.json', JSON.stringify(options.manifest, null, 2))
  git(['add', '-A'])
  git(['commit', '--quiet', '-m', 'work'])
  return repo
}

interface GateResult {
  status: number | null
  stdout: string
  stderr: string
}

function gate(repo: string, args: string[] = []): GateResult {
  const result = spawnSync(process.execPath, [join(repo, 'scripts/upgrade/verify-upstream-overrides.mjs'), ...args], {
    cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/** A manifest entry with the fields the gate requires. */
function entry(path: string, category: 'fork' | 'generated' | 'wiring'): Record<string, string> {
  return { path, category, owner: 'spec', reason: 'spec fixture' }
}

describe('verify-upstream-overrides', () => {
  it('accepts a registered rewrite and reports the budget line', () => {
    const repo = fixture({
      upstream: { 'packages/core/src/a.ts': 'export const a = 1\n' },
      work: { 'packages/core/src/a.ts': 'export const a = 2\n' },
      manifest: { budget: { maxForkFiles: 1 }, entries: [entry('packages/core/src/a.ts', 'fork')] },
    })
    const result = gate(repo)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('fork 1/1')
    expect(result.stdout).toContain('in budget')
  })

  it('rejects an upstream rewrite that the manifest does not carry', () => {
    const repo = fixture({
      upstream: { 'packages/core/src/a.ts': 'export const a = 1\n', 'packages/core/src/b.ts': 'export const b = 1\n' },
      work: { 'packages/core/src/a.ts': 'export const a = 2\n', 'packages/core/src/b.ts': 'export const b = 2\n' },
      manifest: { budget: { maxForkFiles: 9 }, entries: [entry('packages/core/src/a.ts', 'fork')] },
    })
    const result = gate(repo)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('unregistered-modification')
    expect(result.stdout).toContain('packages/core/src/b.ts')
  })

  it('rejects a registration whose file no longer differs from upstream', () => {
    const repo = fixture({
      upstream: { 'packages/core/src/a.ts': 'export const a = 1\n' },
      work: { 'packages/core/src/b.ts': 'export const b = 1\n' },
      manifest: {
        budget: { maxForkFiles: 9 },
        entries: [entry('packages/core/src/a.ts', 'fork'), entry('packages/core/src/b.ts', 'fork')],
      },
    })
    expect(gate(repo).status).toBe(1)
    expect(gate(repo).stdout).toContain('stale-registration')
    expect(gate(repo, ['--allow-stale']).status).toBe(0)
  })

  it('rejects a registration without an owner or a reason', () => {
    const repo = fixture({
      upstream: { 'packages/core/src/a.ts': 'export const a = 1\n' },
      work: { 'packages/core/src/a.ts': 'export const a = 2\n' },
      manifest: { budget: { maxForkFiles: 9 }, entries: [{ path: 'packages/core/src/a.ts', category: 'fork', owner: ' ', reason: 'x' }] },
    })
    const result = gate(repo, ['--report'])
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('TODO owner')
  })

  it('rejects a generated registration whose file carries no generated marker', () => {
    const repo = fixture({
      upstream: { 'docs/catalog.md': 'plain\n' },
      work: { 'docs/catalog.md': 'plain, edited\n' },
      manifest: { budget: { maxForkFiles: 9 }, entries: [entry('docs/catalog.md', 'generated')] },
    })
    const result = gate(repo)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('category-mismatch')
  })

  it('accepts a generated registration whose file carries the marker', () => {
    const repo = fixture({
      upstream: { 'docs/catalog.md': 'Generated by gen-catalog. Do not edit.\n' },
      work: { 'docs/catalog.md': 'Generated by gen-catalog. Do not edit.\nrow\n' },
      manifest: { budget: { maxForkFiles: 9 }, entries: [entry('docs/catalog.md', 'generated')] },
    })
    expect(gate(repo).status).toBe(0)
  })

  it('rejects a fork count above the recorded budget', () => {
    const repo = fixture({
      upstream: { 'packages/core/src/a.ts': 'a\n', 'packages/core/src/b.ts': 'b\n' },
      work: { 'packages/core/src/a.ts': 'a2\n', 'packages/core/src/b.ts': 'b2\n' },
      manifest: {
        budget: { maxForkFiles: 1 },
        entries: [entry('packages/core/src/a.ts', 'fork'), entry('packages/core/src/b.ts', 'fork')],
      },
    })
    const result = gate(repo)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('fork-budget-exceeded')
  })

  it('skips the new-fork check when the baseline ref carries no manifest', () => {
    const repo = fixture({
      upstream: { 'packages/core/src/a.ts': 'a\n' },
      work: { 'packages/core/src/a.ts': 'a2\n' },
      manifest: { budget: { maxForkFiles: 9 }, entries: [entry('packages/core/src/a.ts', 'fork')] },
    })
    const result = gate(repo, ['--against', 'upstream/master'])
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('carries no ledger')
  })

  it('flags a fork that the baseline manifest does not list', () => {
    const repo = fixture({
      upstream: { 'packages/core/src/a.ts': 'a\n', 'packages/core/src/b.ts': 'b\n' },
      work: { 'packages/core/src/a.ts': 'a2\n' },
      manifest: { budget: { maxForkFiles: 9 }, entries: [entry('packages/core/src/a.ts', 'fork')] },
    })
    const git = (args: string[]): void => { execFileSync('git', args, { cwd: repo, stdio: 'ignore' }) }
    const write = (path: string, content: string): void => {
      mkdirSync(dirname(join(repo, path)), { recursive: true })
      writeFileSync(join(repo, path), content)
    }
    // The baseline carries a manifest that lists only the first fork.
    git(['branch', 'baseline'])
    write('packages/core/src/b.ts', 'b2\n')
    write('scripts/upgrade/upstream-overrides.json', JSON.stringify({
      budget: { maxForkFiles: 9 },
      entries: [entry('packages/core/src/a.ts', 'fork'), entry('packages/core/src/b.ts', 'fork')],
    }, null, 2))
    git(['add', '-A'])
    git(['commit', '--quiet', '-m', 'second fork'])
    const result = gate(repo, ['--against', 'baseline'])
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('new-fork-requires-review')
    expect(result.stdout).toContain('packages/core/src/b.ts')
  })

  it('restores a conflicting generated artifact from the merged branch', () => {
    const repo = fixture({
      upstream: { 'docs/catalog.md': 'Generated by gen-catalog. Do not edit.\nbase\n' },
      work: { 'docs/catalog.md': 'Generated by gen-catalog. Do not edit.\nours\n' },
      manifest: { budget: { maxForkFiles: 9 }, entries: [entry('docs/catalog.md', 'generated')] },
    })
    const git = (args: string[]): void => { execFileSync('git', args, { cwd: repo, stdio: 'ignore' }) }
    // Upstream regenerates the same artifact on its own history.
    git(['switch', '--quiet', '-c', 'upstream-next', 'upstream/master'])
    writeFileSync(join(repo, 'docs/catalog.md'), 'Generated by gen-catalog. Do not edit.\ntheirs\n')
    git(['add', '-A'])
    git(['commit', '--quiet', '-m', 'upstream regenerated'])
    git(['branch', '-f', 'upstream/master', 'upstream-next'])
    git(['switch', '--quiet', 'work'])
    const merge = spawnSync('git', ['merge', '--no-ff', 'upstream/master'], { cwd: repo, encoding: 'utf8' })
    expect(merge.status).not.toBe(0)
    expect(gate(repo, ['--restore-generated']).status).toBe(0)
    expect(readFileSync(join(repo, 'docs/catalog.md'), 'utf8')).toContain('theirs')
  })
})
