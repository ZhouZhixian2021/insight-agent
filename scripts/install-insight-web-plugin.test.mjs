/** Offline artifact and installation contracts; no product or provider is started. */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { x as extractTar } from 'tar'
import { createInstallPlan, verifyArchive, installPlugin, installEnvironment } from './install-insight-web-plugin.mjs'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

async function temporaryHome(t) {
  const base = await mkdtemp(join(tmpdir(), 'insight-web-plugin-test-'))
  t.after(async () => {
    assert.equal(dirname(resolve(base)), resolve(tmpdir()))
    await rm(base, { recursive: true, force: true })
  })
  return join(base, 'home')
}

test('the shipped archive pins the compatible bundle and its built host', async t => {
  const plan = await createInstallPlan({ home: await temporaryHome(t) })
  const manifest = await verifyArchive(plan.archive, plan.lock)
  assert.equal(manifest.version, '0.3.5+insight.1')
  assert.equal(plan.lock.upstream.tag, 'v0.3.5')
  assert.equal(plan.lock.dependencyVersions.length, 26)
  assert.deepEqual(manifest.dependencies, plan.lock.directDependencies)
  assert.deepEqual(manifest.bundledDependencies, Object.keys(manifest.dependencies))
  assert.ok(Object.values(manifest.dependencies).every(version => /^\d+\.\d+\.\d+$/.test(version)))
  assert.ok(plan.lock.bundledPackages.every(item => item.licenseFiles.length > 0))
  assert.equal(plan.lock.packedFiles['lib/host/index.js'], '656670462e715ece2c20202281f65667626451b5da086c2dd9a45dc0ba20dd15')
})

test('a changed archive fails before profile creation or command execution', async t => {
  const home = await temporaryHome(t)
  const plan = await createInstallPlan({ home })
  const changed = Buffer.from(await readFile(plan.archive))
  changed[changed.length - 1] ^= 1
  const filename = join(dirname(home), 'changed.tgz')
  await writeFile(filename, changed)
  await assert.rejects(verifyArchive(filename, plan.lock), { code: 'ARCHIVE_DIGEST' })
  await assert.rejects(access(home), { code: 'ENOENT' })
})

test('dry run requires an explicit home and leaves it absent', async t => {
  await assert.rejects(createInstallPlan({}), { code: 'HOME_REQUIRED' })
  const home = await temporaryHome(t)
  const plan = await createInstallPlan({ home, storeDir: join(dirname(home), 'store') })
  let commands = 0
  const result = await installPlugin(plan, { dryRun: true, runCommand() { commands++; throw new Error('must not execute') } })
  assert.equal(result.status, 'dry-run')
  assert.equal(commands, 0)
  assert.ok(plan.args.includes('--offline'))
  assert.ok(plan.args.includes('--ignore-scripts'))
  assert.ok(plan.args.includes('--config.auto-install-peers=false'))
  assert.equal(plan.args[0], join(repositoryRoot, 'apps', 'cli', 'lib', 'bin.js'))
  await assert.rejects(access(home), { code: 'ENOENT' })
})

test('package management receives OS settings without API credentials', () => {
  const env = installEnvironment('/isolated/home', '/isolated/empty.npmrc', {
    PATH: '/tools', DEEPSEEK_API_KEY: 'not-a-credential', OPENAI_API_KEY: 'not-a-credential', DSH_TOKEN: 'not-a-credential',
  })
  assert.equal(env.PATH, '/tools')
  assert.equal(env.DSH_HOME, '/isolated/home')
  assert.equal(env.NPM_CONFIG_USERCONFIG, '/isolated/empty.npmrc')
  assert.equal('DEEPSEEK_API_KEY' in env, false)
  assert.equal('OPENAI_API_KEY' in env, false)
  assert.equal('DSH_TOKEN' in env, false)
})

test('an installed matching profile is reused without running package management', async t => {
  const home = await temporaryHome(t)
  const plan = await createInstallPlan({ home })
  const packageDir = join(plan.profileDir, 'node_modules', plan.lock.name)
  await mkdir(packageDir, { recursive: true })
  await extractTar({ file: plan.archive, cwd: packageDir, strip: 1 })
  await mkdir(dirname(plan.localArchive), { recursive: true })
  await copyFile(plan.archive, plan.localArchive)
  await writeFile(join(plan.profileDir, 'package.json'), JSON.stringify({ dependencies: { [plan.lock.name]: `file:${plan.localArchive}` },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', plan.lock.name] } } }))
  const credentials = join(home, '.credentials.yaml')
  await writeFile(credentials, 'local-only fixture\n')
  let commands = 0
  const result = await installPlugin(plan, { runCommand() { commands++; throw new Error('must not execute') } })
  assert.equal(result.status, 'already-installed')
  assert.equal(commands, 0)
  assert.equal(await readFile(credentials, 'utf8'), 'local-only fixture\n')
})

test('a failed package-manager operation stops once and preserves local credentials', async t => {
  const home = await temporaryHome(t)
  await mkdir(home, { recursive: true })
  const credentials = join(home, '.credentials.yaml')
  await writeFile(credentials, 'local-only fixture\n')
  const plan = await createInstallPlan({ home })
  let commands = 0
  await assert.rejects(installPlugin(plan, { async runCommand(_executable, args, options) {
    commands++
    assert.ok(args.includes('--ignore-scripts'))
    assert.equal(options.env.DSH_HOME, home)
    throw new Error('synthetic package-manager failure')
  } }), { code: 'PACKAGE_MANAGER' })
  assert.equal(commands, 1)
  assert.equal(await readFile(credentials, 'utf8'), 'local-only fixture\n')
})
