/** File-only SDK replay composition checks; no snapshot adapter or application is started. */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as yaml from 'js-yaml'
import ts from 'typescript'
import { describe, expect, it, onTestFinished } from 'vitest'
import { applyEntryPatches, entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { materializeProfilePatch } from '../src/launcher.ts'

const repoRoot = resolve(import.meta.dirname, '../../../..')
const scenarioDir = join(repoRoot, 'snapshots/sdk/academic-plan-chinese')
const authoredPatches = [join(scenarioDir, 'cordis.yml'), join(scenarioDir, 'cordis.snapshot.yml')]
const compatibilityPatch = join(import.meta.dirname, 'fixtures/sdk-plan-replay.compat.yml')
const minimalBundle = join(repoRoot, 'packages/bundle/sdk-minimal/cordis.patch.yml')
const apiKeyPackage = '@deepseek-ai/dsh-llm-deepseek-api-key'
const replayPackage = '@deepseek-ai/dsh-llm-replay'
const legacyWarning = {
  message: 'patch: name mismatch for %C (expected %C, got %C), skipping',
  args: ['llm-deepseek', apiKeyPackage, '@deepseek-ai/dsh-llm-deepseek'],
}

function readPatches(path: string): PatchOptions[] {
  const parsed: unknown = yaml.load(readFileSync(path, 'utf8'), { schema: entryListSchema })
  if (!Array.isArray(parsed)) throw new Error(`expected a patch list: ${path}`)
  return parsed as PatchOptions[]
}

function compose(patches: readonly string[]) {
  let entries: ReturnType<typeof applyEntryPatches> = []
  const warnings: { message: string; args: unknown[] }[] = []
  for (const path of [minimalBundle, ...patches]) {
    entries = applyEntryPatches(entries, readPatches(path), (message, ...args: unknown[]) => {
      warnings.push({ message, args })
    })
  }
  return { entries, warnings }
}

function descendants<T extends ts.Node>(root: ts.Node, guard: (node: ts.Node) => node is T): T[] {
  const found: T[] = []
  const visit = (node: ts.Node): void => {
    if (guard(node)) found.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return found
}

describe('SDK plan replay composition without launching the application', () => {
  it('retains the live API-key provider when only the frozen legacy selector is applied', () => {
    const { entries, warnings } = compose(authoredPatches)
    expect(warnings).toEqual([legacyWarning])
    const providers = entries.filter(entry => entry.id === 'llm-deepseek')
    expect(providers).toHaveLength(1)
    expect(providers[0]).toMatchObject({ name: apiKeyPackage })
    expect(providers[0]?.disabled).not.toBe(true)
    expect(entries.filter(entry => entry.id === 'llm-replay')).toHaveLength(1)
  })

  it('disables only the live provider after the authored replay catalog has been composed', () => {
    const before = compose(authoredPatches)
    const after = compose([...authoredPatches, compatibilityPatch])
    expect(after.warnings).toEqual([legacyWarning])
    expect(readPatches(compatibilityPatch)).toEqual([{ id: 'llm-deepseek', name: apiKeyPackage, disabled: true }])
    expect(after.entries.filter(entry => entry.id !== 'llm-deepseek'))
      .toEqual(before.entries.filter(entry => entry.id !== 'llm-deepseek'))
    expect(after.entries.filter(entry => entry.id === 'llm-deepseek'))
      .toEqual(before.entries.filter(entry => entry.id === 'llm-deepseek').map(entry => ({ ...entry, disabled: true })))
    expect(after.entries.filter(entry => entry.name === apiKeyPackage && entry.disabled !== true)).toEqual([])
    const replay = after.entries.filter(entry => entry.id === 'llm-replay')
    expect(replay).toHaveLength(1)
    expect(replay[0]).toMatchObject({
      name: replayPackage,
      config: { providers: [{ id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'deepseek-v4-flash' }] }] },
    })
    expect(replay[0]?.disabled).not.toBe(true)
  })

  it('materializes packages in the actual sdk-minimal profile and retains the academic plan entry', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dsh-sdk-plan-replay-files-'))
    onTestFinished(() => { rmSync(cwd, { recursive: true, force: true }) })
    const patchRoot = join(cwd, '.snapshot-patches')
    mkdirSync(patchRoot)
    const materialized = [...authoredPatches, compatibilityPatch].map((path, index) =>
      materializeProfilePatch(path, cwd, 'sdk-minimal', patchRoot, index))
    const profileRoot = join(cwd, '.dsh/profiles/sdk-minimal')
    const fromProfile = createRequire(pathToFileURL(join(profileRoot, 'fixture.js')))
    for (const [name, directory] of [
      [replayPackage, 'packages/test-support/llm-replay'],
      ['@deepseek-ai/dsh-plan-mode', 'packages/plan/plan-mode'],
      ['@deepseek-ai/dsh-session-persistence-jsonl', 'packages/session/session-persistence-jsonl'],
      [apiKeyPackage, 'packages/llm/llm-deepseek-api-key'],
    ] as const) {
      const packageRoot = join(repoRoot, directory)
      expect(realpathSync(join(profileRoot, 'node_modules', name))).toBe(realpathSync(packageRoot))
      const manifestPath = fromProfile.resolve(`${name}/package.json`)
      expect(realpathSync(manifestPath)).toBe(realpathSync(join(packageRoot, 'package.json')))
      // Package declarations identify the runtime entry without requiring built JavaScript or importing it.
      const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
      expect(manifest).toMatchObject({ name, main: 'lib/index.js', exports: { '.': { default: './lib/index.js' } } })
    }
    expect(existsSync(join(cwd, '.dsh/profiles/sdk/node_modules'))).toBe(false)
    const entries = materialized.flatMap(path => readPatches(path).flatMap(patch => patch.insert ?? []))
    const plan = entries.find(entry => entry.id === 'academic-plan-chinese')
    if (plan === undefined) throw new Error('materialized academic plan entry is missing')
    const planPath = join(repoRoot, 'packages/api/academic-research-controller/src/plan-validation.ts')
    expect(plan.name).toBe(pathToFileURL(planPath).href)
    expect(realpathSync(fileURLToPath(plan.name))).toBe(realpathSync(planPath))
    const composition = compose(materialized)
    expect(composition.warnings).toEqual([legacyWarning])
    expect(composition.entries.find(entry => entry.id === 'llm-deepseek')?.disabled).toBe(true)
    expect(composition.entries.find(entry => entry.id === 'llm-replay')?.name).toBe(replayPackage)
  })

  it('uses one actual profile for package links and launch and limits the trailing overlay to SDK-01 replay', () => {
    const adapterPath = join(repoRoot, 'snapshots/sdk/sdk.snapshot.ts')
    // Parse declarations instead of importing the adapter, which registers formal replay cases.
    const source = ts.createSourceFile(adapterPath, readFileSync(adapterPath, 'utf8'), ts.ScriptTarget.Latest, true)
    const declarations = descendants(source, ts.isVariableDeclaration)
    const declaration = (name: string): ts.VariableDeclaration => {
      const node = declarations.find(item => ts.isIdentifier(item.name) && item.name.text === name)
      if (node === undefined) throw new Error(`SDK adapter declaration is missing: ${name}`)
      return node
    }
    const runtimeProfile = declaration('runtimeProfile')
    expect(runtimeProfile.initializer?.getText(source)).toBe('assertions.runtimeProfile ?? scenario.manifest.profile')
    const assertions = declaration('SDK_ASSERTIONS')
    const academic = descendants(assertions, ts.isPropertyAssignment)
      .find(node => ts.isStringLiteral(node.name) && node.name.text === 'academic-plan-chinese')
    if (academic === undefined) throw new Error('SDK-01 profile assertion is missing')
    expect(descendants(academic, ts.isPropertyAssignment)
      .find(node => node.name.getText(source) === 'runtimeProfile')?.initializer.getText(source)).toBe("'sdk-minimal'")

    const compatibility = declaration('replayCompatibilityPatches').initializer
    if (compatibility === undefined || !ts.isConditionalExpression(compatibility)) {
      throw new Error('SDK replay compatibility requires an explicit conditional')
    }
    expect(compatibility.condition.getText(source).replace(/\s+/g, ''))
      .toBe("scenario.name==='academic-plan-chinese'&&runtimeProfile==='sdk-minimal'&&mode==='replay'")
    expect(compatibility.whenTrue.getText(source)).toBe('[sdkPlanReplayCompatibilityPatch]')
    expect(compatibility.whenFalse.getText(source)).toBe('[]')
    const overlayPath = declaration('sdkPlanReplayCompatibilityPatch')
    const overlayUrl = descendants(overlayPath, ts.isNewExpression)
      .find(node => node.expression.getText(source) === 'URL')?.arguments?.[0]
    if (overlayUrl === undefined || !ts.isStringLiteral(overlayUrl)) throw new Error('compatibility overlay URL is missing')
    expect(fileURLToPath(new URL(overlayUrl.text, pathToFileURL(adapterPath)))).toBe(compatibilityPatch)

    const patches = declaration('patches')
    const patchArrays = descendants(patches, ts.isArrayLiteralExpression).filter(node =>
      node.elements.some(element => ts.isSpreadElement(element) && element.expression.getText(source) === 'replayCompatibilityPatches'))
    expect(patchArrays).toHaveLength(1)
    expect(patchArrays[0]?.elements[0]?.getText(source)).toBe('...authoredPatches(scenario, !recording)')
    expect(patchArrays[0]?.elements.at(-1)?.getText(source)).toBe('...replayCompatibilityPatches')
    const materializers = descendants(patches, ts.isCallExpression)
      .filter(node => node.expression.getText(source) === 'materializeProfilePatch')
    expect(materializers).toHaveLength(1)
    expect(materializers[0]?.arguments[2]?.getText(source)).toBe('runtimeProfile')
    expect(runtimeProfile.pos).toBeLessThan(patches.pos)
    const harnesses = descendants(source, ts.isNewExpression)
      .filter(node => node.expression.getText(source) === 'DeepSeekHarness')
    expect(harnesses).toHaveLength(1)
    const harnessOptions = harnesses[0]?.arguments?.[0]
    if (harnessOptions === undefined) throw new Error('SDK Harness options are missing')
    expect(descendants(harnessOptions, ts.isPropertyAssignment)
      .find(node => node.name.getText(source) === 'profile')?.initializer.getText(source)).toBe('runtimeProfile')
  })
})
