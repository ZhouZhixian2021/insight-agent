import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { clientFeatureManifestPaths, isClientFeaturePackage } from './client-feature-packages.ts'

it('keeps moved Client features in the manifest corpus and excludes Host wire packages', () => {
  const root = mkdtempSync(join(tmpdir(), 'client-feature-packages-'))
  try {
    const manifests = [
      ['packages/client/old/package.json', 'legacy-client'],
      ['packages/academic/ui-research/package.json', '@deepseek-ai/dsh-client-ui-academic-research'],
      ['packages/api/controller/package.json', '@deepseek-ai/dsh-api-controller'],
      ['packages/academic/model/package.json', '@deepseek-ai/dsh-academic-model'],
      ['packages/test-support/client-runtime/package.json', '@deepseek-ai/dsh-client-test-runtime'],
      ['packages/extensions/ui-cordis/package.json', '@deepseek-ai/dsh-client-ui-cordis'],
    ] as const
    for (const [file, name] of manifests) {
      const target = join(root, file)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, JSON.stringify({ name, exports: { './client': './lib/client.js' } }))
    }
    expect(clientFeatureManifestPaths(root)).toEqual([
      'packages/academic/ui-research/package.json',
      'packages/client/old/package.json',
      'packages/extensions/ui-cordis/package.json',
    ])
    expect(isClientFeaturePackage('packages\\client\\old\\package.json', '')).toBe(true)
    expect(isClientFeaturePackage('packages\\academic\\ui-research\\package.json',
      '@deepseek-ai/dsh-client-ui-academic-research')).toBe(true)
    expect(isClientFeaturePackage('packages/api/controller/package.json', '@deepseek-ai/dsh-api-controller')).toBe(false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
