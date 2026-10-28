/**
 * The verify-cordis-config metadata contract: `disabled` is the one entry
 * metadata field whose `!!js` expression the Loader interpolates; every other
 * metadata field must stay static, and a disabled expression must parse.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  bundleManifestPaths,
  bundlePluginDependencyErrors,
  metadataExpressionErrors,
  packageTestFixtureDependencyErrors,
  packageTestPluginDependencyErrors,
  verifyCordisConfigs,
} from './verify-cordis-config.ts'

describe('verify-cordis-config metadata expressions', () => {
  it('accepts a disabled !!js expression', () => {
    const problems = metadataExpressionErrors(
      { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabled: { __jsExpr: "process.platform === 'win32'" } },
      '[0]',
    )
    expect(problems).toEqual([])
  })

  it('rejects an expression in a static metadata field', () => {
    const problems = metadataExpressionErrors({ id: { __jsExpr: 'process.platform' }, name: 'pkg' }, '[0]')
    expect(problems).toContain('[0].id: !!js is not interpolated here')
  })

  it('rejects an expression nested below disabled (only the field itself interpolates)', () => {
    const problems = metadataExpressionErrors(
      { id: 'tool-bash', name: 'pkg', disabled: { when: { __jsExpr: 'process.platform' } } },
      '[0]',
    )
    expect(problems).toContain('[0].disabled.when: !!js is not interpolated here')
  })

  it('rejects a disabled expression that does not parse (the loader would fail the boot)', () => {
    const problems = metadataExpressionErrors(
      { id: 'tool-bash', name: 'pkg', disabled: { __jsExpr: 'process.platform ===' } },
      '[0]',
    )
    expect(problems.some(problem => problem.includes('[0].disabled: disabled expression does not parse'))).toBe(true)
  })
})

/** Each test owns its repository, index objects, and all possible link targets. */
function configFixture() {
  const scope = mkdtempSync(join(tmpdir(), 'dsh-cordis-git-links-'))
  onTestFinished(() => { rmSync(scope, { recursive: true, force: true }) })
  const root = join(scope, 'repo')
  mkdirSync(root)
  const write = (file: string, source: string): void => {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, source)
  }
  const git = (args: string[], input?: string): string => execFileSync('git', args, {
    cwd: root, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10_000,
  })
  const link = (file: string, payload: string): void => {
    const oid = git(['hash-object', '-w', '--stdin'], payload).trim()
    git(['update-index', '--add', '--cacheinfo', `120000,${oid},${file}`])
    write(file, payload)
  }
  git(['init', '--quiet'])
  write('tsconfig.base.json', JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext' } }))
  write('apps/cli/package.json', JSON.stringify({ dependencies: { 'fixture-plugin': '*' } }))
  write('apps/cli/config/headless.cordis.yml', '[]\n')
  write('packages/bundle/base/cordis.patch.yml', '[]\n')
  write('packages/bundle/web-app/package.json', JSON.stringify({ dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  write('packages/bundle/web-app/cordis.patch.yml', '[]\n')
  write('packages/example/owner/package.json', JSON.stringify({ name: '@fixture/owner' }))
  write('packages/example/owner/tests/loader/cordis.yml', '[]\n')
  write('packages/example/owner/tests/loader/driver.ts', 'export {}\n')
  return { root, scope, write, link, git }
}

const alias = 'apps/cli/tests/profiles/acp/cordis.yml'
const target = 'snapshots/acp/example/cordis.yml'
const payload = '../../../../../snapshots/acp/example/cordis.yml'

describe('Git link placeholder configs through the static checker', () => {
  it('accepts ordinary Loader arrays without Git metadata', () => {
    const fixture = configFixture()
    rmSync(join(fixture.root, '.git'), { recursive: true, force: true })
    fixture.write(alias, '- name: fixture-plugin\n')
    expect(verifyCordisConfigs(fixture.root).errors).toEqual([])
  })

  it('reads an exact indexed placeholder without evaluating !!js or changing the index', () => {
    const fixture = configFixture()
    fixture.write(target, '- name: fixture-plugin\n  disabled: !!js \'(() => { throw new Error("must not run") })()\'\n  config:\n    value: !!js process.platform\n')
    fixture.link(alias, payload)
    const indexBefore = readFileSync(join(fixture.root, '.git/index'))
    const result = verifyCordisConfigs(fixture.root)
    expect(result.errors).toEqual([])
    expect(result.pluginReferences).toContainEqual({ file: alias, name: 'fixture-plugin' })
    expect(readFileSync(join(fixture.root, alias), 'utf8')).toBe(payload)
    expect(readFileSync(join(fixture.root, '.git/index'))).toEqual(indexBefore)
  })

  it('checks target worktree edits and keeps the app-test dependency owner', () => {
    const fixture = configFixture()
    fixture.write(target, '- name: fixture-plugin\n')
    fixture.git(['add', target])
    fixture.link(alias, payload)
    fixture.write(target, '- name: missing-plugin\n')
    const result = verifyCordisConfigs(fixture.root)
    expect(result.errors).toContain(`${alias}: missing-plugin must be declared in apps/cli/package.json dependencies or devDependencies`)
  })

  it.each(['untracked', 'ordinary Git file', 'modified placeholder'])('rejects a path scalar in a %s', (kind) => {
    const fixture = configFixture()
    fixture.write(target, '[]\n')
    if (kind === 'modified placeholder') fixture.link(alias, payload)
    fixture.write(alias, kind === 'modified placeholder' ? `${payload}\n` : payload)
    if (kind === 'ordinary Git file') fixture.git(['add', alias])
    expect(verifyCordisConfigs(fixture.root).errors).toContain(`${alias}: root must be a Loader entry array`)
  })

  it.each([
    ['missing', payload, 'ENOENT'],
    ['outside', '../../../../../../outside.yml', 'Git link target must stay inside the repository'],
    ['cycle', './cordis.yml', 'Git link target cycle'],
  ])('rejects a %s target', (_kind, linkPayload, diagnostic) => {
    const fixture = configFixture()
    writeFileSync(join(fixture.scope, 'outside.yml'), '[]\n')
    fixture.link(alias, linkPayload)
    expect(verifyCordisConfigs(fixture.root).errors.some(error => error.startsWith(`${alias}: `) && error.includes(diagnostic))).toBe(true)
  })

  it('rejects a cycle between two indexed placeholders', () => {
    const fixture = configFixture()
    fixture.link(alias, payload)
    fixture.link(target, '../../../apps/cli/tests/profiles/acp/cordis.yml')
    expect(verifyCordisConfigs(fixture.root).errors).toContain(`${alias}: Git link target cycle`)
  })

  it.each([
    ['{}\n', ': root must be a Loader entry array'],
    ['- name: fixture-plugin\n  id: !!js process.platform\n', '[0].id: !!js is not interpolated here'],
    ['- name: fixture-plugin\n  disabled: !!js "process.platform ==="\n', '[0].disabled: disabled expression does not parse'],
    ['- name: [\n', ': unexpected end'],
  ])('rejects invalid target YAML or metadata: %s', (source, diagnostic) => {
    const fixture = configFixture()
    fixture.write(target, source)
    fixture.link(alias, payload)
    expect(verifyCordisConfigs(fixture.root).errors.some(error => error.startsWith(alias) && error.includes(diagnostic))).toBe(true)
  })

  it('uses the same link reader for preset plane checks outside the discovered YAML names', () => {
    const fixture = configFixture()
    fixture.write('packages/bundle/base/cordis.patch.yml', '- id: duplicate\n  name: ./plugin.ts\n')
    fixture.write('assets/preset.yml', '- name: "@deepseek-ai/dsh-agent-preset"\n  config:\n    id: example\n    plugins:\n      - id: duplicate\n        name: ./plugin.ts\n')
    fixture.write('packages/bundle/web-app/package.json', JSON.stringify({ dsh: { bundle: { patch: './layers/host.patch.yml' } } }))
    fixture.link('packages/bundle/web-app/layers/host.patch.yml', '../../../../assets/preset.yml')
    expect(verifyCordisConfigs(fixture.root).errors).toContain('packages/bundle/web-app/layers/host.patch.yml#example: row "duplicate" is also active in the host composition; a row belongs to exactly one plane')
  })

  it('rejects an invalid root read only by the preset plane check', () => {
    const fixture = configFixture()
    fixture.write('assets/preset.yml', '{}\n')
    fixture.write('packages/bundle/web-app/package.json', JSON.stringify({ dsh: { bundle: { patch: './layers/host.patch.yml' } } }))
    fixture.link('packages/bundle/web-app/layers/host.patch.yml', '../../../../assets/preset.yml')
    expect(verifyCordisConfigs(fixture.root).errors).toContain('packages/bundle/web-app/layers/host.patch.yml: root must be a Loader entry array')
  })

  it.each([
    ['apps/cli/tests/profiles/example/cordis.yml', 'apps/cli/package.json dependencies or devDependencies'],
    ['apps/cli/config/examples/nested/cordis.yml', 'apps/cli/package.json dependencies or a bundle manifest'],
    ['packages/bundle/web-app/cordis.patch.yml', 'packages/bundle/web-app/package.json dependencies'],
  ])('retains normalized dependency classification for %s', (file, owner) => {
    const fixture = configFixture()
    fixture.write(file, '- name: missing-plugin\n')
    expect(verifyCordisConfigs(fixture.root).errors).toContain(`${file}: missing-plugin must be declared in ${owner}`)
  })

  it('reports an empty Loader corpus instead of succeeding', () => {
    const fixture = configFixture()
    rmSync(join(fixture.root, 'apps'), { recursive: true })
    rmSync(join(fixture.root, 'packages'), { recursive: true })
    // The remaining repository manifests are required by independent resolution checks.
    fixture.write('apps/cli/package.json', '{}')
    mkdirSync(join(fixture.root, 'apps/cli/config'))
    fixture.write('packages/bundle/web-app/package.json', JSON.stringify({ dsh: { bundle: { patch: [] } } }))
    expect(verifyCordisConfigs(fixture.root).errors).toContain('Loader config scan found no configuration files')
  })
})

describe('workspace Bundle discovery and product dependency closures', () => {
  it('discovers a Bundle outside packages/bundle from its manifest declaration', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'dsh-bundle-discovery-'))
    try {
      const bundleDir = join(fixture, 'packages/subagent/example')
      const plainDir = join(fixture, 'packages/bundle/plain')
      mkdirSync(bundleDir, { recursive: true })
      mkdirSync(plainDir, { recursive: true })
      writeFileSync(join(bundleDir, 'package.json'), JSON.stringify({
        name: '@deepseek-ai/dsh-subagent-example',
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }))
      writeFileSync(join(plainDir, 'package.json'), JSON.stringify({
        name: '@deepseek-ai/dsh-plain',
      }))

      expect(bundleManifestPaths(fixture)).toEqual([
        'packages/subagent/example/package.json',
      ])
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('allows a Bundle to mount itself but rejects an undeclared plugin package', () => {
    const manifestPath = 'packages/subagent/example/package.json'
    const file = 'packages/subagent/example/cordis.patch.yml'
    const manifest = {
      name: '@deepseek-ai/dsh-subagent-example',
      dependencies: {},
    }
    const self = { file, name: '@deepseek-ai/dsh-subagent-example' }
    expect(bundlePluginDependencyErrors(manifestPath, manifest, [self])).toEqual([])
    expect(bundlePluginDependencyErrors(manifestPath, manifest, [
      self,
      { file, name: '@deepseek-ai/dsh-missing-plugin' },
    ])).toEqual([
      `${file}: @deepseek-ai/dsh-missing-plugin must be declared in ${manifestPath} dependencies`,
    ])
  })
})

describe('package-owned Loader test dependency closures', () => {
  it('requires package test configs to declare each named plugin they load', () => {
    const manifestPath = 'packages/example/owner/package.json'
    const file = 'packages/example/owner/tests/fixtures/cordis.yml'
    const manifest = {
      name: '@deepseek-ai/dsh-owner',
      dependencies: {},
      devDependencies: {
        '@deepseek-ai/dsh-declared': 'workspace:^',
      },
    }
    expect(packageTestPluginDependencyErrors(manifestPath, manifest, [
      { file, name: '@deepseek-ai/dsh-owner' },
      { file, name: '@deepseek-ai/dsh-declared' },
      { file, name: '@deepseek-ai/dsh-missing' },
    ])).toEqual([
      `${file}: @deepseek-ai/dsh-missing must be declared in ${manifestPath} dependencies or devDependencies`,
    ])
  })

  it('requires executable package test fixtures to declare their bare imports', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'dsh-package-test-entrypoint-'))
    try {
      const packageDir = join(fixture, 'packages/example/owner')
      const driverDir = join(packageDir, 'tests/fixtures/loader')
      mkdirSync(driverDir, { recursive: true })
      writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
        name: '@deepseek-ai/dsh-owner',
        devDependencies: {
          '@deepseek-ai/dsh-declared': 'workspace:^',
        },
      }))
      writeFileSync(join(driverDir, 'driver.ts'), [
        "import '@deepseek-ai/dsh-owner'",
        "import '@deepseek-ai/dsh-declared'",
        "import '@deepseek-ai/dsh-missing'",
      ].join('\n'))
      writeFileSync(join(driverDir, 'cordis.yml'), '[]\n')
      writeFileSync(join(driverDir, 'fixture.mjs'), "import '@deepseek-ai/dsh-declared'\n")
      const unrelatedDir = join(packageDir, 'tests/fixtures/unrelated')
      mkdirSync(unrelatedDir, { recursive: true })
      writeFileSync(join(unrelatedDir, 'driver.ts'), "import '@deepseek-ai/dsh-unrelated'\n")

      expect(packageTestFixtureDependencyErrors(fixture)).toEqual([
        'packages/example/owner/tests/fixtures/loader/driver.ts: '
        + '@deepseek-ai/dsh-missing must be declared in '
        + 'packages/example/owner/package.json dependencies or devDependencies',
      ])
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('fails loud when package-owned Loader fixtures disappear from the scan', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'dsh-empty-package-test-entrypoint-'))
    try {
      expect(packageTestFixtureDependencyErrors(fixture)).toEqual([
        'package test fixture dependency scan found no package-owned Loader configs',
      ])
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })
})
