import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cordisConfigFiles } from './cordis-config-files.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('cordisConfigFiles', () => {
  it('finds Loader YAML without treating translation records as configs', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-cordis-config-files-'))
    roots.push(root)
    for (const directory of ['.claude', 'apps/cli/config/examples', 'docs', 'node_modules/pkg', 'vendor/pkg']) {
      mkdirSync(join(root, directory), { recursive: true })
    }
    for (const file of [
      '.claude/hidden.cordis.yml',
      'docs/cordis-primer.i18n.yaml',
      'apps/cli/config/examples/agent.cordis.yaml',
      'apps/cli/config/examples/headless.cordis.yml',
      'node_modules/pkg/hidden.cordis.yml',
      'vendor/pkg/hidden.cordis.yml',
    ]) {
      writeFileSync(join(root, file), '[]\n')
    }

    expect(cordisConfigFiles(root)).toEqual([
      'apps/cli/config/examples/agent.cordis.yaml',
      'apps/cli/config/examples/headless.cordis.yml',
    ])
  })

  it('keeps nested app tests, Bundle patches, and snapshot aliases in the scan', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-cordis-config-paths-'))
    roots.push(root)
    const paths = [
      'apps/cli/tests/profiles/acp/cordis.yml',
      'packages/bundle/web/presets/cordis.patch.yml',
      'snapshots/acp/example/cordis.yaml',
    ]
    for (const file of paths) {
      mkdirSync(join(root, file, '..'), { recursive: true })
      writeFileSync(join(root, file), '[]\n')
      writeFileSync(join(root, `${file}.i18n.yaml`), '{}\n')
    }
    expect(cordisConfigFiles(root)).toEqual(paths)
  })
})
