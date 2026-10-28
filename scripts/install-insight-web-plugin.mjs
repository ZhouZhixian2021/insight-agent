/** Install the pinned Web search bundle through dsh's profile package manager. */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify, parseArgs } from 'node:util'
import { t as listTar } from 'tar'

const execFileAsync = promisify(execFile)
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const integrationDir = join(repositoryRoot, 'integrations', 'dsh-web-tools')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

/** Installation failures stop without retrying or claiming rollback. */
export class InstallError extends Error {
  constructor(code, message, options) {
    super(message, options)
    this.name = 'InstallError'
    this.code = code
  }
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'))
}

/** Resolve dependency manifests without importing or executing package code. */
export async function dependencyGraph(packageDir) {
  const seen = new Map()
  async function visit(directory, root = false) {
    const manifest = await readJson(join(directory, 'package.json'))
    const id = `${manifest.name}@${manifest.version}`
    if (seen.has(id)) return
    seen.set(id, { name: manifest.name, version: manifest.version })
    const resolver = createRequire(join(directory, 'package.json'))
    for (const name of Object.keys(manifest.dependencies ?? {}).sort()) {
      let found
      for (const base of resolver.resolve.paths(name) ?? []) {
        const candidate = join(base, name, 'package.json')
        try { await access(candidate); found = dirname(candidate); break } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
      }
      if (found === undefined) throw new InstallError('DEPENDENCY_MISSING', `Missing dependency ${name}.`)
      await visit(found)
    }
    if (root) seen.delete(id)
  }
  await visit(packageDir, true)
  return [...seen.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'))
}

/** Verify both archive bytes and the shipped host contract without loading it. */
export async function verifyArchive(filename, lock) {
  if (digest(await readFile(filename)) !== lock.archive.sha256) {
    throw new InstallError('ARCHIVE_DIGEST', 'Pinned plugin archive checksum does not match.')
  }
  const selected = new Map()
  const forbiddenEntries = []
  const wanted = new Set(['package/package.json', ...Object.keys(lock.packedFiles).map(name => `package/${name}`)])
  await listTar({ file: filename, onReadEntry(entry) {
    if (/(?:^|\/)(?:\.npmrc|\.env(?:\.[^/]*)?|\.?credentials(?:\.[^/]*)?)(?:$|\/)/i.test(entry.path)
      || entry.path.includes('/node_modules/@deepseek-ai/')) forbiddenEntries.push(entry.path)
    if (!wanted.has(entry.path)) return
    const chunks = []
    entry.on('data', chunk => chunks.push(chunk))
    entry.on('end', () => selected.set(entry.path, Buffer.concat(chunks)))
  } })
  if (forbiddenEntries.length > 0) throw new InstallError('ARCHIVE_SCOPE', 'Archive includes local configuration or Harness core packages.')
  const manifest = JSON.parse(selected.get('package/package.json')?.toString('utf8') ?? 'null')
  if (manifest?.name !== lock.name || manifest.version !== lock.version || manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
    throw new InstallError('PACKAGE_IDENTITY', 'Pinned archive is not the expected Web tools bundle.')
  }
  if (JSON.stringify(manifest.dependencies) !== JSON.stringify(lock.directDependencies)
    || JSON.stringify(manifest.bundledDependencies) !== JSON.stringify(Object.keys(lock.directDependencies))) {
    throw new InstallError('BUNDLED_DEPENDENCIES', 'Pinned archive must carry its exact ordinary dependencies.')
  }
  for (const [name, expected] of Object.entries(lock.packedFiles)) {
    const bytes = selected.get(`package/${name}`)
    if (bytes === undefined || digest(bytes) !== expected) throw new InstallError('PACKED_FILE_DIGEST', `Packed file differs: ${name}.`)
  }
  const host = selected.get('package/lib/host/index.js').toString('utf8')
  const declaredInject = /^export const inject = (\[[^\n]+\]);$/m.exec(host)
  if (declaredInject === null || JSON.parse(declaredInject[1]).includes('webRuntime')) {
    throw new InstallError('OBSOLETE_SERVICE', 'Packed host still requires the removed webRuntime service.')
  }
  return manifest
}

/** Build a credential-free command plan; this operation never writes a profile. */
export async function createInstallPlan({ home, storeDir, offline = true, sourceCli = false }) {
  if (typeof home !== 'string' || home.trim() === '') throw new InstallError('HOME_REQUIRED', 'Pass --home with the intended DSH home.')
  const lock = await readJson(join(integrationDir, 'lock.json'))
  const rootPackage = await readJson(join(repositoryRoot, 'package.json'))
  if (rootPackage.version !== lock.testedRuntime) throw new InstallError('RUNTIME_VERSION', 'Review the pinned integration before installing into this runtime version.')
  const archive = join(integrationDir, lock.archive.filename)
  await verifyArchive(archive, lock)
  const targetHome = resolve(home)
  const localArchive = join(targetHome, 'plugin-packages', lock.archive.filename)
  const cli = join(repositoryRoot, 'apps', 'cli', sourceCli ? 'src/bin.ts' : 'lib/bin.js')
  const args = [...(sourceCli ? ['--import', 'tsx/esm'] : []), cli, 'plugin', '--profile', 'web', 'add', localArchive,
    ...(offline ? ['--offline'] : []), '--ignore-scripts', '--config.auto-install-peers=false', '--config.verify-deps-before-run=false',
    '--config.fetch-retries=0', '--reporter=append-only', ...(storeDir ? ['--store-dir', resolve(storeDir)] : [])]
  return { lock, archive, localArchive, home: targetHome, profileDir: join(targetHome, 'profiles', 'web'), cli, args }
}

function packageReference(filename, profileDir) {
  if (typeof filename !== 'string' || !filename.startsWith('file:')) return undefined
  const value = filename.slice(5)
  return resolve(isAbsolute(value) ? value : join(profileDir, value))
}

/** Check the installed artifact, profile bundle, and ordinary dependency versions. */
export async function installedProfileMatches(plan) {
  try {
    const profile = await readJson(join(plan.profileDir, 'package.json'))
    const packageDir = join(plan.profileDir, 'node_modules', plan.lock.name)
    const installed = await readJson(join(packageDir, 'package.json'))
    if (packageReference(profile.dependencies?.[plan.lock.name], plan.profileDir) !== resolve(plan.localArchive)
      || installed.name !== plan.lock.name || installed.version !== plan.lock.version
      || profile.dsh?.profile?.bundles?.filter(name => name === plan.lock.name).length !== 1) return false
    if (digest(await readFile(plan.localArchive)) !== plan.lock.archive.sha256) return false
    for (const [name, expected] of Object.entries(plan.lock.packedFiles)) {
      if (digest(await readFile(join(packageDir, name))) !== expected) return false
    }
    return JSON.stringify(await dependencyGraph(packageDir)) === JSON.stringify(plan.lock.dependencyVersions)
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'DEPENDENCY_MISSING') return false
    throw error
  }
}

/** Pass OS/package-manager settings only; never forward API or DSH credentials. */
export function installEnvironment(home, userConfig, parent = process.env) {
  const names = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'SystemDrive', 'USERPROFILE',
    'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'HOME', 'PNPM_HOME', 'COREPACK_HOME', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
    'http_proxy', 'https_proxy', 'no_proxy', 'PROCESSOR_ARCHITECTURE']
  return { ...Object.fromEntries(names.filter(name => parent[name] !== undefined).map(name => [name, parent[name]])),
    DSH_HOME: home, NPM_CONFIG_USERCONFIG: userConfig, npm_config_userconfig: userConfig }
}

/** Install once, retain unknown/partial failures, and verify the resulting profile. */
export async function installPlugin(plan, { dryRun = false, runCommand = execFileAsync } = {}) {
  if (await installedProfileMatches(plan)) return { status: 'already-installed', version: plan.lock.version, home: plan.home }
  if (dryRun) return { status: 'dry-run', version: plan.lock.version, home: plan.home, executable: process.execPath, args: plan.args }
  await access(plan.cli)
  await mkdir(dirname(plan.localArchive), { recursive: true })
  await copyFile(plan.archive, plan.localArchive)
  const userConfig = join(dirname(plan.localArchive), 'install-empty.npmrc')
  await writeFile(userConfig, '', { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error })
  if ((await readFile(userConfig)).length !== 0) throw new InstallError('USER_CONFIG', 'The isolated installer npm config must be empty.')
  try {
    await runCommand(process.execPath, plan.args, { cwd: repositoryRoot, env: installEnvironment(plan.home, userConfig),
      windowsHide: true, timeout: 300000, maxBuffer: 1024 * 1024 })
  } catch (error) {
    throw new InstallError('PACKAGE_MANAGER', 'The dsh plugin installation failed; profile state may be partial. Inspect the profile package-manager diagnostics before retrying.', { cause: error })
  }
  if (!await installedProfileMatches(plan)) {
    throw new InstallError('INSTALLED_MISMATCH', 'Installed plugin or dependency versions differ from the lock; do not start the product before reviewing the profile.')
  }
  return { status: 'installed', version: plan.lock.version, home: plan.home }
}

async function main() {
  const { values } = parseArgs({ options: { home: { type: 'string' }, 'store-dir': { type: 'string' },
    offline: { type: 'boolean' }, online: { type: 'boolean' }, 'source-cli': { type: 'boolean' }, 'dry-run': { type: 'boolean' } } })
  if (values.offline && values.online) throw new InstallError('ARGUMENTS', 'Choose either --offline or --online.')
  const plan = await createInstallPlan({ home: values.home, storeDir: values['store-dir'], offline: !values.online, sourceCli: values['source-cli'] })
  console.log(JSON.stringify(await installPlugin(plan, { dryRun: values['dry-run'] }), null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(error => {
    console.error(`${error.code ?? 'INSTALL_FAILED'}: ${error.message}`)
    process.exitCode = 1
  })
}
