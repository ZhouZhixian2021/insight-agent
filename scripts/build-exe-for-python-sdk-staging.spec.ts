import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { c as tar } from 'tar'
import { afterEach, expect, it, onTestFinished } from 'vitest'
import { deduplicateStagedWorkspacePackages, materializeStagedLinks, needsStagedSpawnHelper,
  pythonRuntimeDeployArguments } from './build-exe-for-python-sdk-staging.ts'
import { runtimeNpmArchive } from './build-exe-for-python-sdk-office.ts'
import { officePackageDirectories } from './libreoffice-packages.mjs'

const temporaryDirectories: string[] = []
const directoryLinkType = process.platform === 'win32' ? 'junction' : 'dir'

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture(prefix: string) {
  const workspace = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(workspace)
  return workspace
}

it('deploys locked dependencies when the registry advertises a newer compatible version', async () => {
  const workspace = await fixture('dsh-python-deploy-lock-')
  const archives = new Map<string, Buffer>()
  const integrities = new Map<string, string>()
  for (const version of ['2.8.1', '2.9.1']) {
    const packageRoot = join(workspace, 'archives', version)
    await mkdir(join(packageRoot, 'package'), { recursive: true })
    await writeFile(join(packageRoot, 'package', 'package.json'), JSON.stringify({ name: 'tslib', version, main: 'index.js' }))
    await writeFile(join(packageRoot, 'package', 'index.js'), `module.exports = {version: '${version}'}\n`)
    const archivePath = join(packageRoot, 'package.tgz')
    await tar({ file: archivePath, cwd: packageRoot, gzip: true }, ['package'])
    const bytes = await readFile(archivePath)
    archives.set(version, bytes)
    integrities.set(version, `sha512-${createHash('sha512').update(bytes).digest('base64')}`)
  }
  const requests: string[] = []
  let registry = ''
  const server = createServer((request, response) => {
    const url = request.url ?? '/'
    requests.push(url)
    const version = /^\/tslib\/-\/tslib-(.+)\.tgz$/.exec(url)?.[1]
    const bytes = version === undefined ? undefined : archives.get(version)
    if (bytes !== undefined) {
      response.writeHead(200, { 'content-type': 'application/octet-stream' })
      response.end(bytes)
      return
    }
    if (url === '/tslib') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ name: 'tslib', 'dist-tags': { latest: '2.9.1' }, versions:
        Object.fromEntries([...archives.keys()].map(version => [version, { name: 'tslib', version, main: 'index.js',
          dist: { integrity: integrities.get(version), tarball: `${registry}tslib/-/tslib-${version}.tgz` } }])) }))
      return
    }
    response.writeHead(404)
    response.end()
  })
  onTestFinished(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) resolve()
        else reject(error)
      })
    })
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Registry has no bound TCP address')
  registry = `http://127.0.0.1:${address.port}/`
  await mkdir(join(workspace, 'runtime'), { recursive: true })
  await mkdir(join(workspace, 'office'), { recursive: true })
  await writeFile(join(workspace, 'package.json'), JSON.stringify({ private: true }))
  await writeFile(join(workspace, 'runtime', 'package.json'), JSON.stringify({ name: 'dsh-python-runtime-closure', version: '1.0.0',
    dependencies: { '@deepseek-ai/libreoffice-kit': 'workspace:*', '@deepseek-ai/libreoffice-kit-wasm': 'workspace:*', tslib: '^2.8.1' } }))
  await mkdir(join(workspace, 'wasm'), { recursive: true })
  await writeFile(join(workspace, 'wasm', 'package.json'), JSON.stringify({ name: '@deepseek-ai/libreoffice-kit-wasm', version: '1.0.0' }))
  await writeFile(join(workspace, 'pnpm-workspace.yaml'), 'packages:\n  - runtime\n  - office\n  - wasm\nautoInstallPeers: false\nminimumReleaseAge: 0\n')
  await writeFile(join(workspace, 'office', 'package.json'), JSON.stringify({ name: '@deepseek-ai/libreoffice-kit', version: '1.0.0',
    main: 'index.js', dependencies: { tslib: '^2.8.1' }, optionalDependencies: { '@deepseek-ai/libreoffice-kit-wasm': 'workspace:*' } }))
  await writeFile(join(workspace, 'office', 'index.js'), "module.exports = require('tslib')\n")
  const lockfile = join(workspace, 'pnpm-lock.yaml')
  const lock = { lockfileVersion: '9.0', settings: { autoInstallPeers: false, excludeLinksFromLockfile: false }, importers: {
    '.': {}, runtime: { dependencies: {
      '@deepseek-ai/libreoffice-kit': { specifier: 'workspace:*', version: 'link:../office' },
      '@deepseek-ai/libreoffice-kit-wasm': { specifier: 'workspace:*', version: 'link:../wasm' },
      tslib: { specifier: '^2.8.1', version: '2.8.1' },
    } }, office: { dependencies: { tslib: { specifier: '^2.8.1', version: '2.8.1' } },
      optionalDependencies: { '@deepseek-ai/libreoffice-kit-wasm': { specifier: 'workspace:*', version: 'link:../wasm' } } }, wasm: {},
  }, packages: { 'tslib@2.8.1': { resolution: { integrity: integrities.get('2.8.1'), tarball: `${registry}tslib/-/tslib-2.8.1.tgz` } } },
  snapshots: { 'tslib@2.8.1': {} } }
  const originalLock = JSON.stringify(lock)
  await writeFile(lockfile, originalLock)
  const deploy = async (destination: string, legacy: boolean) => {
    const args = pythonRuntimeDeployArguments(destination)
    const deployArgs = legacy ? [...args.filter(arg => arg !== '--frozen-lockfile' && arg !== '--config.inject-workspace-packages=true'), '--legacy'] : args
    const entry = fileURLToPath(new URL('./bin/pnpm.mjs', import.meta.resolve('pnpm')))
    await promisify(execFile)(process.execPath, [entry, ...deployArgs, '--registry', registry,
      '--store-dir', join(workspace, 'store'), '--ignore-scripts'], {
      cwd: workspace, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
    })
  }
  const legacy = join(workspace, 'legacy-output')
  await deploy(legacy, true)
  const legacyManifest = JSON.parse(await readFile(join(legacy, 'node_modules/tslib/package.json'), 'utf8')) as { version: string }
  expect(legacyManifest.version).toBe('2.9.1')
  await expect(runtimeNpmArchive('tslib', legacyManifest.version, lockfile)).rejects.toThrow('missing SHA-512 integrity for tslib@2.9.1')
  requests.length = 0
  const staging = join(workspace, 'locked-output')
  await deploy(staging, false)
  await materializeStagedLinks(staging)
  await deduplicateStagedWorkspacePackages(staging, staging)
  const require = createRequire(join(staging, 'runtime-bootstrap.cjs'))
  const tslib = require('tslib') as { readonly version: string }
  expect(tslib.version).toBe('2.8.1')
  expect(require('@deepseek-ai/libreoffice-kit')).toBe(tslib)
  expect(requests).not.toContain('/tslib/-/tslib-2.9.1.tgz')
  expect(await readFile(lockfile, 'utf8')).toBe(originalLock)
  expect(await listSymlinks(join(staging, 'node_modules'))).toEqual([])
  expect(await officePackageDirectories(staging, { platform: 'freebsd', arch: 'x64' })).toContain(join(staging, 'node_modules', 'tslib'))
  expect(await runtimeNpmArchive('tslib', tslib.version, lockfile)).toMatchObject({
    version: '2.8.1', integrity: integrities.get('2.8.1'),
  })
}, 60_000)

it('permits only the reviewed subprocess helper to be skipped by shared-lockfile deploy', async () => {
  const workspace = await fixture('dsh-python-deploy-builds-')
  const staging = join(workspace, 'payload')
  const modules = join(staging, 'node_modules')
  await mkdir(modules, { recursive: true })
  const metadata = join(modules, '.modules.yaml')
  await writeFile(metadata, JSON.stringify({ ignoredBuilds: [] }))
  await expect(needsStagedSpawnHelper(staging, workspace)).resolves.toBe(false)
  const reviewed = `@deepseek-ai/dsh-subprocess-local@${pathToFileURL(join(workspace,
    'packages/subprocess/subprocess-local')).href}`
  await writeFile(metadata, JSON.stringify({ ignoredBuilds: [reviewed] }))
  await expect(needsStagedSpawnHelper(staging, workspace)).resolves.toBe(true)
  await writeFile(metadata, JSON.stringify({ ignoredBuilds: [reviewed, 'unexpected@file:///tmp/source'] }))
  await expect(needsStagedSpawnHelper(staging, workspace)).rejects.toThrow('unreviewed ignored build scripts')
})

/** List every symbolic link below a directory. */
async function listSymlinks(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) return [path]
    if (entry.isDirectory()) return listSymlinks(path)
    return []
  }))
  return nested.flat()
}

it('drops the deploy root link that points back into the payload', async () => {
  const workspace = await fixture('dsh-python-staging-root-')
  const project = join(workspace, 'python', 'sdk-runtime')
  const staging = join(project, 'src', 'runtime', 'node')
  await mkdir(join(staging, 'node_modules'), { recursive: true })
  await writeFile(join(project, 'package.json'), '{"name":"dsh-python-runtime-closure"}\n')
  await symlink(project, join(staging, 'node_modules', 'dsh-python-runtime-closure'), directoryLinkType)

  await materializeStagedLinks(staging)

  expect(existsSync(join(staging, 'node_modules', 'dsh-python-runtime-closure'))).toBe(false)
  await expect(readFile(join(project, 'package.json'), 'utf8')).resolves.toContain('dsh-python-runtime-closure')
})

it('copies workspace package links as files and removes command shims', async () => {
  const workspace = await fixture('dsh-python-staging-packages-')
  const staging = join(workspace, 'runtime', 'node')
  const packageDirectory = join(workspace, 'packages', 'dsh-base')
  await mkdir(join(packageDirectory, 'lib'), { recursive: true })
  await writeFile(join(packageDirectory, 'package.json'), '{"name":"@deepseek-ai/dsh-base"}\n')
  await writeFile(join(packageDirectory, 'lib', 'index.js'), 'export {}\n')
  await mkdir(join(staging, 'node_modules', '@deepseek-ai'), { recursive: true })
  await mkdir(join(staging, 'node_modules', '.bin'), { recursive: true })
  await writeFile(join(staging, 'package.json'), '{"name":"dsh-python-runtime-closure"}\n')
  await symlink(packageDirectory, join(staging, 'node_modules', '@deepseek-ai', 'dsh-base'), directoryLinkType)
  await symlink(packageDirectory, join(staging, 'node_modules', '.bin', 'dsh'), directoryLinkType)

  await materializeStagedLinks(staging)

  expect(existsSync(join(staging, 'node_modules', '.bin'))).toBe(false)
  await expect(readFile(join(staging, 'node_modules', '@deepseek-ai', 'dsh-base', 'lib', 'index.js'), 'utf8'))
    .resolves.toBe('export {}\n')
  expect(await listSymlinks(staging)).toEqual([])
})

it('shares an identical workspace package while retaining different peers and third-party copies', async () => {
  const workspace = await fixture('dsh-python-staging-dedupe-')
  const staging = join(workspace, 'payload')
  const modules = join(staging, 'node_modules')
  const root = join(modules, '@fixture', 'tools')
  const duplicate = join(modules, 'app', 'node_modules', '@fixture', 'tools')
  const differentPeers = join(modules, 'other', 'node_modules', '@fixture', 'tools')
  const external = join(modules, 'external')
  const externalCopy = join(modules, 'app', 'node_modules', 'external')
  for (const directory of [root, duplicate, differentPeers, external, externalCopy]) {
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'index.js'), 'exports.scheduler = Symbol("scheduler")\n')
  }
  const locations = (paths: string[]) => paths.map(path => relative(workspace, path))
  await writeFile(join(modules, '.modules.yaml'), JSON.stringify({ hoistedLocations: {
    '@fixture/tools@file:packages/tools(peer@1)': locations([root, duplicate]),
    '@fixture/tools@file:packages/tools(peer@2)': locations([differentPeers]),
    'external@1.0.0(@fixture/tools@file:packages/tools)': locations([external, externalCopy]),
  } }))

  await deduplicateStagedWorkspacePackages(staging, workspace)

  expect(existsSync(duplicate)).toBe(false)
  for (const directory of [root, differentPeers, external, externalCopy]) {
    expect(existsSync(join(directory, 'index.js'))).toBe(true)
  }
  const fromRoot = createRequire(join(staging, 'entry.cjs'))
  const fromApp = createRequire(join(modules, 'app', 'entry.cjs'))
  const fromOther = createRequire(join(modules, 'other', 'entry.cjs'))
  expect(fromApp('@fixture/tools')).toBe(fromRoot('@fixture/tools'))
  expect(fromOther('@fixture/tools')).not.toBe(fromRoot('@fixture/tools'))
})

it('rejects invalid deployment metadata before removing any package', async () => {
  const workspace = await fixture('dsh-python-staging-metadata-')
  const staging = join(workspace, 'payload')
  const modules = join(staging, 'node_modules')
  const root = join(modules, 'tools')
  const duplicate = join(modules, 'app', 'node_modules', 'tools')
  const outside = join(workspace, 'source')
  for (const directory of [root, duplicate, outside]) await mkdir(directory, { recursive: true })
  const valid = { 'tools@file:packages/tools': [root, duplicate].map(path => relative(workspace, path)) }
  for (const invalid of [
    {},
    { hoistedLocations: { invalid: [42] } },
    { hoistedLocations: { ...valid, 'other@file:packages/other': [relative(workspace, outside)] } },
  ]) {
    await writeFile(join(modules, '.modules.yaml'), JSON.stringify(invalid))
    await expect(deduplicateStagedWorkspacePackages(staging, workspace)).rejects.toThrow('hoistedLocations')
    expect(existsSync(duplicate)).toBe(true)
    expect(existsSync(outside)).toBe(true)
  }
})
