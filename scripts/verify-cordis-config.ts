/**
 * Validate Cordis Loader entry metadata and package resolution.
 *
 * The Loader interpolates a plugin entry's `config` (after declared injections
 * activate, against that plugin context) and the entry `disabled` field (at
 * every mount decision, against the loader context). Every other entry
 * metadata field stays static, so an expression there remains truthy data and
 * silently changes composition. Shipped and test-only dsh overlays resolve
 * named plugins from the CLI application's owning manifest; package-owned
 * Loader fixtures resolve from their package manifest.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, globSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { Script } from 'node:vm'
import ts from 'typescript'
import type { DshBundleManifest } from '../packages/util/package-manifest/src/types.ts'
import { bundlePatchFiles, bundlePatchPaths } from '../packages/boot/app-boot/src/profile.ts'
import { cordisConfigFiles } from './cordis-config-files.ts'
import { isAgentPresetEntry, presetDefinitions, isCordisGroupEntry, isJsExpr, loadCordisYaml } from './cordis-yaml.ts'

export interface PackageManifest {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  dsh?: { bundle?: DshBundleManifest }
}

export interface PluginReference {
  file: string
  name: string
}

const root = resolve(import.meta.dirname, '..')
const metadataFields = ['id', 'name', 'group', 'inject', 'intercept', 'isolate'] as const

/** The adaptive directory-picker chooser package (mounts a backend row at boot). */
const CHOOSER_PACKAGE = '@deepseek-ai/dsh-host-directory-picker-auto'

/**
 * The packages the chooser mounts by runtime string (mirror of its exported
 * `BACKEND_PACKAGES` and `SURFACE_PACKAGES`), invisible to yml-row scanning: a
 * composition mounting the chooser must resolve every one, or keyless Linux CI
 * (which only ever resolves `browse`) hides a dropped `-native` dependency
 * until a macOS boot.
 */
const CHOOSER_BACKEND_PACKAGES = [
  '@deepseek-ai/dsh-host-directory-picker-native',
  '@deepseek-ai/dsh-host-directory-picker-browse',
  '@deepseek-ai/dsh-client-ui-directory-picker-browse',
  '@deepseek-ai/dsh-client-ui-directory-picker-native',
]
if (import.meta.main) {
  const { files, errors } = verifyCordisConfigs()
  if (errors.length > 0) {
    console.error('verify-cordis-config: invalid Loader metadata or plugin package resolution:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
  } else {
    console.log(`verify-cordis-config: ${files.length} config files passed.`)
  }
}

/** Diagnostics and plugin references owned by one static check invocation. */
interface ConfigValidation {
  errors: string[]
  pluginReferences: PluginReference[]
}

/**
 * Check Loader files without loading plugins or evaluating YAML expressions.
 * Git link placeholders are followed only when their bytes match the index;
 * diagnostics and dependency ownership retain the discovered alias path.
 * File and YAML failures become diagnostics; unreadable Git index metadata,
 * required manifests, or compiler configuration stop the check by throwing.
 * @param repoRoot Repository to check; defaults to this script's repository.
 * @returns Discovered paths, diagnostics, and named plugin references.
 */
export function verifyCordisConfigs(repoRoot: string = root): ConfigValidation & { files: string[] } {
  const readConfig = cordisConfigReader(repoRoot)
  const result: ConfigValidation & { files: string[] } = { files: cordisConfigFiles(repoRoot), errors: [], pluginReferences: [] }
  const documents = new Map<string, unknown>()
  const loadEntries = (file: string): unknown[] => {
    if (!documents.has(file)) {
      try {
        const document = readConfig(file)
        documents.set(file, document)
        if (!isUnknownArray(document)) result.errors.push(`${file}: root must be a Loader entry array`)
      } catch (error) {
        result.errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`)
        documents.set(file, undefined)
      }
    }
    const document = documents.get(file)
    return isUnknownArray(document) ? document : []
  }
  if (result.files.length === 0) result.errors.push('Loader config scan found no configuration files')
  for (const file of result.files) {
    const entries = loadEntries(file)
    for (let index = 0; index < entries.length; index++) validateEntry(entries[index], file, `[${index}]`, result)
  }
  result.errors.push(...validateAppResolution(repoRoot, result.pluginReferences))
  result.errors.push(...validatePackageTestResolution(repoRoot, result.pluginReferences))
  result.errors.push(...packageTestFixtureDependencyErrors(repoRoot))
  result.errors.push(...validateSourcePlaneResolution(repoRoot, result.pluginReferences))
  result.errors.push(...validatePresetPlaneSeparation(repoRoot, loadEntries))
  result.errors.push(...validateClientHalvesDeclared(repoRoot))
  return result
}

/** Read working-tree YAML, recognizing only byte-exact Git link placeholders. */
function cordisConfigReader(repoRoot: string): (file: string) => unknown {
  const links = new Map<string, string>()
  const blobs = new Map<string, Buffer>()
  const gitOptions = { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024, stdio: 'pipe' as const }
  if (existsSync(resolve(repoRoot, '.git'))) {
    const index = execFileSync('git', ['ls-files', '--stage', '-z'], { ...gitOptions, encoding: 'utf8' })
    for (const entry of index.split('\0')) {
      const match = /^120000 ([a-f0-9]+) 0\t(.+)$/s.exec(entry)
      if (match?.[1] !== undefined && match[2] !== undefined) links.set(match[2], match[1])
    }
  }
  const realRoot = realpathSync(repoRoot)
  const inside = (base: string, path: string): boolean => {
    const local = relative(base, path)
    return !isAbsolute(local) && local !== '..' && !local.startsWith(`..${sep}`)
  }
  return (file) => {
    let path = resolve(repoRoot, file)
    const visited = new Set<string>()
    while (true) {
      if (visited.size > 0 && (!inside(repoRoot, path) || !inside(realRoot, realpathSync(path)))) {
        throw new Error('Git link target must stay inside the repository')
      }
      if (visited.has(path)) throw new Error('Git link target cycle')
      const stat = lstatSync(path)
      const bytes = readFileSync(path)
      const oid = stat.isFile() ? links.get(relative(repoRoot, path).replaceAll('\\', '/')) : undefined
      if (oid === undefined) return loadCordisYaml(bytes.toString('utf8'))
      let payload = blobs.get(oid)
      if (payload === undefined) {
        payload = execFileSync('git', ['cat-file', 'blob', oid], gitOptions)
        blobs.set(oid, payload)
      }
      if (!bytes.equals(payload)) return loadCordisYaml(bytes.toString('utf8'))
      visited.add(path)
      path = resolve(dirname(path), payload.toString('utf8'))
    }
  }
}

/**
 * A browser plugin must declare the browser half it ships.
 *
 * The browser roster is discovered by scanning composed packages for a
 * `dsh.client` block, and the node half of a surface plugin is an empty
 * `apply`. A `packages/client` package that exports `./client` without that
 * block therefore composes, activates, and contributes nothing — its bundle is
 * never served and no error is raised anywhere. The mismatch is invisible in
 * the composition file, so it is checked against the manifests instead. Only
 * this group is checked: a Host package's `./client` export is the typed wire
 * face its browser consumers import, not a plugin the roster serves.
 * @returns one violation per client package whose `./client` export and
 * `dsh.client` declaration disagree.
 */
function validateClientHalvesDeclared(repoRoot: string): string[] {
  return globSync('packages/client/*/package.json', { cwd: repoRoot }).flatMap((manifestPath) => {
    const manifest = readManifest(manifestPath, repoRoot) as PackageManifest & {
      exports?: Record<string, unknown>
      dsh?: { client?: unknown }
    }
    const shipsClient = manifest.exports !== undefined && Object.hasOwn(manifest.exports, './client')
    const declaresClient = manifest.dsh?.client !== undefined
    if (shipsClient === declaresClient) return []
    return [shipsClient
      ? `${manifestPath}: exports "./client" but declares no dsh.client, so its browser half is never served`
      : `${manifestPath}: declares dsh.client but exports no "./client" entry to serve`]
  })
}

/**
 * No shipped agent preset may repeat a row the host composition still runs.
 *
 * A preset contributes what ONE session adds to the host's registries. A row
 * active on both planes is therefore mounted twice — once per process and once
 * per session — and what that costs depends on what the row does: a provider
 * behind an `isolate` realm shadows the host's for its own consumers, so a host
 * contributor to that service reaches nobody; a row that registers into a host
 * singleton registers once per live session, so the second one collides.
 *
 * Both failure modes have occurred. A preset-local provider once shadowed the
 * host route that its consumer needed, and a host-registry contribution once
 * registered again for every live session until the second registration threw.
 * Neither changes a tool catalog, so no catalog assertion can see them — and the
 * shipped presets are near-copies of each other, so a fix applied to three of
 * four is the normal failure.
 * @returns one diagnostic per preset row that is also active on the host plane.
 */
function validatePresetPlaneSeparation(repoRoot: string, loadEntries: (file: string) => unknown[]): string[] {
  const problems: string[] = []
  // The shipped Web surface is two bundle layers over an empty root; the web
  // layer is its host patch followed by one patch file per shipped preset.
  const hostFile = 'packages/bundle/base/cordis.patch.yml'
  const overlayDir = 'packages/bundle/web-app'
  const overlayManifest = JSON.parse(readFileSync(resolve(repoRoot, overlayDir, 'package.json'), 'utf8')) as { dsh: { bundle: DshBundleManifest } }
  const overlayFiles = bundlePatchFiles(overlayManifest.dsh.bundle).map(file => `${overlayDir}/${file.replace(/^\.\//, '')}`)
  const disabled = new Set<string>()
  const overlayRows = new Set<string>()
  for (const file of overlayFiles) {
    for (const entry of loadEntries(file)) {
      if (!isRecord(entry)) continue
      if (entry.disabled === true && typeof entry.id === 'string') disabled.add(entry.id)
    }
    for (const id of collectRowIds(loadEntries(file))) overlayRows.add(id)
  }
  // The overlay's own inserts are host-plane too; its disables take them back out.
  const active = new Set([...collectRowIds(loadEntries(hostFile)), ...overlayRows].filter(id => !disabled.has(id)))
  for (const file of overlayFiles) {
    for (const definition of presetDefinitions(loadEntries(file))) {
      for (const id of collectRowIds(definition.plugins)) {
        if (active.has(id)) problems.push(`${file}#${definition.id}: row "${id}" is also active in the host composition; a row belongs to exactly one plane`)
      }
    }
  }
  return problems
}

function collectRowIds(rows: unknown): Set<string> {
  const ids = new Set<string>()
  const walk = (value: unknown): void => {
    if (isUnknownArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (!isRecord(value)) return
    if (typeof value.id === 'string' && typeof value.name === 'string') ids.add(value.id)
    walk(value.insert)
    if (isCordisGroupEntry(value)) walk(value.config)
  }
  walk(rows)
  return ids
}

function validateEntry(value: unknown, file: string, path: string, result: ConfigValidation): void {
  const { errors, pluginReferences } = result
  if (!isRecord(value)) {
    errors.push(`${file}${path}: entry must be an object`)
    return
  }
  recordPlugin(value, file, pluginReferences)
  errors.push(...metadataExpressionErrors(value, path).map(problem => `${file}${problem}`))
  if (isCordisGroupEntry(value)) {
    for (let index = 0; index < value.config.length; index++) {
      validateEntry(value.config[index], file, `${path}.config[${index}]`, result)
    }
  }
  if (isAgentPresetEntry(value)) {
    for (let index = 0; index < value.config.plugins.length; index++) validateEntry(value.config.plugins[index], file, `${path}.config.plugins[${index}]`, result)
  }
  if (isUnknownArray(value.insert)) {
    for (let index = 0; index < value.insert.length; index++) {
      validateEntry(value.insert[index], file, `${path}.insert[${index}]`, result)
    }
  }
  if (value.name !== '@deepseek-ai/cordis-plugin-include') return
  const config = value.config
  if (!isRecord(config) || !isUnknownArray(config.patches)) return
  for (let index = 0; index < config.patches.length; index++) {
    const patch = config.patches[index]
    const patchPath = `${path}.config.patches[${index}]`
    if (!isRecord(patch)) continue
    recordPlugin(patch, file, pluginReferences)
    errors.push(...metadataExpressionErrors(patch, patchPath).map(problem => `${file}${problem}`))
    if (!isUnknownArray(patch.insert)) continue
    for (let insertIndex = 0; insertIndex < patch.insert.length; insertIndex++) {
      validateEntry(patch.insert[insertIndex], file, `${patchPath}.insert[${insertIndex}]`, result)
    }
  }
}

function recordPlugin(entry: Record<string, unknown>, file: string, pluginReferences: PluginReference[]): void {
  if (typeof entry.name === 'string') pluginReferences.push({ file, name: entry.name })
}

function validateAppResolution(repoRoot: string, pluginReferences: readonly PluginReference[]): string[] {
  const violations: string[] = []
  const bundleManifests = bundleManifestPaths(repoRoot)
  const appOverlayFiles = new Set(globSync('apps/cli/config/examples/**/*.yml', { cwd: repoRoot })
    .map(file => file.replaceAll('\\', '/')))
  // App overlays (and any config left under apps/cli/config) resolve from the
  // dsh app's own dependency surface — the runtime resolution mirrors it.
  const appManifest = readManifest('apps/cli/package.json', repoRoot)
  const appDependencies = {
    ...appManifest.dependencies,
    // Runtime resolution includes every in-box bundle's own dependencies.
    // Optional Profile bundles stay outside the app installation until that
    // Profile installs them.
    ...Object.fromEntries(globSync('packages/bundle/*/package.json', { cwd: repoRoot })
      .flatMap(file => Object.entries(readManifest(file, repoRoot).dependencies ?? {}))),
  }
  const shipped = new Set(globSync('*.cordis.yml', { cwd: resolve(repoRoot, 'apps/cli/config') })
    .map(file => `apps/cli/config/${file}`))
  const appReferences = pluginReferences.filter(reference => shipped.has(reference.file) || appOverlayFiles.has(reference.file))
  violations.push(...missingPluginDependencies(
    appReferences,
    appDependencies,
    'apps/cli/package.json dependencies or a bundle manifest',
  ))
  const appTestReferences = pluginReferences.filter(reference => reference.file.startsWith('apps/cli/tests/'))
  violations.push(...missingPluginDependencies(
    appTestReferences,
    { ...appManifest.dependencies, ...appManifest.devDependencies },
    'apps/cli/package.json dependencies or devDependencies',
  ))
  // Each bundle's patch rows must resolve from that bundle's own dependencies:
  // per-layer resolution anchors on the bundle package directory.
  for (const manifestPath of bundleManifests) {
    const bundleDir = manifestPath.replace(/\/package\.json$/, '')
    const manifest = readManifest(manifestPath, repoRoot)
    const bundle = manifest.dsh?.bundle
    if (bundle === undefined) continue
    const patchFiles = new Set(bundlePatchPaths(resolve(repoRoot, bundleDir), bundle)
      .map(file => relative(repoRoot, file).replaceAll('\\', '/')))
    const references = pluginReferences.filter(reference => patchFiles.has(reference.file))
    violations.push(...bundlePluginDependencyErrors(manifestPath, manifest, references))
  }
  return violations
}

/**
 * Package-owned Loader fixtures resolve named plugins from their package's
 * dependency surface, not from a repository-level test umbrella.
 * @returns one violation per configured package absent from the owner manifest.
 */
function validatePackageTestResolution(repoRoot: string, pluginReferences: readonly PluginReference[]): string[] {
  const referencesByManifest = new Map<string, PluginReference[]>()
  for (const reference of pluginReferences) {
    const manifestPath = packageTestManifestPath(reference.file)
    if (manifestPath === undefined) continue
    const references = referencesByManifest.get(manifestPath) ?? []
    references.push(reference)
    referencesByManifest.set(manifestPath, references)
  }
  return [...referencesByManifest].flatMap(([manifestPath, references]) =>
    packageTestPluginDependencyErrors(manifestPath, readManifest(manifestPath, repoRoot), references))
}

/**
 * Validate the named plugins one package-owned Loader fixture resolves.
 * Self-references use Node package self-resolution; every other package must
 * be an ordinary production or test dependency of the owner.
 * @param manifestPath Repository-relative owner manifest path.
 * @param manifest Parsed owner manifest.
 * @param references Named plugin references from owner-local test configs.
 * @returns Missing dependency diagnostics.
 */
export function packageTestPluginDependencyErrors(
  manifestPath: string,
  manifest: PackageManifest,
  references: readonly PluginReference[],
): string[] {
  return missingPluginDependencies(
    references.filter(reference => packageNameFromSpecifier(reference.name) !== manifest.name),
    { ...manifest.dependencies, ...manifest.devDependencies },
    `${manifestPath} dependencies or devDependencies`,
  )
}

/**
 * Validate imports made by fixture modules adjacent to package-owned Loader
 * configs. These files execute as plain Node/tsx children, so a stale root
 * `node_modules` link must not hide an undeclared dependency.
 * @param repoRoot Repository root to scan.
 * @returns Missing dependency diagnostics.
 */
export function packageTestFixtureDependencyErrors(repoRoot: string = root): string[] {
  const fixtureDirectories = new Set(cordisConfigFiles(repoRoot)
    .filter(file => packageTestManifestPath(file) !== undefined)
    .map(file => dirname(file).replaceAll('\\', '/')))
  if (fixtureDirectories.size === 0) {
    return ['package test fixture dependency scan found no package-owned Loader configs']
  }
  const referencesByManifest = new Map<string, PluginReference[]>()
  let fixtureModuleCount = 0
  for (const fixtureDirectory of fixtureDirectories) {
    const files = globSync([
      `${fixtureDirectory}/**/*.ts`,
      `${fixtureDirectory}/**/*.mjs`,
    ], { cwd: repoRoot })
    fixtureModuleCount += files.length
    for (const file of files) {
      const manifestPath = packageTestManifestPath(file)
      if (manifestPath === undefined) continue
      const references = referencesByManifest.get(manifestPath) ?? []
      const source = readFileSync(resolve(repoRoot, file), 'utf8')
      for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
        references.push({ file: file.replaceAll('\\', '/'), name: imported.fileName })
      }
      referencesByManifest.set(manifestPath, references)
    }
  }
  if (fixtureModuleCount === 0) {
    return ['package test fixture dependency scan found no fixture modules beside Loader configs']
  }
  return [...referencesByManifest].flatMap(([manifestPath, references]) =>
    packageTestPluginDependencyErrors(
      manifestPath,
      readManifest(manifestPath, repoRoot),
      references,
    ))
}

/** Owner manifest for a package-local test path. */
function packageTestManifestPath(file: string): string | undefined {
  const match = /^(packages\/[^/]+\/[^/]+)\/tests(?:\/|$)/.exec(file.replaceAll('\\', '/'))
  return match?.[1] === undefined ? undefined : `${match[1]}/package.json`
}

/**
 * Discover workspace Bundle packages from their manifest declaration.
 * @param repoRoot Repository root to scan.
 * @returns Sorted slash-normalized repository-relative package manifest paths.
 */
export function bundleManifestPaths(repoRoot: string = root): string[] {
  return globSync('packages/*/*/package.json', { cwd: repoRoot })
    .filter(path => readManifest(path, repoRoot).dsh?.bundle?.patch !== undefined)
    .map(path => path.replaceAll('\\', '/'))
    .sort()
}

/**
 * Validate plugin packages referenced by one Bundle patch.
 * @param manifestPath Repository-relative Bundle manifest path.
 * @param manifest Parsed Bundle manifest.
 * @param references Plugin rows read from the Bundle package directory.
 * @returns Missing production dependency diagnostics.
 */
export function bundlePluginDependencyErrors(
  manifestPath: string,
  manifest: PackageManifest,
  references: readonly PluginReference[],
): string[] {
  return missingPluginDependencies(
    // A Bundle may mount its own package (for example, its provider or runtime row).
    references.filter(reference => packageNameFromSpecifier(reference.name) !== manifest.name),
    manifest.dependencies ?? {},
    `${manifestPath} dependencies`,
  )
}

/**
 * Every configured specifier of a local workspace package must resolve through
 * the tsconfig `paths` facade to a `.ts`/`.tsx` source file. The `dsh` source
 * launch (tsx) and vitest resolve in the source plane; without a `paths` match
 * they fall back to package `exports`, which reach built `lib/` — present on a
 * built dev tree, absent on a clean one — so a missing mapping boots locally
 * yet breaks every clean checkout. Anything but a `.ts`/`.tsx` hit (a `.d.ts`
 * or `.js` under built `lib/`) is that artifact-plane fallback, not source.
 */
function validateSourcePlaneResolution(repoRoot: string, pluginReferences: readonly PluginReference[]): string[] {
  const violations: string[] = []
  const localPackages = localPackageDirectories(repoRoot)
  const config = ts.readConfigFile(resolve(repoRoot, 'tsconfig.base.json'), path => ts.sys.readFile(path))
  if (config.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  }
  const { options, errors: optionErrors } = ts.convertCompilerOptionsFromJson(
    (config.config as { compilerOptions?: unknown }).compilerOptions,
    repoRoot,
    'tsconfig.base.json',
  )
  if (optionErrors.length > 0) {
    throw new Error(optionErrors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'))
  }
  // convertCompilerOptionsFromJson leaves `pathsBasePath` unset, so relative
  // `paths` targets resolve against the host's current directory; anchor it to
  // the repository root to keep the gate cwd-independent.
  const host: ts.ModuleResolutionHost = {
    fileExists: path => ts.sys.fileExists(path),
    readFile: path => ts.sys.readFile(path),
    directoryExists: path => ts.sys.directoryExists(path),
    getCurrentDirectory: () => repoRoot,
  }
  const sourceExtensions = new Set<string>([ts.Extension.Ts, ts.Extension.Tsx])
  const containingFile = resolve(repoRoot, 'scripts/verify-cordis-config.ts')
  const locationsBySpecifier = new Map<string, Set<string>>()
  for (const reference of pluginReferences) {
    const packageName = packageNameFromSpecifier(reference.name)
    if (packageName === undefined || !localPackages.has(packageName)) continue
    const locations = locationsBySpecifier.get(reference.name) ?? new Set<string>()
    locations.add(reference.file)
    locationsBySpecifier.set(reference.name, locations)
  }
  for (const [specifier, locations] of locationsBySpecifier) {
    const resolved = ts.resolveModuleName(specifier, containingFile, options, host).resolvedModule
    if (resolved !== undefined && sourceExtensions.has(resolved.extension)) continue
    violations.push(`${[...locations].join(', ')}: ${specifier} does not resolve to workspace source through tsconfig.base.json paths (add a mapping so the tsx source launch does not depend on built lib/)`)
  }
  return violations
}

function missingPluginDependencies(
  references: readonly PluginReference[],
  dependencies: Readonly<Record<string, string>>,
  dependencyOwner: string,
): string[] {
  const requiredPackages = new Map<string, Set<string>>()
  const require = (packageName: string, file: string): void => {
    const locations = requiredPackages.get(packageName) ?? new Set<string>()
    locations.add(file)
    requiredPackages.set(packageName, locations)
  }
  for (const reference of references) {
    const packageName = packageNameFromSpecifier(reference.name)
    if (packageName === undefined) continue
    require(packageName, reference.file)
    if (packageName === CHOOSER_PACKAGE) {
      for (const backend of CHOOSER_BACKEND_PACKAGES) require(backend, reference.file)
    }
  }
  return [...requiredPackages].flatMap(([packageName, locations]) => packageName in dependencies
    ? []
    : `${[...locations].join(', ')}: ${packageName} must be declared in ${dependencyOwner}`)
}

function readManifest(path: string, repoRoot: string = root): PackageManifest {
  return JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8')) as PackageManifest
}

function localPackageDirectories(repoRoot: string): Map<string, string> {
  const manifests = globSync(['packages/*/*/package.json', 'vendor/*/package.json'], { cwd: repoRoot })
  const packages = new Map<string, string>()
  for (const manifestPath of manifests) {
    const manifest = readManifest(manifestPath, repoRoot)
    if (manifest.name !== undefined) packages.set(manifest.name, resolve(repoRoot, dirname(manifestPath)))
  }
  return packages
}

function packageNameFromSpecifier(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/') || /^[a-z][a-z+.-]*:/i.test(specifier)) return undefined
  const segments = specifier.split('/')
  if (specifier.startsWith('@')) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : undefined
  }
  return segments[0] || undefined
}

/**
 * Expression-node diagnostics for one entry. `disabled` is the single
 * interpolated metadata field: its own `!!js` expression node is allowed and
 * must parse, while expressions nested below it stay truthy data; every other
 * metadata field must stay fully static.
 * @param entry - one loader entry (or patch row).
 * @param path - the entry's diagnostic path prefix.
 * @returns one diagnostic per offending expression.
 */
export function metadataExpressionErrors(entry: Record<string, unknown>, path: string): string[] {
  const problems: string[] = []
  for (const field of metadataFields) {
    if (!(field in entry)) continue
    const expressionPaths: string[] = []
    collectExpressionPaths(entry[field], `${path}.${field}`, expressionPaths)
    for (const expressionPath of expressionPaths) problems.push(`${expressionPath}: !!js is not interpolated here`)
  }
  const disabled = entry.disabled
  if (disabled !== undefined) {
    if (isJsExpr(disabled)) {
      const detail = disabledExpressionProblem(disabled.__jsExpr)
      if (detail !== undefined) problems.push(`${path}.disabled${detail}`)
    } else {
      // A non-expression value gates on Boolean() at mount; an expression
      // nested anywhere below it never evaluates, so it must stay literal.
      const expressionPaths: string[] = []
      collectExpressionPaths(disabled, `${path}.disabled`, expressionPaths)
      for (const expressionPath of expressionPaths) problems.push(`${expressionPath}: !!js is not interpolated here`)
    }
  }
  return problems
}

/**
 * Parse-only validation of a `disabled` expression: the Loader evaluates it
 * at every mount decision, and a syntax error would fail the boot — rejecting
 * it here moves that failure to the earliest resolvable point.
 * @param expression - the `!!js` expression text.
 * @returns the diagnostic suffix, or `undefined` when the expression parses.
 */
function disabledExpressionProblem(expression: string): string | undefined {
  try {
    // Compilation only — constructing a Script does not execute its source.
    new Script(`(${expression})`)
    return undefined
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return `: disabled expression does not parse: ${detail}`
  }
}

function collectExpressionPaths(value: unknown, path: string, output: string[]): void {
  if (isJsExpr(value)) {
    output.push(path)
    return
  }
  if (isUnknownArray(value)) {
    for (let index = 0; index < value.length; index++) collectExpressionPaths(value[index], `${path}[${index}]`, output)
    return
  }
  if (!isRecord(value)) return
  for (const [key, child] of Object.entries(value)) collectExpressionPaths(child, `${path}.${key}`, output)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}
