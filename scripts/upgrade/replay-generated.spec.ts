/**
 * Behaviour of the generated-artifact replay against small throwaway repositories.
 *
 * The fixture supplies its own `generated-map.json`, so the "generators" are
 * Node one-liners that write files. That keeps the replay's contract — plan
 * order, command de-duplication, and the two-pass idempotence check — under test
 * without running the real documentation generators.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'replay-generated.mjs')

const STABLE = 'node -e "require(\'fs\').writeFileSync(\'out.txt\',\'x\')"'
const NOISY_TWO_PASSES = 'node -e "const f=require(\'fs\');const n=(+(f.existsSync(\'n.txt\')?f.readFileSync(\'n.txt\',\'utf8\'):\'0\'))+1;f.writeFileSync(\'n.txt\',String(n));f.writeFileSync(\'out-\'+n+\'.txt\',\'x\')"'
const FAILS = 'node -e "process.exit(3)"'

const scratch: string[] = []

afterEach(() => {
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/** A repository whose `generated-map.json` points at the supplied commands. */
function fixture(entries: { path: string; command: string }[]): string {
  const repo = mkdtempSync(join(tmpdir(), 'dsh-replay-spec-'))
  scratch.push(repo)
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'spec@example.com'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'spec'], { cwd: repo, stdio: 'ignore' })
  writeFileSync(join(repo, 'seed.txt'), 'seed\n')
  execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['commit', '--quiet', '-m', 'seed'], { cwd: repo, stdio: 'ignore' })
  mkdirSync(join(repo, 'scripts/upgrade'), { recursive: true })
  writeFileSync(join(repo, 'scripts/upgrade/replay-generated.mjs'), readFileSync(SCRIPT, 'utf8'))
  writeFileSync(join(repo, 'scripts/upgrade/generated-map.json'), JSON.stringify({ entries }, null, 2))
  // Committing the fixture keeps the dirty set under test to what the "generators" write.
  execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['commit', '--quiet', '-m', 'map'], { cwd: repo, stdio: 'ignore' })
  return repo
}

interface ReplayResult {
  status: number | null
  stdout: string
  stderr: string
}

function replay(repo: string, args: string[] = []): ReplayResult {
  const result = spawnSync(process.execPath, [join(repo, 'scripts/upgrade/replay-generated.mjs'), ...args], {
    cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe('replay-generated', () => {
  it('prints a de-duplicated plan with install first and translation records last', () => {
    const repo = fixture([
      { path: 'docs/a.md', command: 'pnpm run verify-translation-pairing --write docs/a.md' },
      { path: 'docs/a.zh.md', command: 'pnpm run verify-translation-pairing --write docs/a.md' },
      { path: 'pnpm-lock.yaml', command: 'pnpm install' },
      { path: 'docs/b.md', command: STABLE },
    ])
    const result = replay(repo)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('replay plan (4 artifacts, 3 commands)')
    const lines = result.stdout.split('\n').filter(line => line.trim().startsWith('$'))
    expect(lines[0]).toContain('pnpm install')
    expect(lines[1]).toContain('writeFileSync')
    expect(lines[2]).toContain('verify-translation-pairing')
  })

  it('reports the plan as JSON', () => {
    const repo = fixture([{ path: 'docs/b.md', command: STABLE }])
    const report = JSON.parse(replay(repo, ['--json']).stdout) as { commands: string[]; files: number }
    expect(report.files).toBe(1)
    expect(report.commands).toEqual([STABLE])
  })

  it('drops the install step under --no-install', () => {
    const repo = fixture([{ path: 'pnpm-lock.yaml', command: 'pnpm install' }, { path: 'docs/b.md', command: STABLE }])
    expect(replay(repo, ['--json', '--no-install']).stdout).not.toContain('pnpm install')
  })

  it('accepts a generator whose second pass changes nothing', () => {
    const repo = fixture([{ path: 'docs/out.txt', command: STABLE }])
    const result = replay(repo, ['--apply', '--no-install'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('replay: stable (1 changed path(s))')
  })

  it('rejects a generator whose second pass changes the dirty set', () => {
    const repo = fixture([{ path: 'docs/out.txt', command: NOISY_TWO_PASSES }])
    const result = replay(repo, ['--apply', '--no-install'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('not idempotent')
  })

  it('stops when a command fails', () => {
    const repo = fixture([{ path: 'docs/out.txt', command: FAILS }])
    const result = replay(repo, ['--apply', '--no-install'])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('failed (3)')
  })

  it('rejects an unknown argument with the environment exit code', () => {
    const repo = fixture([{ path: 'docs/out.txt', command: STABLE }])
    const result = replay(repo, ['--nonsense'])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('unknown argument')
  })

  it('runs the generators in the repository root rather than the caller directory', () => {
    const repo = fixture([{ path: 'docs/out.txt', command: STABLE }])
    const outer = mkdtempSync(join(tmpdir(), 'dsh-replay-outside-'))
    scratch.push(outer)
    const result = spawnSync(process.execPath, [join(repo, 'scripts/upgrade/replay-generated.mjs'), '--apply', '--no-install'], {
      cwd: outer, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
    expect(result.status).toBe(0)
    expect(readFileSync(join(repo, 'out.txt'), 'utf8')).toBe('x')
  })
})
