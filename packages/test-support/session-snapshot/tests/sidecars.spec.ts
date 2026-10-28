/** File-only ACP fixture checks: no e2e module, agent, or protocol subprocess is started. */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  defineAcpSnapshotSuite,
  parseSystemPromptSnapshot,
  parseToolSchemasSnapshot,
  resolveCorpusSidecarSource,
  resolveSnapshotSidecarSource,
  writeSnapshotSidecar,
  type Scenario,
} from '../src/suite.ts'
import { parseSnapshotManifest } from '../src/manifest.ts'
import { materializeProfilePatch } from '../src/launcher.ts'

const repoRoot = resolve(import.meta.dirname, '../../../..')
const corpusRoot = join(repoRoot, 'snapshots')
const promptFile = 'system-prompt.expected.md'
const schemasFile = 'tool-schemas.expected.json'

/** Each temporary corpus and materialized patch is owned by its current test. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-acp-sidecar-files-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const write = (file: string, content: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), content)
  }
  write('session/owner/snapshot.yml', 'version: 1\nprofile: headless\nheader:\n  class: default\n')
  write(`session/owner/${promptFile}`, 'Canonical prompt\n')
  write(`session/owner/${schemasFile}`, '{"initial":[],"changes":[]}\n')
  return { root, write }
}

describe('ACP fixture paths without launching the application', () => {
  it.each(['acp.e2e.ts', 'escalation.e2e.ts', 'hooks.e2e.ts'])('reads the canonical array config used by %s', (name) => {
    const path = join(repoRoot, 'apps/cli/tests/profiles/acp/tests', name)
    // Inspect the declaration instead of importing e2e modules with launch hooks and runner probes.
    const reference = /configPath: fileURLToPath\(new URL\('([^']+)', import\.meta\.url\)\)/.exec(readFileSync(path, 'utf8'))
    expect(reference?.[1]).toBeDefined()
    const selected = fileURLToPath(new URL(reference?.[1] ?? '', pathToFileURL(path)))
    const canonical = join(corpusRoot, 'acp/escalation-approved/cordis.yml')
    expect(selected).toBe(canonical)
    expect(readFileSync(selected)).toEqual(readFileSync(canonical))
    expect(readFileSync(selected, 'utf8')).toMatch(/^- id: llm-deepseek$/m)
  })

  it.each([
    ['escalation-approved', promptFile, 'session/text-turn'],
    ['escalation-approved', schemasFile, 'session/text-turn'],
    ['image-compaction', promptFile, 'session/read-image'],
  ] as const)('reads %s/%s from its declared corpus owner', async (scenario, file, expectedOwner) => {
    const path = join(corpusRoot, 'acp', scenario, 'snapshot.yml')
    const manifest = parseSnapshotManifest(readFileSync(path, 'utf8'), path)
    const owner = file === promptFile ? manifest.header?.systemPromptSource : manifest.header?.toolSchemasSource
    expect(owner).toBe(expectedOwner)
    const resolved = resolveCorpusSidecarSource(corpusRoot, owner ?? '', file, 0)
    expect(resolved).toEqual({ name: expectedOwner, path: join(corpusRoot, expectedOwner, file), readOnly: true })
    const bytes = await readFile(resolved.path)
    expect(bytes).toEqual(readFileSync(join(corpusRoot, expectedOwner, file)))
    if (file === promptFile) expect(parseSystemPromptSnapshot(bytes.toString('utf8')).initial.length).toBeGreaterThan(0)
    else expect(parseToolSchemasSnapshot(bytes.toString('utf8')).initial.length).toBeGreaterThan(0)
  })

  it('preserves relative plugin resolution, patch order, and !!js data during materialization', () => {
    const owned = fixture()
    const source = join(owned.root, 'patches/cordis.yml')
    owned.write('patches/cordis.yml', '- id: first\n  name: ./plugin.ts\n  config:\n    value: !!js process.cwd()\n- id: second\n  disabled: !!js process.platform\n')
    const materialized = materializeProfilePatch(source, owned.root, 'acp', owned.root, 0)
    const content = readFileSync(materialized, 'utf8')
    expect(content).toContain(pathToFileURL(join(owned.root, 'patches/plugin.ts')).href)
    expect(content.indexOf('id: first')).toBeLessThan(content.indexOf('id: second'))
    expect(content).toContain('!!js process.cwd()')
    expect(content).toContain('!!js process.platform')
  })
})

describe('corpus sidecar sources', () => {
  it('resolves image-compaction schemas through the local escalation pin to its corpus owner', () => {
    const options = { snapshotsDir: join(corpusRoot, 'acp'), corpusRoot }
    const pin: Scenario = { name: 'escalation-approved', hasModelTurn: true, recorded: false, pinsHeader: true, toolSchemasSource: 'session/text-turn' }
    const image: Scenario = { name: 'image-compaction', hasModelTurn: true, recorded: false, pinsHeader: true, toolSchemasSource: pin.name }
    const scenarios = new Map([[pin.name, pin], [image.name, image]])
    const source = resolveSnapshotSidecarSource(options, scenarios, image, 'toolSchemasSource')
    expect(source).toEqual({ name: 'session/text-turn', path: join(corpusRoot, 'session/text-turn', schemasFile), readOnly: true })
    const incompatible = { ...image, expectedHeaderChanges: 1 }
    expect(() => resolveSnapshotSidecarSource(options, scenarios, incompatible, 'toolSchemasSource')).toThrow('different expectedHeaderChanges')
  })

  it('resolves every declared ACP pin sidecar without collecting the protocol adapter', () => {
    const names = ['escalation-approved', 'image-compaction']
    const scenarios = new Map<string, Scenario>()
    for (const name of names) {
      const path = join(corpusRoot, 'acp', name, 'snapshot.yml')
      const manifest = parseSnapshotManifest(readFileSync(path, 'utf8'), path)
      const systemPromptSource = manifest.header?.systemPromptSource
      const toolSchemasSource = manifest.header?.toolSchemasSource
      scenarios.set(name, {
        name, hasModelTurn: true, recorded: false, pinsHeader: true,
        ...(systemPromptSource === undefined ? {} : { systemPromptSource }),
        ...(toolSchemasSource === undefined ? {} : { toolSchemasSource }),
      })
    }
    for (const scenario of scenarios.values()) {
      for (const field of ['systemPromptSource', 'toolSchemasSource'] as const) {
        const source = resolveSnapshotSidecarSource({ snapshotsDir: join(corpusRoot, 'acp'), corpusRoot }, scenarios, scenario, field)
        expect(source.readOnly).toBe(true)
        if (field === 'systemPromptSource') expect(parseSystemPromptSnapshot(readFileSync(source.path, 'utf8')).initial).not.toBe('')
        else expect(parseToolSchemasSnapshot(readFileSync(source.path, 'utf8')).initial.length).toBeGreaterThan(0)
      }
    }
  })

  it('requires an explicit corpus root before registering an external source suite', () => {
    const owned = fixture()
    expect(() => { defineAcpSnapshotSuite({
      agent: { binScript: 'unused.ts', configPath: 'unused.yml', tsconfigPath: 'unused.json' },
      snapshotsDir: owned.root,
      scenarios: [{ name: 'pin', pinsHeader: true, hasModelTurn: true, recorded: false, systemPromptSource: 'session/owner' }],
      mode: 'replay',
    }) }).toThrow('corpusRoot is required')
  })

  it('ignores a local alias payload and reads the explicitly declared owner', () => {
    const owned = fixture()
    owned.write(`acp/pin/${promptFile}`, '../../session/other/system-prompt.expected.md')
    const source = resolveCorpusSidecarSource(owned.root, 'session/owner', promptFile, 0)
    expect(readFileSync(source.path, 'utf8')).toBe('Canonical prompt\n')
    expect(readFileSync(join(owned.root, `acp/pin/${promptFile}`), 'utf8')).toContain('session/other')
  })

  it.each(['../outside', '/session/owner', 'session\\owner', 'session/owner/extra'])('rejects invalid corpus source %s', (source) => {
    const owned = fixture()
    expect(() => resolveCorpusSidecarSource(owned.root, source, promptFile, 0)).toThrow('must name profile/scenario')
  })

  it('rejects a missing source manifest and a missing sidecar', () => {
    const owned = fixture()
    expect(() => resolveCorpusSidecarSource(owned.root, 'session/missing', promptFile, 0)).toThrow('ENOENT')
    rmSync(join(owned.root, 'session/owner', promptFile))
    expect(() => resolveCorpusSidecarSource(owned.root, 'session/owner', promptFile, 0)).toThrow('ENOENT')
  })

  it('rejects a source without header ownership metadata', () => {
    const owned = fixture()
    owned.write('session/owner/snapshot.yml', 'version: 1\nprofile: headless\n')
    expect(() => resolveCorpusSidecarSource(owned.root, 'session/owner', promptFile, 0)).toThrow('lacks header ownership metadata')
  })

  it.each([
    [promptFile, 'systemPromptSource'],
    [schemasFile, 'toolSchemasSource'],
  ] as const)('rejects a redirecting owner for %s', (file, field) => {
    const owned = fixture()
    owned.write('session/owner/snapshot.yml', `version: 1\nprofile: headless\nheader:\n  class: default\n  ${field}: other\n`)
    expect(() => resolveCorpusSidecarSource(owned.root, 'session/owner', file, 0)).toThrow(`does not own ${file}`)
  })

  it.each([
    [promptFile, 'promptChanges'],
    [schemasFile, 'changes'],
  ] as const)('rejects mismatched change counts for %s', (file, field) => {
    const owned = fixture()
    owned.write('session/owner/snapshot.yml', `version: 1\nprofile: headless\nheader:\n  class: default\n  pin: true\n  ${field}: 1\n`)
    expect(() => resolveCorpusSidecarSource(owned.root, 'session/owner', file, 0)).toThrow('different change count')
    expect(resolveCorpusSidecarSource(owned.root, 'session/owner', file, 1).readOnly).toBe(true)
  })

  it.each(['owner', 'session/owner'])('accepts an explicit self-owned source %s', (source) => {
    const owned = fixture()
    owned.write('session/owner/snapshot.yml', `version: 1\nprofile: headless\nheader:\n  class: default\n  systemPromptSource: ${source}\n`)
    expect(resolveCorpusSidecarSource(owned.root, 'session/owner', promptFile, 0).readOnly).toBe(true)
  })

  it('compares identical shared content without writing or changing its timestamp', async () => {
    const owned = fixture()
    const source = resolveCorpusSidecarSource(owned.root, 'session/owner', promptFile, 0)
    const before = await stat(source.path)
    await writeSnapshotSidecar(source, 'Canonical prompt\n')
    expect((await stat(source.path)).mtimeMs).toBe(before.mtimeMs)
    expect(readFileSync(source.path, 'utf8')).toBe('Canonical prompt\n')
  })

  it('rejects changed shared content without overwriting the owner', async () => {
    const owned = fixture()
    const source = resolveCorpusSidecarSource(owned.root, 'session/owner', schemasFile, 0)
    const before = readFileSync(source.path)
    await expect(writeSnapshotSidecar(source, '{}\n')).rejects.toThrow('read-only sidecar differs')
    expect(readFileSync(source.path)).toEqual(before)
  })

  it('writes a local owned sidecar', async () => {
    const owned = fixture()
    const path = join(owned.root, 'local.md')
    await writeSnapshotSidecar({ name: 'local', path, readOnly: false }, 'New local prompt\n')
    expect(readFileSync(path, 'utf8')).toBe('New local prompt\n')
  })

  it('reports invalid schema content instead of reading the adapter alias', () => {
    const owned = fixture()
    owned.write(`session/owner/${schemasFile}`, '{}\n')
    const source = resolveCorpusSidecarSource(owned.root, 'session/owner', schemasFile, 0)
    expect(() => parseToolSchemasSnapshot(readFileSync(source.path, 'utf8'))).toThrow('array-valued initial and changes')
  })
})
