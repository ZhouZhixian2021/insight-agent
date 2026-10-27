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
const systemPromptPackage = '@deepseek-ai/dsh-system-prompt'
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

  it('disables the live provider and restores the frozen persona without changing other entries', () => {
    const before = compose(authoredPatches)
    const after = compose([...authoredPatches, compatibilityPatch])
    const beforePrompts = before.entries.filter(entry => entry.id === 'system-prompt')
    expect(beforePrompts).toHaveLength(1)
    expect(beforePrompts[0]).toMatchObject({ name: systemPromptPackage })
    const authoredPrompts = readPatches(join(scenarioDir, 'cordis.yml')).filter(patch => patch.id === 'system-prompt')
    expect(authoredPrompts).toHaveLength(1)
    const frozenConfig: unknown = authoredPrompts[0]?.config
    if (frozenConfig === null || typeof frozenConfig !== 'object'
      || !('persona' in frozenConfig) || typeof frozenConfig.persona !== 'string') {
      throw new Error('frozen SDK-01 persona is missing')
    }
    const persona = frozenConfig.persona
    expect(frozenConfig).toEqual({ persona, includeHarnessIdentity: false, includeRuntimeContext: false })
    expect(beforePrompts[0]?.config).toEqual(frozenConfig)
    const sidecar = readFileSync(join(scenarioDir, 'system-prompt.expected.md'), 'utf8')
    expect(persona).toBe(sidecar.split(/\r?\n\r?\n/u)[0])
    const promptConfig = { personaPrefix: persona, includeHarnessIdentity: false, includeRuntimeContext: false }
    expect(after.warnings).toEqual([legacyWarning])
    expect(readPatches(compatibilityPatch)).toEqual([
      { id: 'llm-deepseek', name: apiKeyPackage, disabled: true },
      { id: 'system-prompt', name: systemPromptPackage, config: promptConfig },
    ])
    expect(after.entries.filter(entry => entry.id !== 'llm-deepseek' && entry.id !== 'system-prompt'))
      .toEqual(before.entries.filter(entry => entry.id !== 'llm-deepseek' && entry.id !== 'system-prompt'))
    expect(after.entries.filter(entry => entry.id === 'llm-deepseek'))
      .toEqual(before.entries.filter(entry => entry.id === 'llm-deepseek').map(entry => ({ ...entry, disabled: true })))
    expect(after.entries.filter(entry => entry.id === 'system-prompt'))
      .toEqual(beforePrompts.map(entry => ({ ...entry, config: promptConfig })))
    expect(promptConfig).not.toHaveProperty('personaSuffix')
    const promptPath = join(repoRoot, 'packages/core/system-prompt/src/index.ts')
    const promptSource = ts.createSourceFile(promptPath, readFileSync(promptPath, 'utf8'), ts.ScriptTarget.Latest, true)
    const promptClass = descendants(promptSource, ts.isClassDeclaration).find(node => node.name?.text === 'SystemPrompt')
    if (promptClass === undefined) throw new Error('SystemPrompt class is missing')
    const config = promptClass.members.find(node => ts.isPropertyDeclaration(node) && node.name.getText(promptSource) === 'Config')
    if (config === undefined) throw new Error('SystemPrompt config declaration is missing')
    const suffix = descendants(config, ts.isPropertyAssignment).find(node => node.name.getText(promptSource) === 'personaSuffix')
    expect(suffix?.initializer.getText(promptSource)).toBe("z.string().default('')")
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
      [systemPromptPackage, 'packages/core/system-prompt'],
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

  it('uses one actual profile for package links and launch and limits compatibility to SDK-01 replay', () => {
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

    const runScenario = descendants(source, ts.isFunctionDeclaration).find(node => node.name?.text === 'runScenario')
    if (runScenario === undefined || runScenario.type === undefined) throw new Error('SDK scenario return declaration is missing')
    expect(descendants(runScenario, ts.isVariableDeclaration).filter(node =>
      ts.isIdentifier(node.name) && node.name.text === 'runtimeProfile')).toEqual([runtimeProfile])
    const returnedProfiles = descendants(runScenario.type, ts.isPropertySignature)
      .filter(node => node.name.getText(source) === 'runtimeProfile')
    expect(returnedProfiles).toHaveLength(1)
    expect(returnedProfiles[0]?.type?.getText(source)).toBe("SnapshotManifest['profile']")
    const scenarioReturns = descendants(runScenario, ts.isReturnStatement)
      .flatMap(node => node.expression !== undefined && ts.isObjectLiteralExpression(node.expression) ? [node.expression] : [])
      .filter(node => node.properties.some(property => ts.isShorthandPropertyAssignment(property) && property.name.text === 'runtimeProfile'))
    expect(scenarioReturns).toHaveLength(1)
    const resultBindings = declarations.filter(node => ts.isObjectBindingPattern(node.name)
      && node.initializer !== undefined && ts.isAwaitExpression(node.initializer)
      && ts.isCallExpression(node.initializer.expression) && node.initializer.expression.expression.getText(source) === 'runScenario')
    expect(resultBindings).toHaveLength(1)
    const resultBinding = resultBindings[0]?.name
    if (resultBinding === undefined || !ts.isObjectBindingPattern(resultBinding)) throw new Error('SDK scenario result binding is missing')
    expect(resultBinding.elements.filter(node => node.name.getText(source) === 'runtimeProfile')
      .map(node => node.getText(source))).toEqual(['runtimeProfile'])

    const comparisonContext = declaration('comparisonContext')
    expect(comparisonContext.initializer?.getText(source)).toBe('contextOf(ordered, cwd)')
    const actualContext = declaration('actualContext').initializer
    if (actualContext === undefined || !ts.isConditionalExpression(actualContext)) {
      throw new Error('SDK encoded-cwd comparison requires an explicit conditional')
    }
    expect(actualContext.condition.getText(source).replace(/\s+/g, ''))
      .toBe("scenario.name==='academic-plan-chinese'&&runtimeProfile==='sdk-minimal'&&mode==='replay'")
    expect(actualContext.whenTrue.getText(source)).toBe('withSdkJsonCwdAlias(comparisonContext)')
    expect(actualContext.whenFalse.getText(source)).toBe('comparisonContext')
    const aliasCalls = descendants(source, ts.isCallExpression)
      .filter(node => node.expression.getText(source) === 'withSdkJsonCwdAlias')
    expect(aliasCalls).toHaveLength(1)
    expect(aliasCalls[0]).toBe(actualContext.whenTrue)
    const aliasImports = source.statements.filter(ts.isImportDeclaration)
      .filter(node => node.importClause?.namedBindings !== undefined && ts.isNamedImports(node.importClause.namedBindings)
        && node.importClause.namedBindings.elements.some(element => element.name.text === 'withSdkJsonCwdAlias'
          && element.propertyName === undefined))
    expect(aliasImports).toHaveLength(1)
    expect(aliasImports[0]?.moduleSpecifier.getText(source)).toBe("'@deepseek-ai/dsh-session-snapshot'")
  })
})
